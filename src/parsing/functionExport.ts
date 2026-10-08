import type { FunctionEvent, FunctionEventStatus } from '../lib/functionSpace';

/**
 * Parses the CSV that OptiqC&E's Reports section exports.
 *
 * Column names are taken from the live Reports table (1 Sep 2026):
 *
 *   Lost Date · Event Name · Client/Company · Event Type · Owner · Space(s) ·
 *   Expected Pax · Expected Revenue · Lost Reason · Lost Notes
 *
 * Matching is EXACT on a normalised header (trimmed, lowercased, punctuation stripped),
 * never by substring. Substring matching is what let a `CODE` alias bind to `BLOCK_CODE`
 * in the Opera parser, and the Novotel resort code is literally `HB4F8`.
 *
 * Aliases are generous because the header row of the forward-events export has not been
 * seen yet — the Lost Business tab is the only per-event table currently visible. When a
 * real export lands, pin the aliases and add it as a fixture.
 */

const ALIASES = {
  eventName: ['event name', 'event', 'name'],
  clientCompany: ['client/company', 'client company', 'client', 'company', 'account'],
  eventType: ['event type', 'type'],
  owner: ['owner', 'sales owner'],
  spaces: ['space(s)', 'spaces', 'space', 'room(s)', 'rooms', 'room', 'function space'],
  expectedPax: ['expected pax', 'pax', 'guests'],
  revenue: ['expected revenue', 'revenue', 'value', 'total value'],
  status: ['status'],
  start: ['start', 'start date', 'start time', 'from', 'event date', 'date', 'lost date'],
  end: ['end', 'end date', 'end time', 'to'],
  notes: ['notes', 'lost notes', 'setup', 'remarks'],
} as const;

type Field = keyof typeof ALIASES;

/** Lowercase, collapse whitespace, drop surrounding quotes. Keeps ( ) and / for "Space(s)". */
function normaliseHeader(h: string): string {
  return String(h ?? '').trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').toLowerCase();
}

/** Minimal RFC4180 line splitter — handles quoted fields containing commas. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

/** "THB 52,250" / "52250" / "-" -> 52250 | null. Never guesses a zero. */
export function parseTHB(raw: string): number | null {
  const cleaned = String(raw ?? '').replace(/THB/gi, '').replace(/,/g, '').trim();
  if (!cleaned || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** "Sep 1, 2026, 12:07 PM" and ISO both parse. Anything else returns null, not today. */
export function parseExportDate(raw: string): string | null {
  const v = String(raw ?? '').trim();
  if (!v || v === '-') return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseStatus(raw: string): FunctionEventStatus | null {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v.startsWith('defin')) return 'definite';
  if (v.startsWith('tent')) return 'tentative';
  if (v.startsWith('prosp')) return 'prospect';
  // The property team confirmed lost is how a cancellation is recorded.
  if (v.startsWith('lost') || v.startsWith('cancel')) return 'lost';
  return null;
}

export interface FunctionExportResult {
  events: FunctionEvent[];
  /** Rows that could not be used, with the reason. Surfaced, never swallowed. */
  rejected: { line: number; reason: string; raw: string }[];
  /** Header names present in the file but not recognised — helps pin aliases later. */
  unmappedHeaders: string[];
}

export function parseFunctionExport(csv: string, defaultStatus: FunctionEventStatus = 'definite'): FunctionExportResult {
  const lines = String(csv ?? '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rejected: FunctionExportResult['rejected'] = [];
  const events: FunctionEvent[] = [];

  if (lines.length < 2) {
    return { events, rejected, unmappedHeaders: [] };
  }

  const headers = splitCsvLine(lines[0]).map(normaliseHeader);
  const index = {} as Record<Field, number>;
  const used = new Set<number>();
  for (const field of Object.keys(ALIASES) as Field[]) {
    const i = headers.findIndex((h, hi) => !used.has(hi) && (ALIASES[field] as readonly string[]).includes(h));
    index[field] = i;
    if (i !== -1) used.add(i);
  }
  const unmappedHeaders = headers.filter((_, i) => !used.has(i) && headers[i]);

  if (index.eventName === -1 || index.spaces === -1) {
    return {
      events,
      rejected: [{ line: 1, reason: 'No "Event Name" and/or "Space(s)" column found. Is this the Reports export?', raw: lines[0] }],
      unmappedHeaders,
    };
  }

  const get = (cells: string[], f: Field) => (index[f] === -1 ? '' : (cells[index[f]] ?? '').trim());

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const eventName = get(cells, 'eventName');
    const spacesRaw = get(cells, 'spaces');

    if (!eventName) {
      rejected.push({ line: i + 1, reason: 'No event name.', raw: lines[i] });
      continue;
    }
    if (!spacesRaw) {
      rejected.push({ line: i + 1, reason: `"${eventName}" has no function space.`, raw: lines[i] });
      continue;
    }

    const startIso = parseExportDate(get(cells, 'start'));
    if (!startIso) {
      rejected.push({ line: i + 1, reason: `"${eventName}" has no readable start date.`, raw: lines[i] });
      continue;
    }
    // A single-day event often carries no end date; the start day is then the whole event.
    const endIso = parseExportDate(get(cells, 'end')) ?? startIso;

    const paxRaw = get(cells, 'expectedPax');
    const pax = paxRaw && paxRaw !== '-' ? Number(paxRaw.replace(/,/g, '')) : null;

    events.push({
      id: `${eventName}|${startIso}|${spacesRaw}`.replace(/\s+/g, '_').slice(0, 200),
      hotelId: 'novotel',
      eventName,
      clientCompany: get(cells, 'clientCompany') || null,
      eventType: get(cells, 'eventType') || undefined,
      owner: get(cells, 'owner') || undefined,
      spacesRaw,
      expectedPax: Number.isFinite(pax as number) ? (pax as number) : null,
      status: parseStatus(get(cells, 'status')) ?? defaultStatus,
      startsAt: startIso,
      endsAt: endIso,
      notes: get(cells, 'notes') || undefined,
      valueTHB: parseTHB(get(cells, 'revenue')),
      lastUpdated: new Date().toISOString(),
    });
  }

  return { events, rejected, unmappedHeaders };
}
