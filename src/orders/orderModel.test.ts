import { describe, it, expect } from 'vitest';
import {
  addItem,
  addPayment,
  cancelOrder,
  changeDetails,
  closeOrder,
  markServed,
  openOrder,
  orderTotals,
  removePayment,
  reopenOrder,
  sendToKitchen,
  setDiscount,
  setHeldQty,
  servedVoidThb,
  voidLine,
  OrderError,
  type Order,
} from './orderModel';
import { grossPriceThb } from '../data/foodExchangeMenu';
import { buildCatalog, buildDishes, dishName, searchCatalog, toggleSoldOut } from './menuCatalog';
import { summariseOrders } from './orderReports';

const host = (at = '2026-10-08T05:30:00.000Z') => ({ by: 'host@accor.com', at });
const manager = (at = '2026-10-08T06:00:00.000Z') => ({ by: 'manager@accor.com', at });
const KHAO_SOY = { menuItemId: 'local-northern-thai-1', name: 'Khao Soy Gai', unitPriceThb: 250 };
const PHAD_KRA_PAO = { menuItemId: 'main-thai-1:chicken', name: 'Phad Kra Pao - Chicken', unitPriceThb: 280 };

const table = (covers = 2): Order =>
  openOrder({ hotelId: 'novotel', businessDate: '2026-10-08', seq: 7, channel: 'table', tableId: 't12', tableNumber: '12', covers }, host());

describe('opening an order', () => {
  it('numbers it per business day and records who opened it', () => {
    const o = table();
    expect(o.id).toBe('2026-10-08-007');
    expect(o.number).toBe('FX-007');
    expect(o.status).toBe('open');
    expect(o.log).toEqual([{ at: '2026-10-08T05:30:00.000Z', by: 'host@accor.com', action: 'order-opened', details: 'Table 12, 2 covers' }]);
  });

  it('needs a table, a room or nothing, as the channel says', () => {
    expect(() => openOrder({ hotelId: 'novotel', businessDate: '2026-10-08', seq: 1, channel: 'table', covers: 2 }, host())).toThrow(/Choose a table/);
    expect(() => openOrder({ hotelId: 'novotel', businessDate: '2026-10-08', seq: 1, channel: 'room', covers: 1 }, host())).toThrow(/in-house room/);
    expect(openOrder({ hotelId: 'novotel', businessDate: '2026-10-08', seq: 1, channel: 'takeaway', covers: 0 }, host()).covers).toBe(0);
  });

  it('refuses a signed-out actor rather than inventing one', () => {
    expect(() => openOrder({ hotelId: 'novotel', businessDate: '2026-10-08', seq: 1, channel: 'takeaway', covers: 0 }, { by: '', at: 'x' })).toThrow(/signed out/);
  });
});

describe('the bill', () => {
  it('applies service charge first, then VAT on the total - 250 net is 294.25', () => {
    const o = addItem(table(), KHAO_SOY, 1, '', host());
    const t = orderTotals(o);
    expect(t).toMatchObject({ subtotalThb: 250, serviceChargeThb: 25, vatThb: 19.25, totalThb: 294.25 });
    expect(t.totalThb).toBe(grossPriceThb(250));
  });

  it('works in satang, so repeated decimals never drift', () => {
    let o = table();
    for (let i = 0; i < 7; i++) o = addItem(o, { menuItemId: `x${i}`, name: `Item ${i}`, unitPriceThb: 0.1 }, 3, '', host());
    expect(orderTotals(o).subtotalThb).toBe(2.1);
  });

  it('takes a discount off before service charge and VAT', () => {
    let o = addItem(table(), KHAO_SOY, 2, '', host());
    o = setDiscount(o, { kind: 'percent', value: 10, reason: 'Accor Plus' }, manager());
    expect(orderTotals(o)).toMatchObject({ subtotalThb: 500, discountThb: 50, serviceChargeThb: 45, vatThb: 34.65, totalThb: 529.65 });
    expect(o.discount?.by).toBe('manager@accor.com');
  });

  it('caps an amount discount at the subtotal and refuses one without a reason', () => {
    const o = addItem(table(), KHAO_SOY, 1, '', host());
    expect(orderTotals(setDiscount(o, { kind: 'amount', value: 9999, reason: 'Recovery' }, manager())).totalThb).toBe(0);
    expect(() => setDiscount(o, { kind: 'amount', value: 50, reason: ' ' }, manager())).toThrow(/reason/);
  });
});

describe('items', () => {
  it('merges a repeat of the same unsent dish into one line, but keeps notes apart', () => {
    let o = addItem(table(), KHAO_SOY, 1, '', host());
    o = addItem(o, KHAO_SOY, 2, '', host());
    o = addItem(o, KHAO_SOY, 1, 'no chili', host());
    expect(o.lines.map((l) => [l.lineId, l.qty, l.note])).toEqual([
      ['L1', 3, ''],
      ['L2', 1, 'no chili'],
    ]);
  });

  it('lets unsent items change freely, and removes them at zero', () => {
    let o = addItem(table(), KHAO_SOY, 2, '', host());
    o = setHeldQty(o, 'L1', 0, host());
    expect(o.lines).toEqual([]);
    expect(o.log.at(-1)?.action).toBe('item-removed');
  });

  it('sends only what is new to the kitchen, and records when', () => {
    let o = addItem(table(), KHAO_SOY, 1, '', host());
    o = sendToKitchen(o, host('2026-10-08T05:35:00.000Z'));
    o = addItem(o, PHAD_KRA_PAO, 1, '', host());
    expect(o.lines.map((l) => l.status)).toEqual(['sent', 'held']);
    expect(o.lines[0].sentAt).toBe('2026-10-08T05:35:00.000Z');
    expect(() => sendToKitchen(sendToKitchen(o, host()), host())).toThrow(/Nothing new/);
  });

  it('never deletes an item the kitchen has seen: it is voided, with a reason', () => {
    let o = sendToKitchen(addItem(table(), KHAO_SOY, 1, '', host()), host());
    expect(() => setHeldQty(o, 'L1', 0, host())).toThrow(/Void it instead/);
    expect(() => voidLine(o, 'L1', '', host())).toThrow(/reason/);
    o = voidLine(o, 'L1', 'Wrong item entered', host());
    expect(o.lines[0]).toMatchObject({ status: 'void', voidReason: 'Wrong item entered' });
    expect(orderTotals(o).totalThb).toBe(0);
    // Not served yet: a correction, not a giveaway, so it leaves the manager-only counter alone.
    expect(servedVoidThb(o)).toBe(0);
  });

  it('counts a dish voided after it was served, which the rules keep for managers', () => {
    let o = sendToKitchen(addItem(table(), KHAO_SOY, 2, '', host()), host());
    o = markServed(o, ['L1'], host());
    o = voidLine(o, 'L1', 'Quality complaint', manager());
    expect(servedVoidThb(o)).toBe(500);
    expect(o.log.at(-1)?.details).toBe('2 × Khao Soy Gai (already served): Quality complaint');
    expect(summariseOrders([o]).voids).toEqual([expect.objectContaining({ item: 'Khao Soy Gai', served: true, netThb: 500 })]);
    // Orders opened before the field existed read as zero.
    expect(servedVoidThb({ servedVoidThb: undefined })).toBe(0);
  });

  it('marks sent items served', () => {
    let o = sendToKitchen(addItem(table(), KHAO_SOY, 1, '', host()), host());
    o = markServed(o, ['L1'], host('2026-10-08T05:50:00.000Z'));
    expect(o.lines[0]).toMatchObject({ status: 'served', servedAt: '2026-10-08T05:50:00.000Z' });
  });
});

describe('payments and closing', () => {
  const sentBill = () => sendToKitchen(addItem(table(), KHAO_SOY, 2, '', host()), host()); // 588.50

  it('splits a bill across methods and closes when nothing is owed', () => {
    let o = sentBill();
    o = addPayment(o, { method: 'cash', amountThb: 300 }, host());
    expect(() => closeOrder(o, host())).toThrow(/still owed/);
    o = addPayment(o, { method: 'room', amountThb: 288.5, roomNumber: '412', guestName: 'GUEST' }, host());
    o = closeOrder(o, host());
    expect(o.status).toBe('complete');
    expect(o.payments.map((p) => [p.paymentId, p.method, p.amountThb, p.roomNumber])).toEqual([
      ['P1', 'cash', 300, null],
      ['P2', 'room', 288.5, '412'],
    ]);
  });

  it('refuses an overpayment, a room charge without a room, and a comp without a reason', () => {
    const o = sentBill();
    expect(() => addPayment(o, { method: 'cash', amountThb: 1000 }, host())).toThrow(/more than/);
    expect(() => addPayment(o, { method: 'room', amountThb: 100 }, host())).toThrow(/room to charge/);
    expect(() => addPayment(o, { method: 'comp', amountThb: 100 }, host())).toThrow(/reason/);
  });

  it('keeps the comp total at the top level, where the security rules can see it', () => {
    let o = addPayment(sentBill(), { method: 'comp', amountThb: 100, reference: 'Service recovery' }, manager());
    expect(o.compThb).toBe(100);
    o = removePayment(o, 'P1', manager());
    expect(o.compThb).toBe(0);
  });

  it('will not close with unsent items, or an empty bill', () => {
    const unsent = addItem(table(), KHAO_SOY, 1, '', host());
    expect(() => closeOrder(unsent, host())).toThrow(/not been sent/);
    const voided = voidLine(sentBill(), 'L1', 'Guest changed mind', host());
    expect(() => closeOrder(voided, host())).toThrow(/Cancel the order instead/);
  });

  it('cancels only an order with nothing paid and nothing in the kitchen', () => {
    expect(() => cancelOrder(sentBill(), 'Opened by mistake', host())).toThrow(/Void them/);
    const prepaid = addPayment(addItem(table(), KHAO_SOY, 1, '', host()), { method: 'cash', amountThb: 100 }, host());
    expect(() => cancelOrder(prepaid, 'Guest left before ordering', host())).toThrow(/remove them/);
    const o = cancelOrder(addItem(table(), KHAO_SOY, 1, '', host()), 'Guest left before ordering', host());
    expect(o).toMatchObject({ status: 'cancelled', cancelReason: 'Guest left before ordering' });
    expect(() => addItem(o, KHAO_SOY, 1, '', host())).toThrow(OrderError);
  });

  it('reopens a closed order, and logs it', () => {
    const closed = closeOrder(addPayment(sentBill(), { method: 'card', amountThb: 588.5 }, host()), host());
    const o = reopenOrder(closed, manager());
    expect(o.status).toBe('open');
    expect(o.log.map((e) => e.action)).toEqual(['order-opened', 'item-added', 'items-sent', 'payment-added', 'order-closed', 'order-reopened']);
  });
});

describe('details', () => {
  it('moves a table and changes covers, keeping both in the log', () => {
    const o = changeDetails(table(2), { covers: 3, tableId: 't14', tableNumber: '14' }, host());
    expect(o).toMatchObject({ covers: 3, tableNumber: '14' });
    expect(o.log.at(-1)?.details).toBe('covers 2 → 3; moved from table 12 to table 14');
  });
});

describe('menu catalogue', () => {
  const catalog = buildCatalog();

  it('sells every printed price and nothing else', () => {
    const kraPao = catalog.filter((e) => e.baseId === 'main-thai-1').map((e) => [e.menuItemId, e.unitPriceThb]);
    expect(kraPao).toEqual([
      ['main-thai-1:chicken', 280],
      ['main-thai-1:minced-pork', 300],
      ['main-thai-1:crispy-pork', 480],
    ]);
    expect(catalog.every((e) => Number.isFinite(e.unitPriceThb))).toBe(true);
    expect(new Set(catalog.map((e) => e.menuItemId)).size).toBe(catalog.length);
  });

  it('finds dishes by words in any order, or by section and number', () => {
    expect(searchCatalog(catalog, 'soy khao').map((e) => e.name)).toEqual(['Khao Soy Gai']);
    expect(searchCatalog(catalog, 'pizza 3').some((e) => e.name === 'Di Mare')).toBe(true);
  });

  it('sells out per dish: one entry for Phad Kra Pao, whatever the protein', () => {
    const dishes = buildDishes();
    expect(dishes.filter((d) => d.baseId === 'main-thai-1')).toEqual([{ baseId: 'main-thai-1', name: 'Phad Kra Pao', sectionTitle: 'Main — Thai' }]);
    expect(new Set(dishes.map((d) => d.baseId)).size).toBe(dishes.length);
    expect(new Set(catalog.map((e) => e.baseId))).toEqual(new Set(dishes.map((d) => d.baseId)));
    expect(dishName('main-thai-1')).toBe('Phad Kra Pao');
    expect(dishName('gone-9')).toBe('gone-9');
  });

  it('marks a dish out once and back again', () => {
    expect(toggleSoldOut(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(toggleSoldOut(['a', 'b'], 'b', true)).toEqual(['a', 'b']);
    expect(toggleSoldOut(['a', 'b'], 'a', false)).toEqual(['b']);
  });
});

describe('sales summary', () => {
  it('counts closed bills as revenue, comps apart, and lists what is still open', () => {
    const at = (h: number) => `2026-10-08T${String(h).padStart(2, '0')}:00:00.000Z`;
    const a = closeOrder(addPayment(sendToKitchen(addItem(table(), KHAO_SOY, 2, '', host(at(5))), host(at(5))), { method: 'card', amountThb: 588.5 }, host(at(6))), host(at(6)));
    let b = sendToKitchen(addItem({ ...table(1), id: 'b', number: 'FX-008', createdAt: at(11) }, KHAO_SOY, 1, '', host(at(11))), host(at(11)));
    b = addPayment(b, { method: 'comp', amountThb: 94.25, reference: 'Delay' }, manager(at(12)));
    b = closeOrder(addPayment(b, { method: 'room', amountThb: 200, roomNumber: '412', guestName: 'GUEST' }, host(at(12))), host(at(12)));
    const c = addItem({ ...table(), id: 'c', number: 'FX-009' }, KHAO_SOY, 1, '', host());
    const d = cancelOrder({ ...table(), id: 'd', number: 'FX-010' }, 'Opened by mistake', host());

    const s = summariseOrders([a, b, c, d]);
    expect(s.orderCount).toEqual({ open: 1, complete: 2, cancelled: 1 });
    expect(s.revenueThb).toBe(788.5);
    expect(s.compThb).toBe(94.25);
    expect(s.byMethod).toEqual({ cash: 0, card: 588.5, qr: 0, room: 200, comp: 94.25 });
    // Shared out in proportion to the comp, with VAT as the remainder: the parts add up exactly.
    expect(Math.round((s.netSalesThb + s.serviceChargeThb + s.vatThb) * 100)).toBe(78850);
    expect(s.netSalesThb).toBe(669.92);
    expect(s.covers).toBe(3);
    expect(s.byItem).toEqual([{ menuItemId: 'local-northern-thai-1', name: 'Khao Soy Gai', qty: 3, netThb: 750 }]);
    expect(s.byHour.map((h) => h.hour)).toEqual([12, 18]); // Bangkok, UTC+7
    expect(s.roomCharges).toEqual([expect.objectContaining({ orderNumber: 'FX-008', roomNumber: '412', amountThb: 200 })]);
    expect(s.stillOpen).toEqual([{ orderNumber: 'FX-009', where: 'Table 12', totalThb: 294.25, outstandingThb: 294.25 }]);
    expect(s.cancellations).toEqual([expect.objectContaining({ orderNumber: 'FX-010', reason: 'Opened by mistake' })]);
  });
});
