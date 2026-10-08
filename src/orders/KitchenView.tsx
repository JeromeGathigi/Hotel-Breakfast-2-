import React, { useEffect, useRef, useState } from 'react';
import { Ban, Bell, BellOff, ChefHat, Printer } from 'lucide-react';
import { Banner, btn } from '../components/ui';
import { timeInBangkok } from '../lib/dates';
import { channelLabel, markReady, markServed, minutesSince, type Order, type OrderLine } from './orderModel';
import type { OrdersStore } from './store';
import { printKitchenTicket } from './printTicket';
import { dishName, toggleSoldOut } from './menuCatalog';
import { SoldOutDialog } from './SoldOutDialog';
import { chime, newlySent } from './chime';

/**
 * The kitchen's screen: every dish sent and not yet served, oldest ticket first, with how long it
 * has waited. The cook bumps a dish Ready when it is up; the waiter sees it on the order and serves
 * it. Tickets whose dishes are all up wait at the end in green until they are carried out. Papaya
 * does this with printed tickets and "hold & fire"; a screen on the pass does it without a printer.
 * The kitchen also marks dishes sold out here, since it is the first to know, and can have a chime
 * for each new ticket.
 */

const WAIT_TONE = (min: number) => (min >= 25 ? 'border-rose-400 bg-rose-50' : min >= 15 ? 'border-amber-400 bg-amber-50' : 'border-border bg-white');
const SOUND_KEY = 'hb2.kitchenChime';

export interface KitchenTicket {
  order: Order;
  cooking: OrderLine[];
  ready: OrderLine[];
}

/** Tickets still cooking, oldest first; then tickets that are all up, longest-waiting first. */
export function kitchenTickets(orders: Order[]): KitchenTicket[] {
  const first = (lines: OrderLine[], at: (l: OrderLine) => string | null | undefined) => lines.map((l) => at(l) ?? '').sort()[0] ?? '';
  return orders
    .filter((o) => o.status === 'open')
    .map((o) => ({ order: o, cooking: o.lines.filter((l) => l.status === 'sent'), ready: o.lines.filter((l) => l.status === 'ready') }))
    .filter((t) => t.cooking.length + t.ready.length > 0)
    .sort((a, b) => {
      if (a.cooking.length > 0 !== b.cooking.length > 0) return a.cooking.length > 0 ? -1 : 1;
      const key = (t: KitchenTicket) => (t.cooking.length ? first(t.cooking, (l) => l.sentAt) : first(t.ready, (l) => l.readyAt ?? l.sentAt));
      return key(a).localeCompare(key(b));
    });
}

function savedSound(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) === '1';
  } catch {
    return false;
  }
}

export const KitchenView: React.FC<{ store: OrdersStore; canMarkSoldOut: boolean }> = ({ store, canMarkSoldOut }) => {
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [soldOutOpen, setSoldOutOpen] = useState(false);
  const [sound, setSound] = useState(savedSound);
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const tickets = kitchenTickets(store.orders);

  // A chime when a dish arrives that the screen has not shown before - not on the first load.
  const sentIds = new Set(tickets.flatMap((t) => t.cooking.map((l) => `${t.order.id}/${l.lineId}`)));
  const sentKey = [...sentIds].sort().join(',');
  useEffect(() => {
    if (store.loading) return;
    if (sound && newlySent(seen.current, sentIds)) chime();
    seen.current = sentIds;
    // sentKey stands in for sentIds, which is a new Set on every render.
  }, [sentKey, store.loading, sound]);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    try {
      window.localStorage.setItem(SOUND_KEY, next ? '1' : '0');
    } catch {
      // Storage blocked: the choice lasts until the page reloads.
    }
    // The tap that turns it on is what lets the browser play later chimes; play one as a check.
    if (next) chime();
  };

  const act = async (order: Order, op: 'ready' | 'served', lineIds: string[]) => {
    setError(null);
    try {
      await store.apply(order.id, (o, a) => (op === 'ready' ? markReady(o, lineIds, a) : markServed(o, lineIds, a)));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold font-display flex items-center gap-2">
            <ChefHat /> Kitchen
          </h2>
          <p className="text-sm text-muted-foreground">
            Dishes sent from Orders. Tap Ready when a dish is up; the waiter sees it and serves it. Oldest first; amber after 15 minutes, red after 25.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btn.secondary} onClick={toggleSound} aria-pressed={sound}>
            {sound ? <Bell size={18} /> : <BellOff size={18} />} {sound ? 'Chime on' : 'Chime off'}
          </button>
          {canMarkSoldOut && (
            <button className={btn.secondary} onClick={() => setSoldOutOpen(true)}>
              <Ban size={18} /> Sold out{store.soldOut.length ? ` (${store.soldOut.length})` : ''}
            </button>
          )}
        </div>
      </div>
      {store.soldOut.length > 0 && (
        <p className="text-sm">
          <span className="font-bold text-rose-800">Sold out:</span> {store.soldOut.map(dishName).join(' · ')}
        </p>
      )}
      {error && (
        <Banner tone="critical" role="alert">
          {error}
        </Banner>
      )}
      {store.errors.orders && (
        <Banner tone="critical" role="alert">
          {store.errors.orders}
        </Banner>
      )}
      {tickets.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-10 text-center text-muted-foreground">Nothing waiting. New tickets appear here as soon as a waiter sends them.</div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {tickets.map(({ order, cooking, ready }) => {
            const allUp = cooking.length === 0;
            const since = allUp ? (ready.map((l) => l.readyAt ?? l.sentAt ?? '').sort()[0] ?? null) : (cooking.map((l) => l.sentAt ?? '').sort()[0] ?? null);
            const waited = minutesSince(since, now) ?? 0;
            const lines = [...cooking, ...ready];
            return (
              <article key={order.id} className={`rounded-2xl border-2 p-4 space-y-3 ${allUp ? 'border-emerald-400 bg-emerald-50' : WAIT_TONE(waited)}`}>
                <header className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xl font-bold">{channelLabel(order)}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.number} · {order.covers ? `${order.covers} covers · ` : ''}
                      {allUp ? `up since ${timeInBangkok(since)} - waiting to be carried out` : `sent ${timeInBangkok(since)}`}
                    </p>
                  </div>
                  <span className="text-2xl font-bold font-mono-custom tabular-nums" aria-label={allUp ? `Ready for ${waited} minutes` : `Waiting ${waited} minutes`}>
                    {waited}′
                  </span>
                </header>
                <ul className="space-y-2">
                  {lines.map((l) => (
                    <li key={l.lineId} className="flex items-start gap-2">
                      <div className="flex-1">
                        <p className={`text-lg font-semibold ${l.status === 'ready' ? 'text-emerald-900' : ''}`}>
                          {l.qty} × {l.name}
                        </p>
                        {l.note && <p className="text-base font-bold text-rose-800">!! {l.note}</p>}
                      </div>
                      {l.status === 'sent' ? (
                        <button className={btn.secondary} onClick={() => act(order, 'ready', [l.lineId])}>
                          Ready
                        </button>
                      ) : (
                        <span className="flex items-center gap-1">
                          <span className="text-xs font-bold uppercase rounded-md px-2 py-1 bg-emerald-200 text-emerald-950">Up</span>
                          <button className={btn.quiet} onClick={() => act(order, 'served', [l.lineId])}>
                            Served
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between gap-2">
                  <button className={btn.quiet} onClick={() => printKitchenTicket(order, lines.map((l) => l.lineId))}>
                    <Printer size={16} /> Ticket
                  </button>
                  {allUp ? (
                    <button className={btn.primary} onClick={() => act(order, 'served', ready.map((l) => l.lineId))}>
                      All served
                    </button>
                  ) : (
                    <button className={btn.primary} onClick={() => act(order, 'ready', cooking.map((l) => l.lineId))}>
                      All ready
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {soldOutOpen && (
        <SoldOutDialog soldOut={store.soldOut} onToggle={(baseId, out) => store.setSoldOut(toggleSoldOut(store.soldOut, baseId, out))} onClose={() => setSoldOutOpen(false)} />
      )}
    </div>
  );
};
