import type { CheckIn, DiningTable, Guest, MealServiceType } from '../types';
import type { RoomOverride } from '../lib/overrides';

/**
 * What the door can do. Declared without any Firebase import so the presentational components can
 * be driven by Firestore in the app (src/door/firestoreActions.ts) and by plain state in the
 * dev-only preview page.
 */

export type WriteResult = 'saved' | 'queued';

export interface OverCapacityAnswersInput {
  childReasons: string[];
  childOtherText: string;
  adultReasonText: string;
  authorizingStaff: string;
}

export interface CheckInInput {
  guest: Guest;
  service: MealServiceType;
  adults: number;
  children: number;
  infants: number;
  checkedGuestNames: string[];
  /** The table (or the primary of a merged group) to seat at, if any. */
  table: DiningTable | null;
  /** The table this room held before, released if it changed. */
  previousTableId: string | null;
  booked: { adults: number; children: number; pax: number };
  basis: string;
  overCapacity: OverCapacityAnswersInput | null;
  existing: CheckIn | null;
}

/** The business date and the author are stamped by the implementation, never by the screen. */
export type CorrectionInput = Omit<RoomOverride, 'recordedBy' | 'recordedAt' | 'date'>;

export interface DoorActions {
  checkIn(input: CheckInInput): Promise<WriteResult>;
  undoCheckIn(guest: Guest, service: MealServiceType, checkIn: CheckIn): Promise<WriteResult>;
  saveCorrection(input: CorrectionInput): Promise<WriteResult>;
}
