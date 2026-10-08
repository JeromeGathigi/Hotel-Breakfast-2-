import type { MealServiceType } from '../types';
import { bangkokCalendarDate, bangkokTime } from '../lib/businessDate';

/**
 * Table reservations and the waiting list, for both restaurants.
 *
 * Borrowed from the restaurant systems surveyed on 8 Oct 2026, where after ordering it is the most
 * common feature among the maintained projects (TastyIgniter, OpenResto, Satisfecho, the WordPress
 * table-reservation plugin, HotPlate's waitlist): a booking for a time and a party size, a table
 * held for it, seating it, and recording a no-show; and for walk-ins when every table is taken, a
 * waiting list with how long each party has waited against what they were told.
 *
 * Adapted to the hotel: a booking can name an in-house room, and it records which meal service it
 * is for, so the Friday seafood buffet and a weekend breakfast queue sit in the same list.
 *
 * Everything here is pure, like the order model: each operation returns the next booking with a
 * history entry appended, or throws a BookingError a host can act on. Nothing is deleted - a
 * booking is cancelled, marked a no-show, or the party leaves the queue - and every step can be
 * put back if it was a mistake.
 */

export type BookingKind = 'reservation' | 'waitlist';
export type BookingStatus = 'booked' | 'waiting' | 'seated' | 'cancelled' | 'no-show' | 'left';
export type BookingAction = 'booked' | 'joined-waitlist' | 'changed' | 'seated' | 'cancelled' | 'no-show' | 'left' | 'restored';

export const CANCEL_BOOKING_REASONS = ['Guest cancelled', 'Booked by mistake', 'Duplicate booking', 'Moved to another time'] as const;

/** How late a party may be before the list flags it. */
export const LATE_AFTER_MINUTES = 15;
/** Two bookings at one table closer than this clash - about one sitting. */
export const SITTING_MINUTES = 90;

export interface BookingEvent {
  at: string;
  by: string;
  action: BookingAction;
  details: string;
}

export interface Booking {
  id: string;
  hotelId: string;
  kind: BookingKind;
  /** Business date the booking is for. */
  date: string;
  /** `HH:MM` Bangkok time; null on the waiting list, where the time is when they joined. */
  time: string | null;
  service: MealServiceType;
  partySize: number;
  name: string;
  /** An in-house guest's room, when the booking is theirs. */
  roomNumber: string | null;
  /** Optional, to call the guest back. Personal data: only what the guest gave for this booking. */
  phone: string;
  /** Occasion, high chair, allergies, "window please". */
  notes: string;
  tableId: string | null;
  tableNumber: string | null;
  status: BookingStatus;
  /** Waiting list: the wait the party was told, in minutes. */
  quotedMinutes: number | null;
  cancelReason: string | null;
  seatedAt: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  log: BookingEvent[];
}

export class BookingError extends Error {}

export interface Actor {
  by: string;
  at: string;
}

export interface NewBooking {
  id: string;
  hotelId: string;
  kind: BookingKind;
  date: string;
  time?: string | null;
  service?: MealServiceType | null;
  partySize: number;
  name: string;
  roomNumber?: string | null;
  phone?: string;
  notes?: string;
  tableId?: string | null;
  tableNumber?: string | null;
  quotedMinutes?: number | null;
}

const OPEN: ReadonlySet<BookingStatus> = new Set(['booked', 'waiting']);
export const isOpen = (b: Pick<Booking, 'status'>) => OPEN.has(b.status);

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** The service a time most likely belongs to; the host can change it. */
export function serviceForTime(time: string): MealServiceType {
  const m = toMinutes(time);
  if (m < 11 * 60) return 'breakfast';
  if (m < 17 * 60) return 'lunch';
  return 'dinner';
}

function requireActor(actor: Actor) {
  if (!actor.by) throw new BookingError('You are signed out. Sign in again to change bookings.');
}

function party(n: number): number {
  const v = Math.floor(Number(n));
  if (!(v >= 1)) throw new BookingError('A booking is for at least one guest.');
  if (v > 60) throw new BookingError('More than 60 guests is an event, not a table booking.');
  return v;
}

function who(name: string, roomNumber: string | null | undefined): string {
  const n = name.trim();
  if (!n && !roomNumber) throw new BookingError('Give the name the booking is under, or the room.');
  return n || `Room ${roomNumber}`;
}

function next(b: Booking, actor: Actor, action: BookingAction, details: string, changes: Partial<Booking>): Booking {
  return { ...b, ...changes, updatedAt: actor.at, updatedBy: actor.by, log: [...b.log, { at: actor.at, by: actor.by, action, details }] };
}

export function createBooking(input: NewBooking, actor: Actor): Booking {
  requireActor(actor);
  const reservation = input.kind === 'reservation';
  const time = input.time ?? null;
  if (reservation && (!time || !TIME.test(time))) throw new BookingError('Choose the time of the booking.');
  const partySize = party(input.partySize);
  const name = who(input.name, input.roomNumber);
  const service = input.service ?? (time ? serviceForTime(time) : 'breakfast');
  const quoted = input.quotedMinutes == null ? null : Math.max(0, Math.round(Number(input.quotedMinutes) || 0));
  const details = reservation ? `${partySize} at ${time} for ${service}` : `${partySize} waiting${quoted ? `, told about ${quoted} min` : ''}`;
  return {
    id: input.id,
    hotelId: input.hotelId,
    kind: input.kind,
    date: input.date,
    time: reservation ? time : null,
    service,
    partySize,
    name,
    roomNumber: input.roomNumber || null,
    phone: (input.phone ?? '').trim(),
    notes: (input.notes ?? '').trim(),
    tableId: input.tableId ?? null,
    tableNumber: input.tableNumber ?? null,
    status: reservation ? 'booked' : 'waiting',
    quotedMinutes: reservation ? null : quoted,
    cancelReason: null,
    seatedAt: null,
    createdAt: actor.at,
    createdBy: actor.by,
    updatedAt: actor.at,
    updatedBy: actor.by,
    log: [{ at: actor.at, by: actor.by, action: reservation ? 'booked' : 'joined-waitlist', details }],
  };
}

export interface BookingChanges {
  date?: string;
  time?: string | null;
  service?: MealServiceType;
  partySize?: number;
  name?: string;
  roomNumber?: string | null;
  phone?: string;
  notes?: string;
  tableId?: string | null;
  tableNumber?: string | null;
  quotedMinutes?: number | null;
}

/** Edits a booking that is still to come or still waiting. The history says what changed. */
export function changeBooking(b: Booking, changes: BookingChanges, actor: Actor): Booking {
  requireActor(actor);
  if (!isOpen(b)) throw new BookingError('Only a booking still to come, or a party still waiting, can be changed. Put it back first.');
  const nextValues: Partial<Booking> = {};
  const said: string[] = [];
  const set = <K extends keyof Booking>(key: K, value: Booking[K], label: string) => {
    if (value !== b[key]) {
      nextValues[key] = value;
      said.push(label);
    }
  };
  if (changes.date !== undefined) set('date', changes.date, `date ${changes.date}`);
  if (changes.time !== undefined && b.kind === 'reservation') {
    if (!changes.time || !TIME.test(changes.time)) throw new BookingError('Choose the time of the booking.');
    set('time', changes.time, `time ${changes.time}`);
  }
  if (changes.service !== undefined) set('service', changes.service, changes.service);
  if (changes.partySize !== undefined) set('partySize', party(changes.partySize), `${party(changes.partySize)} guests`);
  if (changes.name !== undefined || changes.roomNumber !== undefined) {
    const room = changes.roomNumber !== undefined ? changes.roomNumber || null : b.roomNumber;
    set('roomNumber', room, room ? `room ${room}` : 'no room');
    set('name', who(changes.name ?? b.name, room), `name ${who(changes.name ?? b.name, room)}`);
  }
  if (changes.phone !== undefined) set('phone', changes.phone.trim(), 'phone');
  if (changes.notes !== undefined) set('notes', changes.notes.trim(), 'notes');
  if (changes.tableId !== undefined) {
    set('tableId', changes.tableId, changes.tableNumber ? `table ${changes.tableNumber}` : 'no table');
    set('tableNumber', changes.tableNumber ?? null, '');
  }
  if (changes.quotedMinutes !== undefined && b.kind === 'waitlist') {
    set('quotedMinutes', changes.quotedMinutes == null ? null : Math.max(0, Math.round(changes.quotedMinutes)), `quoted ${changes.quotedMinutes ?? '-'} min`);
  }
  if (said.length === 0) return b;
  return next(b, actor, 'changed', said.filter(Boolean).join(', '), nextValues);
}

/** The party is at their table. Where they sat is recorded; the screen also marks the table. */
export function seatBooking(b: Booking, table: { id: string; tableNumber: string } | null, actor: Actor): Booking {
  requireActor(actor);
  if (!isOpen(b)) throw new BookingError(`This booking is ${b.status}, so it cannot be seated. Put it back first.`);
  return next(b, actor, 'seated', table ? `at table ${table.tableNumber}` : 'without a table', {
    status: 'seated',
    seatedAt: actor.at,
    tableId: table?.id ?? b.tableId,
    tableNumber: table?.tableNumber ?? b.tableNumber,
  });
}

export function cancelBooking(b: Booking, reason: string, actor: Actor): Booking {
  requireActor(actor);
  if (b.status !== 'booked') throw new BookingError('Only a booking still to come can be cancelled. A party on the waiting list leaves it instead.');
  const why = reason.trim();
  if (!why) throw new BookingError('Give a reason for cancelling.');
  return next(b, actor, 'cancelled', why, { status: 'cancelled', cancelReason: why });
}

export function markNoShow(b: Booking, actor: Actor): Booking {
  requireActor(actor);
  if (b.status !== 'booked') throw new BookingError('Only a booking still to come can be a no-show.');
  return next(b, actor, 'no-show', '', { status: 'no-show' });
}

/** A party on the waiting list gave up and went. */
export function markLeft(b: Booking, actor: Actor): Booking {
  requireActor(actor);
  if (b.status !== 'waiting') throw new BookingError('Only a party on the waiting list can leave it.');
  return next(b, actor, 'left', '', { status: 'left' });
}

/** Undoes a seat, cancellation, no-show or departure made by mistake. */
export function restoreBooking(b: Booking, actor: Actor): Booking {
  requireActor(actor);
  if (isOpen(b)) return b;
  const back: BookingStatus = b.kind === 'reservation' ? 'booked' : 'waiting';
  return next(b, actor, 'restored', `was ${b.status}`, { status: back, cancelReason: null, seatedAt: null });
}

/* =========================================================================
   READING THE DAY
   ========================================================================= */

/** Minutes from `a` to `b`, both `HH:MM`, on the same day. */
const minutesBetween = (a: string, b: string) => toMinutes(b) - toMinutes(a);

/** A booking still to come whose time passed more than LATE_AFTER_MINUTES ago, in Bangkok. */
export function isLate(b: Booking, now: Date, graceMinutes = LATE_AFTER_MINUTES): boolean {
  if (b.status !== 'booked' || !b.time) return false;
  const today = bangkokCalendarDate(now);
  if (b.date < today) return true;
  if (b.date > today) return false;
  return minutesBetween(b.time, bangkokTime(now)) > graceMinutes;
}

/** How long a party has been on the waiting list. */
export function waitedMinutes(b: Pick<Booking, 'createdAt'>, now: Date): number {
  const t = Date.parse(b.createdAt);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / 60_000)) : 0;
}

/** The waiting list in the order parties joined it, still waiting only. */
export function waitingList(bookings: Booking[]): Booking[] {
  return bookings.filter((b) => b.kind === 'waitlist' && b.status === 'waiting').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Reservations for the day, by time, then by when they were made. */
export function reservationsByTime(bookings: Booking[]): Booking[] {
  return bookings.filter((b) => b.kind === 'reservation').sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '') || a.createdAt.localeCompare(b.createdAt));
}

/**
 * Other bookings still to come at the same table within one sitting of this one. The WordPress
 * plugin's rule - one table cannot be reserved by two parties at once - as a warning, since a
 * host may knowingly turn a table.
 */
export function tableClashes(bookings: Booking[], candidate: Pick<Booking, 'id' | 'date' | 'time' | 'tableId'>, sittingMinutes = SITTING_MINUTES): Booking[] {
  if (!candidate.tableId || !candidate.time) return [];
  return bookings.filter(
    (b) =>
      b.id !== candidate.id &&
      b.kind === 'reservation' &&
      b.status === 'booked' &&
      b.date === candidate.date &&
      b.tableId === candidate.tableId &&
      b.time !== null &&
      Math.abs(minutesBetween(b.time, candidate.time!)) < sittingMinutes
  );
}

export interface DaySummary {
  reservations: number;
  covers: number;
  toArrive: number;
  late: number;
  seated: number;
  noShows: number;
  cancelled: number;
  waiting: number;
  longestWaitMinutes: number;
  /** Booked covers per half hour, for the reservations still in play. */
  coversBySlot: Array<{ slot: string; covers: number }>;
}

export function summariseDay(bookings: Booking[], now: Date): DaySummary {
  const res = bookings.filter((b) => b.kind === 'reservation');
  const live = res.filter((b) => b.status === 'booked' || b.status === 'seated');
  const slots = new Map<string, number>();
  for (const b of live) {
    if (!b.time) continue;
    const m = toMinutes(b.time);
    const slot = `${String(Math.floor(m / 60)).padStart(2, '0')}:${m % 60 < 30 ? '00' : '30'}`;
    slots.set(slot, (slots.get(slot) ?? 0) + b.partySize);
  }
  const waiting = waitingList(bookings);
  return {
    reservations: live.length,
    covers: live.reduce((n, b) => n + b.partySize, 0),
    toArrive: res.filter((b) => b.status === 'booked').length,
    late: res.filter((b) => isLate(b, now)).length,
    seated: bookings.filter((b) => b.status === 'seated').length,
    noShows: res.filter((b) => b.status === 'no-show').length,
    cancelled: res.filter((b) => b.status === 'cancelled').length,
    waiting: waiting.length,
    longestWaitMinutes: waiting.reduce((m, b) => Math.max(m, waitedMinutes(b, now)), 0),
    coversBySlot: [...slots.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([slot, covers]) => ({ slot, covers })),
  };
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  booked: 'To arrive',
  waiting: 'Waiting',
  seated: 'Seated',
  cancelled: 'Cancelled',
  'no-show': 'No-show',
  left: 'Left',
};
