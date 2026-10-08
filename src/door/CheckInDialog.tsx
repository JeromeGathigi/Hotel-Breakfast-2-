import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, HelpCircle, StickyNote } from 'lucide-react';
import type { DiningTable, MealServiceType } from '../types';
import type { DoorRoom } from './doorModel';
import type { CorrectionInput, DoorActions, WriteResult } from './actions';
import { Banner, Modal, Stepper, VipBadge, btn } from '../components/ui';
import {
  ADULT_REASON_OTHER,
  CHILD_REASON_OTHER,
  childReasonOptions,
  overCapacity,
  overCapacityProblems,
} from '../lib/checkins';
import { canonicalPlan } from '../lib/meals';
import { effectiveCapacity, getCombinedTableNumber, seatableTables } from '../lib/tables';

const SERVICE_LABEL: Record<MealServiceType, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

/** Quick text for the adult reason - they fill the field, which stays mandatory and editable. */
const ADULT_REASON_CHIPS = ['Paid at the door', 'Charged to the room', 'Complimentary - manager approved'];

export interface CheckInDialogProps {
  hotelId: string;
  room: DoorRoom;
  service: MealServiceType;
  tables: DiningTable[];
  actions: DoorActions;
  onClose: () => void;
  onSaved: (result: WriteResult, roomNumber: string) => void;
}

/**
 * Check-in at the restaurant door, as the property spec describes it (section 8): pre-filled with the
 * booked counts, and an over-capacity check-in needs a reason AND the name of whoever authorised
 * it. The previous dialog showed those fields but saved without them, so the "authorisation" was
 * decorative.
 */
export const CheckInDialog: React.FC<CheckInDialogProps> = ({ hotelId, room, service, tables, actions, onClose, onSaved }) => {
  const { guest, breakfast, checkIn: existing } = room;
  const booked = room.booked;

  const [adults, setAdults] = useState(existing ? Number(existing.adultsAte) || 0 : booked.adults);
  const [children, setChildren] = useState(existing ? Number(existing.childrenAte) || 0 : booked.children);
  const [infants, setInfants] = useState(existing ? Number(existing.infantsAte) || 0 : 0);
  const names = [guest.guestName, ...(guest.accompanyingGuests ?? [])].filter(Boolean);
  const [attending, setAttending] = useState<Set<string>>(new Set(existing?.checkedGuestNames ?? names));
  const [tableId, setTableId] = useState<string>(existing?.tableId ?? '');
  const [childReasons, setChildReasons] = useState<string[]>([]);
  const [childOtherText, setChildOtherText] = useState('');
  const [adultReasonText, setAdultReasonText] = useState('');
  const [authorizingStaff, setAuthorizingStaff] = useState(existing?.authorizingStaff ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRate, setConfirmingRate] = useState(false);

  const over = overCapacity({ adults: booked.adults, children: booked.children }, { adults, children, infants });
  const problems = overCapacityProblems(over, { childReasons, childOtherText, adultReasonText, authorizingStaff });
  const total = adults + children + infants;

  const seatable = useMemo(() => seatableTables(tables), [tables]);
  const chosenTable = seatable.find((t) => t.id === tableId) ?? null;

  const toggleChildReason = (code: string) =>
    setChildReasons((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const confirmRate = async (included: boolean) => {
    setConfirmingRate(true);
    setError(null);
    const input: CorrectionInput = {
      roomNumber: guest.roomNumber,
      resvNameId: guest.resvNameId,
      kind: 'rate',
      breakfast: included,
      breakfastPax: included ? (Number(guest.adults) || 0) + (Number(guest.children) || 0) : 0,
      note: included ? 'Front office confirmed breakfast is included' : 'Front office confirmed room only',
    };
    try {
      await actions.saveCorrection(input);
    } catch (e) {
      setError(`Could not save the confirmation: ${(e as Error)?.message || 'unknown error'}.`);
    } finally {
      setConfirmingRate(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (total === 0 || problems.length > 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await actions.checkIn({
        guest,
        service,
        adults,
        children,
        infants,
        checkedGuestNames: names.filter((n) => attending.has(n)),
        table: chosenTable,
        previousTableId: existing?.tableId ?? null,
        booked,
        basis: service === 'breakfast' ? breakfast.basis : 'rate',
        overCapacity: over.any
          ? {
              childReasons: over.childrenOver ? childReasons : [],
              childOtherText: over.childrenOver && childReasons.includes(CHILD_REASON_OTHER) ? childOtherText.trim() : '',
              adultReasonText: over.adultsOver ? adultReasonText.trim() : '',
              authorizingStaff: authorizingStaff.trim(),
            }
          : null,
        existing,
      });
      onSaved(result, guest.roomNumber);
      onClose();
    } catch (err) {
      // A refusal (permissions, a rule) arrives here within the write timeout. Nothing was saved.
      setError(`Not saved: ${(err as Error)?.message || 'unknown error'}. Nothing was recorded for room ${guest.roomNumber}.`);
    } finally {
      setSubmitting(false);
    }
  };

  const verdict =
    service !== 'breakfast'
      ? room.entitled
        ? { tone: 'ok' as const, text: `${SERVICE_LABEL[service]} is included in this rate.` }
        : { tone: 'warn' as const, text: `${SERVICE_LABEL[service]} is not included in this rate.` }
      : breakfast.unverified
        ? { tone: 'warn' as const, text: breakfast.reason }
        : breakfast.entitled
          ? { tone: 'ok' as const, text: breakfast.reason }
          : { tone: 'warn' as const, text: breakfast.reason };

  return (
    <Modal
      title={`Room ${guest.roomNumber} · ${guest.guestName}`}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <VipBadge vip={room.vip} size="lg" />
          <span>{canonicalPlan(guest.rateCode || guest.mealPlan)}</span>
          <span>·</span>
          <span>
            Booked for {SERVICE_LABEL[service].toLowerCase()}: <strong className="text-foreground">{booked.pax}</strong>
          </span>
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="checkin-form" className={btn.primary} disabled={submitting || total === 0 || problems.length > 0}>
            <CheckCircle2 size={18} />
            {submitting ? 'Saving…' : existing ? `Update (${total})` : `Check in ${total}`}
          </button>
        </>
      }
    >
      <form id="checkin-form" onSubmit={submit} className="space-y-4">
        <Banner tone={verdict.tone} title={service === 'breakfast' ? (breakfast.unverified ? 'Check the rate before serving' : breakfast.entitled ? 'Breakfast included' : 'Room only') : undefined}>
          <p>{verdict.text}</p>
          {service === 'breakfast' && breakfast.evidence.length > 1 && (
            <ul className="mt-2 space-y-0.5 text-xs opacity-90">
              {breakfast.evidence.map((e, i) => (
                <li key={i}>
                  <strong>{e.source.replace('-', ' ')}:</strong> {e.says.replace('-', ' ')} — {e.detail}
                </li>
              ))}
            </ul>
          )}
          {service === 'breakfast' && breakfast.unverified && (
            <div className="flex flex-wrap gap-2 pt-2">
              <button type="button" className={btn.secondary} disabled={confirmingRate} onClick={() => confirmRate(true)}>
                <Check size={16} /> Front office confirms breakfast
              </button>
              <button type="button" className={btn.secondary} disabled={confirmingRate} onClick={() => confirmRate(false)}>
                Front office confirms room only
              </button>
            </div>
          )}
        </Banner>

        {service === 'breakfast' && breakfast.arrivesToday && (
          <Banner tone="info" title="Arrived today">
            An Opera breakfast package starts with tomorrow's breakfast. Serving this morning is outside the package.
          </Banner>
        )}

        {room.vip?.operational === 'black-list' && (
          <Banner tone="critical" title={`${room.vip.label}`} role="alert">
            {room.vip.description}. Follow the hotel's procedure before serving.
          </Banner>
        )}
        {room.vip?.operational === 'accessibility' && (
          <Banner tone="info" title={`${room.vip.label} · ${room.vip.description}`}>
            Offer an accessible table.
          </Banner>
        )}

        {(guest.notes?.length ?? 0) > 0 && (
          <div className="rounded-xl border border-border p-3 space-y-1.5">
            <p className="text-sm font-bold flex items-center gap-1.5">
              <StickyNote size={15} /> Front office notes
            </p>
            <ul className="space-y-1">
              {guest.notes!.map((n, i) => (
                <li key={i} className="text-sm leading-snug">
                  {n.type && <span className="text-xs font-mono-custom text-muted-foreground mr-1.5">{n.type}</span>}
                  {n.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        {names.length > 1 && (
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-bold mb-1">Who is here</legend>
            {names.map((n) => {
              const on = attending.has(n);
              return (
                <label key={n} className={`flex items-center gap-3 min-h-11 px-3 rounded-xl border cursor-pointer ${on ? 'border-accent bg-accent/5' : 'border-border'}`}>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[var(--accent)]"
                    checked={on}
                    onChange={() =>
                      setAttending((prev) => {
                        const next = new Set(prev);
                        if (next.has(n)) next.delete(n);
                        else next.add(n);
                        return next;
                      })
                    }
                  />
                  <span className="text-base">{n}</span>
                </label>
              );
            })}
          </fieldset>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Stepper label="Adults" hint={`booked ${booked.adults}`} value={adults} onChange={setAdults} />
          <Stepper label="Children" hint={`booked ${booked.children}`} value={children} onChange={setChildren} />
          <Stepper label="Infants" hint="below 2 years" value={infants} onChange={setInfants} />
        </div>

        {over.any && (
          <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 space-y-3" role="alert">
            <p className="font-bold text-amber-950 flex items-start gap-2">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              This room is booked for {booked.pax} {SERVICE_LABEL[service].toLowerCase()} pax only. You are checking in {total}{' '}
              guest{total === 1 ? '' : 's'}. Are you sure?
            </p>

            {over.childrenOver && (
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-bold text-amber-950">Reason for the extra children or infants (tick one or more)</legend>
                {childReasonOptions(hotelId).map((o) => (
                  <label key={o.code} className="flex items-center gap-3 min-h-11 px-3 rounded-xl bg-white border border-amber-200 cursor-pointer">
                    <input type="checkbox" className="h-5 w-5" checked={childReasons.includes(o.code)} onChange={() => toggleChildReason(o.code)} />
                    <span className="text-sm">{o.label}</span>
                  </label>
                ))}
                {childReasons.includes(CHILD_REASON_OTHER) && (
                  <input
                    className="w-full h-11 px-3 rounded-xl border border-amber-300 bg-white text-base"
                    placeholder="Specify the reason"
                    value={childOtherText}
                    onChange={(e) => setChildOtherText(e.target.value)}
                  />
                )}
              </fieldset>
            )}

            {over.adultsOver && (
              <div className="space-y-1.5">
                <label htmlFor={ADULT_REASON_OTHER} className="text-sm font-bold text-amber-950 block">
                  Reason for the extra adults (required)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ADULT_REASON_CHIPS.map((c) => (
                    <button key={c} type="button" className="h-9 px-3 rounded-lg bg-white border border-amber-300 text-sm cursor-pointer" onClick={() => setAdultReasonText(c)}>
                      {c}
                    </button>
                  ))}
                </div>
                <input
                  id={ADULT_REASON_OTHER}
                  className="w-full h-11 px-3 rounded-xl border border-amber-300 bg-white text-base"
                  placeholder="Specify the reason"
                  value={adultReasonText}
                  onChange={(e) => setAdultReasonText(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="authorizing-staff" className="text-sm font-bold text-amber-950 block">
                Staff member who authorised it (required)
              </label>
              <input
                id="authorizing-staff"
                className="w-full h-11 px-3 rounded-xl border border-amber-300 bg-white text-base"
                placeholder="Name"
                value={authorizingStaff}
                onChange={(e) => setAuthorizingStaff(e.target.value)}
              />
            </div>
            {problems.length > 0 && (
              <ul className="text-sm text-amber-900 list-disc pl-5">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="table" className="text-sm font-bold block">
            Table (optional)
          </label>
          <select
            id="table"
            value={tableId}
            onChange={(e) => setTableId(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-border bg-white text-base"
          >
            <option value="">No table yet</option>
            {seatable.map((t) => {
              const label = getCombinedTableNumber(t, tables);
              const takenByOther = t.status === 'occupied' && t.occupiedByRoom && t.occupiedByRoom !== guest.roomNumber;
              return (
                <option key={t.id} value={t.id} disabled={Boolean(takenByOther)}>
                  {label} · {t.zone} · {effectiveCapacity(t, tables)} seats{takenByOther ? ` · occupied by room ${t.occupiedByRoom}` : ''}
                </option>
              );
            })}
          </select>
          {chosenTable && effectiveCapacity(chosenTable, tables) < total && (
            <p className="text-sm text-amber-800 flex items-center gap-1.5">
              <HelpCircle size={14} /> {total} guests at a table for {effectiveCapacity(chosenTable, tables)}.
            </p>
          )}
        </div>

        {error && (
          <Banner tone="critical" role="alert">
            {error}
          </Banner>
        )}
      </form>
    </Modal>
  );
};
