import React, { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { collection, db, onSnapshot } from '../firebase';
import type { MealForecastItem } from '../types';
import { isLegacyForecast } from '../lib/guestImport';
import { addDays, weekdayName } from '../lib/businessDate';
import { dateTimeInBangkok } from '../lib/dates';
import { downloadCsv, toCsv } from '../lib/csv';
import { Banner, Empty, btn } from './ui';

/**
 * Opera's package forecast, from today forward.
 *
 * Fixes against the previous screen:
 *  - it showed the FIRST seven days ever imported, not the next seven - after a month, "7 days"
 *    was a week of history;
 *  - "total covers" counted meeting coffee breaks (MBREAK) as restaurant covers;
 *  - 34 Novotel documents in production came from an older parser that summed per-unit rows
 *    (214 breakfasts for 2 Sep where the file says 98). They are shown as untrusted, never charted;
 *  - a read error was logged as a "notice" and the screen showed an empty forecast as if real.
 */
export const ForecastView: React.FC<{ hotelId: string; today: string }> = ({ hotelId, today }) => {
  const [docs, setDocs] = useState<MealForecastItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<7 | 14 | 31>(7);

  useEffect(() => {
    setLoading(true);
    setError(null);
    return onSnapshot(
      collection(db, 'hotels', hotelId, 'forecasts'),
      (snap) => {
        setDocs(snap.docs.map((d) => d.data() as MealForecastItem));
        setLoading(false);
      },
      (err) => {
        console.error('Forecast read failed:', err);
        setError(err?.code === 'permission-denied' ? 'You do not have permission to read the forecast.' : err?.message || 'The forecast could not be read.');
        setLoading(false);
      }
    );
  }, [hotelId]);

  const end = addDays(today, range - 1);
  const upcoming = useMemo(
    () => docs.filter((d) => !isLegacyForecast(d) && d.date >= today && d.date <= end).sort((a, b) => a.date.localeCompare(b.date)),
    [docs, today, end]
  );
  const legacyCount = docs.filter(isLegacyForecast).length;
  const latest = docs.filter((d) => !isLegacyForecast(d)).sort((a, b) => String(b.reportDate ?? '').localeCompare(String(a.reportDate ?? '')))[0];

  const chart = upcoming.map((d) => ({
    name: `${d.dayOfWeek || weekdayName(d.date)} ${Number(d.date.slice(8))}`,
    Breakfast: d.totalBreakfast,
    Dinner: d.totalDinner,
    'Meeting packages': d.meetingPackages ?? 0,
  }));
  const totals = upcoming.reduce((acc, d) => ({ breakfast: acc.breakfast + d.totalBreakfast, dinner: acc.dinner + d.totalDinner }), { breakfast: 0, dinner: 0 });

  /** Every day the latest forecast covers from today, not only the range on screen. */
  const exportCsv = () => {
    const ahead = docs.filter((d) => !isLegacyForecast(d) && d.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    downloadCsv(`${hotelId}-forecast-from-${today}.csv`, toCsv(['Date', 'Breakfast', 'Dinner', 'Meeting packages'], ahead.map((d) => [d.date, d.totalBreakfast, d.totalDinner, d.meetingPackages ?? 0])));
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-5 border border-border shadow-luxury flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold font-display">Meal forecast</h2>
          <p className="text-sm text-muted-foreground">
            {latest ? `From ${latest.filename || 'the package forecast'}, produced by Opera on ${latest.reportDate || 'an unknown date'}${latest.importedAt ? `, imported ${dateTimeInBangkok(latest.importedAt)}` : ''}.` : 'No package forecast imported yet.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-border bg-[#F2EBE4]/70 p-1">
            {([7, 14, 31] as const).map((n) => (
              <button key={n} onClick={() => setRange(n)} aria-pressed={range === n} className={`h-10 px-4 rounded-lg text-sm font-bold cursor-pointer ${range === n ? 'bg-white shadow-sm' : 'text-muted-foreground'}`}>
                {n === 31 ? 'Month' : `${n} days`}
              </button>
            ))}
          </div>
          <button className={btn.secondary} onClick={exportCsv} disabled={upcoming.length === 0}>
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {error && (
        <Banner tone="critical" role="alert">
          {error}
        </Banner>
      )}
      {legacyCount > 0 && (
        <Banner tone="warn" title={`${legacyCount} older forecast document${legacyCount === 1 ? '' : 's'} not shown`}>
          They were written by a previous parser that counted every package row separately and over-stated breakfast (for example 214 for a day the file says 98). Re-import the package forecast; an administrator can remove them under Settings → Data maintenance.
        </Banner>
      )}

      {loading ? (
        <p className="text-center text-muted-foreground py-10">Loading…</p>
      ) : upcoming.length === 0 ? (
        <Empty title="No forecast for the coming days">A manager imports Opera's package forecast each morning on the Opera import screen.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="stat-card-luxury !p-4">
              <p className="label-mono">Breakfast, next {upcoming.length} days</p>
              <p className="text-3xl font-bold font-display text-accent">{totals.breakfast}</p>
              <p className="text-xs text-muted-foreground">{Math.round(totals.breakfast / upcoming.length)} a day on average</p>
            </div>
            <div className="stat-card-luxury !p-4">
              <p className="label-mono">Dinner packages</p>
              <p className="text-3xl font-bold font-display">{totals.dinner}</p>
              <p className="text-xs text-muted-foreground">meeting packages are listed separately</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-border p-4">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,22,43,0.08)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Breakfast" fill="#1A3A6D" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Dinner" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Meeting packages" fill="#94a3b8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F2EBE4]/60 text-left label-mono">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Breakfast</th>
                  <th className="p-3 text-right">Dinner</th>
                  <th className="p-3 text-right">Meeting</th>
                  <th className="p-3">Products</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {upcoming.map((d) => (
                  <tr key={d.date} className={d.date === today ? 'bg-accent/5' : ''}>
                    <td className="p-3 whitespace-nowrap font-bold">
                      {d.dayOfWeek || weekdayName(d.date)} {d.date}
                      {d.date === today ? ' · today' : ''}
                    </td>
                    <td className="p-3 text-right tabular-nums font-bold text-accent">{d.totalBreakfast}</td>
                    <td className="p-3 text-right tabular-nums">{d.totalDinner}</td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">{d.meetingPackages ?? 0}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {Object.entries(d.packages)
                        .filter(([, n]) => n > 0)
                        .map(([p, n]) => `${p} ${n}`)
                        .join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
