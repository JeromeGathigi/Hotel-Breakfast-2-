import type { CheckIn, Guest, MealForecastItem, MealServiceType, ReportMetadata, DiningTable } from '../types';
import type { PackageIndex } from '../parsing/packageDetail';
import { lookupPackages } from '../parsing/packageDetail';
import { applyOverride, overrideApplies, type RoomOverride } from '../lib/overrides';
import { assessGuestBreakfast, type GuestBreakfast } from '../lib/entitlement';
import { hasMealEntitlement } from '../lib/meals';
import { lookupRate } from '../lib/rateReferential';
import { vipInfo, type VipInfo } from '../lib/vip';
import { checkinsByRoom, checkinPax } from '../lib/checkins';

/** Everything the door screen reads, as plain data. Firestore fills it; the preview fakes it. */
export interface DoorData {
  hotelId: string;
  today: string;
  guests: Guest[];
  checkins: CheckIn[];
  overrides: RoomOverride[];
  tables: DiningTable[];
  metadata: ReportMetadata | null;
  packages: PackageIndex | null;
  forecastToday: MealForecastItem | null;
  loading: boolean;
  /** Per stream, so one refused read does not blank the whole screen. */
  errors: Partial<Record<'guests' | 'checkins' | 'overrides' | 'tables' | 'metadata' | 'packages' | 'forecast', string>>;
}

export type PlanCategory = 'FB' | 'HB' | 'BB' | 'RO' | '?';

export interface DoorRoom {
  /** The guest as the door sees it today, corrections applied. */
  guest: Guest;
  /** As imported, before any correction. */
  raw: Guest;
  breakfast: GuestBreakfast;
  /** Entitlement for the ACTIVE service: three-valued for breakfast, yes/no for lunch and dinner. */
  entitled: boolean | null;
  /** Covers booked for the active service. */
  booked: { adults: number; children: number; pax: number };
  plan: PlanCategory;
  vip: VipInfo | null;
  checkIn: CheckIn | null;
  /** Spec section 7 data-quality states. */
  dataIssue: 'no-adults' | 'no-details' | null;
  corrected: boolean;
  correction: RoomOverride | null;
}

/** Full board > half board > breakfast > room only - the spec's priority order (section 4). */
export function planCategory(g: Guest, breakfast: GuestBreakfast, packages: PackageIndex | null): PlanCategory {
  const plan = lookupRate(g.rateCode || g.mealPlan)?.plan;
  if (plan === 'FB' || plan === 'AI') return 'FB';
  if (plan === 'HB') return 'HB';
  const pkg = packages ? lookupPackages(packages, g.resvNameId) : null;
  if (pkg?.present && pkg.status === 'breakfast' && pkg.products.some((p) => p === 'DINNER' || p === 'DINNVT')) return 'HB';
  if (breakfast.entitled === true) return 'BB';
  if (breakfast.entitled === false) return 'RO';
  return '?';
}

export function buildDoorRooms(data: DoorData, service: MealServiceType): DoorRoom[] {
  const overrideByRoom = new Map(data.overrides.map((o) => [o.roomNumber, o]));
  const checkins = checkinsByRoom(data.checkins, service);
  const rooms: DoorRoom[] = [];

  for (const raw of data.guests) {
    const override = overrideByRoom.get(raw.roomNumber) ?? null;
    const applies = overrideApplies(override, raw, data.today);
    const guest = applyOverride(raw, override, data.today);
    if (!guest) continue; // a host marked this room as not occupied today

    const breakfast = assessGuestBreakfast(guest, { today: data.today, packages: data.packages, override: applies ? override : null });
    let entitled: boolean | null;
    if (service === 'breakfast') entitled = breakfast.entitled;
    else entitled = hasMealEntitlement(guest.rateCode || guest.mealPlan, service);

    const adults = Math.max(0, Number(guest.adults) || 0);
    const children = Math.max(0, Number(guest.children) || 0);
    const booked =
      service === 'breakfast'
        ? breakfast.entitled === false
          ? { adults: 0, children: 0, pax: 0 }
          : { adults, children, pax: breakfast.pax }
        : entitled
          ? { adults, children, pax: adults + children }
          : { adults: 0, children: 0, pax: 0 };

    rooms.push({
      guest,
      raw,
      breakfast,
      entitled,
      booked,
      plan: planCategory(guest, breakfast, data.packages),
      vip: vipInfo(guest.vipStatus ?? guest.vipLevel),
      checkIn: checkins.get(guest.roomNumber) ?? null,
      dataIssue: guest.issueType === 'no-adults' || guest.issueType === 'no-details' ? guest.issueType : null,
      corrected: applies,
      correction: applies ? override : null,
    });
  }

  return rooms.sort((a, b) => a.guest.roomNumber.localeCompare(b.guest.roomNumber, undefined, { numeric: true }));
}

/* =========================================================================
   STATS - the spec's stats bar and live breakfast status bar (section 6)
   ========================================================================= */

export interface DoorStats {
  totalRooms: number;
  totalPax: number;
  breakfast: { rooms: number; pax: number };
  halfBoard: { rooms: number; pax: number };
  fullBoard: { rooms: number; pax: number };
  roomOnlyRooms: number;
  needsChecking: { rooms: number; pax: number; codes: string[] };
  dataIssues: { noAdults: number; noDetails: number };
  /** Booked covers for this morning: confirmed + unverified, excluding today's arrivals. */
  expectedToday: number;
  checkedIn: { rooms: number; pax: number };
  remaining: { rooms: number; pax: number };
}

export function doorStats(rooms: DoorRoom[], service: MealServiceType): DoorStats {
  const s: DoorStats = {
    totalRooms: rooms.length,
    totalPax: 0,
    breakfast: { rooms: 0, pax: 0 },
    halfBoard: { rooms: 0, pax: 0 },
    fullBoard: { rooms: 0, pax: 0 },
    roomOnlyRooms: 0,
    needsChecking: { rooms: 0, pax: 0, codes: [] },
    dataIssues: { noAdults: 0, noDetails: 0 },
    expectedToday: 0,
    checkedIn: { rooms: 0, pax: 0 },
    remaining: { rooms: 0, pax: 0 },
  };
  const codes = new Set<string>();
  for (const r of rooms) {
    const pax = (Number(r.guest.adults) || 0) + (Number(r.guest.children) || 0);
    s.totalPax += pax;
    if (r.dataIssue === 'no-adults') s.dataIssues.noAdults += 1;
    if (r.dataIssue === 'no-details') s.dataIssues.noDetails += 1;

    if (r.plan === 'FB') {
      s.fullBoard.rooms += 1;
      s.fullBoard.pax += pax;
    } else if (r.plan === 'HB') {
      s.halfBoard.rooms += 1;
      s.halfBoard.pax += pax;
    }
    if (r.breakfast.unverified) {
      s.needsChecking.rooms += 1;
      s.needsChecking.pax += pax;
      const code = String(r.guest.rateCode || r.guest.mealPlan || '').trim().toUpperCase();
      if (code) codes.add(code);
    } else if (r.breakfast.entitled) {
      s.breakfast.rooms += 1;
      s.breakfast.pax += r.breakfast.pax;
    } else {
      s.roomOnlyRooms += 1;
    }

    const servedToday = service !== 'breakfast' || !r.breakfast.arrivesToday;
    const expected = r.entitled !== false && servedToday;
    if (expected) s.expectedToday += service === 'breakfast' ? (r.breakfast.unverified ? pax : r.breakfast.pax) : r.booked.pax;
    if (r.checkIn) {
      s.checkedIn.rooms += 1;
      s.checkedIn.pax += checkinPax(r.checkIn);
    } else if (expected) {
      s.remaining.rooms += 1;
      s.remaining.pax += service === 'breakfast' ? (r.breakfast.unverified ? pax : r.breakfast.pax) : r.booked.pax;
    }
  }
  s.needsChecking.codes = [...codes].sort();
  return s;
}

/* =========================================================================
   RECONCILIATION - Opera's forecast against the guest list (the discrepancy alert)
   ========================================================================= */

export interface Reconciliation {
  level: 'ok' | 'alert' | 'unavailable';
  forecast: number | null;
  /** Confirmed breakfast covers for this morning from the list. */
  confirmed: number;
  /** Covers on rooms the app cannot confirm. */
  unverified: number;
  difference: number | null;
  message: string;
}

/**
 * Opera's own number for this morning against what the guest list confirms.
 *
 * Calibrated on the 2 Sep exports: with both files imported the two agree within 1 at Novotel
 * (99 vs 98) and 2 at ibis (41 vs 43). An alert threshold of max(5 covers, 10%) therefore stays
 * quiet on an ordinary morning and fires when something real is wrong - the wrong day's file, a
 * truncated export, a block of rate codes the app reads the wrong way.
 */
export function reconcile(rooms: DoorRoom[], forecastToday: MealForecastItem | null): Reconciliation {
  let confirmed = 0;
  let unverified = 0;
  for (const r of rooms) {
    if (r.breakfast.arrivesToday) continue;
    const pax = (Number(r.guest.adults) || 0) + (Number(r.guest.children) || 0);
    if (r.breakfast.unverified) unverified += pax;
    else if (r.breakfast.entitled) confirmed += r.breakfast.pax;
  }
  if (!forecastToday || forecastToday.source !== 'package-forecast') {
    return {
      level: 'unavailable',
      forecast: null,
      confirmed,
      unverified,
      difference: null,
      message: "No package forecast has been imported for today, so the list cannot be checked against Opera's own breakfast count.",
    };
  }
  const forecast = forecastToday.totalBreakfast;
  const expected = confirmed + unverified;
  const difference = expected - forecast;
  const threshold = Math.max(5, Math.round(forecast * 0.1));
  // The forecast can legitimately sit anywhere between "confirmed only" and "confirmed plus every
  // unverified room". Only outside that band - by more than the threshold - is it a discrepancy.
  const below = forecast - expected;
  const above = confirmed - forecast;
  const outside = below > threshold || above > threshold;
  const level = outside ? 'alert' : 'ok';
  const message = outside
    ? below > threshold
      ? `Opera expects ${forecast} breakfasts this morning, but the guest list accounts for only ${expected} (${confirmed} confirmed, ${unverified} to check). ` +
        `Rooms may be missing from the list, or the list may be from another day.`
      : `The guest list confirms ${confirmed} breakfasts, but Opera expects only ${forecast}. ` +
        `Check for departed rooms still on the list, or a list from another day.`
    : `Opera expects ${forecast}; the list confirms ${confirmed}${unverified ? ` with ${unverified} still to check` : ''}.`;
  return { level, forecast, confirmed, unverified, difference, message };
}

/* =========================================================================
   SEARCH - exact room first, then rooms starting with the query, then everything else
   ========================================================================= */

export function searchRooms(rooms: DoorRoom[], query: string): DoorRoom[] {
  const q = query.trim().toLowerCase();
  if (!q) return rooms;
  const scored: Array<{ r: DoorRoom; score: number }> = [];
  for (const r of rooms) {
    const g = r.guest;
    const room = g.roomNumber.toLowerCase();
    let score = -1;
    if (room === q) score = 0;
    else if (room.startsWith(q)) score = 1;
    else if (
      g.guestName.toLowerCase().includes(q) ||
      (g.accompanyingGuests ?? []).some((n) => n.toLowerCase().includes(q)) ||
      (g.companyName ?? '').toLowerCase().includes(q) ||
      (g.blockCode ?? '').toLowerCase().includes(q) ||
      room.includes(q)
    )
      score = 2;
    if (score >= 0) scored.push({ r, score });
  }
  return scored.sort((a, b) => a.score - b.score).map((x) => x.r);
}

/** Storage key for "this device has acknowledged this alert today". Never holds guest data. */
export function ackKey(kind: 'unverified' | 'discrepancy' | 'data-quality', hotelId: string, date: string, signature: string): string {
  return `door-ack:${kind}:${hotelId}:${date}:${signature}`;
}

/**
 * One line saying WHY a room has (or has not) got breakfast, for the card.
 *
 * The card used to show the rate's own label - "STAY LONGER AND SAVE RATE (RO)" - next to a green
 * "Breakfast" chip whenever Opera or the front office had added breakfast to a room-only rate,
 * which reads as a contradiction to a host. The decisive source is shown instead.
 */
export function breakfastBasisLabel(room: DoorRoom): string {
  const b = room.breakfast;
  const decisive = b.evidence.find((e) => e.source === b.basis);
  const code = (room.guest.rateCode || room.guest.mealPlan || '').toUpperCase();
  switch (b.basis) {
    case 'correction':
      return room.correction?.note ? `Confirmed at the door - ${room.correction.note}` : 'Confirmed at the door';
    case 'opera-package':
      return decisive ? `Opera package: ${decisive.detail}` : 'Opera package list';
    case 'note':
      return decisive ? `Front-office note: ${decisive.detail}` : 'Front-office note';
    case 'property-list':
      return `${code} · on the property's breakfast rate list`;
    default:
      return '';
  }
}
