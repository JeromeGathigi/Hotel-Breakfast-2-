/**
 * Meeting and banqueting space, for the F&B team to read.
 *
 * READ-ONLY. OptiqC&E (optiq-ce.boutiquecorporation.com) is the system of record and is
 * itself fed from Opera Sales & Catering. Nothing here is ever created or edited in this
 * app. Novotel only — ibis has no function space in scope.
 *
 * The field set below was taken from the live OptiqC&E screens on 1 Sep 2026 (the event
 * detail page and the Reports table), not invented:
 *
 *   Event Name · Client/Company · Event Type · Owner · Space(s) · Expected Pax ·
 *   Expected Revenue · Status · Notes · Menu Items
 *
 * Three things about that data are worth knowing before reading this file:
 *
 *  1. `Client/Company` exists but is empty on every row I inspected. In practice the
 *     EVENT NAME carries the company ("Example Health Foundation (EHF)",
 *     "Sample Trading Co.,Ltd"). `displayCompany()` below reflects that.
 *  2. There is ONE pax figure, labelled "Expected Pax" — not the expected/guaranteed/
 *     actual triple that Opera S&C usually carries.
 *  3. Setup style is free text inside `Notes` ("Classroom"), not a structured field.
 */

/**
 * Canonical bookable spaces at Novotel Chiang Mai.
 *
 * OptiqC&E names them MR1-MR4 and FX. The OTB "Function Room Block.xlsx" workbook names
 * the same rooms in **28 different ways** across 1,001 rows — "Meeting 1", "meeting 1",
 * "Meeting1", "Meeting room 1", "Meeting roon 2-3" (a typo), "Meeting 1- 4",
 * "Food Exchange", "food Exchange", "Hotel Restaurant" — plus two spaces OptiqC&E does
 * not list at all: Gourmet Bar and the Recreation room. `normaliseVenue` below maps all
 * of it onto this list.
 */
export const FUNCTION_SPACES = ['MR1', 'MR2', 'MR3', 'MR4', 'FX', 'GB', 'REC'] as const;
export type FunctionSpaceId = (typeof FUNCTION_SPACES)[number];

/** Human labels, for display. */
export const SPACE_LABELS: Record<FunctionSpaceId, string> = {
  MR1: 'Meeting 1',
  MR2: 'Meeting 2',
  MR3: 'Meeting 3',
  MR4: 'Meeting 4',
  FX: 'Food Exchange',
  GB: 'Gourmet Bar',
  REC: 'Recreation Room',
};

/**
 * FX is the Food Exchange — the restaurant breakfast is served in — and it is bookable as
 * a function space.
 *
 * Per the property team, an FX booking is ALWAYS a lunch or dinner event and NEVER
 * breakfast: the restaurant is needed for in-house guests during breakfast service, so it
 * is not sold as function space then. So "FX Busy" does not mean breakfast is disrupted,
 * and this is deliberately not modelled as a breakfast conflict.
 *
 * It still matters to F&B — it is their room, and it drives evening staffing and the
 * turnaround after breakfast — so it is surfaced as a restaurant booking with its service
 * period, not as a warning.
 *
 * The one case worth flagging is an FX event that starts before breakfast service ends.
 * The property says that does not happen, so if it appears in the data it is either a
 * data-entry error or a genuine exception someone needs to know about. See
 * `startsDuringBreakfastService`.
 */
export const RESTAURANT_SPACE: FunctionSpaceId = 'FX';

/** Breakfast service, Asia/Bangkok. Matches the window used by the arrival-time reporting. */
export const BREAKFAST_SERVICE_START_HOUR = 6;
export const BREAKFAST_SERVICE_END_HOUR = 10;
export const BREAKFAST_SERVICE_END_MINUTE = 30;

/**
 * OptiqC&E statuses. Per the property team, **`lost` means cancelled** — there is no
 * separate cancelled state. A lost event therefore still gets shown (a room the kitchen
 * thinks is booked is an operational problem) but never counts toward totals and never
 * holds a room.
 */
export type FunctionEventStatus = 'prospect' | 'tentative' | 'definite' | 'lost';

/**
 * Status codes seen in the real sources. Three vocabularies for the same concepts:
 *
 *   OptiqC&E                  Definite | Tentative | Prospect | Lost
 *   Function Room Block.xlsx  DEF | TEN | BID | CXL | Private
 *   GRC workbook              DEF | CLX
 *
 * Note CXL in the function workbook versus CLX in the GRC workbook — the same
 * cancellation, transposed. Both must map to `lost`, which the property confirmed is how
 * a cancellation is recorded.
 */
export function normaliseStatusCode(raw: string): FunctionEventStatus | null {
  const v = String(raw ?? '').trim().toUpperCase();
  if (!v) return null;
  if (v.startsWith('DEF')) return 'definite';
  if (v.startsWith('TEN')) return 'tentative';
  if (v.startsWith('BID') || v.startsWith('PROSP')) return 'prospect';
  if (v.startsWith('CXL') || v.startsWith('CLX') || v.startsWith('CANCEL') || v.startsWith('LOST')) return 'lost';
  // "Private" is an internal/house booking, not a sales stage. Treat it as committed.
  if (v.startsWith('PRIVATE')) return 'definite';
  return null;
}

/**
 * NOTE: OptiqC&E has an "Attach Menu Items" action, but the property confirmed they do
 * not use it, so packages are deliberately not modelled here. The F&B-relevant package
 * signal for this app is the Opera product code on the in-house report (CNFBB, MBREAK,
 * MBUFF), which src/lib/meals.ts already handles.
 */

export interface FunctionEvent {
  /** OptiqC&E event id, e.g. txbNL309zj99HG92GSPL. Stable; never generated locally. */
  id: string;
  hotelId: 'novotel';
  eventName: string;
  /** OptiqC&E "Client/Company". Usually absent — see displayCompany(). */
  clientCompany?: string | null;
  eventType?: string;
  owner?: string;
  /** Raw "Space(s)" string as exported: "MR 1", "MR 2-3", "MR 1-4", "FX". */
  spacesRaw: string;
  expectedPax?: number | null;
  status: FunctionEventStatus;
  /** ISO datetimes. Events are frequently multi-day. */
  startsAt: string;
  endsAt: string;
  /** Free text; the setup style ("Classroom", "U-Shape") lives in here. */
  notes?: string;
  /** Expected revenue in THB. The property confirmed F&B should see this. */
  valueTHB?: number | null;
  lastUpdated: string;
}

/**
 * Expands an OptiqC&E "Space(s)" string into the individual rooms it occupies.
 *
 * "MR 2-4" is a RANGE — meeting rooms 2, 3 and 4 combined into one space, which is how
 * the property sells larger events. Treating it as a single opaque room would understate
 * which rooms are occupied and miss conflicts.
 */
export function expandSpaces(spacesRaw: string): FunctionSpaceId[] {
  // Collapse the spelling chaos first: lowercase, squash whitespace, fix the known typo,
  // and drop the redundant word "room" so "Meeting room 2-3" and "Meeting 2-3" agree.
  const raw = String(spacesRaw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/MEETING ROON/g, 'MEETING')   // real typo in the workbook
    .replace(/MEETING ROOMS?/g, 'MEETING')
    .replace(/\s*-\s*/g, '-');           // "1- 4", "1 - 4" -> "1-4"
  if (!raw) return [];

  // A venue naming several spaces, or an undecided either/or, is not one room. Split and
  // union rather than silently picking the first.
  if (raw.includes('/') || raw.includes(' OR ')) {
    const parts = raw.split(/\/| OR /).map((x) => x.trim()).filter(Boolean);
    const union = new Set<FunctionSpaceId>();
    for (const part of parts) for (const id of expandSpaces(part)) union.add(id);
    return [...union];
  }

  if (raw.includes('GOURMET')) return ['GB'];
  if (raw.includes('RECREATION')) return ['REC'];
  if (raw.includes('FX') || raw.includes('FOOD EXCHANGE') || raw.includes('RESTAURANT') || raw.includes('BUFFET')) {
    return ['FX'];
  }

  // "MR 2-4" / "MR2-4" / "Meeting 1-4" — all normalised to the same shape by now.
  const range = raw.match(/(?:MR|MEETING)\s*(\d)-(\d)/);
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    const out: FunctionSpaceId[] = [];
    for (let n = Math.min(from, to); n <= Math.max(from, to); n++) {
      const id = `MR${n}` as FunctionSpaceId;
      if ((FUNCTION_SPACES as readonly string[]).includes(id)) out.push(id);
    }
    return out;
  }

  // "MR 1" / "MR1" / "Meeting 1"
  const single = raw.match(/(?:MR|MEETING)\s*(\d)/);
  if (single) {
    const id = `MR${single[1]}` as FunctionSpaceId;
    return (FUNCTION_SPACES as readonly string[]).includes(id) ? [id] : [];
  }

  return [];
}

/** True when this event is booked into the Food Exchange restaurant. */
export function usesFoodExchange(event: FunctionEvent): boolean {
  return expandSpaces(event.spacesRaw).includes(RESTAURANT_SPACE);
}

/**
 * Which service an FX booking belongs to, from its start time. Per the property this is
 * only ever lunch or dinner. Returns null for events not in the restaurant.
 */
export function restaurantServicePeriod(event: FunctionEvent): 'lunch' | 'dinner' | null {
  if (!usesFoodExchange(event)) return null;
  const start = new Date(event.startsAt);
  if (isNaN(start.getTime())) return null;
  const hour = bangkokHourOf(start);
  // Anything from late afternoon onward is dinner; earlier is lunch.
  return hour >= 16 ? 'dinner' : 'lunch';
}

/**
 * An FX event that begins before breakfast service ends. The property says this never
 * happens, so a true result is a data-quality signal rather than a normal state — surface
 * it for someone to check instead of silently assuming it away.
 */
export function startsDuringBreakfastService(event: FunctionEvent): boolean {
  if (!usesFoodExchange(event)) return false;
  const start = new Date(event.startsAt);
  if (isNaN(start.getTime())) return false;
  const hour = bangkokHourOf(start);
  const minute = bangkokMinuteOf(start);
  if (hour < BREAKFAST_SERVICE_START_HOUR) return false;
  if (hour < BREAKFAST_SERVICE_END_HOUR) return true;
  return hour === BREAKFAST_SERVICE_END_HOUR && minute < BREAKFAST_SERVICE_END_MINUTE;
}

/** Hour in Asia/Bangkok, never the viewer's timezone. */
function bangkokHourOf(at: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', hour: '2-digit', hour12: false })
      .formatToParts(at)
      .find((p) => p.type === 'hour')?.value ?? '0'
  ) % 24;
}

/** Minute in Asia/Bangkok. */
function bangkokMinuteOf(at: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', minute: '2-digit' })
      .formatToParts(at)
      .find((p) => p.type === 'minute')?.value ?? '0'
  );
}

/**
 * The company to show. `Client/Company` is empty on every OptiqC&E row inspected, so the
 * event name is the practical answer — but say which one it is rather than silently
 * presenting a name as a company.
 */
export function displayCompany(event: FunctionEvent): { name: string; fromEventName: boolean } {
  const c = (event.clientCompany ?? '').trim();
  if (c && c !== '-') return { name: c, fromEventName: false };
  return { name: event.eventName, fromEventName: true };
}

/** The setup style, if it can be recognised in the free-text notes. */
const SETUP_STYLES = ['Classroom', 'U-Shape', 'Theatre', 'Banquet', 'Boardroom', 'Cocktail', 'Hollow Square'];
export function setupStyleFromNotes(notes?: string): string | null {
  if (!notes) return null;
  const found = SETUP_STYLES.find((s) => notes.toLowerCase().includes(s.toLowerCase()));
  return found ?? null;
}

/** `lost` is how OptiqC&E records a cancellation. */
export function isCancelled(event: FunctionEvent): boolean {
  return event.status === 'lost';
}

/** Only definite events count toward operational totals. */
export function countsTowardTotals(event: FunctionEvent): boolean {
  return event.status === 'definite';
}

/** Total expected revenue for a date, definite only. */
export function revenueOnDate(events: FunctionEvent[], businessDate: string): number {
  return eventsOnDate(events, businessDate)
    .filter(countsTowardTotals)
    .reduce((sum, e) => sum + (e.valueTHB ?? 0), 0);
}

/** Total expected pax for a date, definite only. */
export function paxOnDate(events: FunctionEvent[], businessDate: string): number {
  return eventsOnDate(events, businessDate)
    .filter(countsTowardTotals)
    .reduce((sum, e) => sum + (e.expectedPax ?? 0), 0);
}

/**
 * Every business date an event covers, inclusive. Events run multi-day (one real event
 * runs 31 Aug to 4 Sep), so a day sheet needs one row per day, not one row per event.
 */
export function eventBusinessDates(event: FunctionEvent): string[] {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];

  const dates: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));

  // Guard against a malformed range producing an unbounded loop.
  let guard = 0;
  while (cursor <= last && guard++ < 400) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/** Events active on a given business date, definite first, then by start time. */
export function eventsOnDate(events: FunctionEvent[], businessDate: string): FunctionEvent[] {
  return events
    .filter((e) => eventBusinessDates(e).includes(businessDate))
    .sort((a, b) => {
      if (a.status !== b.status) {
        if (a.status === 'definite') return -1;
        if (b.status === 'definite') return 1;
      }
      return a.startsAt.localeCompare(b.startsAt);
    });
}

/** Room occupancy for a date: which spaces are taken, and by what. */
export function spaceOccupancy(
  events: FunctionEvent[],
  businessDate: string
): Record<FunctionSpaceId, FunctionEvent[]> {
  const out = {} as Record<FunctionSpaceId, FunctionEvent[]>;
  for (const s of FUNCTION_SPACES) out[s] = [];
  for (const e of eventsOnDate(events, businessDate)) {
    if (e.status === 'lost') continue;
    for (const s of expandSpaces(e.spacesRaw)) out[s].push(e);
  }
  return out;
}
