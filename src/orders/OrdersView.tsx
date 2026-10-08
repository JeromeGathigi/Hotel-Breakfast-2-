import React, { useMemo, useState } from 'react';
import { Plus, Search, ReceiptText } from 'lucide-react';
import { Banner, btn } from '../components/ui';
import { formatBusinessDateDisplay } from '../lib/businessDate';
import { timeInBangkok } from '../lib/dates';
import type { Role } from '../lib/access';
import { channelLabel, formatThb, orderTotals, type Order, type OrderStatus } from './orderModel';
import type { OrdersStore } from './store';
import { NewOrderDialog } from './NewOrderDialog';
import { OrderPanel } from './OrderPanel';

/**
 * The order list - Papaya's Orders page for the Food Exchange: Open / Complete / Cancelled, search
 * by number, table, room or guest, and the bill a tap away. One business day at a time; a manager
 * can look back at an earlier day.
 */

const STATUS_TABS: Array<{ id: OrderStatus; label: string }> = [
  { id: 'open', label: 'Open' },
  { id: 'complete', label: 'Complete' },
  { id: 'cancelled', label: 'Cancelled' },
];

const STATUS_CHIP: Record<OrderStatus, string> = {
  open: 'bg-amber-100 text-amber-900',
  complete: 'bg-emerald-100 text-emerald-900',
  cancelled: 'bg-slate-200 text-slate-700',
};

export function matchesOrder(o: Order, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [o.number, o.tableNumber, o.roomNumber, o.guestName, channelLabel(o)].some((v) => (v ?? '').toLowerCase().includes(s));
}

export const OrdersView: React.FC<{
  store: OrdersStore;
  role: Role;
  date: string;
  today: string;
  onDateChange: (d: string) => void;
}> = ({ store, role, date, today, onDateChange }) => {
  const [tab, setTab] = useState<OrderStatus>('open');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const manager = role === 'admin' || role === 'manager';
  const isToday = date === today;

  const counts = useMemo(() => {
    const c: Record<OrderStatus, number> = { open: 0, complete: 0, cancelled: 0 };
    store.orders.forEach((o) => (c[o.status] += 1));
    return c;
  }, [store.orders]);

  const shown = store.orders.filter((o) => o.status === tab && matchesOrder(o, search));
  const selected = store.orders.find((o) => o.id === openId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold font-display">Orders</h2>
          <p className="text-sm text-muted-foreground">Food Exchange à la carte · {formatBusinessDateDisplay(date)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {manager && (
            <label className="text-sm font-semibold flex items-center gap-2">
              Day
              <input type="date" value={date} max={today} onChange={(e) => e.target.value && onDateChange(e.target.value)} className="h-11 px-3 rounded-xl border border-border bg-white" />
            </label>
          )}
          <button className={btn.primary} onClick={() => setCreating(true)} disabled={!isToday || !store.me}>
            <Plus size={18} /> New order
          </button>
        </div>
      </div>

      {!isToday && <Banner tone="info">You are looking at {formatBusinessDateDisplay(date)}. New orders go on today's list.</Banner>}
      {store.errors.orders && (
        <Banner tone="critical" title="Orders could not be loaded" role="alert">
          {store.errors.orders}
        </Banner>
      )}

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
        <div role="tablist" className="flex gap-1 bg-white rounded-xl border border-border p-1 w-fit">
          {STATUS_TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`h-10 px-4 rounded-lg text-sm font-bold cursor-pointer ${tab === t.id ? 'bg-accent text-white' : 'hover:bg-[#F2EBE4]'}`}
            >
              {t.label} <span className="font-mono-custom">{counts[t.id]}</span>
            </button>
          ))}
        </div>
        <label className="relative flex-1 sm:max-w-sm">
          <span className="sr-only">Search orders</span>
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order no., table, room or guest"
            className="w-full h-11 pl-10 pr-3 rounded-xl border border-border bg-white text-base"
          />
        </label>
      </div>

      {store.loading ? (
        <Banner tone="pending">Loading orders…</Banner>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-10 text-center text-muted-foreground">
          <ReceiptText className="mx-auto mb-2" />
          {search ? 'No orders match that search.' : tab === 'open' ? 'No open orders. Start one with New order.' : `No ${tab} orders.`}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border divide-y divide-border overflow-hidden">
          {shown.map((o) => {
            const t = orderTotals(o);
            const inKitchen = o.lines.filter((l) => l.status === 'sent').length;
            return (
              <button key={o.id} onClick={() => setOpenId(o.id)} className="w-full text-left p-4 hover:bg-[#F2EBE4]/50 grid grid-cols-2 md:grid-cols-[6rem_1fr_6rem_8rem_8rem_7rem] gap-2 items-center cursor-pointer">
                <span className="font-bold font-mono-custom">{o.number}</span>
                <span className="min-w-0">
                  <span className="font-bold">{channelLabel(o)}</span>
                  {o.guestName && <span className="text-muted-foreground"> · {o.guestName}</span>}
                  <span className="block text-xs text-muted-foreground">
                    {o.covers ? `${o.covers} cover${o.covers === 1 ? '' : 's'} · ` : ''}
                    {o.lines.filter((l) => l.status !== 'void').length} items
                    {t.heldCount ? ` · ${t.heldCount} not sent` : ''}
                    {inKitchen ? ` · ${inKitchen} in kitchen` : ''}
                  </span>
                </span>
                <span className="text-sm text-muted-foreground">{timeInBangkok(o.createdAt)}</span>
                <span className="text-sm">
                  <span className="text-muted-foreground">Total </span>
                  <span className="font-bold tabular-nums">{formatThb(t.totalThb)}</span>
                </span>
                <span className="text-sm">
                  {o.status === 'open' && t.outstandingThb > 0 ? (
                    <>
                      <span className="text-muted-foreground">Owed </span>
                      <span className="font-bold tabular-nums text-amber-800">{formatThb(t.outstandingThb)}</span>
                    </>
                  ) : null}
                </span>
                <span className={`justify-self-start md:justify-self-end text-xs font-bold uppercase rounded-md px-2 py-1 ${STATUS_CHIP[o.status]}`}>{o.status}</span>
              </button>
            );
          })}
        </div>
      )}

      {creating && (
        <NewOrderDialog
          store={store}
          onClose={() => setCreating(false)}
          onCreated={(o) => {
            setCreating(false);
            setTab('open');
            setOpenId(o.id);
          }}
        />
      )}
      {selected && <OrderPanel order={selected} store={store} manager={manager} onClose={() => setOpenId(null)} />}
    </div>
  );
};
