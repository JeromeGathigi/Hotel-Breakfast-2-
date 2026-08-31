import { Guest, MealServiceType } from '../types';

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

export function hasMealEntitlement(mealPlan: string | undefined | null, service: MealServiceType = 'breakfast'): boolean {
  if (!mealPlan) return false;
  const p = mealPlan.toUpperCase().trim();

  if (service === 'breakfast') {
    // Standard breakfast indicators
    if (
      p.includes('BF') ||
      p.includes('BB') ||
      p.includes('BKF') ||
      p.includes('BREAKFAST') ||
      p.includes('ABF') ||
      p.includes('BUFFET') ||
      p.includes('RB') || // Room & Breakfast rate
      p.includes('FMRB') ||
      p.includes('FLRB') ||
      p.includes('FLSBB') ||
      p.includes('MASTBB') ||
      p.includes('CNFBB') ||
      p.includes('SUPBB') ||
      p.includes('MBREAK') ||
      p.includes('BFCOMP')
    ) {
      if (p.includes('RO') && !p.includes('BB') && !p.includes('BF') && !p.includes('BKF') && !p.includes('RB') && !p.includes('BREAKFAST')) {
        return false;
      }
      return true;
    }
    return false;
  }

  if (service === 'dinner') {
    return (
      p.includes('HALF BOARD') ||
      p.includes('FULL BOARD') ||
      p.includes('DINNER') ||
      p.includes('DINNVT') ||
      /(^|[^A-Z0-9])(HB|FB)([^A-Z0-9]|$)/.test(p)
    );
  }

  if (service === 'lunch') {
    return (
      p.includes('LUNCH') ||
      p.includes('FULL BOARD') ||
      /(^|[^A-Z0-9])FB([^A-Z0-9]|$)/.test(p) ||
      p.includes('CONF') ||
      p.includes('CNF') ||
      p.includes('MBUFF')
    );
  }

  return false;
}

export function entitledPax(guest: Guest, service: MealServiceType = 'breakfast'): number {
  if (!hasMealEntitlement(guest.mealPlan, service)) return 0;
  return (guest.adults || 0) + (guest.children || 0);
}

export function canonicalPlan(plan: string | undefined | null): string {
  if (!plan) return 'Room Only (RO)';
  const p = plan.toUpperCase().trim();
  if (p.includes('BFCOMP') || p.includes('COMP')) return 'Complimentary Breakfast (BFCOMP)';
  if (p.includes('CNFBB')) return 'Conference Breakfast (CNFBB)';
  if (p.includes('BF350NET')) return 'Breakfast 350 Net (BF350NET)';
  if (p.includes('BF260NET')) return 'Breakfast 260 Net (BF260NET)';
  if (p.includes('DINNVT') || p.includes('DINNER')) return 'Dinner Package Included (DINNER)';
  if (p.includes('MBREAK')) return 'Morning Coffee Break (MBREAK)';
  if (p.includes('MBUFF')) return 'Morning Buffet (MBUFF)';
  if (p.includes('BB') || p.includes('BF') || p.includes('RB')) return 'Bed & Breakfast (BB/BF)';
  if (p.includes('RO') || p.includes('ROOM ONLY')) return 'Room Only (RO)';
  return plan;
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
