import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import { DEFAULT_NOVOTEL_TABLES } from '../constants';
import { addDays, bangkokTime, businessDate } from '../lib/businessDate';
import type { DiningTable, Guest } from '../types';
import { getMergedGroupMembers } from '../lib/tables';
import { BookingError, createBooking, seatBooking, type Booking } from '../bookings/bookingModel';
import type { BookingOp, BookingsStore, NewBookingInput } from '../bookings/store';
import { BookingsView } from '../bookings/BookingsView';

/**
 * DEV-ONLY preview of the bookings screen, at /dev/bookings-preview.html. Imports nothing from
 * Firebase: the guests and bookings are invented and labelled, and live in this page's memory.
 */

const today = businessDate();
const me = 'preview@accor.com';
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const inMinutes = (minutes: number) => bangkokTime(new Date(Date.now() + minutes * 60_000));

const guests: Guest[] = ['204', '305', '412'].map((room) => ({
  roomNumber: room,
  guestName: `PREVIEW GUEST ${room}`,
  arrivalDate: addDays(today, -1),
  departureDate: addDays(today, 2),
  mealPlan: 'RB1',
  rateCode: 'RB1',
  adults: 2,
  children: 0,
  resvNameId: `P${room}`,
  hotelId: 'novotel',
}));

function seed(): Booking[] {
  const t = DEFAULT_NOVOTEL_TABLES;
  const make = (id: string, input: Omit<Parameters<typeof createBooking>[0], 'id' | 'hotelId'>, minutesAgo = 120) =>
    createBooking({ id, hotelId: 'novotel', ...input }, { by: me, at: ago(minutesAgo) });
  return [
    make('r1', { kind: 'reservation', date: today, time: inMinutes(-30), partySize: 4, name: 'PREVIEW FAMILY ONE', notes: 'Birthday - cake at 20:00', tableId: t[2].id, tableNumber: t[2].tableNumber }),
    make('r2', { kind: 'reservation', date: today, time: inMinutes(20), partySize: 2, name: '', roomNumber: '305' }),
    make('r3', { kind: 'reservation', date: today, time: inMinutes(50), partySize: 6, name: 'PREVIEW TOUR GROUP', phone: '000 000 0000', tableId: t[4].id, tableNumber: t[4].tableNumber }),
    make('w1', { kind: 'waitlist', date: today, partySize: 3, name: 'PREVIEW WALK-IN', quotedMinutes: 15 }, 22),
    make('w2', { kind: 'waitlist', date: today, partySize: 2, name: '', roomNumber: '412', quotedMinutes: 20 }, 6),
  ];
}

function useMemoryStore(date: string): BookingsStore {
  const [bookings, setBookings] = useState<Booking[]>(seed);
  const [tables, setTables] = useState<DiningTable[]>(DEFAULT_NOVOTEL_TABLES);
  return useMemo<BookingsStore>(() => {
    const actor = () => ({ by: me, at: new Date().toISOString() });
    return {
      hotelId: 'novotel',
      bookings: bookings.filter((b) => b.date === date),
      tables,
      guests,
      loading: false,
      errors: {},
      me,
      async create(input: NewBookingInput) {
        const b = createBooking({ ...input, id: `p${Date.now()}`, hotelId: 'novotel' }, actor());
        setBookings((prev) => [...prev, b]);
        return b;
      },
      async apply(id: string, op: BookingOp) {
        const current = bookings.find((b) => b.id === id);
        if (!current) throw new BookingError('This booking no longer exists.');
        const next = op(current, actor());
        setBookings((prev) => prev.map((b) => (b.id === id ? next : b)));
      },
      async seat(id: string, table: DiningTable | null, service) {
        const current = bookings.find((b) => b.id === id);
        if (!current) throw new BookingError('This booking no longer exists.');
        const next = seatBooking(current, table, actor());
        const members = new Set(table ? getMergedGroupMembers(table, tables).map((m) => m.id) : []);
        setBookings((prev) => prev.map((b) => (b.id === id ? next : b)));
        setTables((prev) =>
          prev.map((t) =>
            members.has(t.id)
              ? { ...t, status: 'occupied', occupiedByRoom: current.roomNumber, occupiedByGuest: current.name, occupiedPax: current.partySize, occupiedSince: new Date().toISOString(), mealService: service }
              : t
          )
        );
      },
    };
  }, [bookings, tables, date]);
}

function Preview() {
  const [date, setDate] = useState(today);
  const store = useMemoryStore(date);
  return (
    <div className="theme-novotel min-h-screen bg-background p-4 md:p-6 space-y-4">
      <div className="rounded-2xl border-2 border-dashed border-fuchsia-500 bg-fuchsia-50 p-3 text-sm text-fuchsia-950">
        <strong>DEV PREVIEW</strong> - invented guests and bookings, not connected to Firebase.
      </div>
      <BookingsView store={store} date={date} today={today} onDateChange={setDate} />
    </div>
  );
}

// A hot reload re-runs this module: reuse the root rather than create a second one on the same node.
const container = document.getElementById('root') as HTMLElement & { __previewRoot?: ReactDOM.Root };
container.__previewRoot ??= ReactDOM.createRoot(container);
container.__previewRoot.render(<Preview />);
