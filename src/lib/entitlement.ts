import type { Guest } from '../types';
import { assessBreakfast } from './meals';
import { breakfastFromNotes } from './noteSignals';
import { lookupPackages, type PackageIndex } from '../parsing/packageDetail';
import { overrideApplies, type RoomOverride } from './overrides';
import { addDays } from './businessDate';

/**
 * Does this room get breakfast THIS MORNING - and how sure are we?
 *
 * Evidence, strongest first:
 *
 *   1. a person's correction for today            (hotels/{id}/overrides)
 *   2. Opera's own package attachment              (the package-forecast export, by RESV_NAME_ID)
 *   3. the front office's reservation notes        ("PM : 2 : RB", "GA RO AT ...", "COMP BF")
 *   4. the property's fixed-breakfast rate list    (spec, section 4)
 *   5. Accor's global rate referential
 *   6. a pattern guess on the rate code's name
 *
 * The answer stays three-valued. `entitled: null` means the data cannot say, and it is never
 * collapsed to false - at the door an unanswerable room is GRANTED (`door: true`) and flagged, because
 * refusing a guest who paid is worse than seating one who did not. Where sources disagree the
 * room is flagged as a conflict so a host sees why, instead of the app quietly picking a side.
 *
 * Calibrated on the 2 Sep exports: Opera's packages and the notes agreed on every Novotel room that
 * had both; together they confirm breakfast for 97 Novotel guests against Opera's own forecast of
 * 98, where the rate code alone could confirm 20.
 */

export type EvidenceSource =
  | 'correction'
  | 'opera-package'
  | 'note'
  | 'property-list'
  | 'rate-referential'
  | 'rate-pattern';

export interface Evidence {
  source: EvidenceSource;
  says: 'breakfast' | 'room-only' | 'unclear';
  detail: string;
}

export interface GuestBreakfast {
  /** true breakfast, false room only, null the data cannot say. */
  entitled: boolean | null;
  /** What the door does: serve unless the answer is a confirmed no. */
  door: boolean;
  /** A person should confirm before relying on it. */
  unverified: boolean;
  /** Two sources disagree. The room is decided, but someone should know. */
  conflict: boolean;
  basis: EvidenceSource | 'none';
  /** One sentence a host can act on. */
  reason: string;
  evidence: Evidence[];
  /** Breakfast covers booked for the room (0 when the answer is no). */
  pax: number;
  /** Arrived today: an Opera breakfast package starts with TOMORROW's breakfast. */
  arrivesToday: boolean;
}

export interface EntitlementContext {
  /** Today's business date, YYYY-MM-DD. */
  today: string;
  /** The latest package-forecast index for this hotel, if one was imported. */
  packages?: PackageIndex | null;
  /** A correction recorded for this room, if any. Applied only when it is for today and this reservation. */
  override?: RoomOverride | null;
}

const LABEL: Record<EvidenceSource, string> = {
  correction: 'A correction made at the door',
  'opera-package': "Opera's package list",
  note: 'The front-office note',
  'property-list': "The property's rate list",
  'rate-referential': "Accor's rate referential",
  'rate-pattern': 'The rate code name',
};

/**
 * Whether a package index can speak for this reservation at all.
 *  - presence of a breakfast package is evidence whenever the index exists;
 *  - ABSENCE is evidence only if the report is from today or yesterday and the reservation had
 *    already arrived by the time Opera produced it. Otherwise it may simply not have existed yet.
 */
function absenceIsMeaningful(index: PackageIndex, guest: Guest, today: string): boolean {
  if (!index.reportDate) return false;
  const recent = index.reportDate === today || index.reportDate === addDays(today, -1);
  const arrivedBeforeReport = !guest.arrivalDate || guest.arrivalDate <= index.reportDate;
  return recent && arrivedBeforeReport;
}

export function assessGuestBreakfast(guest: Guest, ctx: EntitlementContext): GuestBreakfast {
  const roomPax = Math.max(0, Number(guest.adults) || 0) + Math.max(0, Number(guest.children) || 0);
  const arrivesToday = Boolean(guest.arrivalDate) && guest.arrivalDate === ctx.today;
  const evidence: Evidence[] = [];

  const result = (
    entitled: boolean | null,
    basis: GuestBreakfast['basis'],
    reason: string,
    opts: { conflict?: boolean; unverified?: boolean; pax?: number } = {}
  ): GuestBreakfast => ({
    entitled,
    door: entitled !== false,
    unverified: opts.unverified ?? entitled === null,
    conflict: opts.conflict ?? false,
    basis,
    reason,
    evidence,
    pax: entitled === false ? 0 : opts.pax ?? roomPax,
    arrivesToday,
  });

  // 1. A person's correction for today wins outright.
  if (overrideApplies(ctx.override, guest, ctx.today) && typeof ctx.override.breakfast === 'boolean') {
    const o = ctx.override;
    evidence.push({
      source: 'correction',
      says: o.breakfast ? 'breakfast' : 'room-only',
      detail: `${o.recordedBy}${o.note ? ` - ${o.note}` : ''}`,
    });
    const pax = o.breakfast ? (Number.isFinite(o.breakfastPax) ? Number(o.breakfastPax) : roomPax) : 0;
    return result(o.breakfast, 'correction', o.breakfast ? `Confirmed at the door: breakfast for ${pax}.` : 'Confirmed at the door: room only.', {
      pax,
      unverified: false,
    });
  }

  // Gather everything else before deciding, so the evidence list is complete for display.
  const pkg = ctx.packages ? lookupPackages(ctx.packages, guest.resvNameId) : null;
  const pkgMeaningfulAbsence = Boolean(ctx.packages) && absenceIsMeaningful(ctx.packages!, guest, ctx.today);
  let pkgSays: Evidence['says'] | null = null;
  if (pkg) {
    if (pkg.present && pkg.status === 'breakfast') {
      pkgSays = 'breakfast';
      evidence.push({ source: 'opera-package', says: 'breakfast', detail: `${pkg.products.join(', ')} for ${pkg.persons}` });
    } else if (pkg.present && pkg.status === 'meeting-only') {
      pkgSays = 'unclear';
      evidence.push({
        source: 'opera-package',
        says: 'unclear',
        detail: `only ${pkg.products.join(', ')} - a meeting package Opera files with breakfast`,
      });
    } else if (pkg.present) {
      pkgSays = 'room-only';
      evidence.push({ source: 'opera-package', says: 'room-only', detail: `${pkg.products.join(', ') || 'no product'}, no breakfast` });
    } else if (pkgMeaningfulAbsence) {
      pkgSays = 'room-only';
      evidence.push({ source: 'opera-package', says: 'room-only', detail: 'no package on this reservation' });
    }
  }

  const notes = breakfastFromNotes(guest.notes);
  const noteSays: Evidence['says'] | null =
    notes.verdict === 'BF' ? 'breakfast' : notes.verdict === 'RO' ? 'room-only' : null;
  if (noteSays) evidence.push({ source: 'note', says: noteSays, detail: notes.evidence });

  const rate = assessBreakfast(guest.rateCode || guest.mealPlan);
  let rateSource: EvidenceSource | null = null;
  let rateSays: Evidence['says'] | null = null;
  if (!rate.unverified && rate.entitled !== null) {
    rateSource = rate.basis === 'property' ? 'property-list' : 'rate-referential';
    rateSays = rate.entitled ? 'breakfast' : 'room-only';
  } else if (rate.basis === 'pattern') {
    rateSource = 'rate-pattern';
    rateSays = 'breakfast';
  } else if (rate.basis === 'contract' || rate.basis === 'package') {
    rateSource = 'rate-referential';
    rateSays = 'unclear';
  }
  if (rateSource && rateSays) {
    evidence.push({ source: rateSource, says: rateSays, detail: rate.reason });
  }

  const othersSayingBreakfast = evidence.filter((e) => e.source !== 'opera-package' && e.says === 'breakfast' && e.source !== 'rate-pattern');
  const pkgPax = pkg?.present && pkg.persons > 0 ? pkg.persons : roomPax;

  // 2. Opera's package attachment.
  //
  // "Conflict" is reserved for disagreement between RESERVATION-level sources - a correction, the
  // package, the note. A package or note overriding the rate code is normal, not a conflict: the
  // spec says DSO, DAF, ACOFF, HOUSE and any code not on the fixed list "depend entirely on
  // comments", and a complimentary breakfast on a Room Only rate is routine (six Novotel rooms on
  // 2 Sep, every one confirmed by Opera's BFCOMP package).
  if (pkgSays === 'breakfast') {
    return result(true, 'opera-package', `Opera has a breakfast package on this reservation (${pkg!.products.join(', ')}).`, {
      pax: pkgPax,
      conflict: noteSays === 'room-only',
      unverified: false,
    });
  }
  if (pkgSays === 'unclear') {
    return result(
      null,
      'opera-package',
      `Opera only attaches ${pkg!.products.join(', ')} - a meeting package it files with breakfast. Check with the front office before relying on it.`,
      { pax: pkgPax }
    );
  }
  if (pkgSays === 'room-only') {
    if (othersSayingBreakfast.length > 0) {
      const who = LABEL[othersSayingBreakfast[0].source].toLowerCase();
      return result(null, 'opera-package', `Opera shows no breakfast package, but ${who} says breakfast. Check with the front office.`, {
        conflict: true,
      });
    }
    return result(false, 'opera-package', 'Opera has no breakfast package on this reservation - room only.', { unverified: false });
  }

  // 3. The front-office note. It outranks the rate code by the spec's own rule.
  if (noteSays === 'breakfast') {
    return result(true, 'note', `The front-office note says breakfast ("${notes.evidence}").`, { unverified: false });
  }
  if (noteSays === 'room-only') {
    if (rateSays === 'breakfast' && rateSource !== 'rate-pattern') {
      return result(null, 'note', `The note says room only, but ${LABEL[rateSource!].toLowerCase()} says breakfast. Check with the front office.`, {
        conflict: true,
      });
    }
    if (notes.mentionsMbreak) {
      return result(
        null,
        'note',
        'The note says room only but mentions MBREAK, which the property spec counts as breakfast. Check with the front office.',
        { conflict: true }
      );
    }
    return result(false, 'note', `The front-office note says room only ("${notes.evidence}").`, { unverified: false });
  }

  // 4-6. The rate code on its own.
  if (rate.unverified || rate.entitled === null) {
    return result(rate.entitled, rate.basis === 'pattern' ? 'rate-pattern' : 'none', rate.reason, {
      unverified: true,
      pax: rate.entitled === false ? 0 : roomPax,
    });
  }
  return result(rate.entitled, rateSource ?? 'rate-referential', rate.reason, { unverified: false });
}

/**
 * Breakfast covers, honestly: three buckets that always add up to the room total.
 *
 * `expected*` counts only rooms whose breakfast is THIS morning: a room that arrived today has its
 * first package breakfast tomorrow, which is exactly how Opera's own forecast counts (97 vs 98 at
 * Novotel on 2 Sep once today's arrivals are left out; 108 if they are not).
 */
export interface BreakfastSummary {
  rooms: number;
  pax: number;
  includedRooms: number;
  includedPax: number;
  excludedRooms: number;
  excludedPax: number;
  unverifiedRooms: number;
  unverifiedPax: number;
  /** Included + unverified, excluding today's arrivals: what the door should expect this morning. */
  expectedTodayPax: number;
  arrivalsTodayRooms: number;
  conflictRooms: number;
  unverifiedCodes: string[];
}

export function summariseBreakfast(guests: Guest[], assess: (g: Guest) => GuestBreakfast): BreakfastSummary {
  const s: BreakfastSummary = {
    rooms: 0,
    pax: 0,
    includedRooms: 0,
    includedPax: 0,
    excludedRooms: 0,
    excludedPax: 0,
    unverifiedRooms: 0,
    unverifiedPax: 0,
    expectedTodayPax: 0,
    arrivalsTodayRooms: 0,
    conflictRooms: 0,
    unverifiedCodes: [],
  };
  const codes = new Set<string>();
  for (const g of guests) {
    const a = assess(g);
    const roomPax = Math.max(0, Number(g.adults) || 0) + Math.max(0, Number(g.children) || 0);
    s.rooms += 1;
    s.pax += roomPax;
    if (a.arrivesToday) s.arrivalsTodayRooms += 1;
    if (a.conflict) s.conflictRooms += 1;
    if (a.unverified) {
      s.unverifiedRooms += 1;
      s.unverifiedPax += roomPax;
      const code = String(g.rateCode || g.mealPlan || '').trim().toUpperCase();
      if (code) codes.add(code);
      if (!a.arrivesToday) s.expectedTodayPax += roomPax;
    } else if (a.entitled) {
      s.includedRooms += 1;
      s.includedPax += roomPax;
      if (!a.arrivesToday) s.expectedTodayPax += a.pax;
    } else {
      s.excludedRooms += 1;
      s.excludedPax += roomPax;
    }
  }
  s.unverifiedCodes = [...codes].sort();
  return s;
}
