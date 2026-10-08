import React, { useState } from 'react';
import { Banner, Modal, btn } from '../components/ui';
import type { Guest } from '../types';
import { PAYMENT_LABEL, equalShare, formatThb, type NewPayment, type Order, type PaymentMethod } from './orderModel';
import { findGuests } from './NewOrderDialog';

/**
 * Taking a payment. A bill can be split across methods - part cash, the rest to the room - and
 * stays open until nothing is owed. Cash shows the change to give; only the bill amount is
 * recorded, so the drawer reconciles. A room charge must name a room on today's in-house list,
 * and the bill prints a signature line for it. Complimentary is a manager's call, with a reason.
 */

export const PaymentDialog: React.FC<{
  order: Order;
  outstandingThb: number;
  guests: Guest[];
  manager: boolean;
  onPay: (p: NewPayment) => Promise<void>;
  onClose: () => void;
}> = ({ order, outstandingThb, guests, manager, onPay, onClose }) => {
  const methods: PaymentMethod[] = ['cash', 'card', 'qr', 'room', ...(manager ? (['comp'] as PaymentMethod[]) : [])];
  const [method, setMethod] = useState<PaymentMethod>(order.channel === 'room' ? 'room' : 'cash');
  const [amount, setAmount] = useState(outstandingThb.toFixed(2));
  const [tendered, setTendered] = useState('');
  const [reference, setReference] = useState('');
  const [roomQuery, setRoomQuery] = useState(order.roomNumber ?? '');
  const [room, setRoom] = useState<Guest | null>(() => guests.find((g) => g.roomNumber === order.roomNumber) ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = Number(amount);
  const change = method === 'cash' && tendered ? Number(tendered) - value : null;

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      await onPay({ method, amountThb: value, reference, roomNumber: room?.roomNumber ?? null, guestName: room?.guestName ?? null });
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Payment · ${order.number}`}
      subtitle={`Still to pay ${formatThb(outstandingThb)}`}
      onClose={onClose}
      footer={
        <>
          <button className={btn.secondary} onClick={onClose}>
            Cancel
          </button>
          <button className={btn.primary} onClick={pay} disabled={busy || !(value > 0) || (method === 'room' && !room)}>
            {busy ? 'Saving…' : `Take ${Number.isFinite(value) ? formatThb(value) : ''}`}
          </button>
        </>
      }
    >
      {error && (
        <Banner tone="critical" role="alert">
          {error}
        </Banner>
      )}
      <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {methods.map((m) => (
          <button key={m} role="radio" aria-checked={method === m} onClick={() => setMethod(m)} className={`h-12 rounded-xl border-2 font-bold text-sm cursor-pointer ${method === m ? 'border-accent bg-accent/10' : 'border-border bg-white'}`}>
            {PAYMENT_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-bold">Amount (THB)</span>
          <input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl border border-border text-base tabular-nums" />
        </label>
        {method === 'cash' && (
          <label className="block">
            <span className="text-sm font-bold">Cash received (optional)</span>
            <input type="number" inputMode="decimal" step="0.01" min="0" value={tendered} onChange={(e) => setTendered(e.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl border border-border text-base tabular-nums" />
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Split what is left equally">
        <span className="text-sm font-bold mr-1">Split what is left between</span>
        {[2, 3, 4, 5, 6].map((n) => (
          <button key={n} type="button" onClick={() => setAmount(equalShare(outstandingThb, n).toFixed(2))} className="h-11 min-w-11 px-3 rounded-xl border border-border bg-white font-bold cursor-pointer">
            {n}
          </button>
        ))}
        <span className="text-xs text-muted-foreground">The last guest pays any odd satang.</span>
      </div>
      {change !== null && Number.isFinite(change) && (
        <Banner tone={change >= 0 ? 'ok' : 'warn'}>{change >= 0 ? `Change to give: ${formatThb(change)}` : `That is ${formatThb(-change)} short of the amount.`}</Banner>
      )}

      {method === 'room' && (
        <div className="space-y-2">
          <label htmlFor="pay-room" className="text-sm font-bold block">
            Room to charge
          </label>
          <input id="pay-room" value={roomQuery} onChange={(e) => setRoomQuery(e.target.value)} placeholder="Room or guest name" className="w-full h-11 px-3 rounded-xl border border-border text-base" />
          <div className="max-h-44 overflow-y-auto divide-y divide-border rounded-xl border border-border">
            {findGuests(guests, roomQuery).map((g) => (
              <button key={g.roomNumber} onClick={() => setRoom(g)} className={`w-full text-left p-3 flex gap-3 cursor-pointer ${room?.roomNumber === g.roomNumber ? 'bg-accent/10' : 'hover:bg-[#F2EBE4]/60'}`}>
                <span className="font-bold font-mono-custom">{g.roomNumber}</span>
                <span className="truncate">{g.guestName}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Post the charge to the room in Opera; the Sales report lists every room charge to post.</p>
        </div>
      )}

      {(method === 'card' || method === 'qr' || method === 'comp') && (
        <label className="block">
          <span className="text-sm font-bold">{method === 'comp' ? 'Reason (required)' : 'Reference (slip or transfer no., optional)'}</span>
          <input value={reference} onChange={(e) => setReference(e.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl border border-border text-base" />
        </label>
      )}
    </Modal>
  );
};
