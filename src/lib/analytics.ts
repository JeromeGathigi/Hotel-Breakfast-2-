import type { DaySummary } from './guestImport';

/**
 * The spec's analytics (section 10), computed from the per-day summaries written when each day's
 * list is archived (src/lib/guestImport.ts, summariseDay).
 *
 * Nothing here substitutes a number that was not measured. The previous page invented a 50-cover
 * forecast for any day without one and divided by it, showed '08:00' as the peak hour of days with
 * no check-ins, and rendered "null%" once the first of those was fixed.
 */

export interface MonthTotals {
  days: number;
  bookedRooms: number;
  bookedAdults: number;
  bookedChildren: number;
  bookedPax: number;
  cameRooms: number;
  cameAdults: number;
  cameChildren: number;
  cameInfants: number;
  camePax: number;
  noShowRooms: number;
  noShowPax: number;
  unbookedPax: number;
  /** Share of booked covers that came; null when nothing was booked. */
  attendance: number | null;
}

export function monthTotals(days: DaySummary[], month: string): MonthTotals {
  const inMonth = days.filter((d) => d.date.startsWith(month));
  const t: MonthTotals = {
    days: inMonth.length,
    bookedRooms: 0,
    bookedAdults: 0,
    bookedChildren: 0,
    bookedPax: 0,
    cameRooms: 0,
    cameAdults: 0,
    cameChildren: 0,
    cameInfants: 0,
    camePax: 0,
    noShowRooms: 0,
    noShowPax: 0,
    unbookedPax: 0,
    attendance: null,
  };
  for (const d of inMonth) {
    t.bookedRooms += d.booked.rooms;
    t.bookedAdults += d.booked.adults;
    t.bookedChildren += d.booked.children;
    t.bookedPax += d.booked.pax;
    t.cameRooms += d.actual.rooms;
    t.cameAdults += d.actual.adults;
    t.cameChildren += d.actual.children;
    t.cameInfants += d.actual.infants;
    t.camePax += d.actual.pax;
    t.noShowRooms += d.noShow.rooms;
    t.noShowPax += d.noShow.pax;
    t.unbookedPax += d.unbooked?.pax ?? 0;
  }
  t.attendance = t.bookedPax > 0 ? Math.round(((t.bookedPax - t.noShowPax) / t.bookedPax) * 100) : null;
  return t;
}

/** Breakfast arrivals by Bangkok hour, 06:00 to 12:00 (weekend service runs until midday). */
export function hourlyProfile(days: DaySummary[], month: string): Array<{ hour: string; pax: number }> {
  const hours = ['06', '07', '08', '09', '10', '11', '12'];
  const totals = Object.fromEntries(hours.map((h) => [h, 0])) as Record<string, number>;
  for (const d of days) {
    if (!d.date.startsWith(month)) continue;
    for (const [h, n] of Object.entries(d.actual.byHour ?? {})) if (h in totals) totals[h] += n;
  }
  return hours.map((h) => ({ hour: `${h}:00`, pax: totals[h] }));
}

/** Booked against actual, day by day, for the month. */
export function dailyTrend(days: DaySummary[], month: string) {
  return days
    .filter((d) => d.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ date: d.date, day: Number(d.date.slice(8)), booked: d.booked.pax, came: d.actual.pax, noShow: d.noShow.pax }));
}

/** Breakfast covers served per month, across everything archived. */
export function monthlyTrend(days: DaySummary[]): Array<{ month: string; came: number; booked: number }> {
  const by = new Map<string, { came: number; booked: number }>();
  for (const d of days) {
    const m = d.date.slice(0, 7);
    const v = by.get(m) ?? { came: 0, booked: 0 };
    v.came += d.actual.pax;
    v.booked += d.booked.pax;
    by.set(m, v);
  }
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => ({ month, ...v }));
}
