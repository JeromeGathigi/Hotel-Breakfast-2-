import type { Anomaly, RawRecord } from './types';

/**
 * Reads the Opera "Guests INH - By Room" tab-delimited export into whole records.
 *
 * Why this is hand-rolled rather than delegated to PapaParse:
 *
 * `RES_COMMENT` frequently contains **raw, unquoted newlines** — rate breakdowns are
 * written across several lines, e.g.
 *
 *     GA RO AT 1,530+++ ON 25-31/8
 *     AT 1,300.50+++ ON 1/9
 *
 * Measured on a real 117-room Novotel export: 112 of 415 physical lines (27%) are
 * continuations of the line above. Because the field is unquoted, every CSV/TSV reader
 * treats each continuation as a new record, which shifts subsequent values into the
 * wrong columns. That is where the phantom "room 1" in the live guest list came from —
 * a shifted record whose ROOM cell held `1`, RATE_CODE held `2` and ADULTS held a
 * reservation id.
 *
 * Opera does not quote or escape fields at all, so the field count is the only reliable
 * record boundary: accumulate physical lines until the tab count matches the header.
 */

const ROOM_HEADER_ALIASES = ['ROOM', 'RM', 'ROOM_NO'];
const FALLBACK_HEADER_HINTS = ['GUEST_NAME', 'ARRIVAL', 'RATE_CODE', 'RESV_NAME_ID'];

export interface RecordReadResult {
  header: string[];
  records: RawRecord[];
  anomalies: Anomaly[];
  physicalLines: number;
  rejectedRecords: number;
}

/** Locates the header row, tolerating Opera's variable number of preamble lines. */
function findHeaderIndex(lines: string[]): number {
  const limit = Math.min(lines.length, 500);

  for (let i = 0; i < limit; i++) {
    const fields = lines[i].split('\t').map((f) => f.trim().toUpperCase());
    if (fields.some((f) => ROOM_HEADER_ALIASES.includes(f))) return i;
  }

  for (let i = 0; i < limit; i++) {
    const upper = lines[i].toUpperCase();
    if (FALLBACK_HEADER_HINTS.some((hint) => upper.includes(hint))) return i;
  }

  return -1;
}

export function readRecords(text: string): RecordReadResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const headerIndex = findHeaderIndex(lines);

  if (headerIndex === -1) {
    throw new Error(
      "Could not find the header row. Expected a tab-separated export containing a 'ROOM' column — " +
        'check that Opera exported as Delimited Data > Tab.'
    );
  }

  const header = lines[headerIndex].split('\t').map((f) => f.trim());
  const expectedFields = header.length;

  const records: RawRecord[] = [];
  const anomalies: Anomaly[] = [];
  let rejectedRecords = 0;

  let buffer: string[] | null = null;
  let bufferStartLine = 0;

  /** Pads trailing fields the exporter omitted, then stores the record. */
  const emit = (fields: string[], startLine: number) => {
    if (fields.length > expectedFields) {
      // Genuinely more fields than the header: a tab landed inside a field and every
      // value after it is shifted. Emitting would invent a room (this is where the
      // phantom "room 1" came from); dropping silently is how it went unnoticed.
      rejectedRecords++;
      anomalies.push({
        kind: 'field-count-overflow',
        line: startLine,
        room: fields[0] || undefined,
        detail:
          `Record starting at line ${startLine} has ${fields.length} fields but the header has ` +
          `${expectedFields}. A tab inside a field has shifted the columns, so this record was ` +
          `discarded rather than imported as a room. First values: ${fields.slice(0, 4).join(' | ')}`,
      });
      return;
    }
    while (fields.length < expectedFields) fields.push('');
    records.push(fields.map((f) => f.trim()));
  };

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (buffer === null && !line.trim()) continue;

    const fields = line.split('\t');

    if (buffer === null) {
      buffer = fields;
      bufferStartLine = i + 1;
    } else if (buffer.length + fields.length - 1 > expectedFields) {
      // Appending would overshoot, so the buffer was not waiting for a continuation —
      // it was already a complete record with its trailing fields omitted.
      //
      // Opera drops the six RES_COMMENT_* columns entirely on rows that carry no
      // comment, producing 38-field records that are perfectly valid. Without this
      // check those get glued to the following record (38 + 44 - 1 = 81 fields) and
      // both are lost. That cost six real rooms — 421, 423, 427, 429, 431 and 432 —
      // on the reference export.
      emit(buffer, bufferStartLine);
      buffer = fields;
      bufferStartLine = i + 1;
    } else {
      // A real continuation: restore the newline inside the field it belongs to.
      buffer[buffer.length - 1] += '\n' + fields[0];
      buffer.push(...fields.slice(1));
    }

    if (buffer.length === expectedFields) {
      emit(buffer, bufferStartLine);
      buffer = null;
    }
  }

  if (buffer !== null && buffer.join('').trim()) {
    // A short record at end of file is the omitted-trailing-fields case again, so it
    // is padded and kept rather than discarded. If it is actually a stray comment
    // fragment its first field will not be a valid room number and the room grouping
    // will drop it.
    emit(buffer, bufferStartLine);
  }

  return {
    header,
    records,
    anomalies,
    physicalLines: lines.length,
    rejectedRecords,
  };
}
