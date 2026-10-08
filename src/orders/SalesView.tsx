import React, { useMemo } from 'react';
import { Download, Printer } from 'lucide-react';
import { Banner, btn } from '../components/ui';
import { downloadCsv, toCsv } from '../lib/csv';
import { dateTimeInBangkok } from '../lib/dates';
import { formatBusinessDateDisplay } from '../lib/businessDate';
import { PAYMENT_LABEL, channelLabel, formatThb, orderTotals, type PaymentMethod } from './orderModel';
import { summariseOrders } from './orderReports';
import { describeDifference } from './cashCount';
import type { OrdersStore } from './store';
import { REPORT_STYLE, esc, printHtml } from './printTicket';

/**
 * Sales for a day or a range: what Papaya splits across Reports (revenue, comps, tax, staff) and
 * Insights (items, hours), in one place. Room charges are listed so they can be posted to Opera -
 * this app cannot post them itself.
 */

const METHODS: PaymentMethod[] = ['cash', 'card', 'qr', 'room', 'comp'];

export const SalesView: React.FC<{
  store: OrdersStore;
  from: string;
  to: string;
  today: string;
  onRangeChange: (from: string, to: string) => void;
}> = ({ store, from, to, today, onRangeChange }) => {
  const s = useMemo(() => summariseOrders(store.orders), [store.orders]);
  const range = from === to ? formatBusinessDateDisplay(from) : `${formatBusinessDateDisplay(from)} - ${formatBusinessDateDisplay(to)}`;

  const exportOrders = () =>
    downloadCsv(
      `food-exchange-orders-${from}_${to}.csv`,
      toCsv(
        ['Business date', 'Order', 'Where', 'Guest', 'Covers', 'Status', 'Opened', 'Opened by', 'Closed', 'Closed by', 'Subtotal', 'Discount', 'Service charge', 'VAT', 'Total', 'Paid', 'Payments', 'Cancel reason'],
        store.orders.map((o) => {
          const t = orderTotals(o);
          return [
            o.businessDate, o.number, channelLabel(o), o.guestName ?? '', o.covers, o.status,
            dateTimeInBangkok(o.createdAt, ''), o.createdBy, dateTimeInBangkok(o.closedAt, ''), o.closedBy ?? '',
            t.subtotalThb, t.discountThb, t.serviceChargeThb, t.vatThb, t.totalThb, t.paidThb,
            o.payments.map((p) => `${PAYMENT_LABEL[p.method]} ${p.amountThb}${p.roomNumber ? ` room ${p.roomNumber}` : ''}`).join('; '),
            o.cancelReason ?? '',
          ];
        })
      )
    );

  const exportRoomCharges = () =>
    downloadCsv(
      `room-charges-${from}_${to}.csv`,
      toCsv(['Business date', 'Order', 'Room', 'Guest', 'Amount THB', 'Charged at', 'Charged by'], s.roomCharges.map((r) => [r.businessDate, r.orderNumber, r.roomNumber, r.guestName, r.amountThb, dateTimeInBangkok(r.at, ''), r.by]))
    );

  const print = () => {
    const rows = (cells: Array<Array<string | number>>) => cells.map((r) => `<tr>${r.map((c, i) => `<td class="${i > 0 && typeof c === 'number' ? 'r' : ''}">${esc(typeof c === 'number' ? formatThb(c) : c)}</td>`).join('')}</tr>`).join('');
    printHtml(
      `Food Exchange sales ${range}`,
      `<h1>Food Exchange - sales</h1><p>${esc(range)} · printed ${esc(dateTimeInBangkok(new Date().toISOString()))}</p>
       <h2>Revenue</h2><table>${rows([
         ['Closed bills', String(s.orderCount.complete)], ['Covers', String(s.covers)],
         ['Net sales', s.netSalesThb], ['Service charge', s.serviceChargeThb], ['VAT', s.vatThb], ['Revenue', s.revenueThb],
         ['Discounts given', s.discountThb], ['Complimentary (not revenue)', s.compThb],
       ])}</table>
       <h2>Payments</h2><table>${rows(METHODS.map((m) => [PAYMENT_LABEL[m], s.byMethod[m]]))}</table>
       <h2>Room charges to post to Opera</h2><table>${rows(s.roomCharges.map((r) => [`${r.orderNumber} · room ${r.roomNumber} · ${r.guestName}`, r.amountThb]))}</table>
       <h2>Items</h2><table>${rows(s.byItem.map((i) => [`${i.qty} × ${i.name}`, i.netThb]))}</table>
       <h2>Voids</h2><table>${rows(s.voids.map((v) => [`${v.orderNumber} · ${v.qty} × ${v.item}${v.served ? ' · after serving' : ''} · ${v.reason}`, v.netThb]))}</table>
       <h2>Cancelled orders</h2><table>${rows(s.cancellations.map((c) => [`${c.orderNumber} · ${c.reason} · ${c.by}`, '']))}</table>
       <h2>Still open</h2><table>${rows(s.stillOpen.map((o) => [`${o.orderNumber} · ${o.where}`, o.outstandingThb]))}</table>
       <h2>Cash drawer counts</h2><table>${rows(store.cashCounts.map((c) => [`${c.businessDate} ${dateTimeInBangkok(c.countedAt).slice(-5)} · ${c.countedBy} · expected ${c.expectedThb.toFixed(2)} · ${describeDifference(c.differenceThb)}${c.note ? ` · ${c.note}` : ''}`, c.countedThb]))}</table>`,
      REPORT_STYLE
    );
  };

  const Kpi: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
    <div className="bg-white rounded-2xl border border-border p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold font-display">Sales</h2>
          <p className="text-sm text-muted-foreground">Food Exchange à la carte · {range}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-semibold">
            From
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && onRangeChange(e.target.value, to)} className="block h-11 px-3 rounded-xl border border-border bg-white" />
          </label>
          <label className="text-sm font-semibold">
            To
            <input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && onRangeChange(from, e.target.value)} className="block h-11 px-3 rounded-xl border border-border bg-white" />
          </label>
          <button className={btn.secondary} onClick={exportOrders} disabled={store.orders.length === 0}>
            <Download size={16} /> Orders CSV
          </button>
          <button className={btn.secondary} onClick={print}>
            <Printer size={16} /> Print
          </button>
        </div>
      </div>

      {store.errors.orders && (
        <Banner tone="critical" title="Orders could not be loaded" role="alert">
          {store.errors.orders}
        </Banner>
      )}
      {s.stillOpen.length > 0 && (
        <Banner tone="warn" title={`${s.stillOpen.length} order${s.stillOpen.length === 1 ? ' is' : 's are'} still open`}>
          Open bills are not in the revenue below until they are closed: {s.stillOpen.map((o) => `${o.orderNumber} (${o.where}, ${formatThb(o.outstandingThb)} owed)`).join(', ')}.
        </Banner>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Revenue" value={formatThb(s.revenueThb)} sub={`${s.orderCount.complete} closed bills`} />
        <Kpi label="Covers" value={String(s.covers)} sub={s.averagePerCoverThb !== null ? `${formatThb(s.averagePerCoverThb)} per cover` : undefined} />
        <Kpi label="Net sales" value={formatThb(s.netSalesThb)} sub={`Service ${formatThb(s.serviceChargeThb)} · VAT ${formatThb(s.vatThb)}`} />
        <Kpi label="Discounts & comps" value={formatThb(s.discountThb + s.compThb)} sub={`Comps ${formatThb(s.compThb)} (not revenue)`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="bg-white rounded-2xl border border-border p-4">
          <h3 className="font-bold mb-2">Payments</h3>
          <table className="w-full text-sm tabular-nums">
            <tbody>
              {METHODS.map((m) => (
                <tr key={m} className="border-b border-border last:border-0">
                  <td className="py-2">{PAYMENT_LABEL[m]}</td>
                  <td className="py-2 text-right font-semibold">{formatThb(s.byMethod[m])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="bg-white rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="font-bold">Room charges to post to Opera</h3>
            <button className={btn.quiet} onClick={exportRoomCharges} disabled={s.roomCharges.length === 0}>
              <Download size={16} /> CSV
            </button>
          </div>
          {s.roomCharges.length === 0 ? (
            <p className="text-sm text-muted-foreground">None.</p>
          ) : (
            <table className="w-full text-sm tabular-nums">
              <tbody>
                {s.roomCharges.map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-2 font-mono-custom">{r.roomNumber}</td>
                    <td className="py-2">{r.guestName}</td>
                    <td className="py-2 text-muted-foreground">{r.orderNumber}</td>
                    <td className="py-2 text-right font-semibold">{formatThb(r.amountThb)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-border p-4">
          <h3 className="font-bold mb-2">Items sold</h3>
          {s.byItem.length === 0 ? (
            <p className="text-sm text-muted-foreground">No closed bills yet.</p>
          ) : (
            <table className="w-full text-sm tabular-nums">
              <tbody>
                {s.byItem.slice(0, 25).map((i) => (
                  <tr key={i.menuItemId} className="border-b border-border last:border-0">
                    <td className="py-2 w-10 text-right pr-2">{i.qty}</td>
                    <td className="py-2">{i.name}</td>
                    <td className="py-2 text-right font-semibold">{formatThb(i.netThb)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-border p-4 space-y-3">
          <div>
            <h3 className="font-bold mb-2">By hour (Bangkok)</h3>
            {s.byHour.length === 0 ? (
              <p className="text-sm text-muted-foreground">No closed bills yet.</p>
            ) : (
              <ul className="text-sm space-y-1 tabular-nums">
                {s.byHour.map((h) => (
                  <li key={h.hour} className="flex justify-between">
                    <span>
                      {String(h.hour).padStart(2, '0')}:00 · {h.orders} bill{h.orders === 1 ? '' : 's'}
                    </span>
                    <span className="font-semibold">{formatThb(h.revenueThb)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <section className="bg-white rounded-2xl border border-border overflow-x-auto">
        <h3 className="font-bold p-4 pb-0">Cash drawer counts</h3>
        {store.cashCounts.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No count recorded for these days. Staff count the drawer from Orders.</p>
        ) : (
          <table className="w-full text-sm tabular-nums mt-2">
            <thead className="bg-[#F2EBE4]/60 text-left label-mono">
              <tr>
                <th className="p-3">When</th>
                <th className="p-3">By</th>
                <th className="p-3 text-right">Float</th>
                <th className="p-3 text-right">Cash taken</th>
                <th className="p-3 text-right">Counted</th>
                <th className="p-3">Difference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {store.cashCounts.map((c) => (
                <tr key={c.id}>
                  <td className="p-3 whitespace-nowrap">{dateTimeInBangkok(c.countedAt)}</td>
                  <td className="p-3 max-w-[14rem] truncate">{c.countedBy}</td>
                  <td className="p-3 text-right">{formatThb(c.floatThb)}</td>
                  <td className="p-3 text-right">{formatThb(c.cashTakenThb)}</td>
                  <td className="p-3 text-right font-semibold">{formatThb(c.countedThb)}</td>
                  <td className={`p-3 ${c.differenceThb === 0 ? 'text-emerald-800' : 'text-rose-800 font-semibold'}`}>
                    {describeDifference(c.differenceThb)}
                    {c.note ? <span className="block text-xs text-muted-foreground font-normal">{c.note}</span> : null}
                    {c.openBills > 0 ? <span className="block text-xs text-muted-foreground font-normal">{c.openBills} bill{c.openBills === 1 ? '' : 's'} still open when counted</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {s.byStaff.length > 0 && (
        <section className="bg-white rounded-2xl border border-border overflow-x-auto">
          <h3 className="font-bold p-4 pb-0">By staff</h3>
          <p className="px-4 text-xs text-muted-foreground">Revenue each person closed, and the exceptions a manager reviews: voids, discounts and comps they gave, orders they cancelled.</p>
          <table className="w-full text-sm tabular-nums mt-2">
            <thead className="bg-[#F2EBE4]/60 text-left label-mono">
              <tr>
                <th className="p-3">Person</th>
                <th className="p-3 text-right">Opened</th>
                <th className="p-3 text-right">Closed</th>
                <th className="p-3 text-right">Revenue</th>
                <th className="p-3 text-right">Voids</th>
                <th className="p-3 text-right">Discounts</th>
                <th className="p-3 text-right">Comps</th>
                <th className="p-3 text-right">Cancelled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {s.byStaff.map((p) => (
                <tr key={p.email}>
                  <td className="p-3 max-w-[16rem] truncate">{p.email}</td>
                  <td className="p-3 text-right">{p.opened}</td>
                  <td className="p-3 text-right">{p.closed}</td>
                  <td className="p-3 text-right font-semibold">{formatThb(p.revenueThb)}</td>
                  <td className="p-3 text-right">{p.voids ? `${p.voids} · ${formatThb(p.voidThb)}` : '—'}</td>
                  <td className="p-3 text-right">{p.discounts ? `${p.discounts} · ${formatThb(p.discountThb)}` : '—'}</td>
                  <td className="p-3 text-right">{p.comps ? `${p.comps} · ${formatThb(p.compThb)}` : '—'}</td>
                  <td className="p-3 text-right">{p.cancelled || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(s.voids.length > 0 || s.cancellations.length > 0) && (
        <section className="bg-white rounded-2xl border border-border p-4 space-y-2">
          <h3 className="font-bold">Voids and cancellations</h3>
          <ul className="text-sm space-y-1">
            {s.voids.map((v, i) => (
              <li key={`v${i}`}>
                {v.orderNumber} · void {v.qty} × {v.item} ({formatThb(v.netThb)}){v.served ? ' · after serving' : ''} · {v.reason}
              </li>
            ))}
            {s.cancellations.map((c, i) => (
              <li key={`c${i}`}>
                {c.orderNumber} · cancelled · {c.reason} · {c.by}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
