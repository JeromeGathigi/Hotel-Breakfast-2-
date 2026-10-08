import type { CheckIn, MealServiceType } from '../types';

/**
 * Check-ins live at hotels/{hotelId}/checkins/{businessDate}/rooms/{id}.
 *
 * The id used to be the room number alone, for every service. So a breakfast check-in made the room
 * show "Checked in" at lunch and dinner too, and checking a room in for dinner OVERWROTE its
 * breakfast record - the morning's attendance silently disappeared from the analytics. Breakfast
 * keeps the bare room number (every existing document stays valid); lunch and dinner get their own.
 */
export function checkinDocId(roomNumber: string, service: MealServiceType): string {
  return service === 'breakfast' ? roomNumber : `${roomNumber}~${service}`;
}

/** Older documents carry no mealService; they were all made at breakfast. */
export function serviceOf(c: Pick<CheckIn, 'mealService'>): MealServiceType {
  return c.mealService ?? 'breakfast';
}

/** Today's check-ins for one service, keyed by room number. */
export function checkinsByRoom(all: CheckIn[], service: MealServiceType): Map<string, CheckIn> {
  const out = new Map<string, CheckIn>();
  for (const c of all) if (serviceOf(c) === service) out.set(c.roomNumber, c);
  return out;
}

export function checkinPax(c: Pick<CheckIn, 'adultsAte' | 'childrenAte' | 'infantsAte'> | null | undefined): number {
  if (!c) return 0;
  return (Number(c.adultsAte) || 0) + (Number(c.childrenAte) || 0) + (Number(c.infantsAte) || 0);
}

/**
 * Over-capacity reasons, as the property's spec lists them (section 8). The child rule names ONE
 * age - the hotel's own - and never both at once.
 */
export function childFreeAge(hotelId: string): number {
  return hotelId === 'ibis' ? 12 : 16;
}

export const CHILD_REASON_FREE_CHILD = 'FREE_CHILD';
export const CHILD_REASON_FREE_INFANT = 'FREE_INFANT';
export const CHILD_REASON_OTHER = 'CHILD_OTHER';
export const ADULT_REASON_OTHER = 'ADULT_OTHER';

export function childReasonOptions(hotelId: string): Array<{ code: string; label: string }> {
  return [
    { code: CHILD_REASON_FREE_CHILD, label: `Free breakfast for child below ${childFreeAge(hotelId)} years old` },
    { code: CHILD_REASON_FREE_INFANT, label: 'Free breakfast for infant below 2 years old' },
    { code: CHILD_REASON_OTHER, label: 'Others (specify)' },
  ];
}

export interface OverCapacityCheck {
  /** Covers booked for this room and service. 0 for a room-only room at breakfast. */
  bookedAdults: number;
  bookedChildren: number;
  adultsOver: boolean;
  childrenOver: boolean;
  any: boolean;
}

export function overCapacity(
  booked: { adults: number; children: number },
  seated: { adults: number; children: number; infants: number }
): OverCapacityCheck {
  const adultsOver = seated.adults > booked.adults;
  // Infants are booked as children in Opera, if at all; over-pax for both is one question.
  const childrenOver = seated.children + seated.infants > booked.children;
  return { bookedAdults: booked.adults, bookedChildren: booked.children, adultsOver, childrenOver, any: adultsOver || childrenOver };
}

export interface OverCapacityAnswers {
  childReasons: string[];
  childOtherText: string;
  adultReasonText: string;
  authorizingStaff: string;
}

/**
 * What is still missing before an over-capacity check-in may be saved. The spec makes the reasons
 * and the authorising staff name MANDATORY; the previous form showed them but saved without them.
 */
export function overCapacityProblems(check: OverCapacityCheck, a: OverCapacityAnswers): string[] {
  if (!check.any) return [];
  const problems: string[] = [];
  if (check.childrenOver) {
    if (a.childReasons.length === 0) problems.push('Tick a reason for the extra children or infants.');
    if (a.childReasons.includes(CHILD_REASON_OTHER) && !a.childOtherText.trim()) problems.push('Say what the other child reason is.');
  }
  if (check.adultsOver && !a.adultReasonText.trim()) problems.push('Say why the extra adults are being served.');
  if (!a.authorizingStaff.trim()) problems.push('Enter the name of the staff member who authorised it.');
  return problems;
}
