import { useEffect, useMemo, useState } from 'react';
import { auth, collection, db, doc, logOperaAuditTrail, onSnapshot, query, runTransaction, sanitizeData, where } from '../firebase';
import type { DiningTable, Guest } from '../types';
import { OrderError, openOrder, type Order } from './orderModel';
import type { NewOrderInput, OrderOp, OrdersStore } from './store';

/**
 * Orders in Firestore: hotels/{hotel}/orders/{businessDate-seq}.
 *
 * Every change is a transaction - read the latest order, run the orderModel operation, write the
 * result - so two hosts adding items to one table cannot overwrite each other. Unlike check-ins at
 * the door, transactions need the network: offline, nothing changes and the host is told so,
 * rather than a bill quietly diverging between two tablets. Order numbers come from a per-day
 * counter (counters/orders-{date}) in the same transaction as the new order.
 */

const OFFLINE = /offline|unavailable|network/i;

function friendly(error: unknown): Error {
  if (error instanceof OrderError) return error;
  const message = (error as Error)?.message ?? String(error);
  if (OFFLINE.test(message)) return new OrderError('No connection. Orders need the network - nothing was changed. Try again when the Wi-Fi is back.');
  if (/permission/i.test(message)) return new OrderError('The server refused this change. Your account may not have the role it needs, or the database rules have not been updated for orders yet.');
  return new OrderError(message);
}

/** Changes worth a line in the hotel's audit log as well as on the order itself. */
const AUDITED = new Set(['discount-set', 'discount-removed', 'payment-removed', 'order-cancelled', 'order-reopened', 'item-voided']);

const availabilityDoc = (hotelId: string) => doc(db, 'hotels', hotelId, 'menuState', 'availability');

/** Dishes marked sold out, for screens that only show the menu. */
export function useSoldOut(hotelId: string): { soldOut: string[]; error: string | null } {
  const [soldOut, setSoldOut] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
    return onSnapshot(
      availabilityDoc(hotelId),
      (snap) => {
        setSoldOut(snap.exists() ? ((snap.data().soldOut as string[]) ?? []) : []);
        setError(null);
      },
      (e) => setError(e.message)
    );
  }, [hotelId]);
  return { soldOut, error };
}

/**
 * Which of the hotel's other lists a screen needs. The kitchen and the sales report never use the
 * in-house guest list or the tables, so they no longer download them: a display on the pass has
 * no business holding every guest's name.
 */
export interface OrderStreams {
  guests?: boolean;
  tables?: boolean;
}

export function useFirestoreOrders(hotelId: string, from: string, to: string, today: string, streams: OrderStreams = { guests: true, tables: true }): OrdersStore {
  const [orders, setOrders] = useState<Order[]>([]);
  const [soldOut, setSoldOutState] = useState<string[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<OrdersStore['errors']>({});
  const me = auth?.currentUser?.email ?? '';

  const withGuests = streams.guests !== false;
  const withTables = streams.tables !== false;

  useEffect(() => {
    setLoading(true);
    setErrors({});
    const fail = (key: keyof OrdersStore['errors']) => (e: Error) => setErrors((prev) => ({ ...prev, [key]: e.message }));
    const unsubs = [
      onSnapshot(
        query(collection(db, 'hotels', hotelId, 'orders'), where('businessDate', '>=', from), where('businessDate', '<=', to)),
        (snap) => {
          setOrders(snap.docs.map((d) => d.data() as Order).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
          setLoading(false);
        },
        (e) => {
          fail('orders')(e);
          setLoading(false);
        }
      ),
      onSnapshot(availabilityDoc(hotelId), (snap) => setSoldOutState(snap.exists() ? ((snap.data().soldOut as string[]) ?? []) : []), fail('menu')),
    ];
    if (withTables) {
      unsubs.push(onSnapshot(collection(db, 'hotels', hotelId, 'tables'), (snap) => setTables(snap.docs.map((d) => ({ ...(d.data() as DiningTable), id: d.id }))), fail('tables')));
    }
    if (withGuests) {
      unsubs.push(onSnapshot(collection(db, 'hotels', hotelId, 'guests'), (snap) => setGuests(snap.docs.map((d) => ({ ...(d.data() as Guest), roomNumber: d.id }))), fail('guests')));
    }
    return () => unsubs.forEach((u) => u());
  }, [hotelId, from, to, withGuests, withTables]);

  return useMemo<OrdersStore>(
    () => ({
      orders,
      loading,
      errors,
      soldOut,
      tables,
      guests,
      me,
      async create(input: NewOrderInput) {
        try {
          const counterRef = doc(db, 'hotels', hotelId, 'counters', `orders-${today}`);
          return await runTransaction(db, async (tx) => {
            const counter = await tx.get(counterRef);
            const seq = (counter.exists() ? Number(counter.data().last) || 0 : 0) + 1;
            const order = openOrder({ ...input, hotelId, businessDate: today, seq }, { by: me, at: new Date().toISOString() });
            tx.set(counterRef, { last: seq, businessDate: today, updatedBy: me, updatedAt: order.createdAt });
            tx.set(doc(db, 'hotels', hotelId, 'orders', order.id), sanitizeData(order) as unknown as Record<string, unknown>);
            return order;
          });
        } catch (e) {
          throw friendly(e);
        }
      },
      async apply(orderId: string, op: OrderOp) {
        let changed: Order | null = null;
        try {
          await runTransaction(db, async (tx) => {
            const ref = doc(db, 'hotels', hotelId, 'orders', orderId);
            const snap = await tx.get(ref);
            if (!snap.exists()) throw new OrderError('This order no longer exists.');
            const current = snap.data() as Order;
            const nextOrder = op(current, { by: me, at: new Date().toISOString() });
            changed = nextOrder === current ? null : nextOrder;
            if (changed) tx.set(ref, sanitizeData(changed) as unknown as Record<string, unknown>);
          });
        } catch (e) {
          throw friendly(e);
        }
        const last = (changed as Order | null)?.log.at(-1);
        if (changed && last && AUDITED.has(last.action)) {
          await logOperaAuditTrail(hotelId, 'ORDER', `${(changed as Order).number}: ${last.action.replace('-', ' ')} - ${last.details}`, (changed as Order).roomNumber ?? undefined);
        }
      },
      async setSoldOut(baseIds: string[]) {
        try {
          await runTransaction(db, async (tx) => {
            tx.set(availabilityDoc(hotelId), { soldOut: baseIds, updatedBy: me, updatedAt: new Date().toISOString() });
          });
        } catch (e) {
          throw friendly(e);
        }
      },
    }),
    [orders, loading, errors, soldOut, tables, guests, me, hotelId, today]
  );
}
