import type { DiningTable, Guest, MealServiceType } from '../types';
import type { Actor, Booking, NewBooking } from './bookingModel';

/**
 * What the bookings screen needs: plain data and three writes. Firestore implements it
 * (firestoreBookings.ts); the dev preview implements it in memory. The screen never touches
 * Firebase.
 */

export type BookingOp = (booking: Booking, actor: Actor) => Booking;

export type NewBookingInput = Omit<NewBooking, 'id' | 'hotelId'>;

export interface BookingsStore {
  hotelId: string;
  /** Bookings for the day being viewed: reservations and the waiting list. */
  bookings: Booking[];
  /** The floor plan, to choose and mark a table. */
  tables: DiningTable[];
  /** Today's in-house list, to book under a room. */
  guests: Guest[];
  loading: boolean;
  errors: Partial<Record<'bookings' | 'tables' | 'guests', string>>;
  /** The signed-in account. Empty when signed out - writes are then refused. */
  me: string;
  create(input: NewBookingInput): Promise<Booking>;
  /** Runs a bookingModel operation against the latest copy of the booking. */
  apply(id: string, op: BookingOp): Promise<void>;
  /** Seats the party and marks its table - the whole merged group - occupied, together. */
  seat(id: string, table: DiningTable | null, service: MealServiceType): Promise<void>;
}
