import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Hourglass, Pencil, Plus, Undo2, UserX, Users } from 'lucide-react';
import { Banner, Modal, btn } from '../components/ui';
import type { DiningTable, MealServiceType } from '../types';
import { formatBusinessDateDisplay } from '../lib/businessDate';
import { timeInBangkok } from '../lib/dates';
import { effectiveCapacity, seatableTables } from '../lib/tables';
import {
  CANCEL_BOOKING_REASONS,
  STATUS_LABEL,
  cancelBooking,
  changeBooking,
  isLate,
  markLeft,
  markNoShow,
  reservationsByTime,
  restoreBooking,
  summariseDay,
  waitedMinutes,
  waitingList,
  type Booking,
  type BookingKind,
} from './bookingModel';
import type { BookingsStore } from './store';
import { BookingDialog } from './BookingDialog';

/**
 * Bookings at the host stand: today's reservations by time, the waiting list, and how the evening
 * is filling up by half hour. Seating a party marks its table occupied on the floor plan; for
 * breakfast, the room is still checked in on Check-in, which is what counts the cover.
 */

type Filter = 'all' | MealServiceType;

const STATUS_CHIP: Record<string, string> = {
  booked: 'bg-sky-100 text-sky-900',
  late: 'bg-amber-200 text-amber-950',
  waiting: 'bg-violet-100 text-violet-900',
  seated: 'bg-emerald-100 text-emerald-900',
  cancelled: 'bg-slate-200 text-slate-700',
  'no-show': 'bg-rose-100 text-rose-900',
  left: 'bg-slate-200 text-slate-700',
};

type Dialog =
  | { kind: 'new'; booking: BookingKind }
  | { kind: 'edit'; booking: Booking }
  | { kind: 'seat'; booking: Booking }
  | { kind: 'cancel'; booking: Booking }
  | null;

export const BookingsView: React.FC<{
  store: BookingsStore;
  date: string;
  today: string;
  onDateChange: (d: string) => void;
}> = ({ store, date, today, onDateChange }) => {
  const [filter, setFilter] = useState<Filter>('all');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState<{ tone: 'ok' | 'critical'; text: string } | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const shown = useMemo(() => store.bookings.filter((b) => filter === 'all' || b.service === filter), [store.bookings, filter]);
  const summary = useMemo(() => summariseDay(shown, now), [shown, now]);
  const reservations = reservationsByTime(shown);
  const queue = waitingList(shown);
  const isToday = date === today;

  const act = async (label: string, run: () => Promise<void>) => {
    try {
      await run();
      setToast({ tone: 'ok', text: label });
    } catch (e) {
      setToast({ tone: 'critical', text: (e as Error).message });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold font-display flex items-center gap-2">
            <CalendarClock /> Bookings
          </h2>
          <p className="text-sm text-muted-foreground">Reservations and the waiting list · {formatBusinessDateDisplay(date)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-semibold flex items-center gap-2">
            Day
            <input type="date" value={date} onChange={(e) => e.target.value && onDateChange(e.target.value)} className="h-11 px-3 rounded-xl border border-border bg-white" />
          </label>
          {isToday && (
            <button className={btn.secondary} onClick={() => setDialog({ kind: 'new', booking: 'waitlist' })} disabled={!store.me}>
              <Hourglass size={18} /> Waiting list
            </button>
          )}
          <button className={btn.primary} onClick={() => setDialog({ kind: 'new', booking: 'reservation' })} disabled={!store.me}>
            <Plus size={18} /> New reservation
          </button>
        </div>
      </div>

      {Object.entries(store.errors)
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <Banner key={k} tone="critical" role="alert">
            <strong className="capitalize">{k}:</strong> {v}
          </Banner>
        ))}

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Meal service">
        {(['all', 'breakfast', 'lunch', 'dinner'] as Filter[]).map((f) => (
          <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)} className={`h-11 px-4 rounded-xl text-sm font-bold capitalize border cursor-pointer ${filter === f ? 'bg-foreground text-white border-foreground' : 'bg-white border-border'}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Booked covers" value={summary.covers} sub={`${summary.reservations} reservation${summary.reservations === 1 ? '' : 's'}`} />
        <Stat label="To arrive" value={summary.toArrive} sub={summary.late ? `${summary.late} late` : 'none late'} tone={summary.late ? 'warn' : undefined} />
        <Stat label="Seated" value={summary.seated} sub="from bookings and the list" />
        <Stat label="Waiting now" value={summary.waiting} sub={summary.waiting ? `longest ${summary.longestWaitMinutes} min` : 'nobody waiting'} tone={summary.longestWaitMinutes >= 20 ? 'warn' : undefined} />
        <Stat label="No-shows" value={summary.noShows} sub={`${summary.cancelled} cancelled`} />
      </div>

      {summary.coversBySlot.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-sm" aria-label="Booked covers by half hour">
          {summary.coversBySlot.map((s) => (
            <span key={s.slot} className="rounded-lg bg-white border border-border px-2 py-1 tabular-nums">
              <strong>{s.slot}</strong> · {s.covers}
            </span>
          ))}
        </div>
      )}

      {store.loading ? (
        <Banner tone="pending">Loading bookings…</Banner>
      ) : (
        <>
          {isToday && (
            <section className="bg-white rounded-2xl border border-border">
              <h3 className="font-bold p-4 pb-2 flex items-center gap-2">
                <Hourglass size={18} /> Waiting list
              </h3>
              {queue.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-muted-foreground">Nobody waiting. When every table is taken, add walk-ins here with the wait you told them.</p>
              ) : (
                <ol className="divide-y divide-border">
                  {queue.map((b, i) => {
                    const waited = waitedMinutes(b, now);
                    const over = b.quotedMinutes != null && waited > b.quotedMinutes;
                    return (
                      <li key={b.id} className="p-4 flex flex-wrap items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-violet-100 text-violet-900 font-bold flex items-center justify-center">{i + 1}</span>
                        <div className="flex-1 min-w-[12rem]">
                          <p className="font-bold">
                            {b.name} <span className="font-normal text-muted-foreground">· {b.partySize}</span>
                            {b.roomNumber && !b.name.startsWith('Room ') ? <span className="font-normal text-muted-foreground"> · room {b.roomNumber}</span> : null}
                          </p>
                          <p className={`text-sm ${over ? 'text-rose-800 font-bold' : 'text-muted-foreground'}`}>
                            Waiting {waited} min{b.quotedMinutes != null ? ` · told ${b.quotedMinutes}` : ''} · joined {timeInBangkok(b.createdAt)}
                            {b.service !== 'breakfast' ? ` · ${b.service}` : ''}
                          </p>
                          {b.notes && <p className="text-sm">{b.notes}</p>}
                        </div>
                        <span className="flex flex-wrap gap-1">
                          <button className={btn.primary} onClick={() => setDialog({ kind: 'seat', booking: b })}>
                            <Users size={16} /> Seat
                          </button>
                          <button className={btn.quiet} onClick={() => setDialog({ kind: 'edit', booking: b })} aria-label={`Change ${b.name}`}>
                            <Pencil size={16} />
                          </button>
                          <button className={btn.quiet} onClick={() => act(`${b.name} left the list.`, () => store.apply(b.id, (x, a) => markLeft(x, a)))}>
                            Left
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          )}

          <section className="bg-white rounded-2xl border border-border">
            <h3 className="font-bold p-4 pb-2 flex items-center gap-2">
              <CalendarClock size={18} /> Reservations
            </h3>
            {reservations.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted-foreground">No reservations{filter !== 'all' ? ` for ${filter}` : ''} on {formatBusinessDateDisplay(date)}.</p>
            ) : (
              <ul className="divide-y divide-border">
                {reservations.map((b) => {
                  const late = isLate(b, now);
                  const chip = late ? 'late' : b.status;
                  return (
                    <li key={b.id} className={`p-4 flex flex-wrap items-center gap-3 ${b.status === 'booked' ? '' : 'opacity-75'}`}>
                      <span className="w-14 text-lg font-bold font-mono-custom tabular-nums">{b.time}</span>
                      <div className="flex-1 min-w-[12rem]">
                        <p className="font-bold">
                          {b.name} <span className="font-normal text-muted-foreground">· {b.partySize}</span>
                          {b.roomNumber && !b.name.startsWith('Room ') ? <span className="font-normal text-muted-foreground"> · room {b.roomNumber}</span> : null}
                          {b.tableNumber ? <span className="font-normal text-muted-foreground"> · table {b.tableNumber}</span> : null}
                        </p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {b.service}
                          {b.phone ? ` · ${b.phone}` : ''}
                          {b.status === 'cancelled' && b.cancelReason ? ` · ${b.cancelReason}` : ''}
                          {b.status === 'seated' && b.seatedAt ? ` · seated ${timeInBangkok(b.seatedAt)}` : ''}
                        </p>
                        {b.notes && <p className="text-sm">{b.notes}</p>}
                      </div>
                      <span className={`text-xs font-bold uppercase rounded-md px-2 py-1 ${STATUS_CHIP[chip]}`}>{late ? 'Late' : STATUS_LABEL[b.status]}</span>
                      {b.status === 'booked' ? (
                        <span className="flex flex-wrap gap-1">
                          <button className={btn.primary} onClick={() => setDialog({ kind: 'seat', booking: b })}>
                            <Users size={16} /> Seat
                          </button>
                          <button className={btn.quiet} onClick={() => setDialog({ kind: 'edit', booking: b })} aria-label={`Change ${b.name}'s booking`}>
                            <Pencil size={16} />
                          </button>
                          <button className={btn.quiet} onClick={() => act(`${b.name}: no-show recorded.`, () => store.apply(b.id, (x, a) => markNoShow(x, a)))}>
                            <UserX size={16} /> No-show
                          </button>
                          <button className={btn.quiet} onClick={() => setDialog({ kind: 'cancel', booking: b })}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button className={btn.quiet} onClick={() => act(`${b.name}'s booking is put back.`, () => store.apply(b.id, (x, a) => restoreBooking(x, a)))}>
                          <Undo2 size={16} /> Put back
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(92vw,560px)]">
          <Banner tone={toast.tone} role={toast.tone === 'critical' ? 'alert' : 'status'}>
            {toast.text}
          </Banner>
        </div>
      )}

      {dialog?.kind === 'new' && (
        <BookingDialog
          store={store}
          kind={dialog.booking}
          date={date}
          onCreate={async (input) => {
            const b = await store.create(input);
            setToast({ tone: 'ok', text: b.kind === 'reservation' ? `Booked: ${b.name}, ${b.partySize} at ${b.time} on ${formatBusinessDateDisplay(b.date)}.` : `${b.name} added to the waiting list.` });
            if (b.kind === 'reservation' && b.date !== date) onDateChange(b.date);
          }}
          onChange={async () => undefined}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'edit' && (
        <BookingDialog
          store={store}
          kind={dialog.booking.kind}
          date={date}
          existing={dialog.booking}
          onCreate={async () => undefined}
          onChange={async (changes) => {
            await store.apply(dialog.booking.id, (x, a) => changeBooking(x, changes, a));
            setToast({ tone: 'ok', text: `${dialog.booking.name}'s booking changed.` });
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'seat' && (
        <SeatDialog
          booking={dialog.booking}
          tables={store.tables}
          onClose={() => setDialog(null)}
          onSeat={async (table) => {
            await store.seat(dialog.booking.id, table, dialog.booking.service);
            setToast({
              tone: 'ok',
              text:
                `${dialog.booking.name} seated${table ? ` at table ${table.tableNumber}` : ''}.` +
                (dialog.booking.service === 'breakfast' && dialog.booking.roomNumber ? ` Check room ${dialog.booking.roomNumber} in on Check-in as usual.` : ''),
            });
          }}
        />
      )}
      {dialog?.kind === 'cancel' && (
        <CancelDialog
          booking={dialog.booking}
          onClose={() => setDialog(null)}
          onCancel={async (reason) => {
            await store.apply(dialog.booking.id, (x, a) => cancelBooking(x, reason, a));
            setToast({ tone: 'ok', text: `${dialog.booking.name}'s booking cancelled.` });
          }}
        />
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number; sub: string; tone?: 'warn' }> = ({ label, value, sub, tone }) => (
  <div className="stat-card-luxury !p-4">
    <p className="label-mono">{label}</p>
    <p className={`text-3xl font-bold font-display mt-1 ${tone === 'warn' ? 'text-amber-700' : 'text-foreground'}`}>{value}</p>
    <p className="text-xs text-muted-foreground mt-1 truncate">{sub}</p>
  </div>
);

/** Where the party sits. Free tables first; a table held as reserved is fine; one in use is not. */
const SeatDialog: React.FC<{ booking: Booking; tables: DiningTable[]; onSeat: (table: DiningTable | null) => Promise<void>; onClose: () => void }> = ({ booking, tables, onSeat, onClose }) => {
  const options = useMemo(() => {
    const rank = (t: DiningTable) => (t.status === 'available' ? 0 : t.status === 'reserved' ? 1 : t.status === 'cleaning' ? 2 : 3);
    return seatableTables(tables).sort((a, b) => rank(a) - rank(b) || a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true }));
  }, [tables]);
  const [tableId, setTableId] = useState<string | null>(booking.tableId && options.some((t) => t.id === booking.tableId && t.status !== 'occupied') ? booking.tableId : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const table = options.find((t) => t.id === tableId) ?? null;

  const seat = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSeat(table);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Seat ${booking.name} · ${booking.partySize}`}
      subtitle="The table shows as occupied on the floor plan from now."
      onClose={onClose}
      width="md"
      footer={
        <>
          <button className={btn.secondary} onClick={onClose}>
            Back
          </button>
          <button className={btn.primary} onClick={seat} disabled={busy}>
            <Users size={18} /> {busy ? 'Seating…' : table ? `Seat at ${table.tableNumber}` : 'Seat without a table'}
          </button>
        </>
      }
    >
      {error && (
        <Banner tone="critical" role="alert">
          {error}
        </Banner>
      )}
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">This property has no floor plan yet. Seat without a table.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto">
          {options.map((t) => {
            const busyTable = t.status === 'occupied';
            const seats = effectiveCapacity(t, tables);
            return (
              <button
                key={t.id}
                disabled={busyTable}
                onClick={() => setTableId(t.id)}
                aria-pressed={tableId === t.id}
                className={`rounded-xl border-2 p-2 text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${tableId === t.id ? 'border-accent bg-accent/10' : 'border-border bg-white'}`}
              >
                <span className="block font-bold">{t.tableNumber}</span>
                <span className={`block text-xs ${seats < booking.partySize ? 'text-amber-800' : 'text-muted-foreground'}`}>
                  {seats} seats · {t.status}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <button className={btn.quiet} onClick={() => setTableId(null)} aria-pressed={tableId === null}>
        No table
      </button>
    </Modal>
  );
};

const CancelDialog: React.FC<{ booking: Booking; onCancel: (reason: string) => Promise<void>; onClose: () => void }> = ({ booking, onCancel, onClose }) => {
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const chosen = reason === 'other' ? other.trim() : reason;
  return (
    <Modal
      title={`Cancel ${booking.name}'s booking`}
      onClose={onClose}
      width="md"
      footer={
        <>
          <button className={btn.secondary} onClick={onClose}>
            Keep it
          </button>
          <button
            className={btn.danger}
            disabled={!chosen}
            onClick={async () => {
              try {
                await onCancel(chosen);
                onClose();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Cancel booking
          </button>
        </>
      }
    >
      {error && (
        <Banner tone="critical" role="alert">
          {error}
        </Banner>
      )}
      <div role="radiogroup" aria-label="Reason" className="space-y-2">
        {[...CANCEL_BOOKING_REASONS, 'other'].map((r) => (
          <label key={r} className="flex items-center gap-3 p-3 rounded-xl border border-border cursor-pointer">
            <input type="radio" name="cancel-reason" className="h-5 w-5" checked={reason === r} onChange={() => setReason(r)} />
            <span>{r === 'other' ? 'Other' : r}</span>
          </label>
        ))}
      </div>
      {reason === 'other' && <input value={other} onChange={(e) => setOther(e.target.value)} autoFocus placeholder="Reason" className="w-full h-11 px-3 rounded-xl border border-border text-base" />}
    </Modal>
  );
};
