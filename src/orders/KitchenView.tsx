import React, { useEffect, useState } from 'react';
import { ChefHat, Printer } from 'lucide-react';
import { Banner, btn } from '../components/ui';
import { timeInBangkok } from '../lib/dates';
import { channelLabel, markServed, minutesSince, type Order } from './orderModel';
import type { OrdersStore } from './store';
import { printKitchenTicket } from './printTicket';

/**
 * The kitchen's screen: every dish that has been sent and not yet served, oldest ticket first,
 * with how long it has waited. Papaya does this with printed tickets and "hold & fire"; a screen
 * on the pass does the same without a printer, and the waiter sees it go out.
 */

const WAIT_TONE = (min: number) => (min >= 25 ? 'border-rose-400 bg-rose-50' : min >= 15 ? 'border-amber-400 bg-amber-50' : 'border-border bg-white');

export function kitchenTickets(orders: Order[]) {
  return orders
    .filter((o) => o.status === 'open')
    .map((o) => ({ order: o, lines: o.lines.filter((l) => l.status === 'sent') }))
    .filter((t) => t.lines.length > 0)
    .sort((a, b) => (a.lines[0].sentAt ?? '').localeCompare(b.lines[0].sentAt ?? ''));
}

export const KitchenView: React.FC<{ store: OrdersStore }> = ({ store }) => {
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const tickets = kitchenTickets(store.orders);

  const serve = async (order: Order, lineIds: string[]) => {
    setError(null);
    try {
      await store.apply(order.id, (o, a) => markServed(o, lineIds, a));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-3xl font-bold font-display flex items-center gap-2">
          <ChefHat /> Kitchen
        </h2>
        <p className="text-sm text-muted-foreground">Dishes sent from Orders and not yet served. Oldest first; amber after 15 minutes, red after 25.</p>
      </div>
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
          {tickets.map(({ order, lines }) => {
            const waited = minutesSince(lines[0].sentAt, now) ?? 0;
            return (
              <article key={order.id} className={`rounded-2xl border-2 p-4 space-y-3 ${WAIT_TONE(waited)}`}>
                <header className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xl font-bold">{channelLabel(order)}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.number} · {order.covers ? `${order.covers} covers · ` : ''}sent {timeInBangkok(lines[0].sentAt)}
                    </p>
                  </div>
                  <span className="text-2xl font-bold font-mono-custom tabular-nums" aria-label={`Waiting ${waited} minutes`}>
                    {waited}′
                  </span>
                </header>
                <ul className="space-y-2">
                  {lines.map((l) => (
                    <li key={l.lineId} className="flex items-start gap-2">
                      <div className="flex-1">
                        <p className="text-lg font-semibold">
                          {l.qty} × {l.name}
                        </p>
                        {l.note && <p className="text-base font-bold text-rose-800">!! {l.note}</p>}
                      </div>
                      <button className={btn.secondary} onClick={() => serve(order, [l.lineId])}>
                        Served
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between gap-2">
                  <button className={btn.quiet} onClick={() => printKitchenTicket(order, lines.map((l) => l.lineId))}>
                    <Printer size={16} /> Ticket
                  </button>
                  <button className={btn.primary} onClick={() => serve(order, lines.map((l) => l.lineId))}>
                    All served
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
