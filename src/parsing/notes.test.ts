import { describe, it, expect } from 'vitest';
import { parseInHouseReport } from './index';

/**
 * Covers three things added together, because they share one delicate mechanism: the
 * record reconstruction that stitches rows split by unquoted newlines.
 *
 *   - BLOCK_CODE, the key to a group's contract. Accor's referential marks BGCI, BGPG and
 *     BGRE "according to the contract", so no rate table can say whether they include
 *     breakfast - only the block can. BGRE alone was 38 rooms on one real export.
 *   - Front-office and F&B comments, which is where the embedded newlines come from.
 *   - The summary block at the end of the file, which used to be glued onto the last guest.
 */

const HEADER = [
  'SHARE_NAMES', 'ACCOMPANYING_NAMES', 'CURRENCY_CODE', 'SHARE_AMOUNT', 'ROWNUM', 'RESORT',
  'IS_SHARED_YN', 'ACCOMPANYING_YN', 'STAY_ROOMS', 'PREFERENCES', 'ROOM', 'VIP',
  'COMPANY_NAME', 'ARRIVAL', 'DEPARTURE', 'ROOM_CATEGORY_LABEL', 'NO_OF_ROOMS',
  'PAYMENT_METHOD', 'BALANCE', 'RESV_NAME_ID', 'CHILDREN', 'ADULTS', 'GUEST_TITLE',
  'RATE_CODE', 'SPECIAL_REQUESTS', 'BLOCK_CODE', 'FULL_NAME', 'GUEST_NAME', 'DEPARTURE_TIME',
  'EXTERNAL_REFERENCE', 'GUEST_NAME_ID', 'ROOM_FEATURES', 'AUTH_AMT', 'SP_REQUEST',
  'PREFERENCE', 'PROF_COUNT', 'RES_COUNT', 'CS_EXTENSION_COUNT', 'COMMENT_RESORT',
  'RES_COMMENT_ORDER_BY', 'RES_COMMENT_TYPE', 'RES_COMMENT', 'RES_COMMENT_DESCRIPTION',
  'COMMENT_RESV_NAME_ID',
];

/** Builds one tab-separated row from a sparse object, padded to the full header width. */
function row(values: Record<string, string>): string {
  return HEADER.map((h) => values[h] ?? '').join('\t');
}

function buildExport(rows: string[], withSummary = true): string {
  const lines = [HEADER.join('\t'), ...rows];
  if (withSummary) {
    // The real footer: six fields against a 44-field header.
    lines.push(['LOGO', 'SUM_ADULTS', 'SUM_CHILDREN', 'SUM_BALANCE', 'SUM_RATE_AMOUNT', 'CS_STAY_ROOMS'].join('\t'));
    lines.push(['', '3', '0', '12345.67', '8901.23', '2'].join('\t'));
  }
  return lines.join('\n');
}

const base = { RESORT: 'HB4F8', STAY_ROOMS: '1', ADULTS: '1', CHILDREN: '0' };

describe('BLOCK_CODE capture', () => {
  it('carries the group block onto the guest', () => {
    const tsv = buildExport([
      row({ ...base, ROOM: '301', GUEST_NAME: 'ONE GUEST', RATE_CODE: 'BGRE', BLOCK_CODE: '2608FAMILY' }),
    ]);
    const room = parseInHouseReport(tsv, 'novotel').rooms.find((r) => r.roomNumber === '301');

    expect(room?.blockCode).toBe('2608FAMILY');
    // BGRE is contract-dependent, so the block code is the only route to an answer.
    expect(room?.rateCode).toBe('BGRE');
  });

  it('leaves blockCode empty rather than inventing one', () => {
    const tsv = buildExport([row({ ...base, ROOM: '302', GUEST_NAME: 'NO BLOCK', RATE_CODE: 'RA1' })]);
    const room = parseInHouseReport(tsv, 'novotel').rooms.find((r) => r.roomNumber === '302');
    expect(room?.blockCode).toBe('');
  });
});

describe('front-office and F&B notes', () => {
  it('captures a note with its type', () => {
    const tsv = buildExport([
      row({ ...base, ROOM: '401', GUEST_NAME: 'NOTED GUEST', RES_COMMENT: 'HOUSE USE **GM OFFICE**', RES_COMMENT_TYPE: 'RES' }),
    ]);
    const room = parseInHouseReport(tsv, 'novotel').rooms.find((r) => r.roomNumber === '401');

    expect(room?.notes).toHaveLength(1);
    expect(room?.notes?.[0].text).toBe('HOUSE USE **GM OFFICE**');
    expect(room?.notes?.[0].type).toBe('RES');
  });

  it('accumulates several notes on one room instead of overwriting', () => {
    // A reservation spans one export row per comment. The room must end up with all of them.
    const tsv = buildExport([
      row({ ...base, ROOM: '402', GUEST_NAME: 'MULTI NOTE', ADULTS: '2', RES_COMMENT: '**Check Pref**', RES_COMMENT_TYPE: 'RES' }),
      row({ ...base, ROOM: '402', GUEST_NAME: 'MULTI NOTE', ADULTS: '1', RES_COMMENT: 'Nonsmoking', RES_COMMENT_TYPE: 'RES' }),
      row({ ...base, ROOM: '402', GUEST_NAME: 'MULTI NOTE', ADULTS: '1', RES_COMMENT: 'Late arrival', RES_COMMENT_TYPE: 'GEN' }),
    ]);
    const room = parseInHouseReport(tsv, 'novotel').rooms.find((r) => r.roomNumber === '402');

    expect(room?.notes?.map((n) => n.text)).toEqual(['**Check Pref**', 'Nonsmoking', 'Late arrival']);
    // The 2-adult row wins the primary contest, but the 1-adult rows still contribute notes.
    expect(room?.adults).toBe(2);
  });

  it('does not duplicate an identical note repeated across rows', () => {
    const tsv = buildExport([
      row({ ...base, ROOM: '403', GUEST_NAME: 'DUPE NOTE', ADULTS: '2', RES_COMMENT: 'Same text', RES_COMMENT_TYPE: 'RES' }),
      row({ ...base, ROOM: '403', GUEST_NAME: 'DUPE NOTE', ADULTS: '1', RES_COMMENT: 'Same text', RES_COMMENT_TYPE: 'RES' }),
    ]);
    const room = parseInHouseReport(tsv, 'novotel').rooms.find((r) => r.roomNumber === '403');
    expect(room?.notes).toHaveLength(1);
  });

  it('reassembles a note broken across lines by an unquoted newline', () => {
    // This is why capturing notes touches the reconstruction: the comment itself contains the
    // raw newline that splits the record.
    const complete = row({
      ...base, ROOM: '404', GUEST_NAME: 'WRAPPED NOTE',
      RES_COMMENT: 'GA RO AT 1530+++ ON 29-31/08', RES_COMMENT_TYPE: 'RES',
    });
    // Break the line where the comment sits, as Opera does.
    const broken = complete.replace('ON 29-31/08', 'ON 29-31/08\nAT 1360+++ ON 01-02/09');
    const room = parseInHouseReport(buildExport([broken]), 'novotel').rooms.find((r) => r.roomNumber === '404');

    expect(room?.notes?.[0].text).toContain('GA RO AT 1530+++ ON 29-31/08');
    expect(room?.notes?.[0].text).toContain('AT 1360+++ ON 01-02/09');
  });
});

describe('the summary block at the end of the file', () => {
  it('is not glued onto the last guest record', () => {
    // The regression: the footer is six fields against a 44-field header, so the accumulator
    // treated it as a continuation. On the real ibis export that gave room 435 a note reading
    // "SUM_RATE_AMOUNT" with type "SUM_BALANCE", and overwrote its real trailing columns.
    const tsv = buildExport([
      row({ ...base, ROOM: '501', GUEST_NAME: 'FIRST GUEST' }),
      row({ ...base, ROOM: '502', GUEST_NAME: 'LAST GUEST' }),
    ]);
    const result = parseInHouseReport(tsv, 'ibis');
    const last = result.rooms.find((r) => r.roomNumber === '502');

    expect(last?.notes ?? []).toEqual([]);
    for (const note of last?.notes ?? []) {
      expect(note.text).not.toMatch(/SUM_|CS_STAY_ROOMS|LOGO/);
    }
  });

  it('does not become a room of its own', () => {
    // The phantom it created is why the parser reported 109 rooms against Opera's own
    // CS_STAY_ROOMS of 108 on the Novotel export. Fixing this reconciled the two.
    const tsv = buildExport([
      row({ ...base, ROOM: '601', GUEST_NAME: 'ONLY GUEST' }),
    ]);
    const result = parseInHouseReport(tsv, 'novotel');

    expect(result.rooms).toHaveLength(1);
    expect(result.rooms[0].roomNumber).toBe('601');
    for (const room of result.rooms) {
      expect(room.guestName).not.toMatch(/LOGO|SUM_/);
    }
  });

  it('parses the same room count with or without a summary block', () => {
    const rows = [
      row({ ...base, ROOM: '701', GUEST_NAME: 'GUEST A' }),
      row({ ...base, ROOM: '702', GUEST_NAME: 'GUEST B' }),
    ];
    const withFooter = parseInHouseReport(buildExport(rows, true), 'novotel');
    const without = parseInHouseReport(buildExport(rows, false), 'novotel');

    expect(withFooter.rooms).toHaveLength(without.rooms.length);
    expect(withFooter.rooms.map((r) => r.roomNumber)).toEqual(without.rooms.map((r) => r.roomNumber));
  });
});
