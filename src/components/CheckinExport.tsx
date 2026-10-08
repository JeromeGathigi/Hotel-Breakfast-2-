import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { collection, db, getDocs } from '../firebase';
import type { CheckIn } from '../types';
import { addDays } from '../lib/businessDate';
import { timeInBangkok } from '../lib/dates';
import { downloadCsv, toCsv } from '../lib/csv';
import { Banner, btn } from './ui';

/** The most days one export reads: a quarter. Each day is one read of that day's check-ins. */
const MAX_DAYS = 93;

/**
 * Every check-in recorded at the door for a range of business days, one row per room and service,
 * with who recorded it and who authorised any over-capacity. Managers' data; it used to be
 * reachable only from the administrators' import screen.
 */
export const CheckinExport: React.FC<{ hotelId: string; today: string }> = ({ hotelId, today }) => {
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      if (from > to) throw new Error('the start date is after the end date');
      const dates: string[] = [];
      for (let d = from; d <= to && dates.length < MAX_DAYS; d = addDays(d, 1)) dates.push(d);
      const snaps = await Promise.all(dates.map((d) => getDocs(collection(db, 'hotels', hotelId, 'checkins', d, 'rooms'))));
      const rows = snaps.flatMap((s, i) =>
        s.docs.map((doc) => {
          const c = doc.data() as CheckIn;
          return [
            dates[i],
            c.mealService ?? 'breakfast',
            c.roomNumber,
            c.guestName,
            c.adultsAte,
            c.childrenAte,
            c.infantsAte,
            c.bookedPax ?? '',
            timeInBangkok(c.timestamp),
            c.tableNumber ?? '',
            c.recordedBy,
            c.authorizingStaff ?? '',
            c.overCapacityOtherReason ?? '',
          ];
        })
      );
      downloadCsv(
        `${hotelId}-checkins-${from}-to-${dates[dates.length - 1]}.csv`,
        toCsv(['Date', 'Service', 'Room', 'Guest', 'Adults', 'Children', 'Infants', 'Booked', 'Time', 'Table', 'Recorded by', 'Authorised by', 'Reason'], rows)
      );
    } catch (e) {
      setError(`Check-in export failed: ${(e as Error)?.message || 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-border p-5 space-y-3">
      <div>
        <h3 className="text-lg font-bold">Check-ins for a range of days</h3>
        <p className="text-sm text-muted-foreground">Every room checked in at the door, as a spreadsheet. Up to {MAX_DAYS} days at a time.</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm font-bold">
          From
          <input type="date" className="block h-11 px-3 rounded-xl border border-border" value={from} max={today} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </label>
        <label className="text-sm font-bold">
          To
          <input type="date" className="block h-11 px-3 rounded-xl border border-border" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </label>
        <button className={btn.secondary} onClick={run} disabled={busy}>
          <Download size={16} /> {busy ? 'Preparing…' : 'Export CSV'}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Files open in Excel. Cells that start like a formula are written as text, so a booking name cannot run anything.</p>
      {error && (
        <Banner tone="critical" role="alert">
          {error}
        </Banner>
      )}
    </section>
  );
};
