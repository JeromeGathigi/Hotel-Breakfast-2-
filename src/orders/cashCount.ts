import type { Order } from './orderModel';

/**
 * Counting the cash drawer at the end of a shift or day, against what the bills say was taken in
 * cash - the shift close and cash reconciliation of URY and POSR, from the restaurant systems
 * surveyed on 8 Oct 2026. Pure: the screens and Firestore call it.
 *
 * A count is never edited or deleted. Counting again adds another record, so a manager sees both
 * the first count and the recount, each with who made it.
 */

/** Thai banknotes and coins, largest first. Satang coins are rare but bills end in .25 and .75. */
export const THB_DENOMINATIONS = [1000, 500, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.25] as const;

export interface CashCount {
  id: string;
  hotelId: string;
  businessDate: string;
  /** The float the drawer started with. */
  floatThb: number;
  /** Cash payments recorded on the day's bills. */
  cashTakenThb: number;
  /** float + cash taken. */
  expectedThb: number;
  countedThb: number;
  /** counted - expected: positive is over, negative is short. */
  differenceThb: number;
  /** How many of each note and coin, when counted that way; null for a single total. */
  denominations: Record<string, number> | null;
  /** Bills still open when counted - their cash is in the drawer but not yet in revenue. */
  openBills: number;
  note: string;
  countedBy: string;
  countedAt: string;
}

const satang = (thb: number) => Math.round(thb * 100);
const baht = (s: number) => s / 100;

/** Cash taken on a business day's bills, open or closed - all of it is in the drawer. */
export function cashTaken(orders: Order[], businessDate: string): number {
  let total = 0;
  for (const o of orders) {
    if (o.businessDate !== businessDate) continue;
    for (const p of o.payments) if (p.method === 'cash') total += satang(p.amountThb);
  }
  return baht(total);
}

/** The total of a note-and-coin count. Blank and negative entries count as none. */
export function denominationTotal(counts: Record<string, number>): number {
  let total = 0;
  for (const d of THB_DENOMINATIONS) {
    const n = Math.floor(Number(counts[String(d)]) || 0);
    if (n > 0) total += satang(d) * n;
  }
  return baht(total);
}

export interface CountInput {
  hotelId: string;
  businessDate: string;
  floatThb: number;
  countedThb: number;
  denominations: Record<string, number> | null;
  note: string;
}

export class CashCountError extends Error {}

export function recordCount(input: CountInput, orders: Order[], actor: { by: string; at: string }): CashCount {
  if (!actor.by) throw new CashCountError('You are signed out. Sign in again to record a count.');
  const floatThb = Number(input.floatThb);
  const countedThb = Number(input.countedThb);
  if (!Number.isFinite(floatThb) || floatThb < 0) throw new CashCountError('The float must be zero or more.');
  if (!Number.isFinite(countedThb) || countedThb < 0) throw new CashCountError('Enter what is in the drawer.');
  const taken = cashTaken(orders, input.businessDate);
  const expected = baht(satang(floatThb) + satang(taken));
  const difference = baht(satang(countedThb) - satang(expected));
  const note = input.note.trim();
  if (difference !== 0 && !note) throw new CashCountError('The drawer does not match. Say what you know about the difference before saving.');
  return {
    id: `${input.businessDate}-${actor.at.replace(/[^0-9]/g, '').slice(8, 17)}`,
    hotelId: input.hotelId,
    businessDate: input.businessDate,
    floatThb: baht(satang(floatThb)),
    cashTakenThb: taken,
    expectedThb: expected,
    countedThb: baht(satang(countedThb)),
    differenceThb: difference,
    denominations: input.denominations,
    openBills: orders.filter((o) => o.businessDate === input.businessDate && o.status === 'open').length,
    note,
    countedBy: actor.by,
    countedAt: actor.at,
  };
}

export function describeDifference(differenceThb: number): string {
  if (differenceThb === 0) return 'matches';
  return differenceThb > 0 ? `over by ${differenceThb.toFixed(2)}` : `short by ${(-differenceThb).toFixed(2)}`;
}
