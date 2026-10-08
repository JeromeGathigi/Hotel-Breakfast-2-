import { describe, it, expect } from 'vitest';
import { dailyTrend, hourlyProfile, monthTotals, monthlyTrend } from './analytics';
import type { DaySummary } from './guestImport';

const day = (date: string, booked: number, came: number, noShow: number, byHour: Record<string, number> = {}): DaySummary => ({
  date,
  hotelId: 'novotel',
  source: 'guest-list-archive',
  rooms: 50,
  pax: 80,
  booked: { rooms: booked / 2, adults: booked, children: 0, pax: booked, unverifiedRooms: 0, unverifiedPax: 0 },
  actual: { rooms: came / 2, adults: came, children: 0, infants: 0, pax: came, byHour },
  noShow: { rooms: noShow / 2, pax: noShow },
  unbooked: { rooms: 0, pax: 0 },
});

const days = [day('2026-09-01', 40, 36, 6, { '07': 20, '08': 16 }), day('2026-09-02', 50, 44, 8, { '08': 30, '11': 14 }), day('2026-10-01', 60, 55, 5)];

describe('analytics', () => {
  it('totals a month', () => {
    const t = monthTotals(days, '2026-09');
    expect(t).toMatchObject({ days: 2, bookedPax: 90, camePax: 80, noShowPax: 14 });
    expect(t.attendance).toBe(84); // (90 - 14) / 90
  });

  it('reports no attendance rate rather than an invented one when nothing was booked', () => {
    expect(monthTotals(days, '2027-01').attendance).toBeNull();
  });

  it('profiles arrivals by Bangkok hour through midday', () => {
    const p = hourlyProfile(days, '2026-09');
    expect(p.find((h) => h.hour === '08:00')?.pax).toBe(46);
    expect(p.find((h) => h.hour === '11:00')?.pax).toBe(14);
    expect(p.map((h) => h.hour)).toEqual(['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00']);
  });

  it('trends by day and by month', () => {
    expect(dailyTrend(days, '2026-09').map((d) => d.day)).toEqual([1, 2]);
    expect(monthlyTrend(days)).toEqual([
      { month: '2026-09', came: 80, booked: 90 },
      { month: '2026-10', came: 55, booked: 60 },
    ]);
  });
});
