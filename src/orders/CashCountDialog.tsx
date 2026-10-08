import React, { useMemo, useState } from 'react';
import { Wallet } from 'lucide-react';
import { Banner, Modal, btn } from '../components/ui';
import { timeInBangkok } from '../lib/dates';
import { formatThb, type Order } from './orderModel';
import { THB_DENOMINATIONS, cashTaken, denominationTotal, describeDifference, recordCount, type CashCount } from './cashCount';

/**
 * Counting the drawer: by notes and coins, or as one total. The expected amount is the float plus
 * every cash payment on today's bills, and a difference has to be explained before it is saved.
 * Counting again adds a second record; nothing here edits or deletes a count.
 */
export const CashCountDialog: React.FC<{
  hotelId: string;
  businessDate: string;
  orders: Order[];
  previous: CashCount[];
  me: string;
  onSave: (count: CashCount) => Promise<void>;
  onClose: () => void;
}> = ({ hotelId, businessDate, orders, previous, me, onSave, onClose }) => {
  const [floatThb, setFloat] = useState(String(previous[0]?.floatThb ?? 0));
  const [byNotes, setByNotes] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taken = useMemo(() => cashTaken(orders, businessDate), [orders, businessDate]);
  const openBills = orders.filter((o) => o.businessDate === businessDate && o.status === 'open').length;
  const counted = byNotes ? denominationTotal(counts) : Number(total) || 0;
  const expected = Math.round(((Number(floatThb) || 0) + taken) * 100) / 100;
  const difference = Math.round((counted - expected) * 100) / 100;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const count = recordCount(
        { hotelId, businessDate, floatThb: Number(floatThb) || 0, countedThb: counted, denominations: byNotes ? counts : null, note },
        orders,
        { by: me, at: new Date().toISOString() }
      );
      await onSave(count);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Count the cash drawer"
      subtitle="Float plus today's cash payments, against what is in the drawer. Saved with your name; a recount adds another record."
      onClose={onClose}
      footer={
        <>
          <button className={btn.secondary} onClick={onClose}>
            Cancel
          </button>
          <button className={btn.primary} onClick={save} disabled={busy}>
            <Wallet size={18} /> {busy ? 'Saving…' : 'Save the count'}
          </button>
        </>
      }
    >
      {error && (
        <Banner tone="critical" role="alert">
          {error}
        </Banner>
      )}
      {openBills > 0 && (
        <Banner tone="warn">
          {openBills} bill{openBills === 1 ? ' is' : 's are'} still open. Cash already taken on {openBills === 1 ? 'it is' : 'them is'} counted here; close them before the end-of-day count.
        </Banner>
      )}

      <label className="block">
        <span className="text-sm font-bold">Float the drawer started with (THB)</span>
        <input type="number" inputMode="decimal" min="0" step="1" value={floatThb} onChange={(e) => setFloat(e.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl border border-border text-base tabular-nums" />
      </label>

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How to count">
        {[true, false].map((v) => (
          <button key={String(v)} role="radio" aria-checked={byNotes === v} onClick={() => setByNotes(v)} className={`h-11 rounded-xl border-2 font-bold text-sm cursor-pointer ${byNotes === v ? 'border-accent bg-accent/10' : 'border-border bg-white'}`}>
            {v ? 'Notes and coins' : 'One total'}
          </button>
        ))}
      </div>

      {byNotes ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {THB_DENOMINATIONS.map((d) => (
            <label key={d} className="flex items-center gap-2 rounded-xl border border-border p-2">
              <span className="w-14 text-right font-bold tabular-nums">{d >= 1 ? d : `${d * 100} st`}</span>
              <span className="text-muted-foreground">×</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                aria-label={`Number of ${d >= 1 ? `${d} baht` : `${d * 100} satang`}`}
                value={counts[String(d)] ?? ''}
                onChange={(e) => setCounts((c) => ({ ...c, [String(d)]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                className="w-full h-11 px-2 rounded-lg border border-border tabular-nums"
              />
            </label>
          ))}
        </div>
      ) : (
        <label className="block">
          <span className="text-sm font-bold">Cash in the drawer (THB)</span>
          <input type="number" inputMode="decimal" min="0" step="0.25" value={total} onChange={(e) => setTotal(e.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl border border-border text-base tabular-nums" />
        </label>
      )}

      <dl className="rounded-xl bg-[#F2EBE4]/50 p-4 space-y-1 text-sm tabular-nums">
        <div className="flex justify-between">
          <dt>Cash taken on today's bills</dt>
          <dd>{formatThb(taken)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Expected in the drawer</dt>
          <dd className="font-bold">{formatThb(expected)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Counted</dt>
          <dd className="font-bold">{formatThb(counted)}</dd>
        </div>
        <div className={`flex justify-between font-bold text-base ${difference === 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
          <dt>Difference</dt>
          <dd>{difference === 0 ? 'matches' : describeDifference(difference)}</dd>
        </div>
      </dl>

      <label className="block">
        <span className="text-sm font-bold">Note {difference !== 0 ? '(required - what do you know about the difference?)' : '(optional)'}</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl border border-border text-base" />
      </label>

      {previous.length > 0 && (
        <div className="text-sm">
          <p className="font-bold">Earlier counts today</p>
          <ul className="text-muted-foreground">
            {previous.map((c) => (
              <li key={c.id}>
                {timeInBangkok(c.countedAt)} · {formatThb(c.countedThb)} · {describeDifference(c.differenceThb)} · {c.countedBy}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
};
