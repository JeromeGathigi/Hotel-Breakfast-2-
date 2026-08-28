import { describe, expect, it } from 'vitest';
import { MEAL_PLANS, canonicalPlan, entitledPax, overCapacityLabel, OVER_CAPACITY_REASONS, availableOverCapacityReasons } from './meals';

describe('meal-plan canonicalisation', () => {
  it('normalises legacy and manual variants to a single canonical plan', () => {
    expect(canonicalPlan('Full Board')).toBe(MEAL_PLANS.FULL_BOARD);
    expect(canonicalPlan('Half Board')).toBe(MEAL_PLANS.HALF_BOARD);
    expect(canonicalPlan('Breakfast')).toBe(MEAL_PLANS.BREAKFAST);
    expect(canonicalPlan('Breakfast (Manual)')).toBe(MEAL_PLANS.BREAKFAST);
    expect(canonicalPlan('Room Only / No Package')).toBe(MEAL_PLANS.ROOM_ONLY);
    expect(canonicalPlan('Room Only (Manual)')).toBe(MEAL_PLANS.ROOM_ONLY);
    expect(canonicalPlan('')).toBe(MEAL_PLANS.ROOM_ONLY);
    expect(canonicalPlan(null)).toBe(MEAL_PLANS.ROOM_ONLY);
    expect(canonicalPlan(undefined)).toBe(MEAL_PLANS.ROOM_ONLY);
  });

  it('keeps Room Only at zero entitlement', () => {
    expect(entitledPax({ mealPlan: 'Room Only / No Package', adults: 2, children: 2 })).toBe(0);
  });

  it('labels reason codes by property age rules without mixing hotels', () => {
    expect(overCapacityLabel(OVER_CAPACITY_REASONS.CHILD_FREE_AGE, 'ibis')).toContain('12');
    expect(overCapacityLabel(OVER_CAPACITY_REASONS.CHILD_FREE_AGE, 'novotel')).toContain('16');
    expect(overCapacityLabel(OVER_CAPACITY_REASONS.CHILD_FREE_AGE, 'ibis')).not.toContain('16');
  });
});

describe('availableOverCapacityReasons', () => {
  it('treats Room Only rooms as no-package issues', () => {
    expect(
      availableOverCapacityReasons({
        mealPlan: 'Room Only / No Package',
        bookedAdults: 2,
        bookedChildren: 0,
        adults: 2,
        children: 0,
        infants: 0,
      })
    ).toEqual([OVER_CAPACITY_REASONS.NO_PACKAGE, OVER_CAPACITY_REASONS.OTHER]);
  });

  it('includes child and infant free-breakfast reasons for extra child covers', () => {
    expect(
      availableOverCapacityReasons({
        mealPlan: 'Breakfast',
        bookedAdults: 2,
        bookedChildren: 0,
        adults: 2,
        children: 1,
        infants: 0,
      })
    ).toEqual([
      OVER_CAPACITY_REASONS.CHILD_FREE_AGE,
      OVER_CAPACITY_REASONS.INFANT_FREE,
      OVER_CAPACITY_REASONS.OTHER,
    ]);
  });

  it('keeps adult overage to the generic other reason', () => {
    expect(
      availableOverCapacityReasons({
        mealPlan: 'Breakfast',
        bookedAdults: 2,
        bookedChildren: 0,
        adults: 3,
        children: 0,
        infants: 0,
      })
    ).toEqual([OVER_CAPACITY_REASONS.OTHER]);
  });
});
