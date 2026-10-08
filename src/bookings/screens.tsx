import React, { useEffect, useState } from 'react';
import { useFirestoreBookings } from './firestoreBookings';
import { BookingsView } from './BookingsView';

/** The bookings screen, wired to Firestore. Lazy-loaded from App.tsx. */
export function BookingsScreen({ hotelId, today }: { hotelId: string; today: string }) {
  const [date, setDate] = useState(today);
  // Follow the business day over the 04:00 rollover.
  useEffect(() => setDate(today), [today]);
  const store = useFirestoreBookings(hotelId, date);
  return <BookingsView store={store} date={date} today={today} onDateChange={setDate} />;
}
