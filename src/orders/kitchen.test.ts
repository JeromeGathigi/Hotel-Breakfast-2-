import { describe, expect, it } from 'vitest';
import { addItem, markReady, openOrder, sendToKitchen, type Order } from './orderModel';
import { kitchenTickets } from './KitchenView';
import { newlySent } from './chime';

const at = (min: number) => `2026-10-08T12:${String(min).padStart(2, '0')}:00.000Z`;
const actor = (min: number) => ({ by: 'host@accor.com', at: at(min) });
const DISH = { menuItemId: 'local-northern-thai-1', name: 'Khao Soy Gai', unitPriceThb: 250 };

function sentAt(seq: number, min: number): Order {
  const o = openOrder({ hotelId: 'novotel', businessDate: '2026-10-08', seq, channel: 'table', tableId: `t${seq}`, tableNumber: String(seq), covers: 2 }, actor(min));
  return sendToKitchen(addItem(o, DISH, 1, '', actor(min)), actor(min));
}

describe('kitchen tickets', () => {
  it('puts tickets still cooking first, oldest first, and tickets that are all up after them', () => {
    const allUp = markReady(sentAt(1, 0), ['L1'], actor(10)); // sent first, but already up
    const newer = sentAt(2, 5);
    const older = sentAt(3, 2);
    expect(kitchenTickets([allUp, newer, older]).map((t) => t.order.number)).toEqual(['FX-003', 'FX-002', 'FX-001']);
  });

  it('keeps cooking and ready dishes apart on a ticket, and drops closed orders', () => {
    const o = addItem(markReady(sentAt(1, 0), ['L1'], actor(3)), DISH, 2, 'no chili', actor(4));
    const mixed = sendToKitchen(o, actor(4));
    const [t] = kitchenTickets([mixed, { ...sentAt(2, 1), status: 'complete' }]);
    expect(t.ready.map((l) => l.lineId)).toEqual(['L1']);
    expect(t.cooking.map((l) => l.lineId)).toEqual(['L2']);
  });
});

describe('the new-ticket chime', () => {
  it('stays quiet on the first load and rings only for a dish the screen has not shown', () => {
    expect(newlySent(null, new Set(['a/L1']))).toBe(false);
    expect(newlySent(new Set(['a/L1']), new Set(['a/L1']))).toBe(false);
    expect(newlySent(new Set(['a/L1']), new Set(['a/L1', 'b/L1']))).toBe(true);
    // A dish leaving the screen (bumped, served) is not a new ticket.
    expect(newlySent(new Set(['a/L1', 'b/L1']), new Set(['b/L1']))).toBe(false);
  });
});
