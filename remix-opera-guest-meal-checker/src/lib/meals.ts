/**
 * Single source of truth for meal-plan identity and breakfast entitlement.
 *
 * Before this file existed, `GuestList`, `GuestSearch`, `CheckInModal` and `Analytics`
 * each carried their own inline `plan.includes('breakfast')`-style predicate. They
 * disagreed, which is how Room Only guests ended up counted as no-shows and how a
 * Room Only room could be checked in with no over-capacity prompt.
 */

/**
 * Display strings are load-bearing: they are persisted on every guest document and
 * matched by the existing UI. Do not change them without a Firestore migration.
 */
export const MEAL_PLANS = {
  FULL_BOARD: 'Full Board',
  HALF_BOARD: 'Half Board',
  BREAKFAST: 'Breakfast',
  ROOM_ONLY: 'Room Only / No Package',
} as const;

export type MealPlan = (typeof MEAL_PLANS)[keyof typeof MEAL_PLANS];

/**
 * Plans that entitle the room to breakfast, in the priority order of domain rule 8.3:
 * Full Board > Half Board > Breakfast > Room Only.
 */
export const MEAL_PLAN_PRIORITY: MealPlan[] = [
  MEAL_PLANS.FULL_BOARD,
  MEAL_PLANS.HALF_BOARD,
  MEAL_PLANS.BREAKFAST,
  MEAL_PLANS.ROOM_ONLY,
];

/**
 * OPEN DECISION (brief section 10.1) — awaiting the property team.
 *
 * Children eat free under 12 (ibis) / 16 (Novotel), which is why they appear in the
 * over-capacity reason list. So are they *booked*, or an allowance on top of the booking?
 *
 * `true` preserves the behaviour the app shipped with. Flipping this one constant changes
 * booked totals, no-shows, variance and attendance rate consistently everywhere, because
 * every one of those figures now derives from `entitledPax()` below.
 */
export const COUNT_CHILDREN_AS_BOOKED = true;

/**
 * True when the room's plan includes breakfast in any form.
 *
 * Tolerant of free-text plans written by the Data Quality correction flow
 * ("Breakfast (Manual)") and of legacy documents written before `MEAL_PLANS` existed.
 */
export function canonicalPlan(mealPlan: string | null | undefined): MealPlan {
  const plan = (mealPlan ?? '').toLowerCase();
  if (plan.includes('full')) return MEAL_PLANS.FULL_BOARD;
  if (plan.includes('half')) return MEAL_PLANS.HALF_BOARD;
  if (plan.includes('breakfast')) return MEAL_PLANS.BREAKFAST;
  return MEAL_PLANS.ROOM_ONLY;
}

export function hasMealEntitlement(mealPlan: string | null | undefined): boolean {
  return canonicalPlan(mealPlan) !== MEAL_PLANS.ROOM_ONLY;
}

/**
 * How many covers this room is entitled to.
 *
 * Room Only returns 0 — so *any* check-in against it is over-capacity and must go
 * through the reason + authoriser flow. That is the case the shipped code was blind to.
 */
export function entitledPax(guest: {
  mealPlan?: string | null;
  adults?: number | null;
  children?: number | null;
}): number {
  if (!hasMealEntitlement(guest.mealPlan)) return 0;
  const adults = Number(guest.adults ?? 0) || 0;
  const children = Number(guest.children ?? 0) || 0;
  return COUNT_CHILDREN_AS_BOOKED ? adults + children : adults;
}

export const OVER_CAPACITY_REASONS = {
  CHILD_FREE_AGE: 'CHILD_FREE_AGE',
  INFANT_FREE: 'INFANT_FREE',
  NO_PACKAGE: 'NO_PACKAGE',
  OTHER: 'OTHER',
} as const;

export type OverCapacityReason = (typeof OVER_CAPACITY_REASONS)[keyof typeof OVER_CAPACITY_REASONS];

/** Free-child age threshold for the property. Never show both (domain rule 8.5). */
export function freeChildAge(hotelId: string): number {
  return hotelId === 'ibis' ? 12 : 16;
}

export function overCapacityLabel(code: OverCapacityReason, hotelId: string): string {
  switch (code) {
    case OVER_CAPACITY_REASONS.CHILD_FREE_AGE:
      return `Free breakfast for child below ${freeChildAge(hotelId)} years old`;
    case OVER_CAPACITY_REASONS.INFANT_FREE:
      return 'Free breakfast for infant below 2 years old';
    case OVER_CAPACITY_REASONS.NO_PACKAGE:
      return 'Room has no breakfast package — admitted by authorisation';
    case OVER_CAPACITY_REASONS.OTHER:
      return 'Other (specified below)';
    default:
      return 'Unknown reason';
  }
}

export function availableOverCapacityReasons(args: {
  mealPlan: string | null | undefined;
  bookedAdults: number;
  bookedChildren: number;
  adults: number;
  children: number;
  infants: number;
}): OverCapacityReason[] {
  const { mealPlan, bookedAdults, bookedChildren, adults, children, infants } = args;

  if (!hasMealEntitlement(mealPlan)) {
    return [OVER_CAPACITY_REASONS.NO_PACKAGE, OVER_CAPACITY_REASONS.OTHER];
  }

  if (adults > bookedAdults) {
    return [OVER_CAPACITY_REASONS.OTHER];
  }

  const reasons: OverCapacityReason[] = [];
  if (children > bookedChildren || infants > 0) {
    reasons.push(OVER_CAPACITY_REASONS.CHILD_FREE_AGE, OVER_CAPACITY_REASONS.INFANT_FREE);
  }
  if (reasons.length === 0) {
    return [OVER_CAPACITY_REASONS.OTHER];
  }
  return [...reasons, OVER_CAPACITY_REASONS.OTHER];
}
