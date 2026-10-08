import type { DiningTable, Guest } from '../types';
import type { Actor, NewOrder, Order } from './orderModel';
import type { CashCount } from './cashCount';

/**
 * What the order screens need, as plain data and two writes. Firestore implements it
 * (firestoreOrders.ts); the dev preview implements it in memory. The screens never touch Firebase.
 */

export type OrderOp = (order: Order, actor: Actor) => Order;

export type NewOrderInput = Omit<NewOrder, 'seq' | 'hotelId' | 'businessDate'>;

export interface OrdersStore {
  /** The property these orders belong to. */
  hotelId: string;
  /** Orders for the business dates being viewed. */
  orders: Order[];
  loading: boolean;
  /** Per stream, so a refused read of the guest list does not hide the orders. */
  errors: Partial<Record<'orders' | 'menu' | 'tables' | 'guests' | 'cash', string>>;
  /** Dishes (catalogue baseIds) marked sold out for now. */
  soldOut: string[];
  tables: DiningTable[];
  /** Today's in-house list, for charging a bill to a room. */
  guests: Guest[];
  /** The signed-in account. Empty when signed out - writes are then refused. */
  me: string;
  create(input: NewOrderInput): Promise<Order>;
  /** Runs an orderModel operation against the latest copy of the order. */
  apply(orderId: string, op: OrderOp): Promise<void>;
  setSoldOut(baseIds: string[]): Promise<void>;
  /** Drawer counts for the business dates being viewed, newest first. */
  cashCounts: CashCount[];
  /** Adds a count. Counts are never edited: a recount is another record. */
  saveCashCount(count: CashCount): Promise<void>;
}
