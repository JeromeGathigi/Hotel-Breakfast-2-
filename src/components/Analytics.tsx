import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { collection, db, onSnapshot } from '../firebase';
import type { DaySummary } from '../lib/guestImport';
import { dailyTrend, hourlyProfile, monthTotals, monthlyTrend } from '../lib/analytics';
import { Banner, Empty } from './ui';

/**
 * Breakfast analytics, as the property's spec defines the page (section 10): past days only, from
 * the archive of each day's guest list and that day's check-ins.
 *
 * "Data shown reflects historical records from previous days. Today's data will appear from
 * tomorrow onwards." - each day is summarised when the next morning's import archives its list,
 * which is also why no scheduled job is needed on the free plan.
 */
export const Analytics: React.FC<{ hotelId: string; today: string }> = ({ hotelId, today }) => {
  const [days, setDays] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(today.slice(0, 7));

  useEffect(() => {
    setLoading(true);
    setError(null);
    return onSnapshot(
      collection(db, 'hotels', hotelId, 'history'),
      (snap) => {
        setDays(snap.docs.map((d) => d.data() as DaySummary).filter((d) => d.source === 'guest-list-archive' && d.date < today));
        setLoading(false);
      },
      (err) => {
        console.error('Analytics read failed:', err);
        setError(err?.code === 'permission-denied' ? 'You do not have permission to read the archive.' : err?.message || 'The archive could not be read.');
        setLoading(false);
      }
    );
  }, [hotelId, today]);

  const totals = useMemo(() => monthTotals(days, month), [days, month]);
  const hours = useMemo(() => hourlyProfile(days, month), [days, month]);
  const daily = useMemo(() => dailyTrend(days, month), [days, month]);
  const months = useMemo(() => monthlyTrend(days), [days]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-5 border border-border shadow-luxury flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold font-display">Breakfast analytics</h2>
          <p className="text-sm text-muted-foreground">
            Data shown reflects historical records from previous days. Today's data will appear from tomorrow onwards.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold">
          Month
          <input type="month" value={month} max={today.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} className="h-11 px-3 rounded-xl border border-border bg-white" />
        </label>
      </div>

      {error && (
        <Banner tone="critical" role="alert">
          {error}
        </Banner>
      )}

      {loading ? (
        <p className="text-center text-muted-foreground py-10">Loading…</p>
      ) : totals.days === 0 ? (
        <Empty title={`No archived days for ${month}`}>
          A day is archived when the next morning's guest list is imported. Days before that process existed have nothing to show - no figures are estimated to fill the gap.
        </Empty>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="text-left p-4 font-bold text-base">
                Monthly summary · {totals.days} day{totals.days === 1 ? '' : 's'} archived
              </caption>
              <thead className="bg-[#F2EBE4]/60 text-left label-mono">
                <tr>
                  <th className="p-3"></th>
                  <th className="p-3 text-right">Rooms</th>
                  <th className="p-3 text-right">Adults</th>
                  <th className="p-3 text-right">Children</th>
                  <th className="p-3 text-right">Infants</th>
                  <th className="p-3 text-right">Persons</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular-nums">
                <tr>
                  <th className="p-3 text-left">Booked with breakfast</th>
                  <td className="p-3 text-right">{totals.bookedRooms}</td>
                  <td className="p-3 text-right">{totals.bookedAdults}</td>
                  <td className="p-3 text-right">{totals.bookedChildren}</td>
                  <td className="p-3 text-right text-muted-foreground">—</td>
                  <td className="p-3 text-right font-bold">{totals.bookedPax}</td>
                </tr>
                <tr>
                  <th className="p-3 text-left">Came to eat</th>
                  <td className="p-3 text-right">{totals.cameRooms}</td>
                  <td className="p-3 text-right">{totals.cameAdults}</td>
                  <td className="p-3 text-right">{totals.cameChildren}</td>
                  <td className="p-3 text-right">{totals.cameInfants}</td>
                  <td className="p-3 text-right font-bold">{totals.camePax}</td>
                </tr>
                <tr>
                  <th className="p-3 text-left">Did not come (no-show)</th>
                  <td className="p-3 text-right">{totals.noShowRooms}</td>
                  <td className="p-3 text-right text-muted-foreground" colSpan={3}></td>
                  <td className="p-3 text-right font-bold">{totals.noShowPax}</td>
                </tr>
              </tbody>
            </table>
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              {totals.attendance === null ? 'Nothing was booked this month.' : `${totals.attendance}% of booked guests came.`}
              {totals.unbookedPax > 0 ? ` ${totals.unbookedPax} guests ate without a confirmed breakfast booking.` : ''}
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Chart title="Peak arrival time">
              <BarChart data={hours}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,22,43,0.08)" />
                <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="pax" name="Guests" fill="#1A3A6D" radius={[6, 6, 0, 0]} />
              </BarChart>
            </Chart>
            <Chart title="Booked against actual, by day">
              <BarChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,22,43,0.08)" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="booked" name="Booked" fill="#cbd5e1" radius={[6, 6, 0, 0]} />
                <Bar dataKey="came" name="Came" fill="#1A3A6D" radius={[6, 6, 0, 0]} />
              </BarChart>
            </Chart>
          </div>
        </>
      )}

      {months.length > 1 && (
        <Chart title="Breakfast covers by month">
          <LineChart data={months}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,22,43,0.08)" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line dataKey="booked" name="Booked" stroke="#94a3b8" strokeWidth={2} />
            <Line dataKey="came" name="Came" stroke="#1A3A6D" strokeWidth={2} />
          </LineChart>
        </Chart>
      )}
    </div>
  );
};

const Chart: React.FC<{ title: string; children: React.ReactElement }> = ({ title, children }) => (
  <section className="bg-white rounded-2xl border border-border p-4">
    <h3 className="font-bold mb-2">{title}</h3>
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  </section>
);
