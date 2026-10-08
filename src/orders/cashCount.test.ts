import { describe, expect, it } from 'vitest';
import { addItem, addPayment, closeOrder, openOrder, sendToKitchen, type Order } from './orderModel';
import { CashCountError, cashTaken, denominationTotal, describeDifference, recordCount } from './cashCount';

const actor = { by: 'host@accor.com', at: '2026-10-08T15:30:00.000Z' };
const DISH = { menuItemId: 'local-northern-thai-1', name: 'Khao Soy Gai', unitPriceThb: 250 }; // 294.25 gross

function bill(seq: number, businessDate: string, pay: Array<{ method: 'cash' | 'card'; amountThb: number }>, close = true): Order {
  let o = openOrder({ hotelId: 'novotel', businessDate, seq, channel: 'table', tableId: `t${seq}`, tableNumber: String(seq), covers: 1 }, actor);
  o = sendToKitchen(addItem(o, DISH, 2, '', actor), actor); // 588.50
  for (const p of pay) o = addPayment(o, p, actor);
  return close ? closeOrder(o, actor) : o;
}

const day = '2026-10-08';
const orders = [
  bill(1, day, [{ method: 'cash', amountThb: 588.5 }]),
  bill(2, day, [{ method: 'card', amountThb: 300 }, { method: 'cash', amountThb: 288.5 }]),
  bill(3, day, [{ method: 'cash', amountThb: 100 }], false), // still open, but the cash is in the drawer
  bill(4, '2026-10-07', [{ method: 'cash', amountThb: 588.5 }]), // yesterday's drawer
];

describe('the cash drawer count', () => {
  it("expects the float plus every cash payment on the day's bills, open ones included", () => {
    expect(cashTaken(orders, day)).toBe(977);
    const c = recordCount({ hotelId: 'novotel', businessDate: day, floatThb: 2000, countedThb: 2977, denominations: null, note: '' }, orders, actor);
    expect(c).toMatchObject({ expectedThb: 2977, countedThb: 2977, differenceThb: 0, openBills: 1, countedBy: 'host@accor.com' });
    expect(c.id).toBe('2026-10-08-153000000');
  });

  it('adds up notes and coins, satang included', () => {
    expect(denominationTotal({ '1000': 2, '500': 1, '100': 4, '20': 3, '1': 7, '0.5': 1, '0.25': 1 })).toBe(2967.75);
    expect(denominationTotal({ '1000': -2, '100': Number.NaN })).toBe(0);
  });

  it('will not save a difference without a word about it', () => {
    const short = { hotelId: 'novotel', businessDate: day, floatThb: 2000, countedThb: 2967.75, denominations: null, note: '' };
    expect(() => recordCount(short, orders, actor)).toThrow(CashCountError);
    const c = recordCount({ ...short, note: 'Change given twice on table 2' }, orders, actor);
    expect(c.differenceThb).toBe(-9.25);
    expect(describeDifference(c.differenceThb)).toBe('short by 9.25');
    expect(describeDifference(5)).toBe('over by 5.00');
  });

  it('refuses a count from nobody, or a negative amount', () => {
    const input = { hotelId: 'novotel', businessDate: day, floatThb: 0, countedThb: 977, denominations: null, note: '' };
    expect(() => recordCount(input, orders, { ...actor, by: '' })).toThrow(/signed out/);
    expect(() => recordCount({ ...input, countedThb: -1 }, orders, actor)).toThrow(/drawer/);
  });
});
