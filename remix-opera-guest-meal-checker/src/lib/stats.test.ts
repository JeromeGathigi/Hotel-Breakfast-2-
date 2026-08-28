import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseInHouseReport } from '../parsing';
import { computeHouseStats } from './stats';

const fixture = readFileSync(
  new URL('../parsing/__fixtures__/novotel-2026-08-27-in-house.tsv', import.meta.url),
  'utf8'
);

describe('computeHouseStats', () => {
  it('matches the real golden-file totals for the Novotel fixture', () => {
    const { rooms } = parseInHouseReport(fixture);
    const guests = rooms.map((room) => ({ ...room, lastUpdated: null as any }));

    const stats = computeHouseStats(guests, {});

    expect(stats.totalRooms).toBe(119);
    expect(stats.entitledRooms).toBe(55);
    expect(stats.roomOnly.rooms).toBe(64);
    expect(stats.breakfast.rooms + stats.halfBoard.rooms + stats.fullBoard.rooms).toBe(55);
  });

  it('keeps Full Board out of the Half Board bucket', () => {
    const synthetic = [
      { roomNumber: '1', mealPlan: 'Full Board', adults: 2, children: 0, lastUpdated: null as any },
      { roomNumber: '2', mealPlan: 'Half Board', adults: 1, children: 0, lastUpdated: null as any },
    ] as any;

    const s = computeHouseStats(synthetic, {});
    expect(s.fullBoard.pax).toBe(2);
    expect(s.halfBoard.pax).toBe(1);
  });

  it('counts unentitled check-ins instead of dropping them', () => {
    const roomOnly = [
      { roomNumber: '9', mealPlan: 'Room Only / No Package', adults: 2, children: 0, lastUpdated: null as any },
    ] as any;

    const s2 = computeHouseStats(roomOnly, {
      '9': { roomNumber: '9', adultsAte: 2, childrenAte: 0, infantsAte: 0 },
    } as any);

    expect(s2.unentitledPax).toBe(2);
    expect(s2.attendedPax).toBe(0);
    expect(s2.remainingPax).toBe(0);
  });
});
