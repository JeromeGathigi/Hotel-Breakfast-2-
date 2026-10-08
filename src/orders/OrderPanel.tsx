import React, { useState } from 'react';
import { ChefHat, History, Minus, Plus, Printer, Receipt, RotateCcw, Trash2, X } from 'lucide-react';
import { Banner, Modal, Stepper, btn } from '../components/ui';
import { timeInBangkok, dateTimeInBangkok } from '../lib/dates';
import {
  CANCEL_REASONS,
  PAYMENT_LABEL,
  VOID_REASONS,
  addItem,
  addPayment,
  cancelOrder,
  changeDetails,
  channelLabel,
  closeOrder,
  describeDiscount,
  formatThb,
  markServed,
  orderTotals,
  removePayment,
  reopenOrder,
  sendToKitchen,
  setDiscount,
  setHeldQty,
  voidLine,
  type Order,
  type OrderLine,
} from './orderModel';
import type { OrdersStore, OrderOp } from './store';
import { MenuPicker } from './MenuPicker';
import { PaymentDialog } from './PaymentDialog';
import { printBill, printKitchenTicket } from './printTicket';

/**
 * One order, end to end: add dishes, send them to the kitchen, take payments, close. Items the
 * kitchen has seen are never deleted - they are voided with a reason - and everything anyone does
 * lands in the order's history, which is what settles a disputed room charge.
 */

const LINE_STATUS: Record<OrderLine['status'], { label: string; cls: string }> = {
  held: { label: 'Not sent', cls: 'bg-amber-100 text-amber-900' },
  sent: { label: 'In kitchen', cls: 'bg-sky-100 text-sky-900' },
  served: { label: 'Served', cls: 'bg-emerald-100 text-emerald-900' },
  void: { label: 'Void', cls: 'bg-slate-200 text-slate-600 line-through' },
};

type Dialog =
  | { kind: 'menu' }
  | { kind: 'pay' }
  | { kind: 'discount' }
  | { kind: 'details' }
  | { kind: 'cancel' }
  | { kind: 'void'; line: OrderLine }
  | null;

export const OrderPanel: React.FC<{ order: Order; store: OrdersStore; manager: boolean; onClose: () => void }> = ({ order, store, manager, onClose }) => {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  /** Lines just sent, so their kitchen ticket can be printed from the confirmation. */
  const [lastSent, setLastSent] = useState<string[]>([]);
  const t = orderTotals(order);
  const open = order.status === 'open';

  /** True when the change was saved. A failure shows its message and nothing else. */
  const run = async (op: OrderOp, done?: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setLastSent([]);
    try {
      await store.apply(order.id, op);
      if (done) setNotice(done);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const held = order.lines.filter((l) => l.status === 'held').map((l) => l.lineId);
    if (await run((o, a) => sendToKitchen(o, a), `${held.length} item${held.length === 1 ? '' : 's'} sent to the kitchen.`)) setLastSent(held);
  };

  const visible = order.lines;

  return (
    <Modal
      title={`${order.number} · ${channelLabel(order)}`}
      subtitle={
        <span>
          {order.guestName ? `${order.guestName} · ` : ''}
          {order.covers ? `${order.covers} cover${order.covers === 1 ? '' : 's'} · ` : ''}
          opened {timeInBangkok(order.createdAt)} by {order.createdBy}
          {order.status !== 'open' && <span className="ml-2 font-bold uppercase">{order.status}</span>}
        </span>
      }
      onClose={onClose}
      width="xl"
      footer={
        <>
          <button className={btn.quiet} onClick={() => printBill(order)}>
            <Printer size={18} /> Print bill
          </button>
          {open && (
            <button className={btn.danger} onClick={() => setDialog({ kind: 'cancel' })} disabled={busy}>
              Cancel order
            </button>
          )}
          {order.status === 'complete' && manager && (
            <button className={btn.secondary} onClick={() => run((o, a) => reopenOrder(o, a), 'Order reopened.')} disabled={busy}>
              <RotateCcw size={18} /> Reopen
            </button>
          )}
          {open && (
            <button className={btn.secondary} onClick={() => setDialog({ kind: 'pay' })} disabled={busy || t.outstandingThb <= 0}>
              <Receipt size={18} /> Take payment
            </button>
          )}
          {open && (
            <button className={btn.primary} onClick={() => run((o, a) => closeOrder(o, a), 'Order closed.')} disabled={busy || t.outstandingThb > 0 || t.heldCount > 0}>
              Close order
            </button>
          )}
        </>
      }
    >
      {error && (
        <Banner tone="critical" role="alert">
          {error}
        </Banner>
      )}
      {notice && (
        <Banner
          tone="ok"
          action={
            lastSent.length > 0 ? (
              <button className={btn.secondary} onClick={() => printKitchenTicket(order, lastSent)}>
                <Printer size={16} /> Kitchen ticket
              </button>
            ) : undefined
          }
        >
          {notice}
        </Banner>
      )}
      {order.status === 'cancelled' && <Banner tone="info">Cancelled: {order.cancelReason}</Banner>}

      {open && (
        <div className="flex flex-wrap gap-2">
          <button className={btn.primary} onClick={() => setDialog({ kind: 'menu' })} disabled={busy}>
            <Plus size={18} /> Add items
          </button>
          <button className={btn.secondary} onClick={send} disabled={busy || t.heldCount === 0}>
            <ChefHat size={18} /> Send to kitchen{t.heldCount ? ` (${t.heldCount})` : ''}
          </button>
          <button className={btn.quiet} onClick={() => setDialog({ kind: 'details' })} disabled={busy}>
            {order.channel === 'table' ? 'Covers / move table' : 'Covers'}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-border divide-y divide-border">
        {visible.length === 0 && <p className="p-4 text-sm text-muted-foreground">No items yet.</p>}
        {visible.map((l) => (
          <div key={l.lineId} className="p-3 flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[12rem]">
              <p className={`font-semibold ${l.status === 'void' ? 'line-through text-muted-foreground' : ''}`}>
                {l.qty} × {l.name}
              </p>
              {l.note && <p className="text-sm font-bold text-rose-800">Note: {l.note}</p>}
              {l.status === 'void' && <p className="text-xs text-muted-foreground">Voided: {l.voidReason}</p>}
              {l.status === 'sent' && l.sentAt && <p className="text-xs text-muted-foreground">Sent {timeInBangkok(l.sentAt)}</p>}
            </div>
            <span className={`text-xs font-bold uppercase rounded-md px-2 py-1 ${LINE_STATUS[l.status].cls}`}>{LINE_STATUS[l.status].label}</span>
            <span className="w-24 text-right tabular-nums font-semibold">{formatThb(l.unitPriceThb * l.qty)}</span>
            {open && l.status === 'held' && (
              <span className="flex gap-1">
                <button aria-label={`One fewer ${l.name}`} onClick={() => run((o, a) => setHeldQty(o, l.lineId, l.qty - 1, a))} disabled={busy} className="h-11 w-11 rounded-xl border border-border flex items-center justify-center cursor-pointer">
                  {l.qty === 1 ? <Trash2 size={16} /> : <Minus size={16} />}
                </button>
                <button aria-label={`One more ${l.name}`} onClick={() => run((o, a) => setHeldQty(o, l.lineId, l.qty + 1, a))} disabled={busy} className="h-11 w-11 rounded-xl border border-border flex items-center justify-center cursor-pointer">
                  <Plus size={16} />
                </button>
              </span>
            )}
            {open && l.status === 'sent' && (
              <button className={btn.quiet} onClick={() => run((o, a) => markServed(o, [l.lineId], a))} disabled={busy}>
                Served
              </button>
            )}
            {/* A dish the guest has had comes off the bill only on a manager's say-so, as a comp does. */}
            {open && (l.status === 'sent' || (l.status === 'served' && manager)) && (
              <button className={btn.quiet} onClick={() => setDialog({ kind: 'void', line: l })} disabled={busy}>
                Void
              </button>
            )}
          </div>
        ))}
      </div>

      <dl className="rounded-xl bg-[#F2EBE4]/50 p-4 space-y-1 text-sm tabular-nums">
        <Row label="Subtotal" value={t.subtotalThb} />
        {order.discount && <Row label={`Discount · ${describeDiscount(order.discount)}`} value={-t.discountThb} />}
        <Row label={`Service charge ${Math.round(order.serviceChargeRate * 100)}%`} value={t.serviceChargeThb} />
        <Row label={`VAT ${Math.round(order.vatRate * 100)}%`} value={t.vatThb} />
        <Row label="Total" value={t.totalThb} strong />
        {order.payments.map((p) => (
          <div key={p.paymentId} className="flex items-center justify-between gap-2 text-emerald-900">
            <dt>
              {PAYMENT_LABEL[p.method]}
              {p.roomNumber ? ` · room ${p.roomNumber}` : ''}
              {p.reference ? ` · ${p.reference}` : ''}
              <span className="text-xs text-muted-foreground"> · {timeInBangkok(p.at)} {p.by}</span>
            </dt>
            <dd className="flex items-center gap-1">
              −{formatThb(p.amountThb)}
              {open && manager && (
                <button aria-label="Remove this payment" onClick={() => run((o, a) => removePayment(o, p.paymentId, a), 'Payment removed.')} className="h-8 w-8 rounded-lg hover:bg-white flex items-center justify-center cursor-pointer">
                  <X size={14} />
                </button>
              )}
            </dd>
          </div>
        ))}
        {order.payments.length > 0 && <Row label="Still to pay" value={t.outstandingThb} strong />}
      </dl>
      {open && manager && (
        <button className={btn.quiet} onClick={() => setDialog({ kind: 'discount' })} disabled={busy}>
          {order.discount ? 'Change discount' : 'Add discount'}
        </button>
      )}

      <button className={btn.quiet} onClick={() => setShowLog((v) => !v)} aria-expanded={showLog}>
        <History size={16} /> History ({order.log.length})
      </button>
      {showLog && (
        <ol className="text-sm space-y-1 border-l-2 border-border pl-3">
          {order.log.map((e, i) => (
            <li key={i}>
              <span className="text-muted-foreground">{dateTimeInBangkok(e.at)}</span> · <span className="font-semibold">{e.action.replace(/-/g, ' ')}</span>
              {e.details ? ` · ${e.details}` : ''} <span className="text-muted-foreground">· {e.by}</span>
            </li>
          ))}
        </ol>
      )}

      {dialog?.kind === 'menu' && (
        <MenuPicker
          soldOut={store.soldOut}
          manager={manager}
          onClose={() => setDialog(null)}
          onAdd={(entry, qty, note) => store.apply(order.id, (o, a) => addItem(o, entry, qty, note, a))}
          onToggleSoldOut={(baseId, out) => store.setSoldOut(out ? [...new Set([...store.soldOut, baseId])] : store.soldOut.filter((id) => id !== baseId))}
        />
      )}
      {dialog?.kind === 'pay' && (
        <PaymentDialog
          order={order}
          outstandingThb={t.outstandingThb}
          guests={store.guests}
          manager={manager}
          onClose={() => setDialog(null)}
          onPay={(p) => store.apply(order.id, (o, a) => addPayment(o, p, a))}
        />
      )}
      {dialog?.kind === 'void' && (
        <ReasonDialog
          title={`Void ${dialog.line.qty} × ${dialog.line.name}${dialog.line.status === 'served' ? ' (already served)' : ''}`}
          reasons={VOID_REASONS}
          confirm="Void item"
          error={error}
          onClose={() => setDialog(null)}
          onConfirm={(reason) => run((o, a) => voidLine(o, dialog.line.lineId, reason, a), 'Item voided.').then((ok) => { if (ok) setDialog(null); })}
        />
      )}
      {dialog?.kind === 'cancel' && (
        <ReasonDialog
          title={`Cancel ${order.number}`}
          reasons={CANCEL_REASONS}
          confirm="Cancel order"
          error={error}
          onClose={() => setDialog(null)}
          onConfirm={(reason) => run((o, a) => cancelOrder(o, reason, a), 'Order cancelled.').then((ok) => { if (ok) setDialog(null); })}
        />
      )}
      {dialog?.kind === 'discount' && (
        <DiscountDialog
          order={order}
          error={error}
          onClose={() => setDialog(null)}
          onSave={(d) => run((o, a) => setDiscount(o, d, a), d ? 'Discount applied.' : 'Discount removed.').then((ok) => { if (ok) setDialog(null); })}
        />
      )}
      {dialog?.kind === 'details' && (
        <DetailsDialog
          order={order}
          store={store}
          error={error}
          onClose={() => setDialog(null)}
          onSave={(c) => run((o, a) => changeDetails(o, c, a), 'Order updated.').then((ok) => { if (ok) setDialog(null); })}
        />
      )}
    </Modal>
  );
};

const Row: React.FC<{ label: string; value: number; strong?: boolean }> = ({ label, value, strong }) => (
  <div className={`flex justify-between gap-2 ${strong ? 'font-bold text-base' : ''}`}>
    <dt>{label}</dt>
    <dd>{formatThb(value)}</dd>
  </div>
);

const ReasonDialog: React.FC<{
  title: string;
  reasons: readonly string[];
  confirm: string;
  error: string | null;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}> = ({ title, reasons, confirm, error, onConfirm, onClose }) => {
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const chosen = reason === 'other' ? other.trim() : reason;
  return (
    <Modal
      title={title}
      onClose={onClose}
      width="md"
      footer={
        <>
          <button className={btn.secondary} onClick={onClose}>
            Back
          </button>
          <button className={btn.danger} onClick={() => onConfirm(chosen)} disabled={!chosen}>
            {confirm}
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
        {[...reasons, 'other'].map((r) => (
          <label key={r} className="flex items-center gap-3 p-3 rounded-xl border border-border cursor-pointer">
            <input type="radio" name="reason" className="h-5 w-5" checked={reason === r} onChange={() => setReason(r)} />
            <span>{r === 'other' ? 'Other' : r}</span>
          </label>
        ))}
      </div>
      {reason === 'other' && <input value={other} onChange={(e) => setOther(e.target.value)} autoFocus placeholder="Reason" className="w-full h-11 px-3 rounded-xl border border-border text-base" />}
    </Modal>
  );
};

const DiscountDialog: React.FC<{
  order: Order;
  error: string | null;
  onSave: (d: { kind: 'percent' | 'amount'; value: number; reason: string } | null) => Promise<void>;
  onClose: () => void;
}> = ({ order, error, onSave, onClose }) => {
  const [kind, setKind] = useState<'percent' | 'amount'>(order.discount?.kind ?? 'percent');
  const [value, setValue] = useState(String(order.discount?.value ?? ''));
  const [reason, setReason] = useState(order.discount?.reason ?? '');
  return (
    <Modal
      title="Discount"
      subtitle="Taken off before service charge and VAT. Recorded with your name."
      onClose={onClose}
      width="md"
      footer={
        <>
          {order.discount && (
            <button className={btn.danger} onClick={() => onSave(null)}>
              Remove discount
            </button>
          )}
          <button className={btn.primary} onClick={() => onSave({ kind, value: Number(value), reason })} disabled={!(Number(value) > 0) || !reason.trim()}>
            Apply
          </button>
        </>
      }
    >
      {error && (
        <Banner tone="critical" role="alert">
          {error}
        </Banner>
      )}
      <div className="grid grid-cols-2 gap-2">
        {(['percent', 'amount'] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={`h-11 rounded-xl border-2 font-bold cursor-pointer ${kind === k ? 'border-accent bg-accent/10' : 'border-border'}`}>
            {k === 'percent' ? 'Percent' : 'Amount (THB)'}
          </button>
        ))}
      </div>
      <input type="number" inputMode="decimal" min="0" value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === 'percent' ? 'e.g. 10' : 'e.g. 200'} className="w-full h-11 px-3 rounded-xl border border-border text-base" />
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. Accor ALL member, service recovery" className="w-full h-11 px-3 rounded-xl border border-border text-base" />
    </Modal>
  );
};

const DetailsDialog: React.FC<{
  order: Order;
  store: OrdersStore;
  error: string | null;
  onSave: (c: { covers?: number; tableId?: string | null; tableNumber?: string | null }) => Promise<void>;
  onClose: () => void;
}> = ({ order, store, error, onSave, onClose }) => {
  const [covers, setCovers] = useState(order.covers);
  const [tableId, setTableId] = useState(order.tableId);
  const tables = [...store.tables].filter((t) => !t.mergedInto).sort((a, b) => a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true }));
  const table = tables.find((t) => t.id === tableId);
  return (
    <Modal
      title="Order details"
      onClose={onClose}
      width="md"
      footer={
        <button className={btn.primary} onClick={() => onSave({ covers, tableId: table?.id ?? order.tableId, tableNumber: table?.tableNumber ?? order.tableNumber })}>
          Save
        </button>
      }
    >
      {error && (
        <Banner tone="critical" role="alert">
          {error}
        </Banner>
      )}
      <Stepper label="Covers" value={covers} onChange={setCovers} min={order.channel === 'takeaway' ? 0 : 1} max={40} />
      {order.channel === 'table' && (
        <div className="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto">
          {tables.map((t) => (
            <button key={t.id} onClick={() => setTableId(t.id)} className={`h-12 rounded-xl border-2 font-bold cursor-pointer ${tableId === t.id ? 'border-accent bg-accent/10' : 'border-border'}`}>
              {t.tableNumber}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
};
