import React, { useEffect, useState } from 'react';
import { canMarkSoldOut, type Role } from '../lib/access';
import { MenuView } from '../components/MenuView';
import { Banner } from '../components/ui';
import { useFirestoreOrders, useSoldOut } from './firestoreOrders';
import { OrdersView } from './OrdersView';
import { KitchenView } from './KitchenView';
import { SalesView } from './SalesView';

/** The Food Exchange screens, wired to Firestore. Lazy-loaded from App.tsx. */

export function OrdersScreen({ hotelId, today, role }: { hotelId: string; today: string; role: Role }) {
  const [date, setDate] = useState(today);
  // Follow the business day over the 04:00 rollover.
  useEffect(() => setDate(today), [today]);
  const store = useFirestoreOrders(hotelId, date, date, today);
  return <OrdersView store={store} role={role} date={date} today={today} onDateChange={setDate} />;
}

export function KitchenScreen({ hotelId, today, role }: { hotelId: string; today: string; role: Role }) {
  const store = useFirestoreOrders(hotelId, today, today, today, { guests: false, tables: false });
  return <KitchenView store={store} canMarkSoldOut={canMarkSoldOut(role)} />;
}

export function SalesScreen({ hotelId, today }: { hotelId: string; today: string }) {
  const [range, setRange] = useState({ from: today, to: today });
  const store = useFirestoreOrders(hotelId, range.from, range.to, today, { guests: false, tables: false });
  return <SalesView store={store} from={range.from} to={range.to} today={today} onRangeChange={(from, to) => setRange({ from, to })} />;
}

/** The menu for reference, with today's sold-out dishes marked as they are on an order. */
export function MenuScreen({ hotelId }: { hotelId: string }) {
  const { soldOut, error } = useSoldOut(hotelId);
  return (
    <div className="space-y-4">
      {error && <Banner tone="warn">Sold-out dishes could not be loaded: {error}</Banner>}
      <MenuView soldOut={soldOut} />
    </div>
  );
}
