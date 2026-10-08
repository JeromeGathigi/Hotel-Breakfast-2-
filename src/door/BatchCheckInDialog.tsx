import React, { useMemo, useState } from 'react';
import { CheckCheck, Search } from 'lucide-react';
import type { MealServiceType } from '../types';
import type { DoorRoom } from './doorModel';
import type { DoorActions } from './actions';
import { Banner, Modal, btn } from '../components/ui';

/**
 * Checking in a tour group or a block in one go.
 *
 * Only rooms whose entitlement is CONFIRMED for this service, that are not already checked in and
 * that have someone booked, can be batched - each is recorded at its booked counts. Anything else
 * (room only, a rate the app cannot confirm, a data-quality problem) needs the individual check-in,
 * where the over-capacity reasons and the rate explanation live. The old batch wrote every selected
 * room regardless.
 */
export const BatchCheckInDialog: React.FC<{
  rooms: DoorRoom[];
  service: MealServiceType;
  actions: DoorActions;
  onClose: () => void;
  onDone: (summary: { saved: number; queued: number; failed: string[] }) => void;
}> = ({ rooms, service, actions, onClose, onDone }) => {
  const groups = useMemo(
    () => [...new Set(rooms.map((r) => r.guest.blockCode || r.guest.companyName).filter((x): x is string => Boolean(x)))].sort(),
    [rooms]
  );
  const [group, setGroup] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const eligibility = (r: DoorRoom): string | null => {
    if (r.checkIn) return 'already checked in';
    if (r.dataIssue) return 'data-quality problem - check in individually';
    if (r.booked.pax === 0) return r.entitled === false ? 'room only - check in individually' : 'nobody booked';
    if (service === 'breakfast' && r.breakfast.unverified) return 'rate not confirmed - check in individually';
    if (service === 'breakfast' && r.breakfast.arrivesToday) return 'arrived today - breakfast starts tomorrow';
    return null;
  };

  const visible = rooms.filter((r) => {
    if (group && r.guest.blockCode !== group && r.guest.companyName !== group) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return r.guest.roomNumber.toLowerCase().includes(q) || r.guest.guestName.toLowerCase().includes(q);
  });
  const selectable = visible.filter((r) => eligibility(r) === null);
  const chosen = rooms.filter((r) => selected.has(r.guest.roomNumber));
  const pax = chosen.reduce((n, r) => n + r.booked.pax, 0);

  const toggle = (room: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(room)) next.delete(room);
      else next.add(room);
      return next;
    });

  const run = async () => {
    setRunning(true);
    setProgress(0);
    let saved = 0;
    let queued = 0;
    const failed: string[] = [];
    for (const r of chosen) {
      try {
        const result = await actions.checkIn({
          guest: r.guest,
          service,
          adults: r.booked.adults,
          children: r.booked.children,
          infants: 0,
          checkedGuestNames: [r.guest.guestName, ...(r.guest.accompanyingGuests ?? [])],
          table: null,
          previousTableId: null,
          booked: r.booked,
          basis: service === 'breakfast' ? r.breakfast.basis : 'rate',
          overCapacity: null,
          existing: null,
        });
        if (result === 'saved') saved += 1;
        else queued += 1;
      } catch (e) {
        failed.push(`${r.guest.roomNumber} (${(e as Error)?.message || 'error'})`);
      }
      setProgress((p) => p + 1);
    }
    setRunning(false);
    onDone({ saved, queued, failed });
    if (failed.length === 0) onClose();
  };

  return (
    <Modal
      title="Group check-in"
      subtitle="Rooms with a confirmed booking, checked in at their booked counts."
      onClose={onClose}
      width="xl"
      footer={
        <>
          <span className="mr-auto text-sm text-muted-foreground">
            {running ? `Saving ${progress} of ${chosen.length}…` : `${chosen.length} rooms · ${pax} guests`}
          </span>
          <button type="button" className={btn.secondary} onClick={onClose} disabled={running}>
            Cancel
          </button>
          <button type="button" className={btn.primary} onClick={run} disabled={running || chosen.length === 0}>
            <CheckCheck size={18} /> Check in {chosen.length}
          </button>
        </>
      }
    >
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full h-11 pl-9 pr-3 rounded-xl border border-border text-base"
            placeholder="Room or name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {groups.length > 0 && (
          <select className="h-11 px-3 rounded-xl border border-border text-base bg-white" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">All groups and companies</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className={btn.secondary}
          onClick={() =>
            setSelected((prev) => {
              const all = selectable.every((r) => prev.has(r.guest.roomNumber));
              const next = new Set(prev);
              for (const r of selectable) all ? next.delete(r.guest.roomNumber) : next.add(r.guest.roomNumber);
              return next;
            })
          }
        >
          {selectable.length > 0 && selectable.every((r) => selected.has(r.guest.roomNumber)) ? 'Clear' : `Select ${selectable.length}`}
        </button>
      </div>

      <ul className="divide-y divide-border rounded-xl border border-border">
        {visible.map((r) => {
          const why = eligibility(r);
          const on = selected.has(r.guest.roomNumber);
          return (
            <li key={r.guest.roomNumber}>
              <label className={`flex items-center gap-3 min-h-12 px-3 py-2 ${why ? 'opacity-60' : 'cursor-pointer'}`}>
                <input type="checkbox" className="h-5 w-5" disabled={Boolean(why)} checked={on} onChange={() => toggle(r.guest.roomNumber)} />
                <span className="font-mono-custom font-bold w-14">{r.guest.roomNumber}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-base truncate">{r.guest.guestName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {r.booked.pax} booked{r.guest.blockCode ? ` · ${r.guest.blockCode}` : ''}
                    {why ? ` · ${why}` : ''}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
        {visible.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">No rooms match.</li>}
      </ul>
      {running && <Banner tone="pending">Saving… keep this window open.</Banner>}
    </Modal>
  );
};
