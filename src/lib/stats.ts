import { Guest } from '../types';
import { hasMealEntitlement } from './meals';

export interface HouseStats {
  totalRooms: number;
  totalGuests: number;
  totalAdults: number;
  totalChildren: number;
  entitledBreakfastPax: number;
  entitledDinnerPax: number;
  vipGuests: number;
  anomaliesCount: number;
}

export function computeHouseStats(guests: Guest[]): HouseStats {
  let totalAdults = 0;
  let totalChildren = 0;
  let entitledBreakfastPax = 0;
  let entitledDinnerPax = 0;
  let vipGuests = 0;
  let anomaliesCount = 0;

  guests.forEach((g) => {
    totalAdults += g.adults || 0;
    totalChildren += g.children || 0;
    if (hasMealEntitlement(g.mealPlan, 'breakfast')) {
      entitledBreakfastPax += (g.adults || 1) + (g.children || 0);
    }
    if (hasMealEntitlement(g.mealPlan, 'dinner')) {
      entitledDinnerPax += (g.adults || 1) + (g.children || 0);
    }
    if (g.vipStatus || g.vipLevel) {
      vipGuests += 1;
    }
    if (g.issueType) {
      anomaliesCount += 1;
    }
  });

  return {
    totalRooms: guests.length,
    totalGuests: totalAdults + totalChildren,
    totalAdults,
    totalChildren,
    entitledBreakfastPax,
    entitledDinnerPax,
    vipGuests,
    anomaliesCount,
  };
}
