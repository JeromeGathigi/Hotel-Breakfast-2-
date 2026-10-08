import React, { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import type { MealServiceType } from '../types';
import { useDoorData } from '../door/useDoorData';
import { buildDoorRooms, doorStats, searchRooms } from '../door/doorModel';
import { Banner, Empty, VipBadge, btn } from './ui';
import { VipLegend } from './VipLegend';
import { canonicalPlan } from '../lib/meals';
import { timeInBangkok } from '../lib/dates';
import { checkinPax } from '../lib/checkins';
import { downloadCsv, toCsv } from '../lib/csv';

/**
 * The in-house manifest, as the spec lays it out (section 6):
 *
 *   # | Room | Guest Name (+ accompanying) | VIP | Meal Plan | Adults | Children | Stay Dates | Check-In
 *
 * It reads the same live data and the same view model as the door, so the two can never disagree
 * about who has breakfast. The old manifest polled Firestore every five minutes ON TOP of a live
 * listener - through a cache-falling-back read that could overwrite live data with stale data - and
 * announced "Manifest synced with Firestore" whether or not it was.
 */
export const GuestList: React.FC<{ hotelId: string; today: string }> = ({ hotelId, today }) => {
  const data = useDoorData(hotelId, today);
  const [service] = useState<MealServiceType>('breakfast');
  const rooms = useMemo(() => buildDoorRooms(data, service), [data, service]);
  const stats = useMemo(() => doorStats(rooms, service), [rooms, service]);
  const [query, setQuery] = useState('');
  const visible = useMemo(() => searchRooms(rooms, query), [rooms, query]);

  const exportCsv = () => {
    const headers = ['Room', 'Guest', 'Accompanying', 'VIP', 'Rate code', 'Plan', 'Breakfast', 'Why', 'Adults', 'Children', 'Arrival', 'Departure', 'Group', 'Checked in at', 'Seated'];
    const rows = rooms.map((r) => [
      r.guest.roomNumber,
      r.guest.guestName,
      (r.guest.accompanyingGuests ?? []).join(' / '),
      r.vip?.label ?? '',
      r.guest.rateCode ?? '',
      r.plan,
      r.breakfast.unverified ? 'Check' : r.breakfast.entitled ? 'Yes' : 'No',
      r.breakfast.reason,
      r.guest.adults,
      r.guest.children,
      r.guest.arrivalDate,
      r.guest.departureDate,
      [r.guest.companyName, r.guest.blockCode].filter(Boolean).join(' / '),
      r.checkIn ? timeInBangkok(r.checkIn.timestamp) : '',
      r.checkIn ? checkinPax(r.checkIn) : '',
    ]);
    downloadCsv(`${hotelId}-manifest-${today}.csv`, toCsv(headers, rows));
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-5 border border-border shadow-luxury flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold font-display">In-house manifest</h2>
          <p className="text-sm text-muted-foreground">
            {stats.totalRooms} rooms · {stats.totalPax} guests · breakfast {stats.breakfast.pax} pax ({stats.breakfast.rooms} rooms) · half board{' '}
            {stats.halfBoard.pax} ({stats.halfBoard.rooms}) · full board {stats.fullBoard.pax} ({stats.fullBoard.rooms}) · room only {stats.roomOnlyRooms} rooms
          </p>
          <p className="text-sm text-muted-foreground">
            Breakfast today: {stats.expectedToday} expected · {stats.checkedIn.pax} checked in · {stats.remaining.pax} still to come
            {stats.needsChecking.rooms ? ` · ${stats.needsChecking.pax} to check (${stats.needsChecking.codes.join(', ')})` : ''}
          </p>
        </div>
        <button className={btn.secondary} onClick={exportCsv} disabled={rooms.length === 0}>
          <Download size={16} /> Export CSV
        </button>
      </div>

      {Object.entries(data.errors)
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <Banner key={k} tone="critical" role="alert">
            <strong className="capitalize">{k}:</strong> {v}
          </Banner>
        ))}
      {stats.dataIssues.noAdults > 0 && <Banner tone="warn" title={`${stats.dataIssues.noAdults} rooms found with no adult count - please review`}>Correct them from the room on the Check-in screen.</Banner>}
      {stats.dataIssues.noDetails > 0 && <Banner tone="warn" title={`${stats.dataIssues.noDetails} rooms found with no guest details - please review`}>Correct them from the room on the Check-in screen.</Banner>}

      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          aria-label="Search the manifest"
          className="w-full h-12 pl-11 pr-4 rounded-xl border border-border bg-white text-base"
          placeholder="Room, name, group or company"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {data.loading ? (
        <p className="text-center text-muted-foreground py-10">Loading…</p>
      ) : rooms.length === 0 ? (
        <Empty title="No guest list">No Opera in-house export has been imported for this property.</Empty>
      ) : (
        <div className="bg-white rounded-2xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F2EBE4]/60 text-left label-mono">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">Room</th>
                <th className="p-3">Guest name</th>
                <th className="p-3">VIP</th>
                <th className="p-3">Meal plan</th>
                <th className="p-3 text-right">Adults</th>
                <th className="p-3 text-right">Children</th>
                <th className="p-3">Stay dates</th>
                <th className="p-3">Check-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((r, i) => (
                <tr key={r.guest.roomNumber} className={r.dataIssue && !r.corrected ? 'bg-amber-50' : ''}>
                  <td className="p-3 text-muted-foreground">{i + 1}</td>
                  <td className="p-3 font-mono-custom font-bold">{r.guest.roomNumber}</td>
                  <td className="p-3">
                    <p className="font-bold">{r.guest.guestName}</p>
                    {(r.guest.accompanyingGuests ?? []).map((n) => (
                      <p key={n} className="text-muted-foreground">
                        {n}
                      </p>
                    ))}
                  </td>
                  <td className="p-3">
                    <VipBadge vip={r.vip} />
                  </td>
                  <td className="p-3">
                    <p>{canonicalPlan(r.guest.rateCode || r.guest.mealPlan)}</p>
                    <p className={`text-xs font-bold ${r.breakfast.unverified ? 'text-amber-700' : r.breakfast.entitled ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {r.breakfast.unverified ? 'Check rate' : r.breakfast.entitled ? 'Breakfast' : 'Room only'}
                    </p>
                  </td>
                  <td className="p-3 text-right tabular-nums">{r.guest.adults}</td>
                  <td className="p-3 text-right tabular-nums">{r.guest.children}</td>
                  <td className="p-3 whitespace-nowrap text-muted-foreground">
                    {r.guest.arrivalDate} → {r.guest.departureDate}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {r.checkIn ? (
                      <span className="text-emerald-800 font-bold">
                        Checked in at {timeInBangkok(r.checkIn.timestamp, '…')} ({checkinPax(r.checkIn)})
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <VipLegend />
    </div>
  );
};
