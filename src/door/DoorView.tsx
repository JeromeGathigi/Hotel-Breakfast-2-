import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCheck, RotateCcw, Search, StickyNote, UserCheck, X } from 'lucide-react';
import type { MealServiceType } from '../types';
import { MEAL_SERVICES } from '../constants';
import { buildDoorRooms, doorStats, reconcile, searchRooms, ackKey, breakfastBasisLabel, type DoorData, type DoorRoom } from './doorModel';
import type { DoorActions, WriteResult } from './actions';
import { CheckInDialog } from './CheckInDialog';
import { CorrectionDialog } from './CorrectionDialog';
import { BatchCheckInDialog } from './BatchCheckInDialog';
import { Banner, Modal, VipBadge, btn } from '../components/ui';
import { canonicalPlan } from '../lib/meals';
import { checkinPax } from '../lib/checkins';
import { timeInBangkok } from '../lib/dates';
import { isWeekendDate } from '../lib/businessDate';

type Filter = 'all' | 'to-come' | 'checked-in' | 'check' | 'data' | 'vip';

/** Per-device "already seen" flags for the pop-ups. Holds codes and dates only, never guest data. */
export interface AckStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export const browserAckStore: AckStore = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Private mode: the pop-up simply shows again next time.
    }
  },
};

export interface DoorViewProps {
  data: DoorData;
  service: MealServiceType;
  onServiceChange: (s: MealServiceType) => void;
  actions: DoorActions;
  /** Managers and admins see how to fix what the alerts report. */
  canManage: boolean;
  onOpenImport?: () => void;
  ackStore?: AckStore;
}

export const DoorView: React.FC<DoorViewProps> = ({ data, service, onServiceChange, actions, canManage, onOpenImport, ackStore = browserAckStore }) => {
  const rooms = useMemo(() => buildDoorRooms(data, service), [data, service]);
  const stats = useMemo(() => doorStats(rooms, service), [rooms, service]);
  const recon = useMemo(() => reconcile(rooms, data.forecastToday), [rooms, data.forecastToday]);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [checkInRoom, setCheckInRoom] = useState<string | null>(null);
  const [correctRoom, setCorrectRoom] = useState<string | null>(null);
  const [undoRoom, setUndoRoom] = useState<string | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [toast, setToast] = useState<{ tone: 'ok' | 'warn' | 'critical'; text: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => searchRef.current?.focus(), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  /* ---- the two pop-up alerts the owner asked for ---- */
  const unverifiedSig = stats.needsChecking.codes.join(',');
  const unverifiedKey = ackKey('unverified', data.hotelId, data.today, unverifiedSig);
  const discrepancyKey = ackKey('discrepancy', data.hotelId, data.today, String(recon.forecast));
  const [popup, setPopup] = useState<'unverified' | 'discrepancy' | null>(null);
  useEffect(() => {
    if (data.loading || service !== 'breakfast') return;
    if (recon.level === 'alert' && !ackStore.get(discrepancyKey)) setPopup('discrepancy');
    else if (stats.needsChecking.rooms > 0 && !ackStore.get(unverifiedKey)) setPopup('unverified');
  }, [data.loading, service, recon.level, discrepancyKey, unverifiedKey, stats.needsChecking.rooms, ackStore]);

  const acknowledge = () => {
    if (popup === 'discrepancy') ackStore.set(discrepancyKey, '1');
    if (popup === 'unverified') ackStore.set(unverifiedKey, '1');
    // Show the other one next, if it is also due.
    const next = popup === 'discrepancy' && stats.needsChecking.rooms > 0 && !ackStore.get(unverifiedKey) ? 'unverified' : null;
    setPopup(next);
  };

  const filtered = useMemo(() => {
    const byFilter = rooms.filter((r) => {
      switch (filter) {
        case 'to-come':
          return !r.checkIn && r.entitled !== false;
        case 'checked-in':
          return Boolean(r.checkIn);
        case 'check':
          return r.breakfast.unverified || r.breakfast.conflict;
        case 'data':
          return Boolean(r.dataIssue);
        case 'vip':
          return Boolean(r.vip);
        default:
          return true;
      }
    });
    return searchRooms(byFilter, query);
  }, [rooms, filter, query]);

  const byRoom = (n: string | null) => rooms.find((r) => r.guest.roomNumber === n) ?? null;
  const activeService = MEAL_SERVICES.find((m) => m.id === service);
  const weekend = isWeekendDate(data.today);

  const onSaved = (result: WriteResult, room: string) =>
    setToast(
      result === 'saved'
        ? { tone: 'ok', text: `Room ${room} checked in.` }
        : { tone: 'warn', text: `Room ${room} saved on this device. It will reach the server when the connection returns.` }
    );

  const confirmUndo = async () => {
    const r = byRoom(undoRoom);
    setUndoRoom(null);
    if (!r?.checkIn) return;
    try {
      await actions.undoCheckIn(r.guest, service, r.checkIn);
      setToast({ tone: 'ok', text: `Check-in for room ${r.guest.roomNumber} cancelled.` });
    } catch (e) {
      setToast({ tone: 'critical', text: `Could not cancel room ${r.guest.roomNumber}: ${(e as Error)?.message || 'unknown error'}` });
    }
  };

  const streamErrors = Object.entries(data.errors).filter(([, v]) => v);

  return (
    <div className="space-y-4">
      {/* Service + group check-in */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-border shadow-luxury flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <div>
          <h2 className="text-2xl font-bold font-display text-foreground">{activeService?.name}</h2>
          <p className="text-sm text-muted-foreground">
            {service === 'breakfast'
              ? weekend
                ? 'Weekend: 06:00 – 12:00'
                : 'Weekday: 06:00 – 10:30 · weekends until 12:00'
              : activeService?.time}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-border bg-[#F2EBE4]/70 p-1" role="tablist" aria-label="Meal service">
            {MEAL_SERVICES.map((m) => (
              <button
                key={m.id}
                role="tab"
                aria-selected={service === m.id}
                onClick={() => onServiceChange(m.id as MealServiceType)}
                className={`h-10 px-4 rounded-lg text-sm font-bold capitalize cursor-pointer ${service === m.id ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground'}`}
              >
                {m.id}
              </button>
            ))}
          </div>
          <button className={btn.secondary} onClick={() => setBatchOpen(true)}>
            <CheckCheck size={18} /> Group check-in
          </button>
        </div>
      </div>

      {streamErrors.length > 0 && (
        <Banner tone="critical" title="Part of this screen could not load" role="alert">
          {streamErrors.map(([k, v]) => (
            <p key={k}>
              <strong className="capitalize">{k}:</strong> {v}
            </p>
          ))}
        </Banner>
      )}

      {/* Live status bar (spec section 6) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={service === 'breakfast' ? 'Expected this morning' : `Booked for ${service}`} value={stats.expectedToday} sub={`${stats.totalRooms} rooms in house · ${stats.totalPax} guests`} />
        <Stat label="Checked in" value={stats.checkedIn.pax} sub={`${stats.checkedIn.rooms} rooms`} tone="accent" />
        <Stat label="Still to come" value={stats.remaining.pax} sub={`${stats.remaining.rooms} rooms`} />
        <Stat
          label="Needs checking"
          value={stats.needsChecking.pax}
          sub={stats.needsChecking.rooms ? `${stats.needsChecking.rooms} rooms · ${stats.needsChecking.codes.join(', ')}` : 'every rate confirmed'}
          tone={stats.needsChecking.rooms ? 'warn' : 'ok'}
          onClick={stats.needsChecking.rooms ? () => setFilter('check') : undefined}
        />
      </div>

      {service === 'breakfast' && (
        <p className="text-sm text-muted-foreground px-1">
          Breakfast {stats.breakfast.pax} pax ({stats.breakfast.rooms} rooms) · Half board {stats.halfBoard.pax} ({stats.halfBoard.rooms}) · Full board{' '}
          {stats.fullBoard.pax} ({stats.fullBoard.rooms}) · Room only {stats.roomOnlyRooms} rooms
        </p>
      )}

      {/* Opera's own count against the list */}
      {service === 'breakfast' && !data.loading && stats.totalRooms > 0 && (
        <Banner
          tone={recon.level === 'alert' ? 'critical' : recon.level === 'ok' ? 'ok' : 'info'}
          title={recon.level === 'alert' ? "The guest list and Opera's forecast disagree" : recon.level === 'ok' ? "Matches Opera's forecast" : undefined}
          action={recon.level === 'unavailable' && canManage && onOpenImport ? <button className={btn.secondary} onClick={onOpenImport}>Import forecast</button> : undefined}
        >
          {recon.message}
        </Banner>
      )}

      {/* Data quality alerts (spec section 7) */}
      {stats.dataIssues.noAdults > 0 && (
        <Banner tone="warn" title={`${stats.dataIssues.noAdults} room${stats.dataIssues.noAdults === 1 ? '' : 's'} found with no adult count - please review`} action={<button className={btn.secondary} onClick={() => setFilter('data')}>Review</button>} />
      )}
      {stats.dataIssues.noDetails > 0 && (
        <Banner tone="warn" title={`${stats.dataIssues.noDetails} room${stats.dataIssues.noDetails === 1 ? '' : 's'} found with no guest details - please review`} action={<button className={btn.secondary} onClick={() => setFilter('data')}>Review</button>} />
      )}

      {/* Search first */}
      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            type="search"
            inputMode="search"
            aria-label="Search by room, name, group or company"
            placeholder="Room number, guest name, group or company"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-14 pl-12 pr-12 rounded-2xl border border-border bg-white text-lg focus:outline-none focus:border-accent shadow-sm"
          />
          {query && (
            <button aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 h-11 w-11 flex items-center justify-center cursor-pointer">
              <X size={18} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter">
          {(
            [
              ['all', 'All'],
              ['to-come', 'To come'],
              ['checked-in', 'Checked in'],
              ['check', 'Needs checking'],
              ['data', 'Data issues'],
              ['vip', 'VIP'],
            ] as Array<[Filter, string]>
          ).map(([id, label]) => (
            <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)} className={`h-11 px-3 rounded-xl text-sm font-bold border cursor-pointer ${filter === id ? 'bg-foreground text-white border-foreground' : 'bg-white border-border'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {data.loading ? (
        <p className="text-center text-muted-foreground py-10">Loading the guest list…</p>
      ) : rooms.length === 0 && !data.errors.guests ? (
        <Banner tone="info" title="No guests for this property">
          No Opera guest list has been imported.{canManage ? ' Import this morning’s "Guests INH - By Room" export.' : ' Ask a manager to import this morning’s Opera export.'}
        </Banner>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-10">No room matches “{query}”.</p>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((r) => (
            <GuestCard
              key={r.guest.roomNumber}
              room={r}
              service={service}
              onCheckIn={() => setCheckInRoom(r.guest.roomNumber)}
              onCorrect={() => setCorrectRoom(r.guest.roomNumber)}
              onUndo={() => setUndoRoom(r.guest.roomNumber)}
            />
          ))}
        </ul>
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(92vw,560px)]">
          <Banner tone={toast.tone} role={toast.tone === 'critical' ? 'alert' : 'status'}>
            {toast.text}
          </Banner>
        </div>
      )}

      {byRoom(checkInRoom) && (
        <CheckInDialog
          hotelId={data.hotelId}
          room={byRoom(checkInRoom)!}
          service={service}
          tables={data.tables}
          actions={actions}
          onClose={() => setCheckInRoom(null)}
          onSaved={onSaved}
        />
      )}
      {byRoom(correctRoom) && <CorrectionDialog room={byRoom(correctRoom)!} actions={actions} onClose={() => setCorrectRoom(null)} />}
      {batchOpen && (
        <BatchCheckInDialog
          rooms={rooms}
          service={service}
          actions={actions}
          onClose={() => setBatchOpen(false)}
          onDone={({ saved, queued, failed }) =>
            setToast(
              failed.length
                ? { tone: 'critical', text: `Not saved: ${failed.join(', ')}. ${saved + queued} other rooms were saved.` }
                : { tone: queued ? 'warn' : 'ok', text: `${saved + queued} rooms checked in${queued ? ` (${queued} waiting for the connection)` : ''}.` }
            )
          }
        />
      )}

      {undoRoom && (
        <Modal
          title={`Cancel the check-in for room ${undoRoom}?`}
          onClose={() => setUndoRoom(null)}
          width="md"
          footer={
            <>
              <button className={btn.secondary} onClick={() => setUndoRoom(null)}>
                Keep it
              </button>
              <button className={btn.danger} onClick={confirmUndo}>
                <RotateCcw size={16} /> Cancel check-in
              </button>
            </>
          }
        >
          <p className="text-base">Use this when the wrong room was checked in. The table it held is released.</p>
        </Modal>
      )}

      {popup === 'discrepancy' && (
        <Modal
          title="Opera's breakfast forecast does not match the guest list"
          onClose={acknowledge}
          width="md"
          footer={<button className={btn.primary} onClick={acknowledge}>Understood</button>}
        >
          <p className="text-base leading-relaxed">{recon.message}</p>
          <p className="text-sm text-muted-foreground">
            Serve as normal. {canManage ? 'Check that both of this morning’s Opera files were imported - the guest list and the package forecast.' : 'Tell the duty manager.'}
          </p>
        </Modal>
      )}
      {popup === 'unverified' && (
        <Modal title={`${stats.needsChecking.rooms} room${stats.needsChecking.rooms === 1 ? '' : 's'} on rate codes the app cannot confirm`} onClose={acknowledge} width="md" footer={<button className={btn.primary} onClick={acknowledge}>Understood</button>}>
          <p className="text-base leading-relaxed">
            Breakfast for these rooms cannot be confirmed from Opera's data: <strong>{stats.needsChecking.codes.join(', ')}</strong>. They are marked{' '}
            <em>Check</em> on the list. Serve the guest, and confirm with the front office from the room's check-in screen.
          </p>
          {canManage && !data.packages && (
            <p className="text-sm text-muted-foreground">Importing today's package forecast usually resolves most of these: it says which reservations carry breakfast.</p>
          )}
        </Modal>
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number; sub: string; tone?: 'accent' | 'warn' | 'ok'; onClick?: () => void }> = ({ label, value, sub, tone, onClick }) => {
  const color = tone === 'accent' ? 'text-accent' : tone === 'warn' ? 'text-amber-700' : tone === 'ok' ? 'text-emerald-700' : 'text-foreground';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`stat-card-luxury !p-4 text-left ${onClick ? 'cursor-pointer hover:border-amber-400' : ''}`}>
      <p className="label-mono">{label}</p>
      <p className={`text-3xl font-bold font-display mt-1 ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1 truncate">{sub}</p>
    </Tag>
  );
};

const GuestCard: React.FC<{ room: DoorRoom; service: MealServiceType; onCheckIn: () => void; onCorrect: () => void; onUndo: () => void }> = ({ room, service, onCheckIn, onCorrect, onUndo }) => {
  const { guest, breakfast, checkIn } = room;
  const seated = checkinPax(checkIn);
  const partial = Boolean(checkIn) && seated < room.booked.pax;

  const chip =
    service !== 'breakfast'
      ? room.entitled
        ? { text: `${service} included`, cls: 'bg-emerald-100 text-emerald-900' }
        : { text: `No ${service}`, cls: 'bg-slate-100 text-slate-700' }
      : breakfast.unverified
        ? { text: 'Check rate', cls: 'bg-amber-100 text-amber-900 border border-amber-300' }
        : breakfast.entitled
          ? { text: breakfast.arrivesToday ? 'Breakfast from tomorrow' : 'Breakfast', cls: 'bg-emerald-100 text-emerald-900' }
          : { text: 'Room only', cls: 'bg-slate-100 text-slate-700' };

  const firstNotes = (guest.notes ?? []).filter((n) => !/^Email missing|^\*\*Check Pref\*\*$/i.test(n.text.trim())).slice(0, 2);

  return (
    <li className={`rounded-2xl border bg-white p-4 flex flex-col gap-3 ${checkIn ? (partial ? 'border-amber-300' : 'border-emerald-300') : 'border-border'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-2xl font-bold font-mono-custom">{guest.roomNumber}</span>
          <VipBadge vip={room.vip} size="lg" />
          {room.corrected && <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-900">Corrected</span>}
        </div>
        <span className={`text-sm font-bold px-2 py-1 rounded-lg ${chip.cls}`}>{chip.text}</span>
      </div>

      <div>
        <p className="text-lg font-bold leading-snug">{guest.guestName}</p>
        {(guest.accompanyingGuests ?? []).map((n) => (
          <p key={n} className="text-base text-muted-foreground leading-snug">
            {n}
          </p>
        ))}
      </div>

      <div className="text-sm text-muted-foreground space-y-0.5">
        <p>
          {guest.adults} adult{guest.adults === 1 ? '' : 's'}
          {guest.children ? ` · ${guest.children} child${guest.children === 1 ? '' : 'ren'}` : ''} · {canonicalPlan(guest.rateCode || guest.mealPlan)}
        </p>
        {service === 'breakfast' && breakfastBasisLabel(room) && <p className="text-foreground/80">{breakfastBasisLabel(room)}</p>}
        {(guest.companyName || guest.blockCode) && <p>{[guest.companyName, guest.blockCode].filter(Boolean).join(' · ')}</p>}
        {breakfast.conflict && service === 'breakfast' && <p className="text-amber-800">{breakfast.reason}</p>}
      </div>

      {firstNotes.length > 0 && (
        <div className="rounded-xl bg-[#F2EBE4]/60 px-3 py-2 text-sm space-y-0.5">
          {firstNotes.map((n, i) => (
            <p key={i} className="flex gap-1.5 leading-snug">
              <StickyNote size={14} className="shrink-0 mt-0.5 text-muted-foreground" />
              <span className="line-clamp-2">{n.text}</span>
            </p>
          ))}
        </div>
      )}

      {room.dataIssue && !room.corrected && (
        <button onClick={onCorrect} className="h-11 rounded-xl border-2 border-amber-300 bg-amber-50 text-amber-950 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer">
          <AlertTriangle size={16} /> {room.dataIssue === 'no-details' ? 'No guest details - review' : 'No adult count - review'}
        </button>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t border-border">
        {checkIn ? (
          <>
            <span className={`text-sm font-bold ${partial ? 'text-amber-800' : 'text-emerald-800'}`}>
              {partial ? `${seated} of ${room.booked.pax} in` : 'Checked in'} at {timeInBangkok(checkIn.timestamp, '…')}
              {checkIn.tableNumber ? ` · table ${checkIn.tableNumber}` : ''}
            </span>
            <span className="flex gap-1">
              {partial && (
                <button className={btn.secondary} onClick={onCheckIn}>
                  Add
                </button>
              )}
              <button className={btn.quiet} onClick={onUndo} aria-label={`Cancel check-in for room ${guest.roomNumber}`}>
                <RotateCcw size={16} />
              </button>
            </span>
          </>
        ) : (
          <button className={`${btn.primary} w-full`} onClick={onCheckIn}>
            <UserCheck size={18} /> Check in
          </button>
        )}
      </div>
    </li>
  );
};
