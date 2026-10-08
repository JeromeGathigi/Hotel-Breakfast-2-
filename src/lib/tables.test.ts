import { describe, expect, it } from 'vitest';
import type { DiningTable } from '../types';
import { VACANT, buildStatusChange, buildUnmergePlan } from './tables';
import { formatSeatedAt } from './turnover';

const table = (id: string, over: Partial<DiningTable> = {}): DiningTable => ({ id, tableNumber: id.toUpperCase(), capacity: 4, zone: 'Main Dining', status: 'available', ...over });

// A1 is the primary of a merged A1+A2, seated for breakfast at 07:42 Bangkok.
const seated = { status: 'occupied' as const, occupiedByRoom: '512', occupiedByGuest: 'GUEST 512', occupiedPax: 6, occupiedSince: '2026-10-08T00:42:00.000Z', mealService: 'breakfast' as const };
const a1 = table('a1', { mergedTables: ['a2'], ...seated });
const a2 = table('a2', { mergedInto: 'a1', ...seated });
const b1 = table('b1');
const all = [a1, a2, b1];
const ctx = { now: '2026-10-08T02:00:00.000Z', service: 'lunch' as const };

describe('changing a table status on the floor plan', () => {
  it('clears every table of a merged group, so the group can be separated afterwards', () => {
    const updates = buildStatusChange(a1, 'available', all, ctx);
    expect(Object.keys(updates).sort()).toEqual(['a1', 'a2']);
    expect(updates.a2).toEqual({ status: 'available', ...VACANT });
    const after = all.map((t) => ({ ...t, ...updates[t.id] }));
    expect(buildUnmergePlan(after[0], after).valid).toBe(true);
  });

  it('reaches the whole group from a member as well as from the primary', () => {
    expect(Object.keys(buildStatusChange(a2, 'cleaning', all, ctx)).sort()).toEqual(['a1', 'a2']);
  });

  it('ends the occupancy for reserved and cleaning, not only for available', () => {
    for (const status of ['reserved', 'cleaning'] as const) {
      expect(buildStatusChange(a1, status, all, ctx).a1).toEqual({ status, ...VACANT });
    }
  });

  it('starts the turnover clock for a walk-in marked occupied by hand, and keeps a running one', () => {
    expect(buildStatusChange(b1, 'occupied', all, ctx)).toEqual({ b1: { status: 'occupied', occupiedSince: ctx.now, mealService: 'lunch' } });
    expect(buildStatusChange(a1, 'occupied', all, ctx).a2).toEqual({ status: 'occupied', occupiedSince: seated.occupiedSince, mealService: 'breakfast' });
  });

  it('only touches fields a host may change under firestore.rules', () => {
    const allowed = new Set(['status', 'occupiedByRoom', 'occupiedByGuest', 'occupiedPax', 'occupiedSince', 'mealService', 'mergedInto', 'mergedTables']);
    for (const status of ['available', 'occupied', 'reserved', 'cleaning'] as const) {
      for (const update of Object.values(buildStatusChange(a1, status, all, ctx))) {
        expect(Object.keys(update).filter((k) => !allowed.has(k))).toEqual([]);
      }
    }
  });
});

describe('formatSeatedAt', () => {
  it('shows a stored instant as the time in Bangkok', () => {
    expect(formatSeatedAt('2026-10-08T00:42:00.000Z')).toBe('07:42');
  });

  it('shows an older stored time as it is, and nothing as nothing', () => {
    expect(formatSeatedAt('07:42')).toBe('07:42');
    expect(formatSeatedAt(null)).toBe('');
    expect(formatSeatedAt(undefined)).toBe('');
  });
});
