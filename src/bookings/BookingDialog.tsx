import React, { useMemo, useState } from 'react';
import { AlertTriangle, Save } from 'lucide-react';
import { Banner, Modal, Stepper, btn } from '../components/ui';
import type { Guest, MealServiceType } from '../types';
import { findGuests } from '../orders/NewOrderDialog';
import { effectiveCapacity, seatableTables } from '../lib/tables';
import { serviceForTime, tableClashes, type Booking, type BookingChanges, type BookingKind } from './bookingModel';
import type { BookingsStore, NewBookingInput } from './store';

const SERVICES: MealServiceType[] = ['breakfast', 'lunch', 'dinner'];
const QUOTES = [5, 10, 15, 20, 30, 45];

/**
 * A new reservation, a walk-in for the waiting list, or changes to either. A booking can be under
 * an in-house room (found on today's list) or just a name; a table is optional and can be chosen
 * when the party arrives. Booking a table already taken within one sitting is warned about, not
 * refused - a host may knowingly turn a table.
 */
export const BookingDialog: React.FC<{
  store: BookingsStore;
  kind: BookingKind;
  date: string;
  existing?: Booking | null;
  onCreate: (input: NewBookingInput) => Promise<void>;
  onChange: (changes: BookingChanges) => Promise<void>;
  onClose: () => void;
}> = ({ store, kind, date, existing, onCreate, onChange, onClose }) => {
  const reservation = kind === 'reservation';
  const [day, setDay] = useState(existing?.date ?? date);
  const [time, setTime] = useState(existing?.time ?? '19:00');
  const [service, setService] = useState<MealServiceType | null>(existing?.service ?? null);
  const [partySize, setPartySize] = useState(existing?.partySize ?? 2);
  const [name, setName] = useState(existing && !existing.name.startsWith('Room ') ? existing.name : '');
  const [guest, setGuest] = useState<Guest | null>(() => store.guests.find((g) => g.roomNumber === existing?.roomNumber) ?? null);
  const [roomQuery, setRoomQuery] = useState(existing?.roomNumber ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [tableId, setTableId] = useState<string | null>(existing?.tableId ?? null);
  const [quoted, setQuoted] = useState<number | null>(existing?.quotedMinutes ?? (reservation ? null : 15));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tables = useMemo(() => seatableTables(store.tables).sort((a, b) => a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true })), [store.tables]);
  const table = tables.find((t) => t.id === tableId) ?? null;
  const chosenService = service ?? serviceForTime(reservation ? time || '19:00' : '07:00');
  const clashes = reservation && table ? tableClashes(store.bookings, { id: existing?.id ?? '', date: day, time, tableId }) : [];
  const roomMatches = roomQuery.trim() && !guest ? findGuests(store.guests, roomQuery).slice(0, 6) : [];

  const save = async () => {
    setBusy(true);
    setError(null);
    const fields = {
      partySize,
      name: name.trim() || guest?.guestName || '',
      roomNumber: guest?.roomNumber ?? null,
      phone,
      notes,
      tableId: table?.id ?? null,
      tableNumber: table?.tableNumber ?? null,
      service: chosenService,
      ...(reservation ? { time, date: day } : { quotedMinutes: quoted }),
    };
    try {
      if (existing) await onChange(fields);
      else await onCreate({ kind, date: reservation ? day : date, ...fields });
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={existing ? `Change ${existing.name}'s booking` : reservation ? 'New reservation' : 'Add to the waiting list'}
      subtitle={reservation ? 'For a time and a party size. Choose a table now or when they arrive.' : 'A party waiting for a table now. Tell them how long; the list times the wait.'}
      onClose={onClose}
      footer={
        <>
          <button className={btn.secondary} onClick={onClose}>
            Cancel
          </button>
          <button className={btn.primary} onClick={save} disabled={busy}>
            <Save size={18} /> {busy ? 'Saving…' : existing ? 'Save changes' : reservation ? 'Book' : 'Add to the list'}
          </button>
        </>
      }
    >
      {error && (
        <Banner tone="critical" role="alert">
          {error}
        </Banner>
      )}

      {reservation && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-bold">Date</span>
            <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl border border-border bg-white" />
          </label>
          <label className="block">
            <span className="text-sm font-bold">Time</span>
            <input type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl border border-border bg-white" />
          </label>
        </div>
      )}

      <div role="radiogroup" aria-label="Meal service" className="grid grid-cols-3 gap-2">
        {SERVICES.map((s) => (
          <button key={s} role="radio" aria-checked={chosenService === s} onClick={() => setService(s)} className={`h-11 rounded-xl border-2 font-bold text-sm capitalize cursor-pointer ${chosenService === s ? 'border-accent bg-accent/10' : 'border-border bg-white'}`}>
            {s}
          </button>
        ))}
      </div>

      <Stepper label="Guests" value={partySize} onChange={setPartySize} min={1} max={60} />

      <div className="space-y-1.5">
        <label htmlFor="bk-room" className="text-sm font-bold block">
          In-house room (optional)
        </label>
        {guest ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-accent bg-accent/5 px-3 h-11">
            <span>
              <strong className="font-mono-custom">{guest.roomNumber}</strong> · {guest.guestName}
            </span>
            <button className={btn.quiet} onClick={() => setGuest(null)}>
              Change
            </button>
          </div>
        ) : (
          <input id="bk-room" value={roomQuery} onChange={(e) => setRoomQuery(e.target.value)} placeholder="Room number or guest name" className="w-full h-11 px-3 rounded-xl border border-border text-base" />
        )}
        {roomMatches.length > 0 && (
          <div className="divide-y divide-border rounded-xl border border-border">
            {roomMatches.map((g) => (
              <button
                key={g.roomNumber}
                onClick={() => {
                  setGuest(g);
                  setRoomQuery(g.roomNumber);
                }}
                className="w-full text-left p-3 flex gap-3 hover:bg-[#F2EBE4]/60 cursor-pointer"
              >
                <span className="font-bold font-mono-custom">{g.roomNumber}</span>
                <span className="truncate">{g.guestName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-bold">Name {guest ? '(optional)' : ''}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={guest?.guestName ?? 'Name the booking is under'} className="mt-1 w-full h-11 px-3 rounded-xl border border-border text-base" />
        </label>
        <label className="block">
          <span className="text-sm font-bold">Phone (optional)</span>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl border border-border text-base" />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-bold">Notes</span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Occasion, high chair, allergies, window table" className="mt-1 w-full h-11 px-3 rounded-xl border border-border text-base" />
      </label>

      {!reservation && (
        <fieldset>
          <legend className="text-sm font-bold mb-1">Wait you told them</legend>
          <div className="flex flex-wrap gap-1.5">
            {QUOTES.map((q) => (
              <button key={q} onClick={() => setQuoted(q)} aria-pressed={quoted === q} className={`h-11 px-3 rounded-xl border-2 font-bold text-sm cursor-pointer ${quoted === q ? 'border-accent bg-accent/10' : 'border-border bg-white'}`}>
                {q} min
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {tables.length > 0 && (
        <fieldset>
          <legend className="text-sm font-bold mb-1">Table (optional)</legend>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-40 overflow-y-auto">
            <button onClick={() => setTableId(null)} aria-pressed={tableId === null} className={`h-11 rounded-xl border-2 text-sm font-bold cursor-pointer ${tableId === null ? 'border-accent bg-accent/10' : 'border-border bg-white'}`}>
              None
            </button>
            {tables.map((t) => (
              <button
                key={t.id}
                onClick={() => setTableId(t.id)}
                aria-pressed={tableId === t.id}
                title={`${effectiveCapacity(t, store.tables)} seats · ${t.zone}`}
                className={`h-11 rounded-xl border-2 text-sm font-bold cursor-pointer ${tableId === t.id ? 'border-accent bg-accent/10' : 'border-border bg-white'}`}
              >
                {t.tableNumber}
              </button>
            ))}
          </div>
          {table && effectiveCapacity(table, store.tables) < partySize && (
            <p className="text-sm text-amber-800 mt-1">Table {table.tableNumber} seats {effectiveCapacity(table, store.tables)}, for a party of {partySize}.</p>
          )}
        </fieldset>
      )}

      {clashes.length > 0 && (
        <Banner tone="warn" title={`Table ${table?.tableNumber} is booked within the same sitting`}>
          <p className="flex items-start gap-1.5">
            <AlertTriangle size={14} className="mt-1 shrink-0" />
            {clashes.map((c) => `${c.time} ${c.name} (${c.partySize})`).join(' · ')}
          </p>
        </Banner>
      )}
    </Modal>
  );
};
