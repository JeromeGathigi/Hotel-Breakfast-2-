import { useEffect, useMemo, useState } from 'react';
import { auth, collection, db, doc, onSnapshot, query, runTransaction, sanitizeData, where } from '../firebase';
import type { DiningTable, Guest, MealServiceType } from '../types';
import { getMergedGroupMembers } from '../lib/tables';
import { BookingError, createBooking, seatBooking, type Booking } from './bookingModel';
import type { BookingOp, BookingsStore, NewBookingInput } from './store';

/**
 * Bookings in Firestore: hotels/{hotel}/bookings/{id}, one document per reservation or waiting
 * party, never deleted.
 *
 * Every change is a transaction - read the latest booking, run the bookingModel operation, write
 * the result - so two hosts at the stand cannot overwrite each other. Like orders, and unlike
 * check-ins, that needs the network: offline, nothing changes and the host is told so.
 */

const OFFLINE = /offline|unavailable|network/i;

function friendly(error: unknown): Error {
  if (error instanceof BookingError) return error;
  const message = (error as Error)?.message ?? String(error);
  if (OFFLINE.test(message)) return new BookingError('No connection. Bookings need the network - nothing was changed. Try again when the Wi-Fi is back.');
  if (/permission/i.test(message)) return new BookingError('The server refused this change. Your account may not have the role it needs, or the database rules have not been published for bookings yet.');
  return new BookingError(message);
}

export function useFirestoreBookings(hotelId: string, date: string): BookingsStore {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<BookingsStore['errors']>({});
  const me = auth?.currentUser?.email ?? '';

  useEffect(() => {
    setLoading(true);
    setErrors({});
    const fail = (key: keyof BookingsStore['errors']) => (e: Error) => setErrors((prev) => ({ ...prev, [key]: e.message }));
    const unsubs = [
      onSnapshot(
        query(collection(db, 'hotels', hotelId, 'bookings'), where('date', '==', date)),
        (snap) => {
          setBookings(snap.docs.map((d) => d.data() as Booking));
          setLoading(false);
        },
        (e) => {
          fail('bookings')(e);
          setLoading(false);
        }
      ),
      onSnapshot(collection(db, 'hotels', hotelId, 'tables'), (snap) => setTables(snap.docs.map((d) => ({ ...(d.data() as DiningTable), id: d.id }))), fail('tables')),
      onSnapshot(collection(db, 'hotels', hotelId, 'guests'), (snap) => setGuests(snap.docs.map((d) => ({ ...(d.data() as Guest), roomNumber: d.id }))), fail('guests')),
    ];
    return () => unsubs.forEach((u) => u());
  }, [hotelId, date]);

  return useMemo<BookingsStore>(
    () => ({
      hotelId,
      bookings,
      tables,
      guests,
      loading,
      errors,
      me,
      async create(input: NewBookingInput) {
        try {
          const ref = doc(collection(db, 'hotels', hotelId, 'bookings'));
          const booking = createBooking({ ...input, id: ref.id, hotelId }, { by: me, at: new Date().toISOString() });
          await runTransaction(db, async (tx) => {
            tx.set(ref, sanitizeData(booking) as unknown as Record<string, unknown>);
          });
          return booking;
        } catch (e) {
          throw friendly(e);
        }
      },
      async apply(id: string, op: BookingOp) {
        try {
          await runTransaction(db, async (tx) => {
            const ref = doc(db, 'hotels', hotelId, 'bookings', id);
            const snap = await tx.get(ref);
            if (!snap.exists()) throw new BookingError('This booking no longer exists.');
            const current = snap.data() as Booking;
            const nextBooking = op(current, { by: me, at: new Date().toISOString() });
            if (nextBooking !== current) tx.set(ref, sanitizeData(nextBooking) as unknown as Record<string, unknown>);
          });
        } catch (e) {
          throw friendly(e);
        }
      },
      async seat(id: string, table: DiningTable | null, service: MealServiceType) {
        try {
          await runTransaction(db, async (tx) => {
            const ref = doc(db, 'hotels', hotelId, 'bookings', id);
            const snap = await tx.get(ref);
            if (!snap.exists()) throw new BookingError('This booking no longer exists.');
            const current = snap.data() as Booking;
            const at = new Date().toISOString();
            const seated = seatBooking(current, table, { by: me, at });
            const members = table ? getMergedGroupMembers(table, tables) : [];
            // Read every table first (a transaction reads before it writes), and refuse a table
            // someone else is sitting at - the screen's copy may be a few seconds old.
            const live = await Promise.all(members.map((m) => tx.get(doc(db, 'hotels', hotelId, 'tables', m.id))));
            for (const t of live) {
              const d = t.data() as DiningTable | undefined;
              if (d?.status === 'occupied') throw new BookingError(`Table ${d.tableNumber} is occupied${d.occupiedByGuest ? ` by ${d.occupiedByGuest}` : ''}. Clear it first or choose another.`);
            }
            tx.set(ref, sanitizeData(seated) as unknown as Record<string, unknown>);
            for (const m of members) {
              tx.update(doc(db, 'hotels', hotelId, 'tables', m.id), {
                status: 'occupied',
                occupiedByRoom: current.roomNumber ?? null,
                occupiedByGuest: current.name,
                occupiedPax: current.partySize,
                occupiedSince: at,
                mealService: service,
              });
            }
          });
        } catch (e) {
          throw friendly(e);
        }
      },
    }),
    [hotelId, bookings, tables, guests, loading, errors, me]
  );
}
