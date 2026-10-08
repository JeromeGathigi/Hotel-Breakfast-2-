import type { DiningTable, Guest } from '../types';
import type { Actor, NewOrder, Order } from './orderModel';

/**
 * What the order screens need, as plain data and two writes. Firestore implements it
 * (firestoreOrders.ts); the dev preview implements it in memory. The screens never touch Firebase.
 */

export type OrderOp = (order: Order, actor: Actor) => Order;

export type NewOrderInput = Omit<NewOrder, 'seq' | 'hotelId' | 'businessDate'>;

export interface OrdersStore {
  /** Orders for the business dates being viewed. */
  orders: Order[];
  loading: boolean;
  /** Per stream, so a refused read of the guest list does not hide the orders. */
  errors: Partial<Record<'orders' | 'menu' | 'tables' | 'guests', string>>;
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
}
