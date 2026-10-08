import React, { useEffect, useState } from 'react';
import type { Role } from '../lib/access';
import { useFirestoreOrders } from './firestoreOrders';
import { OrdersView } from './OrdersView';
import { KitchenView } from './KitchenView';
import { SalesView } from './SalesView';

/** The order screens, wired to Firestore. Lazy-loaded from App.tsx. */

export function OrdersScreen({ hotelId, today, role }: { hotelId: string; today: string; role: Role }) {
  const [date, setDate] = useState(today);
  // Follow the business day over the 04:00 rollover.
  useEffect(() => setDate(today), [today]);
  const store = useFirestoreOrders(hotelId, date, date, today);
  return <OrdersView store={store} role={role} date={date} today={today} onDateChange={setDate} />;
}

export function KitchenScreen({ hotelId, today }: { hotelId: string; today: string }) {
  const store = useFirestoreOrders(hotelId, today, today, today);
  return <KitchenView store={store} />;
}

export function SalesScreen({ hotelId, today }: { hotelId: string; today: string }) {
  const [range, setRange] = useState({ from: today, to: today });
  const store = useFirestoreOrders(hotelId, range.from, range.to, today);
  return <SalesView store={store} from={range.from} to={range.to} today={today} onRangeChange={(from, to) => setRange({ from, to })} />;
}
