import { MENU_SOURCE } from '../data/foodExchangeMenu';

/**
 * A la carte orders for the Food Exchange: the part of a restaurant POS this app did not have.
 *
 * Modelled on how the outlet's POS trial (Papaya) runs an order - open it for a table, a room or a
 * takeaway; add items; send them to the kitchen; take one or more payments; close it - adapted to
 * a hotel: a bill can be charged to an in-house room, and every action is kept on the order with
 * who did it, because a disputed room charge is settled by that history.
 *
 * Everything here is pure. Each operation takes an order and returns the next one with a log entry
 * appended, or throws an OrderError whose message a host can act on. Firestore and the preview
 * both run these same functions.
 */

export type OrderChannel = 'table' | 'room' | 'takeaway';
export type OrderStatus = 'open' | 'complete' | 'cancelled';
/**
 * held = taken but not yet sent to the kitchen; sent = being cooked; ready = cooked and waiting at
 * the pass; served = at the table; void = sent, then taken off the bill with a reason.
 *
 * "Ready" is the kitchen-display stage the restaurant systems surveyed on 8 Oct 2026 share (URY
 * Mosaic, FloCafe, POSR): the kitchen bumps a dish when it is up, and the waiter sees it is waiting
 * instead of the kitchen marking it served before anyone has carried it out.
 */
export type LineStatus = 'held' | 'sent' | 'ready' | 'served' | 'void';
export type PaymentMethod = 'cash' | 'card' | 'qr' | 'room' | 'comp';

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  qr: 'QR / PromptPay',
  room: 'Charge to room',
  comp: 'Complimentary',
};

/** Thai convention, as the menu footer says: prices are net of 10% service charge and 7% VAT. */
export const SERVICE_CHARGE_RATE = 0.1;
export const VAT_RATE = 0.07;

export const CANCEL_REASONS = ['Guest left before ordering', 'Opened by mistake', 'Duplicate order', 'Moved to another order'] as const;
export const VOID_REASONS = ['Guest changed mind', 'Wrong item entered', 'Kitchen could not make it', 'Quality complaint'] as const;

export interface OrderLine {
  lineId: string;
  /** From the menu catalogue, e.g. `main-thai-1:chicken`. */
  menuItemId: string;
  name: string;
  /** Net THB, as printed on the menu. */
  unitPriceThb: number;
  qty: number;
  /** Allergies, "no chili", cooking preference. Printed on the kitchen ticket. */
  note: string;
  status: LineStatus;
  addedAt: string;
  addedBy: string;
  sentAt: string | null;
  /** When the kitchen bumped it. Absent on lines from before the ready stage existed. */
  readyAt?: string | null;
  servedAt: string | null;
  voidReason: string | null;
  /** Who voided it, and when - for the staff report. Absent on lines voided before 8 Oct 2026. */
  voidedBy?: string | null;
  voidedAt?: string | null;
}

export interface OrderPayment {
  paymentId: string;
  method: PaymentMethod;
  amountThb: number;
  /** Card slip, transfer reference, or the comp's reason. */
  reference: string;
  /** Set for a room charge: the in-house room and guest it was signed against. */
  roomNumber: string | null;
  guestName: string | null;
  at: string;
  by: string;
}

export interface OrderDiscount {
  kind: 'percent' | 'amount';
  value: number;
  reason: string;
  by: string;
}

export type OrderAction =
  | 'order-opened'
  | 'details-changed'
  | 'item-added'
  | 'item-changed'
  | 'item-removed'
  | 'items-sent'
  | 'items-ready'
  | 'items-served'
  | 'item-voided'
  | 'discount-set'
  | 'discount-removed'
  | 'payment-added'
  | 'payment-removed'
  | 'order-closed'
  | 'order-cancelled'
  | 'order-reopened';

export interface OrderEvent {
  at: string;
  by: string;
  action: OrderAction;
  details: string;
}

export interface Order {
  /** Document id: `${businessDate}-${seq}`, e.g. `2026-10-08-007`. */
  id: string;
  /** What staff and the bill show, e.g. `FX-007`. Restarts each business day. */
  number: string;
  hotelId: string;
  outlet: typeof MENU_SOURCE.venueId;
  businessDate: string;
  channel: OrderChannel;
  tableId: string | null;
  tableNumber: string | null;
  roomNumber: string | null;
  guestName: string | null;
  resvNameId: string | null;
  covers: number;
  status: OrderStatus;
  lines: OrderLine[];
  discount: OrderDiscount | null;
  payments: OrderPayment[];
  /** Kept on the order so a later rate change never rewrites an old bill. */
  serviceChargeRate: number;
  vatRate: number;
  /** Sum of complimentary payments, top-level so the security rules can see it change. */
  compThb: number;
  /**
   * Net value of dishes voided after they were served. Taking a dish the guest has eaten off the
   * bill is a comp by another name, so it is a manager's call like a comp; top-level for the same
   * reason as compThb. Absent on orders made before 8 Oct 2026 - read it with servedVoidThb().
   */
  servedVoidThb?: number;
  cancelReason: string | null;
  /** Sequences for line and payment ids - deterministic, so no randomness is needed. */
  lineSeq: number;
  paymentSeq: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  closedAt: string | null;
  closedBy: string | null;
  log: OrderEvent[];
}

export class OrderError extends Error {}

export interface Actor {
  /** The signed-in account's email. Never a fallback. */
  by: string;
  /** ISO time of the action. */
  at: string;
}

/* =========================================================================
   MONEY - in satang, so 0.1 + 0.2 never reaches a bill
   ========================================================================= */

const satang = (thb: number) => Math.round(thb * 100);
const baht = (s: number) => s / 100;

export interface OrderTotals {
  subtotalThb: number;
  discountThb: number;
  serviceChargeThb: number;
  vatThb: number;
  totalThb: number;
  paidThb: number;
  outstandingThb: number;
  /** Lines taken but not yet sent to the kitchen. */
  heldCount: number;
}

/**
 * The bill. Service charge on the discounted subtotal, then VAT on that plus the service charge -
 * the same order as grossPriceThb() in the menu data, so 250 net is 294.25, not 292.50.
 */
export function orderTotals(order: Pick<Order, 'lines' | 'discount' | 'payments' | 'serviceChargeRate' | 'vatRate'>): OrderTotals {
  const billable = order.lines.filter((l) => l.status !== 'void');
  const subtotal = billable.reduce((s, l) => s + satang(l.unitPriceThb) * l.qty, 0);
  let discount = 0;
  if (order.discount) {
    discount =
      order.discount.kind === 'percent'
        ? Math.round((subtotal * Math.min(100, Math.max(0, order.discount.value))) / 100)
        : Math.min(subtotal, satang(Math.max(0, order.discount.value)));
  }
  const afterDiscount = subtotal - discount;
  const service = Math.round(afterDiscount * order.serviceChargeRate);
  const vat = Math.round((afterDiscount + service) * order.vatRate);
  const total = afterDiscount + service + vat;
  const paid = order.payments.reduce((s, p) => s + satang(p.amountThb), 0);
  return {
    subtotalThb: baht(subtotal),
    discountThb: baht(discount),
    serviceChargeThb: baht(service),
    vatThb: baht(vat),
    totalThb: baht(total),
    paidThb: baht(paid),
    outstandingThb: baht(Math.max(0, total - paid)),
    heldCount: order.lines.filter((l) => l.status === 'held').length,
  };
}

/**
 * One guest's share when what is left is split between `ways` people: rounded down to the satang,
 * so the last guest pays the odd satang and the bill always closes exactly (FloCafe's "collect
 * equal shares", from the systems surveyed on 8 Oct 2026). 100.00 three ways is 33.33, then 33.33,
 * then 33.34.
 */
export function equalShare(outstandingThb: number, ways: number): number {
  const n = Math.max(1, Math.floor(ways));
  const left = satang(Math.max(0, outstandingThb));
  return n === 1 ? baht(left) : baht(Math.floor(left / n));
}

export const formatThb = (thb: number) =>
  `฿${thb.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* =========================================================================
   OPERATIONS
   ========================================================================= */

function next(order: Order, actor: Actor, action: OrderAction, details: string, changes: Partial<Order>): Order {
  return {
    ...order,
    ...changes,
    updatedAt: actor.at,
    updatedBy: actor.by,
    log: [...order.log, { at: actor.at, by: actor.by, action, details }],
  };
}

function requireOpen(order: Order, doing: string) {
  if (order.status !== 'open') {
    throw new OrderError(`Order ${order.number} is ${order.status}, so you cannot ${doing}. ${order.status === 'complete' ? 'A manager can reopen it.' : ''}`.trim());
  }
}

function requireActor(actor: Actor) {
  if (!actor.by) throw new OrderError('You are signed out. Sign in again to change orders.');
}

export function orderNumber(seq: number): string {
  return `${MENU_SOURCE.venueId}-${String(seq).padStart(3, '0')}`;
}

export function orderId(businessDate: string, seq: number): string {
  return `${businessDate}-${String(seq).padStart(3, '0')}`;
}

export interface NewOrder {
  hotelId: string;
  businessDate: string;
  seq: number;
  channel: OrderChannel;
  tableId?: string | null;
  tableNumber?: string | null;
  roomNumber?: string | null;
  guestName?: string | null;
  resvNameId?: string | null;
  covers: number;
}

export function channelLabel(o: Pick<Order, 'channel' | 'tableNumber' | 'roomNumber'>): string {
  if (o.channel === 'table') return `Table ${o.tableNumber ?? '?'}`;
  if (o.channel === 'room') return `Room ${o.roomNumber ?? '?'}`;
  return 'Takeaway';
}

export function openOrder(input: NewOrder, actor: Actor): Order {
  requireActor(actor);
  if (input.channel === 'table' && !input.tableNumber) throw new OrderError('Choose a table for a dine-in order.');
  if (input.channel === 'room' && !input.roomNumber) throw new OrderError('Choose the in-house room for a room order.');
  const covers = Math.max(0, Math.floor(Number(input.covers) || 0));
  if (input.channel !== 'takeaway' && covers < 1) throw new OrderError('Enter how many guests are eating.');
  const base: Order = {
    id: orderId(input.businessDate, input.seq),
    number: orderNumber(input.seq),
    hotelId: input.hotelId,
    outlet: MENU_SOURCE.venueId,
    businessDate: input.businessDate,
    channel: input.channel,
    tableId: input.channel === 'table' ? input.tableId ?? null : null,
    tableNumber: input.channel === 'table' ? input.tableNumber ?? null : null,
    roomNumber: input.channel === 'room' ? input.roomNumber ?? null : null,
    guestName: input.guestName ?? null,
    resvNameId: input.resvNameId ?? null,
    covers,
    status: 'open',
    lines: [],
    discount: null,
    payments: [],
    serviceChargeRate: SERVICE_CHARGE_RATE,
    vatRate: VAT_RATE,
    compThb: 0,
    servedVoidThb: 0,
    cancelReason: null,
    lineSeq: 0,
    paymentSeq: 0,
    createdAt: actor.at,
    createdBy: actor.by,
    updatedAt: actor.at,
    updatedBy: actor.by,
    closedAt: null,
    closedBy: null,
    log: [],
  };
  return next(base, actor, 'order-opened', `${channelLabel(base)}, ${covers} cover${covers === 1 ? '' : 's'}`, {});
}

export function changeDetails(
  order: Order,
  changes: { covers?: number; tableId?: string | null; tableNumber?: string | null },
  actor: Actor
): Order {
  requireActor(actor);
  requireOpen(order, 'change it');
  const parts: string[] = [];
  const patch: Partial<Order> = {};
  if (changes.covers !== undefined && changes.covers !== order.covers) {
    const covers = Math.max(order.channel === 'takeaway' ? 0 : 1, Math.floor(changes.covers));
    patch.covers = covers;
    parts.push(`covers ${order.covers} → ${covers}`);
  }
  if (order.channel === 'table' && changes.tableNumber && changes.tableNumber !== order.tableNumber) {
    patch.tableId = changes.tableId ?? null;
    patch.tableNumber = changes.tableNumber;
    parts.push(`moved from table ${order.tableNumber} to table ${changes.tableNumber}`);
  }
  if (parts.length === 0) return order;
  return next(order, actor, 'details-changed', parts.join('; '), patch);
}

export interface AddItem {
  menuItemId: string;
  name: string;
  unitPriceThb: number;
}

/** Adds to an identical unsent line when there is one, so "two more Phad Thai" stays one line. */
export function addItem(order: Order, item: AddItem, qty: number, note: string, actor: Actor): Order {
  requireActor(actor);
  requireOpen(order, 'add items');
  const count = Math.floor(qty);
  if (count < 1) throw new OrderError('Quantity must be at least 1.');
  if (!(item.unitPriceThb >= 0)) throw new OrderError(`${item.name} has no price on the menu, so it cannot be sold from here.`);
  const cleanNote = note.trim();
  const same = order.lines.find((l) => l.status === 'held' && l.menuItemId === item.menuItemId && l.note === cleanNote);
  const detail = `${count} × ${item.name}${cleanNote ? ` (${cleanNote})` : ''}`;
  if (same) {
    return next(order, actor, 'item-added', detail, {
      lines: order.lines.map((l) => (l === same ? { ...l, qty: l.qty + count } : l)),
    });
  }
  const lineSeq = order.lineSeq + 1;
  const line: OrderLine = {
    lineId: `L${lineSeq}`,
    menuItemId: item.menuItemId,
    name: item.name,
    unitPriceThb: item.unitPriceThb,
    qty: count,
    note: cleanNote,
    status: 'held',
    addedAt: actor.at,
    addedBy: actor.by,
    sentAt: null,
    servedAt: null,
    voidReason: null,
  };
  return next(order, actor, 'item-added', detail, { lines: [...order.lines, line], lineSeq });
}

function findLine(order: Order, lineId: string): OrderLine {
  const line = order.lines.find((l) => l.lineId === lineId);
  if (!line) throw new OrderError('That item is no longer on the order. Refresh and try again.');
  return line;
}

/** Only for items the kitchen has not seen. Zero removes the line. */
export function setHeldQty(order: Order, lineId: string, qty: number, actor: Actor): Order {
  requireActor(actor);
  requireOpen(order, 'change items');
  const line = findLine(order, lineId);
  if (line.status !== 'held') throw new OrderError(`${line.name} has already gone to the kitchen. Void it instead, with a reason.`);
  const count = Math.max(0, Math.floor(qty));
  if (count === line.qty) return order;
  if (count === 0) {
    return next(order, actor, 'item-removed', `${line.qty} × ${line.name} (not sent)`, {
      lines: order.lines.filter((l) => l.lineId !== lineId),
    });
  }
  return next(order, actor, 'item-changed', `${line.name}: ${line.qty} → ${count}`, {
    lines: order.lines.map((l) => (l.lineId === lineId ? { ...l, qty: count } : l)),
  });
}

export function sendToKitchen(order: Order, actor: Actor): Order {
  requireActor(actor);
  requireOpen(order, 'send items');
  const held = order.lines.filter((l) => l.status === 'held');
  if (held.length === 0) throw new OrderError('Nothing new to send - every item is already with the kitchen.');
  return next(order, actor, 'items-sent', held.map((l) => `${l.qty} × ${l.name}`).join(', '), {
    lines: order.lines.map((l) => (l.status === 'held' ? { ...l, status: 'sent' as const, sentAt: actor.at } : l)),
  });
}

/** The kitchen has it: being cooked, or cooked and waiting at the pass. */
export const withKitchen = (l: Pick<OrderLine, 'status'>) => l.status === 'sent' || l.status === 'ready';

/** The kitchen bumps dishes that are up. Only dishes being cooked can become ready. */
export function markReady(order: Order, lineIds: string[], actor: Actor): Order {
  requireActor(actor);
  const ids = new Set(lineIds);
  const ready = order.lines.filter((l) => ids.has(l.lineId) && l.status === 'sent');
  if (ready.length === 0) return order;
  return next(order, actor, 'items-ready', ready.map((l) => `${l.qty} × ${l.name}`).join(', '), {
    lines: order.lines.map((l) => (ids.has(l.lineId) && l.status === 'sent' ? { ...l, status: 'ready' as const, readyAt: actor.at } : l)),
  });
}

/** At the table - from the pass, or straight from the kitchen when nobody bumped it first. */
export function markServed(order: Order, lineIds: string[], actor: Actor): Order {
  requireActor(actor);
  const ids = new Set(lineIds);
  const served = order.lines.filter((l) => ids.has(l.lineId) && withKitchen(l));
  if (served.length === 0) return order;
  return next(order, actor, 'items-served', served.map((l) => `${l.qty} × ${l.name}`).join(', '), {
    lines: order.lines.map((l) => (ids.has(l.lineId) && withKitchen(l) ? { ...l, status: 'served' as const, servedAt: actor.at } : l)),
  });
}

/** Net THB of the dishes on this order voided after they were served. */
export const servedVoidThb = (order: Pick<Order, 'servedVoidThb'>) => order.servedVoidThb ?? 0;

/**
 * Takes a dish off the bill. Not yet sent: it is simply removed. Sent or ready but not served:
 * anyone, with a reason. Already served: a manager, with a reason - enforced by the UI and by the
 * security rules through servedVoidThb, as a comp is through compThb.
 */
export function voidLine(order: Order, lineId: string, reason: string, actor: Actor): Order {
  requireActor(actor);
  requireOpen(order, 'void items');
  const line = findLine(order, lineId);
  if (line.status === 'held') return setHeldQty(order, lineId, 0, actor);
  if (line.status === 'void') return order;
  const why = reason.trim();
  if (!why) throw new OrderError('Give a reason for voiding an item the kitchen has already had.');
  const served = line.status === 'served';
  return next(order, actor, 'item-voided', `${line.qty} × ${line.name}${served ? ' (already served)' : ''}: ${why}`, {
    lines: order.lines.map((l) => (l.lineId === lineId ? { ...l, status: 'void' as const, voidReason: why, voidedBy: actor.by, voidedAt: actor.at } : l)),
    ...(served ? { servedVoidThb: Math.round((servedVoidThb(order) + line.unitPriceThb * line.qty) * 100) / 100 } : {}),
  });
}

/** Manager only - enforced by the UI and by the security rules. */
export function setDiscount(order: Order, discount: Omit<OrderDiscount, 'by'> | null, actor: Actor): Order {
  requireActor(actor);
  requireOpen(order, 'change the discount');
  if (!discount) {
    if (!order.discount) return order;
    return next(order, actor, 'discount-removed', describeDiscount(order.discount), { discount: null });
  }
  if (!(discount.value > 0)) throw new OrderError('A discount must be more than zero.');
  if (discount.kind === 'percent' && discount.value > 100) throw new OrderError('A percentage discount cannot exceed 100%.');
  if (!discount.reason.trim()) throw new OrderError('Give a reason for the discount.');
  const d: OrderDiscount = { ...discount, reason: discount.reason.trim(), by: actor.by };
  if (orderTotals({ ...order, discount: d }).totalThb < orderTotals(order).paidThb) {
    throw new OrderError('That discount would bring the bill below what has already been paid. Remove a payment first.');
  }
  return next(order, actor, 'discount-set', describeDiscount(d), { discount: d });
}

export function describeDiscount(d: Pick<OrderDiscount, 'kind' | 'value' | 'reason'>): string {
  return `${d.kind === 'percent' ? `${d.value}%` : formatThb(d.value)} - ${d.reason}`;
}

export interface NewPayment {
  method: PaymentMethod;
  amountThb: number;
  reference?: string;
  roomNumber?: string | null;
  guestName?: string | null;
}

export function addPayment(order: Order, p: NewPayment, actor: Actor): Order {
  requireActor(actor);
  requireOpen(order, 'take a payment');
  const amount = Math.round(Number(p.amountThb) * 100) / 100;
  if (!(amount > 0)) throw new OrderError('Enter an amount greater than zero.');
  const { outstandingThb } = orderTotals(order);
  if (amount > outstandingThb + 0.001) {
    throw new OrderError(`That is more than the ${formatThb(outstandingThb)} still owed. For cash, enter the bill amount and give change.`);
  }
  if (p.method === 'room' && !p.roomNumber) throw new OrderError('Choose the in-house room to charge.');
  if (p.method === 'comp' && !(p.reference ?? '').trim()) throw new OrderError('Give a reason for the complimentary amount.');
  const paymentSeq = order.paymentSeq + 1;
  const payment: OrderPayment = {
    paymentId: `P${paymentSeq}`,
    method: p.method,
    amountThb: amount,
    reference: (p.reference ?? '').trim(),
    roomNumber: p.method === 'room' ? p.roomNumber ?? null : null,
    guestName: p.method === 'room' ? p.guestName ?? null : null,
    at: actor.at,
    by: actor.by,
  };
  const what = payment.method === 'room' ? `charged to room ${payment.roomNumber}` : PAYMENT_LABEL[p.method].toLowerCase();
  return next(order, actor, 'payment-added', `${formatThb(amount)} ${what}${payment.reference ? ` (${payment.reference})` : ''}`, {
    payments: [...order.payments, payment],
    paymentSeq,
    compThb: Math.round((order.compThb + (p.method === 'comp' ? amount : 0)) * 100) / 100,
  });
}

/** Manager only. */
export function removePayment(order: Order, paymentId: string, actor: Actor): Order {
  requireActor(actor);
  requireOpen(order, 'remove a payment');
  const payment = order.payments.find((p) => p.paymentId === paymentId);
  if (!payment) throw new OrderError('That payment is no longer on the order.');
  return next(order, actor, 'payment-removed', `${formatThb(payment.amountThb)} ${PAYMENT_LABEL[payment.method].toLowerCase()}`, {
    payments: order.payments.filter((p) => p.paymentId !== paymentId),
    compThb: Math.round((order.compThb - (payment.method === 'comp' ? payment.amountThb : 0)) * 100) / 100,
  });
}

export function closeOrder(order: Order, actor: Actor): Order {
  requireActor(actor);
  requireOpen(order, 'close it');
  const t = orderTotals(order);
  if (t.heldCount > 0) throw new OrderError('Some items have not been sent to the kitchen. Send or remove them before closing.');
  if (order.lines.every((l) => l.status === 'void')) throw new OrderError('There is nothing on this bill. Cancel the order instead.');
  if (t.outstandingThb > 0) throw new OrderError(`${formatThb(t.outstandingThb)} is still owed. Take the payment before closing.`);
  return next(order, actor, 'order-closed', `Total ${formatThb(t.totalThb)}`, { status: 'complete', closedAt: actor.at, closedBy: actor.by });
}

export function cancelOrder(order: Order, reason: string, actor: Actor): Order {
  requireActor(actor);
  requireOpen(order, 'cancel it');
  const why = reason.trim();
  if (!why) throw new OrderError('Give a reason for cancelling.');
  if (order.payments.length > 0) throw new OrderError('This order has payments on it. A manager must remove them before it can be cancelled.');
  if (order.lines.some((l) => withKitchen(l) || l.status === 'served')) {
    throw new OrderError('The kitchen has items for this order. Void them with a reason first, so the waste is recorded.');
  }
  return next(order, actor, 'order-cancelled', why, { status: 'cancelled', cancelReason: why, closedAt: actor.at, closedBy: actor.by });
}

/** Manager only. */
export function reopenOrder(order: Order, actor: Actor): Order {
  requireActor(actor);
  if (order.status !== 'complete') throw new OrderError('Only a closed order can be reopened.');
  return next(order, actor, 'order-reopened', '', { status: 'open', closedAt: null, closedBy: null });
}

/** Minutes since the item was sent, for the kitchen screen. */
export function minutesSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / 60000)) : null;
}
