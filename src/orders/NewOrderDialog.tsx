import React, { useMemo, useState } from 'react';
import { BedDouble, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { Banner, Modal, Stepper, btn } from '../components/ui';
import type { Guest } from '../types';
import type { OrderChannel, Order } from './orderModel';
import type { OrdersStore } from './store';

/**
 * Opening an order: where it is (a table, an in-house room, or takeaway) and how many are eating.
 * A room order is tied to the guest list Opera gave us, so the bill can later be charged to it.
 */

const CHANNELS: Array<{ id: OrderChannel; label: string; icon: React.ReactNode }> = [
  { id: 'table', label: 'Table', icon: <UtensilsCrossed size={18} /> },
  { id: 'room', label: 'In-house room', icon: <BedDouble size={18} /> },
  { id: 'takeaway', label: 'Takeaway', icon: <ShoppingBag size={18} /> },
];

export function findGuests(guests: Guest[], q: string): Guest[] {
  const s = q.trim().toLowerCase();
  const sorted = [...guests].sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
  if (!s) return sorted.slice(0, 12);
  return sorted.filter((g) => g.roomNumber.toLowerCase().startsWith(s) || (g.guestName ?? '').toLowerCase().includes(s)).slice(0, 12);
}

export const NewOrderDialog: React.FC<{ store: OrdersStore; onClose: () => void; onCreated: (o: Order) => void }> = ({ store, onClose, onCreated }) => {
  const [channel, setChannel] = useState<OrderChannel>('table');
  const [tableId, setTableId] = useState<string | null>(null);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [roomQuery, setRoomQuery] = useState('');
  const [takeawayName, setTakeawayName] = useState('');
  const [covers, setCovers] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openByTable = useMemo(() => {
    const m = new Map<string, string>();
    store.orders.filter((o) => o.status === 'open' && o.tableId).forEach((o) => m.set(o.tableId as string, o.number));
    return m;
  }, [store.orders]);

  const tables = useMemo(
    () => [...store.tables].filter((t) => !t.mergedInto).sort((a, b) => a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true })),
    [store.tables]
  );
  const table = tables.find((t) => t.id === tableId) ?? null;
  const matches = findGuests(store.guests, roomQuery);

  const ready = channel === 'table' ? Boolean(table) : channel === 'room' ? Boolean(guest) : true;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const order = await store.create({
        channel,
        tableId: table?.id ?? null,
        tableNumber: table?.tableNumber ?? null,
        roomNumber: guest?.roomNumber ?? null,
        guestName: channel === 'room' ? guest?.guestName ?? null : takeawayName.trim() || null,
        resvNameId: guest?.resvNameId ?? null,
        covers: channel === 'takeaway' ? 0 : covers,
      });
      onCreated(order);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New order"
      onClose={onClose}
      width="xl"
      footer={
        <>
          <button className={btn.secondary} onClick={onClose}>
            Cancel
          </button>
          <button className={btn.primary} onClick={create} disabled={!ready || busy}>
            {busy ? 'Opening…' : 'Open order'}
          </button>
        </>
      }
    >
      {error && (
        <Banner tone="critical" role="alert">
          {error}
        </Banner>
      )}
      <div role="radiogroup" aria-label="Where is this order?" className="grid grid-cols-3 gap-2">
        {CHANNELS.map((c) => (
          <button
            key={c.id}
            role="radio"
            aria-checked={channel === c.id}
            onClick={() => setChannel(c.id)}
            className={`h-14 rounded-xl border-2 font-bold flex items-center justify-center gap-2 cursor-pointer ${channel === c.id ? 'border-accent bg-accent/10' : 'border-border bg-white'}`}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {channel === 'table' && (
        <div>
          <p className="text-sm font-bold mb-2">Table</p>
          {store.errors.tables && <Banner tone="warn">The floor plan could not be loaded: {store.errors.tables}</Banner>}
          {tables.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tables yet. A manager can create the floor plan on the Floor plan screen.</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-64 overflow-y-auto">
              {tables.map((t) => {
                const busyWith = openByTable.get(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => setTableId(t.id)}
                    title={busyWith ? `Already has open order ${busyWith}` : `${t.zone}, ${t.capacity} seats`}
                    className={`h-14 rounded-xl border-2 text-sm font-bold cursor-pointer ${tableId === t.id ? 'border-accent bg-accent/10' : busyWith ? 'border-amber-300 bg-amber-50' : 'border-border bg-white'}`}
                  >
                    {t.tableNumber}
                    <span className="block text-[11px] font-normal text-muted-foreground">{busyWith ?? `${t.capacity} seats`}</span>
                  </button>
                );
              })}
            </div>
          )}
          {table && openByTable.has(table.id) && <Banner tone="info">Table {table.tableNumber} already has open order {openByTable.get(table.id)}. A second order is fine for a separate bill.</Banner>}
        </div>
      )}

      {channel === 'room' && (
        <div className="space-y-2">
          <label className="text-sm font-bold block" htmlFor="room-search">
            Room or guest name
          </label>
          <input id="room-search" value={roomQuery} onChange={(e) => setRoomQuery(e.target.value)} autoFocus className="w-full h-11 px-3 rounded-xl border border-border text-base" placeholder="e.g. 412" />
          {store.errors.guests && <Banner tone="warn">Today's guest list could not be loaded: {store.errors.guests}</Banner>}
          <div className="max-h-56 overflow-y-auto divide-y divide-border rounded-xl border border-border">
            {matches.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No in-house guest matches. Only rooms on today's imported list can be charged.</p>
            ) : (
              matches.map((g) => (
                <button key={g.roomNumber} onClick={() => setGuest(g)} className={`w-full text-left p-3 flex justify-between gap-3 cursor-pointer ${guest?.roomNumber === g.roomNumber ? 'bg-accent/10' : 'hover:bg-[#F2EBE4]/60'}`}>
                  <span className="font-bold font-mono-custom">{g.roomNumber}</span>
                  <span className="flex-1 truncate">{g.guestName}</span>
                  <span className="text-xs text-muted-foreground">until {g.departureDate}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {channel === 'takeaway' && (
        <div>
          <label className="text-sm font-bold block mb-1" htmlFor="takeaway-name">
            Name for pickup (optional)
          </label>
          <input id="takeaway-name" value={takeawayName} onChange={(e) => setTakeawayName(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-border text-base" />
        </div>
      )}

      {channel !== 'takeaway' && <Stepper label="Covers" hint="guests eating" value={covers} onChange={setCovers} min={1} max={40} />}
    </Modal>
  );
};
