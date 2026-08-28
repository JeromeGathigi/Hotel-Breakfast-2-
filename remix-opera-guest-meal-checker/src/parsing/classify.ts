import { MEAL_PLANS, type MealPlan, hasMealEntitlement } from '../lib/meals';
import { field, numeric } from './columns';
import type { Anomaly, ColumnMap, ParsedRoom, RawRecord } from './types';

/** Domain rule 8.2 — exact match, no comment check needed. */
export const FIXED_BREAKFAST_CODES = new Set([
  'FLMRB1',
  'FLMRB3',
  'FMRB3S',
  'DRB1',
  'DRB3S',
  'FLRB1',
  'PKGH1',
  'C01',
  'CREWESR',
  'TGLLSR',
  'TGLL',
  'LDR',
]);

/**
 * Domain rule 8.3 step 4 — a comment grants breakfast if it contains BF or MBREAK.
 *
 * Boundary-aware so that a guest surname such as "BFORD" does not grant breakfast,
 * while every form that actually occurs in the real exports still matches:
 *
 *     GA COMP BF AT 1,300+++
 *     MBREAK AT 400+++
 *     DAF COMP BF ON 27/8
 *     (PAID) BF INCL 2 PAX
 *
 * Deliberately loose about surrounding punctuation. Tightening this pattern makes the
 * app *refuse* breakfast to entitled guests, which is the failure mode being fixed —
 * so any change here needs a real export to justify it, not reasoning.
 */
export const BREAKFAST_COMMENT = /(^|[^A-Z])(BF|MBREAK)([^A-Z]|$)/i;

/** Room numbers are `^\d+[A-Za-z]?$`; leading zeros are stripped so 0104 === 104. */
export function normalizeRoom(raw: string): string | null {
  const trimmed = String(raw ?? '').trim();
  if (!/^\d+[A-Za-z]?$/.test(trimmed)) return null;
  const match = trimmed.match(/^0*(\d+)([A-Za-z]?)$/);
  if (!match) return trimmed.toUpperCase();
  return match[1] + (match[2] ?? '').toUpperCase();
}

/**
 * Pass A — every comment in the file, keyed by the reservation it belongs to.
 *
 * Two things make this pass necessary, and both were missing before:
 *
 * 1. Opera denormalises comments: a room with four comments appears as four otherwise
 *    identical records. The old code kept one entry per room and only ever consulted
 *    the first record's comment, so on a real 117-room export five rooms carrying an
 *    explicit "GA COMP BF" were classified Room Only and would have been refused
 *    breakfast at the door.
 * 2. The join key is `COMMENT_RESV_NAME_ID`, not `RESV_NAME_ID`. They agree on most
 *    rows but genuinely differ on some (6 rows in the reference export), so a comment
 *    can belong to a different reservation than the row carrying it.
 *
 * Runs over *all* records, before any room filtering.
 */
export function collectComments(records: RawRecord[], cols: ColumnMap): Map<string, string[]> {
  const byReservation = new Map<string, string[]>();

  for (const record of records) {
    const comment = field(record, cols.comment);
    if (!comment) continue;

    const key = field(record, cols.commentResvId) || field(record, cols.resvNameId);
    if (!key) continue;

    const existing = byReservation.get(key);
    if (existing) {
      if (!existing.includes(comment)) existing.push(comment);
    } else {
      byReservation.set(key, [comment]);
    }
  }

  return byReservation;
}

/** All records belonging to one physical room. */
export interface RoomGroup {
  roomNumber: string;
  records: RawRecord[];
}

/** Pass B — group records by normalised room number, keeping every record. */
export function groupRooms(records: RawRecord[], cols: ColumnMap): Map<string, RoomGroup> {
  const rooms = new Map<string, RoomGroup>();

  for (const record of records) {
    const roomNumber = normalizeRoom(field(record, cols.room));
    if (roomNumber === null) continue;

    const group = rooms.get(roomNumber);
    if (group) group.records.push(record);
    else rooms.set(roomNumber, { roomNumber, records: [record] });
  }

  return rooms;
}

export interface Classification {
  mealPlan: MealPlan;
  reason: string;
}

/**
 * Pass C — classify one room from *all* its rate codes and *all* comments on *all*
 * reservations that touch it, in the priority order of domain rule 8.3.
 *
 * The old code assigned the meal plan only from whichever record won the primary-guest
 * contest, so an HB or FB code sitting on a sharer record was silently dropped.
 */
export function classifyRoom(rateCodes: string[], comments: string[]): Classification {
  const codes = rateCodes.map((c) => c.toUpperCase().trim()).filter(Boolean);

  // Exact matches first, so the substring tests below can never shadow a known code.
  const fixed = codes.find((c) => FIXED_BREAKFAST_CODES.has(c));

  const fullBoard = codes.find((c) => c.includes('FB'));
  if (fullBoard) {
    return { mealPlan: MEAL_PLANS.FULL_BOARD, reason: `rate code ${fullBoard} contains FB` };
  }

  const halfBoard = codes.find((c) => c.includes('HB'));
  if (halfBoard) {
    return { mealPlan: MEAL_PLANS.HALF_BOARD, reason: `rate code ${halfBoard} contains HB` };
  }

  if (fixed) {
    return { mealPlan: MEAL_PLANS.BREAKFAST, reason: `${fixed} is a fixed breakfast rate code` };
  }

  const granting = comments.find((c) => BREAKFAST_COMMENT.test(c));
  if (granting) {
    const snippet = granting.replace(/\s+/g, ' ').slice(0, 60);
    return { mealPlan: MEAL_PLANS.BREAKFAST, reason: `comment grants breakfast: "${snippet}"` };
  }

  return {
    mealPlan: MEAL_PLANS.ROOM_ONLY,
    reason: codes.length
      ? `no fixed code, no FB/HB, and no BF/MBREAK comment (codes: ${[...new Set(codes)].join(', ')})`
      : 'no rate code and no BF/MBREAK comment',
  };
}

/**
 * `SHARE_NAMES` holds the other occupants of the room as `Last, First`, separated by
 * ` / `. It is populated on 205 of 345 records in the reference export, whereas the
 * ADULTS=0 inference the spec describes finds only a single room — so this column, not
 * the 0-adult heuristic, is the reliable source for accompanying guests.
 */
export function parseShareNames(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split('/')
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => {
      const [last, first] = name.split(',').map((p) => p.trim());
      return first ? `${first} ${last}` : last;
    })
    .filter(Boolean);
}

/** VIP is a single digit 0-7. Anything else is a shifted column, not a VIP tier. */
function parseVip(raw: string): { vip: string; suspicious: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) return { vip: '', suspicious: false };
  const digits = trimmed.replace(/^VIP\s*/i, '').trim();
  if (/^[0-7]$/.test(digits)) return { vip: digits, suspicious: false };
  return { vip: '', suspicious: true };
}

/** Full pipeline: records in, rooms out. Pure — no Firebase, no React, no clock. */
export function buildRooms(
  records: RawRecord[],
  cols: ColumnMap
): { rooms: ParsedRoom[]; anomalies: Anomaly[] } {
  const comments = collectComments(records, cols);
  const groups = groupRooms(records, cols);
  const anomalies: Anomaly[] = [];
  const rooms: ParsedRoom[] = [];

  for (const group of groups.values()) {
    const { roomNumber, records: rows } = group;

    // Primary guest = the record with the highest ADULTS (domain rule 8.1).
    let primary = rows[0];
    for (const row of rows) {
      if (numeric(row, cols.adults) > numeric(primary, cols.adults)) primary = row;
    }

    // If every record has ADULTS = 0, prefer one with a real name or rate code.
    if (numeric(primary, cols.adults) === 0) {
      const better = rows.find(
        (row) => field(row, cols.guestName) !== '' || field(row, cols.rateCode) !== ''
      );
      if (better) primary = better;
    }

    const rateCodes = [
      ...new Set(rows.map((row) => field(row, cols.rateCode)).filter(Boolean)),
    ];

    const reservationIds = new Set(
      rows.flatMap((row) =>
        [field(row, cols.commentResvId), field(row, cols.resvNameId)].filter(Boolean)
      )
    );
    const roomComments = [...reservationIds].flatMap((id) => comments.get(id) ?? []);

    const { mealPlan, reason } = classifyRoom(rateCodes, roomComments);

    const primaryName = field(primary, cols.guestName);
    const adults = numeric(primary, cols.adults);
    const children = numeric(primary, cols.children);

    // Accompanying names: SHARE_NAMES on any record, plus any other distinct GUEST_NAME.
    const accompanying = new Set<string>();
    for (const row of rows) {
      for (const name of parseShareNames(field(row, cols.shareNames))) {
        if (name.toUpperCase() !== primaryName.toUpperCase()) accompanying.add(name);
      }
      const name = field(row, cols.guestName);
      if (name && name.toUpperCase() !== primaryName.toUpperCase()) accompanying.add(name);
    }

    const { vip, suspicious } = parseVip(field(primary, cols.vip));
    if (suspicious) {
      anomalies.push({
        kind: 'suspicious-value',
        room: roomNumber,
        detail:
          `Room ${roomNumber}: VIP column held "${field(primary, cols.vip)}", which is not a tier ` +
          `0-7. Treated as no VIP. This usually means the record's columns are shifted.`,
      });
    }

    const hasAnyIdentity = rows.some(
      (row) =>
        field(row, cols.guestName) !== '' ||
        field(row, cols.rateCode) !== '' ||
        field(row, cols.resvNameId) !== ''
    );

    let issueType: ParsedRoom['issueType'] = null;
    if (!hasAnyIdentity) {
      issueType = 'no-details';
    } else if (adults === 0) {
      issueType = 'no-adults';
    }

    // Rule 1.6: an ambiguous entitlement is granted and flagged, never quietly refused.
    if (mealPlan === MEAL_PLANS.ROOM_ONLY && roomComments.some((c) => /BREAKFAST|B\/FAST/i.test(c))) {
      anomalies.push({
        kind: 'ambiguous-entitlement',
        room: roomNumber,
        detail:
          `Room ${roomNumber} classified Room Only, but a comment mentions breakfast without a ` +
          `BF/MBREAK marker. Verify before refusing service at the door.`,
      });
    }

    rooms.push({
      roomNumber,
      guestName: primaryName || 'RESERVED / NO DETAILS',
      arrivalDate: field(primary, cols.arrival) || 'N/A',
      departureDate: field(primary, cols.departure) || 'N/A',
      mealPlan,
      adults,
      children,
      resvNameId: field(primary, cols.resvNameId),
      accompanyingGuests: [...accompanying],
      vipStatus: vip,
      issueType,
      rateCodes,
      classificationReason: reason,
    });
  }

  rooms.sort((a, b) => compareRooms(a.roomNumber, b.roomNumber));
  return { rooms, anomalies };
}

/**
 * Numeric room ordering. Firestore's `orderBy('roomNumber')` sorts the field as a
 * string, which puts 10 before 9 and 100 before 20 — unusable for a host scanning a
 * 200-row list, so the list is ordered here instead.
 */
export function compareRooms(a: string, b: string): number {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (na !== nb) return na - nb;
  return a.localeCompare(b);
}

export { hasMealEntitlement };
