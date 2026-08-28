import type { CheckIn, Guest } from '../types';
import { MEAL_PLANS, canonicalPlan, entitledPax, hasMealEntitlement } from './meals';

export interface PlanBucket {
  rooms: number;
  pax: number;
}

export interface HouseStats {
  totalRooms: number;
  breakfast: PlanBucket;
  halfBoard: PlanBucket;
  fullBoard: PlanBucket;
  roomOnly: PlanBucket;
  entitledRooms: number;
  entitledPax: number;
  attendedRooms: number;
  attendedPax: number;
  unentitledRooms: number;
  unentitledPax: number;
  remainingPax: number;
  roomsNeedingReview: number;
}

export function computeHouseStats(
  guests: Guest[],
  checkIns: Record<string, CheckIn | undefined>
): HouseStats {
  const breakfast: PlanBucket = { rooms: 0, pax: 0 };
  const halfBoard: PlanBucket = { rooms: 0, pax: 0 };
  const fullBoard: PlanBucket = { rooms: 0, pax: 0 };
  const roomOnly: PlanBucket = { rooms: 0, pax: 0 };

  let entitledRooms = 0;
  let entitledCovers = 0;
  let attendedRooms = 0;
  let attendedPax = 0;
  let unentitledRooms = 0;
  let unentitledPax = 0;
  let roomsNeedingReview = 0;

  for (const guest of guests) {
    const plan = canonicalPlan(guest.mealPlan);
    const guestPax = entitledPax(guest);
    const roomOccupants = Number(guest.adults ?? 0) + Number(guest.children ?? 0);

    switch (plan) {
      case MEAL_PLANS.BREAKFAST:
        breakfast.rooms += 1;
        breakfast.pax += guestPax;
        break;
      case MEAL_PLANS.HALF_BOARD:
        halfBoard.rooms += 1;
        halfBoard.pax += guestPax;
        break;
      case MEAL_PLANS.FULL_BOARD:
        fullBoard.rooms += 1;
        fullBoard.pax += guestPax;
        break;
      case MEAL_PLANS.ROOM_ONLY:
        roomOnly.rooms += 1;
        roomOnly.pax += roomOccupants;
        break;
    }

    if (hasMealEntitlement(guest.mealPlan)) {
      entitledRooms += 1;
      entitledCovers += guestPax;
    }

    if (guest.issueType) {
      roomsNeedingReview += 1;
    }

    const checkIn = checkIns[guest.roomNumber];
    if (!checkIn) continue;

    const actual = Number(checkIn.adultsAte ?? 0) + Number(checkIn.childrenAte ?? 0) + Number(checkIn.infantsAte ?? 0);

    if (hasMealEntitlement(guest.mealPlan)) {
      attendedRooms += 1;
      attendedPax += actual;
    } else {
      unentitledRooms += 1;
      unentitledPax += actual;
    }
  }

  return {
    totalRooms: guests.length,
    breakfast,
    halfBoard,
    fullBoard,
    roomOnly,
    entitledRooms,
    entitledPax: entitledCovers,
    attendedRooms,
    attendedPax,
    unentitledRooms,
    unentitledPax,
    remainingPax: Math.max(0, entitledCovers - attendedPax),
    roomsNeedingReview,
  };
}
