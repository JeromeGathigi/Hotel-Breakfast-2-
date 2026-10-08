import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import { DEFAULT_NOVOTEL_TABLES } from '../constants';
import { businessDate, addDays } from '../lib/businessDate';
import type { Guest } from '../types';
import type { Role } from '../lib/access';
import { addItem, addPayment, closeOrder, openOrder, sendToKitchen, OrderError, type Order } from '../orders/orderModel';
import type { NewOrderInput, OrderOp, OrdersStore } from '../orders/store';
import { OrdersView } from '../orders/OrdersView';
import { KitchenView } from '../orders/KitchenView';
import { SalesView } from '../orders/SalesView';

/**
 * DEV-ONLY preview of the order screens, at /dev/orders-preview.html. Imports nothing from
 * Firebase: the guests are invented and labelled, and every order lives in this page's memory.
 */

const today = businessDate();
const me = 'preview@accor.com';
const actor = (minutesAgo: number) => ({ by: me, at: new Date(Date.now() - minutesAgo * 60_000).toISOString() });

const guests: Guest[] = ['204', '305', '412', '518'].map((room, i) => ({
  roomNumber: room,
  guestName: `PREVIEW GUEST ${room}`,
  arrivalDate: addDays(today, -1),
  departureDate: addDays(today, 2 + i),
  mealPlan: 'RB1',
  rateCode: 'RB1',
  adults: 2,
  children: 0,
  resvNameId: `P${room}`,
  hotelId: 'novotel',
}));

const KHAO_SOY = { menuItemId: 'local-northern-thai-1', name: 'Khao Soy Gai', unitPriceThb: 250 };
const PIZZA = { menuItemId: 'pizza-5', name: 'Napolitano', unitPriceThb: 300 };
const MANGO = { menuItemId: 'desserts-1', name: 'Mango Sticky Rice', unitPriceThb: 220 };

function seed(): Order[] {
  const t = DEFAULT_NOVOTEL_TABLES;
  let a = openOrder({ hotelId: 'novotel', businessDate: today, seq: 1, channel: 'table', tableId: t[0].id, tableNumber: t[0].tableNumber, covers: 2 }, actor(95));
  a = addItem(a, KHAO_SOY, 2, '', actor(94));
  a = sendToKitchen(a, actor(93));
  a = addPayment(a, { method: 'card', amountThb: 588.5, reference: 'Slip 4471' }, actor(40));
  a = closeOrder(a, actor(40));

  let b = openOrder({ hotelId: 'novotel', businessDate: today, seq: 2, channel: 'table', tableId: t[3].id, tableNumber: t[3].tableNumber, covers: 3 }, actor(30));
  b = addItem(b, PIZZA, 1, 'no basil', actor(29));
  b = addItem(b, KHAO_SOY, 2, 'one mild, peanut allergy', actor(29));
  b = sendToKitchen(b, actor(28));
  b = addItem(b, MANGO, 3, '', actor(5));

  let c = openOrder({ hotelId: 'novotel', businessDate: today, seq: 3, channel: 'room', roomNumber: '412', guestName: 'PREVIEW GUEST 412', resvNameId: 'P412', covers: 1 }, actor(18));
  c = addItem(c, KHAO_SOY, 1, '', actor(17));
  c = sendToKitchen(c, actor(17));
  return [c, b, a];
}

function useMemoryStore(): OrdersStore {
  const [orders, setOrders] = useState<Order[]>(seed);
  const [soldOut, setSoldOut] = useState<string[]>(['from-the-grill-3']);
  return useMemo<OrdersStore>(
    () => ({
      orders,
      loading: false,
      errors: {},
      soldOut,
      tables: DEFAULT_NOVOTEL_TABLES,
      guests,
      me,
      async create(input: NewOrderInput) {
        const seq = orders.length + 1;
        const order = openOrder({ ...input, hotelId: 'novotel', businessDate: today, seq }, { by: me, at: new Date().toISOString() });
        setOrders((prev) => [order, ...prev]);
        return order;
      },
      async apply(orderId: string, op: OrderOp) {
        const current = orders.find((o) => o.id === orderId);
        if (!current) throw new OrderError('This order no longer exists.');
        const next = op(current, { by: me, at: new Date().toISOString() });
        setOrders((prev) => prev.map((o) => (o.id === orderId ? next : o)));
      },
      async setSoldOut(ids: string[]) {
        setSoldOut(ids);
      },
    }),
    [orders, soldOut]
  );
}

function Preview() {
  const store = useMemoryStore();
  const [screen, setScreen] = useState<'orders' | 'kitchen' | 'sales'>('orders');
  const [role, setRole] = useState<Role>('manager');
  const [date, setDate] = useState(today);
  return (
    <div className="theme-novotel min-h-screen bg-background p-4 md:p-6 space-y-4">
      <div className="rounded-2xl border-2 border-dashed border-fuchsia-500 bg-fuchsia-50 p-3 text-sm text-fuchsia-950 flex flex-wrap gap-3 items-center">
        <strong>DEV PREVIEW</strong> - invented guests and orders, not connected to Firebase.
        {(['orders', 'kitchen', 'sales'] as const).map((s) => (
          <button key={s} onClick={() => setScreen(s)} className={`px-3 py-1 rounded-lg border ${screen === s ? 'bg-fuchsia-600 text-white' : 'bg-white'}`}>
            {s}
          </button>
        ))}
        <label>
          role{' '}
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="border rounded px-1">
            <option value="staff">staff</option>
            <option value="manager">manager</option>
          </select>
        </label>
      </div>
      {screen === 'orders' && <OrdersView store={store} role={role} date={date} today={today} onDateChange={setDate} />}
      {screen === 'kitchen' && <KitchenView store={store} />}
      {screen === 'sales' && <SalesView store={store} from={today} to={today} today={today} onRangeChange={() => undefined} />}
    </div>
  );
}

// A hot reload re-runs this module: reuse the root rather than create a second one on the same node.
const container = document.getElementById('root') as HTMLElement & { __previewRoot?: ReactDOM.Root };
container.__previewRoot ??= ReactDOM.createRoot(container);
container.__previewRoot.render(<Preview />);
