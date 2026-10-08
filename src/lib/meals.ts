import { Guest, MealServiceType } from '../types';
import { breakfastFromRate, lookupRate } from './rateReferential';

export const OVER_CAPACITY_REASONS = {
  STAFF_APPROVED: 'STAFF_APPROVED',
  ROOM_CHARGE: 'ROOM_CHARGE',
  CHILD_COMPLIMENTARY: 'CHILD_COMPLIMENTARY',
  VIP_BENEFIT: 'VIP_BENEFIT',
  CONFERENCE_EXTRA: 'CONFERENCE_EXTRA',
  OTHER: 'OTHER',
} as const;

export function freeChildAge(hotelId: string): number {
  return hotelId.toLowerCase().includes('ibis') ? 12 : 16;
}

/* =========================================================================
   BREAKFAST ENTITLEMENT

   The Opera export has NO meal-plan field, so `parseInHouseReport` puts the rate code into
   `guest.mealPlan`. Everything below therefore reasons about a rate code.

   This used to be decided by substring-matching that code for 'BB' / 'BF' / 'RB'. Measured
   against Accor's Global Rate Referential on the real 2 Sep exports, that granted breakfast
   to 24 of 162 Novotel adults where Opera's own package forecast said 98, and 10 of 135 ibis
   adults where Opera said 43. The error ran ONE WAY ONLY: the app never gave breakfast away,
   it silently refused it - the opposite of this project's standing rule, which is to bias
   ambiguity toward granting and flag it.
   ========================================================================= */

/**
 * Flat by design - the project compiles without `strict`, where discriminated-union narrowing
 * does not work reliably. A previous attempt at a tagged union here had to be reverted.
 */
export interface BreakfastAssessment {
  /**
   * true  - include this room in breakfast
   * false - the rate is Room Only
   * null  - THE DATA CANNOT SAY. Ask a human. Never collapse this to false; that is the bug
   *         this whole module exists to fix.
   */
  entitled: boolean | null;
  /** 'referential' | 'aspac' | 'property' | 'contract' | 'package' | 'explicit' | 'pattern' | 'blank' | 'unlisted' */
  basis: string;
  /** True when the answer is a guess or unanswerable. Drives the unknown-rate-code alert. */
  unverified: boolean;
  /** One sentence a host or manager can act on. */
  reason: string;
  /** The rate's name in the referential, when it is listed there. */
  rateName: string;
}

/**
 * Rate codes the PROPERTY defines as breakfast-inclusive, from its own spec ("Opera Guest Meal
 * Checker - Full Project Summary", May 2026, section 4, Step 1: "Fixed Breakfast Rate Codes - no
 * comment check needed").
 *
 * Six of these are also in Accor's global referential, as BB, so the two sources agree. The other
 * five - PKGH1, C01, CREWESR, TGLLSR, LDR - are property-local codes the global file does not list;
 * until this list was wired in they were reported as "cannot confirm", which put 13 Novotel and 14
 * ibis adults in the needs-checking pile on the 2 Sep exports for no reason the property did not
 * already answer.
 */
export const PROPERTY_BREAKFAST_CODES: ReadonlySet<string> = new Set([
  'FLMRB1', 'FLMRB3', 'FMRB3S', 'DRB1', 'DRB3S', 'FLRB1', 'PKGH1',
  'C01', 'CREWESR', 'TGLLSR', 'TGLL', 'LDR',
]);

/** Tokens that indicate breakfast when a code is not in the global referential. */
const BREAKFAST_PATTERNS = [
  'BREAKFAST',
  'BFCOMP',
  'CNFBB',
  'BKF',
  'ABF',
  'BB',
  'BF',
  'RB',
];

/**
 * Codes that LOOK like breakfast to a loose pattern match but are not breakfast at all.
 * MBREAK is a meeting morning coffee break and MBUFF a meeting buffet; the previous
 * implementation granted breakfast for both.
 */
const NOT_BREAKFAST_PATTERNS = ['MBREAK', 'MBUFF'];

function patternSaysBreakfast(code: string): boolean {
  if (NOT_BREAKFAST_PATTERNS.some((t) => code.includes(t))) return false;
  return BREAKFAST_PATTERNS.some((t) => code.includes(t));
}

/**
 * Some values in this field are not rate codes at all but a spelled-out meal plan - either
 * because a comment scan produced one, or because the export carried plain text such as
 * "RO - Room Only". When a plan is stated in words it is unambiguous, so honour it.
 *
 * Returns true for breakfast, false for room only, null when the text states nothing.
 *
 * Note the word-boundary test on the bare token `RO`. A substring test would match TRIPRO,
 * EURO and PROMO - and TRIPRO is a real code at Novotel carrying 10 adults.
 */
function explicitPlanFromText(text: string): boolean | null {
  if (/BED\s*(&|AND)\s*BREAKFAST|HALF\s*BOARD|FULL\s*BOARD|ALL\s*INCLUSIVE|BREAKFAST\s*INCLUDED/.test(text)) {
    return true;
  }
  if (/ROOM\s*ONLY/.test(text)) return false;
  if (/(^|[^A-Z0-9])RO([^A-Z0-9]|$)/.test(text) && !patternSaysBreakfast(text)) return false;
  return null;
}

/**
 * The single source of truth for whether a room gets breakfast, in precedence order:
 *
 *   1. An exact hit in Accor's Global Rate Referential that gives a determinate answer.
 *   2. An exact hit that is contract- or package-dependent -> unanswerable, flagged.
 *   3. No hit (a property-local code) -> pattern match, flagged as a guess.
 *   4. No hit and no pattern -> unanswerable, flagged.
 *
 * Exact match only. The Novotel resort code is literally `HB4F8`; a loose `HB` test reads it
 * as Half Board.
 */
export function assessBreakfast(mealPlan: string | undefined | null): BreakfastAssessment {
  const code = String(mealPlan ?? '').trim().toUpperCase();

  if (!code) {
    return {
      entitled: null,
      basis: 'blank',
      unverified: true,
      reason: 'This reservation has no rate code. Check the guest in Opera before serving.',
      rateName: '',
    };
  }

  const info = lookupRate(code);
  const fromRate = breakfastFromRate(code);

  if (info && fromRate !== null) {
    const aspac = info.plan === 'ASPAC';
    return {
      entitled: fromRate,
      basis: aspac ? 'aspac' : 'referential',
      unverified: false,
      reason: aspac
        ? `${code} reads as Room Only on weekdays, but the ASPAC override makes it Bed & Breakfast every day. Chiang Mai is ASPAC, so breakfast is included.`
        : fromRate
          ? `${code} is ${info.plan} in Accor's rate referential - breakfast included.`
          : `${code} is Room Only in Accor's rate referential - breakfast not included.`,
      rateName: info.name,
    };
  }

  if (info && info.plan === 'CONTRACT') {
    return {
      entitled: null,
      basis: 'contract',
      unverified: true,
      // BGCI / BGPG / BGRE. Accor's own text is "Accoriding the contract".
      reason: `${code} (${info.name}) is set by the group's contract, not by the rate. No rate table can answer it - check the block's contract.`,
      rateName: info.name,
    };
  }

  if (info && info.plan === 'PACKAGE') {
    return {
      entitled: null,
      basis: 'package',
      unverified: true,
      reason: `${code} (${info.name}) depends on what the package bundles. Check the reservation's packages in Opera.`,
      rateName: info.name,
    };
  }

  // Not in Accor's referential, but on the property's own fixed-breakfast list.
  if (!info && PROPERTY_BREAKFAST_CODES.has(code)) {
    return {
      entitled: true,
      basis: 'property',
      unverified: false,
      reason: `${code} is on the property's fixed-breakfast rate list - breakfast included.`,
      rateName: '',
    };
  }

  // Not a listed rate code. It may still state a plan in words.
  const explicit = explicitPlanFromText(code);
  if (explicit !== null) {
    return {
      entitled: explicit,
      basis: 'explicit',
      unverified: false,
      reason: explicit
        ? 'The reservation states a plan that includes breakfast.'
        : 'The reservation states Room Only.',
      rateName: '',
    };
  }

  // Not in the global referential at all. Normal for property-local codes: C01MRO, LDR, C20,
  // TRIPRO, CREWESR, MASTBB and similar are configured in the property's own Opera.
  if (patternSaysBreakfast(code)) {
    return {
      entitled: true,
      basis: 'pattern',
      unverified: true,
      reason: `${code} is not in Accor's rate referential. Its name suggests breakfast, so it is being granted - but this is a guess and should be confirmed.`,
      rateName: '',
    };
  }

  return {
    entitled: null,
    basis: 'unlisted',
    unverified: true,
    reason: `${code} is not in Accor's rate referential and nothing about it indicates breakfast. Confirm with the front office before refusing a guest.`,
    rateName: '',
  };
}

/**
 * The door-facing yes/no.
 *
 * An unanswerable rate resolves to TRUE here, deliberately. At the restaurant door, refusing
 * someone who paid for breakfast is worse than seating someone who did not, and every such
 * room is flagged `unverified` so staff are prompted rather than the guest silently turned
 * away. Do NOT use this for covers arithmetic - use `breakfastBuckets`, which keeps the
 * unverified rooms in their own bucket instead of quietly picking a side.
 */
export function hasMealEntitlement(
  mealPlan: string | undefined | null,
  service: MealServiceType = 'breakfast'
): boolean {
  if (service === 'breakfast') {
    return assessBreakfast(mealPlan).entitled !== false;
  }

  const code = String(mealPlan ?? '').trim().toUpperCase();
  if (!code) return false;

  const plan = lookupRate(code)?.plan ?? '';

  if (service === 'dinner') {
    // Half Board and above include dinner.
    if (plan === 'HB' || plan === 'FB' || plan === 'AI') return true;
    if (plan === 'RO' || plan === 'BB') return false;
    return (
      code.includes('HALF BOARD') ||
      code.includes('FULL BOARD') ||
      code.includes('DINNER') ||
      code.includes('DINNVT') ||
      /(^|[^A-Z0-9])(HB|FB)([^A-Z0-9]|$)/.test(code)
    );
  }

  if (service === 'lunch') {
    // Only Full Board and All Inclusive include lunch; Half Board is dinner, not lunch.
    if (plan === 'FB' || plan === 'AI') return true;
    if (plan === 'RO' || plan === 'BB' || plan === 'HB') return false;
    return (
      code.includes('LUNCH') ||
      code.includes('FULL BOARD') ||
      /(^|[^A-Z0-9])FB([^A-Z0-9]|$)/.test(code) ||
      code.includes('CONF') ||
      code.includes('CNF') ||
      code.includes('MBUFF')
    );
  }

  return false;
}

/**
 * Covers arithmetic, honestly. Three buckets, never two.
 *
 * Folding `unverified` into `included` inflates the kitchen's number; folding it into
 * `excluded` is the defect this module replaces. Report it separately and reconcile against
 * Opera's package forecast, which is the authoritative total.
 */
export function breakfastBuckets(guests: Guest[]): {
  includedRooms: number;
  includedPax: number;
  excludedRooms: number;
  excludedPax: number;
  unverifiedRooms: number;
  unverifiedPax: number;
  unverifiedCodes: string[];
} {
  const out = {
    includedRooms: 0,
    includedPax: 0,
    excludedRooms: 0,
    excludedPax: 0,
    unverifiedRooms: 0,
    unverifiedPax: 0,
    unverifiedCodes: [] as string[],
  };
  const codes = new Set<string>();

  for (const guest of guests || []) {
    const pax = (guest.adults || 0) + (guest.children || 0);
    const assessment = assessBreakfast(guest.mealPlan);

    if (assessment.unverified) {
      out.unverifiedRooms += 1;
      out.unverifiedPax += pax;
      const code = String(guest.mealPlan ?? '').trim().toUpperCase();
      if (code) codes.add(code);
      continue;
    }
    if (assessment.entitled) {
      out.includedRooms += 1;
      out.includedPax += pax;
    } else {
      out.excludedRooms += 1;
      out.excludedPax += pax;
    }
  }

  out.unverifiedCodes = Array.from(codes).sort();
  return out;
}

export function entitledPax(guest: Guest, service: MealServiceType = 'breakfast'): number {
  if (!hasMealEntitlement(guest.mealPlan, service)) return 0;
  return (guest.adults || 0) + (guest.children || 0);
}

/** A human label for the rate, preferring the referential's own name. */
export function canonicalPlan(plan: string | undefined | null): string {
  if (!plan) return 'No rate code';
  const code = plan.trim().toUpperCase();

  const info = lookupRate(code);
  if (info) {
    const suffix =
      info.plan === 'ASPAC'
        ? 'BB here (ASPAC)'
        : info.plan === 'CONTRACT'
          ? 'per contract'
          : info.plan === 'PACKAGE'
            ? 'per package'
            : info.plan;
    return `${info.name} (${suffix})`;
  }

  if (PROPERTY_BREAKFAST_CODES.has(code)) return `${code} (BB - property rate list)`;

  // Property-local codes and product codes the referential does not list.
  if (code.includes('BFCOMP')) return 'Complimentary Breakfast (BFCOMP)';
  if (code.includes('CNFBB')) return 'Conference Breakfast (CNFBB)';
  if (code.includes('BF350NET')) return 'Breakfast 350 Net (BF350NET)';
  if (code.includes('BF260NET')) return 'Breakfast 260 Net (BF260NET)';
  if (code.includes('DINNVT') || code.includes('DINNER')) return 'Dinner Package (DINNER)';
  if (code.includes('MBREAK')) return 'Meeting Morning Break (MBREAK) - not breakfast';
  if (code.includes('MBUFF')) return 'Meeting Buffet (MBUFF) - not breakfast';
  return `${plan} (not in rate referential)`;
}

export function overCapacityLabel(code: string, hotelId: string = 'novotel'): string {
  switch (code) {
    case OVER_CAPACITY_REASONS.STAFF_APPROVED:
      return 'Staff Approved';
    case OVER_CAPACITY_REASONS.ROOM_CHARGE:
      return 'Room Charge / Paid Walk-In';
    case OVER_CAPACITY_REASONS.CHILD_COMPLIMENTARY:
      return `Child complimentary (under ${freeChildAge(hotelId)} years)`;
    case OVER_CAPACITY_REASONS.VIP_BENEFIT:
      return 'VIP / Loyalty Benefit';
    case OVER_CAPACITY_REASONS.CONFERENCE_EXTRA:
      return 'Conference Group Add-on';
    case OVER_CAPACITY_REASONS.OTHER:
      return 'Other Reason';
    default:
      return code;
  }
}

export function availableOverCapacityReasons(hotelId: string = 'novotel'): Array<{ code: string; label: string }> {
  return [
    { code: OVER_CAPACITY_REASONS.STAFF_APPROVED, label: 'Manager / Staff Approved' },
    { code: OVER_CAPACITY_REASONS.ROOM_CHARGE, label: 'Room Charge (Post to Folio)' },
    { code: OVER_CAPACITY_REASONS.CHILD_COMPLIMENTARY, label: `Child complimentary (under ${freeChildAge(hotelId)} years)` },
    { code: OVER_CAPACITY_REASONS.VIP_BENEFIT, label: 'ALL Accor Diamond / Platinum Benefit' },
    { code: OVER_CAPACITY_REASONS.CONFERENCE_EXTRA, label: 'Conference / Event Extra Cover' },
    { code: OVER_CAPACITY_REASONS.OTHER, label: 'Other Specified Reason' },
  ];
}
