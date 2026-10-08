import React, { useState } from 'react';
import { Save } from 'lucide-react';
import type { DoorRoom } from './doorModel';
import type { CorrectionInput, DoorActions } from './actions';
import { Banner, Modal, Stepper, btn } from '../components/ui';

/**
 * The spec's Data Quality Alert forms (section 7):
 *
 *   Type 1 - a guest name but 0 adults (a sharer left behind when the paying guest was checked
 *            out first): how many adults, and is breakfast included?
 *   Type 2 - a room number with no guest data at all (a GDS booking that did not come through):
 *            is the room occupied? If not, remove it; if so, name, breakfast, how many.
 *
 * Saved as a correction for TODAY and THIS reservation only (src/lib/overrides.ts), which staff may
 * write. The previous form wrote into the guest document, which needed admin rights and was erased
 * by the next import.
 */
export const CorrectionDialog: React.FC<{
  room: DoorRoom;
  actions: DoorActions;
  onClose: () => void;
}> = ({ room, actions, onClose }) => {
  const { raw } = room;
  const kind = room.dataIssue ?? 'no-adults';
  const [occupied, setOccupied] = useState<boolean | null>(kind === 'no-details' ? null : true);
  const [guestName, setGuestName] = useState(raw.guestName === 'RESERVED / NO DETAILS' ? '' : raw.guestName);
  const [adults, setAdults] = useState(Math.max(1, Number(raw.adults) || 0));
  const [children, setChildren] = useState(Number(raw.children) || 0);
  const [breakfast, setBreakfast] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready =
    occupied === false || (occupied === true && breakfast !== null && adults > 0 && (kind !== 'no-details' || guestName.trim().length > 0));

  const save = async () => {
    if (!ready) return;
    setSaving(true);
    setError(null);
    const input: CorrectionInput =
      occupied === false
        ? { roomNumber: raw.roomNumber, resvNameId: raw.resvNameId, kind, occupied: false, note: note.trim() }
        : {
            roomNumber: raw.roomNumber,
            resvNameId: raw.resvNameId,
            kind,
            occupied: true,
            guestName: guestName.trim() || raw.guestName,
            adults,
            children,
            breakfast: breakfast === true,
            breakfastPax: breakfast ? adults + children : 0,
            note: note.trim(),
          };
    try {
      await actions.saveCorrection(input);
      onClose();
    } catch (e) {
      setError(`Not saved: ${(e as Error)?.message || 'unknown error'}.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Room ${raw.roomNumber} · ${kind === 'no-details' ? 'no guest details' : 'no adult count'}`}
      subtitle={
        kind === 'no-details'
          ? 'Opera exported this room with no guest data - usually a GDS booking whose profile did not come through.'
          : 'Opera lists a guest here with 0 adults - usually a sharer left after the paying guest was checked out first.'
      }
      onClose={onClose}
      width="md"
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btn.primary} onClick={save} disabled={!ready || saving}>
            <Save size={18} /> {saving ? 'Saving…' : occupied === false ? 'Remove for today' : 'Save correction'}
          </button>
        </>
      }
    >
      {kind === 'no-details' && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold mb-1">Is this room occupied?</legend>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={occupied === true ? btn.primary : btn.secondary} onClick={() => setOccupied(true)}>
              Yes
            </button>
            <button type="button" className={occupied === false ? btn.primary : btn.secondary} onClick={() => setOccupied(false)}>
              No
            </button>
          </div>
        </fieldset>
      )}

      {occupied === false && (
        <Banner tone="info">The room disappears from today's list and every count. Tomorrow's import decides again.</Banner>
      )}

      {occupied === true && (
        <>
          {kind === 'no-details' && (
            <div className="space-y-1.5">
              <label htmlFor="corr-name" className="text-sm font-bold block">
                Guest name
              </label>
              <input id="corr-name" className="w-full h-11 px-3 rounded-xl border border-border text-base" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Stepper label="Adults" value={adults} onChange={setAdults} min={1} />
            <Stepper label="Children" value={children} onChange={setChildren} />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold mb-1">Breakfast included?</legend>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={breakfast === true ? btn.primary : btn.secondary} onClick={() => setBreakfast(true)}>
                Yes
              </button>
              <button type="button" className={breakfast === false ? btn.primary : btn.secondary} onClick={() => setBreakfast(false)}>
                No
              </button>
            </div>
          </fieldset>
        </>
      )}

      <div className="space-y-1.5">
        <label htmlFor="corr-note" className="text-sm font-bold block">
          Who confirmed it (optional)
        </label>
        <input
          id="corr-note"
          className="w-full h-11 px-3 rounded-xl border border-border text-base"
          placeholder="e.g. Front office, duty manager"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <p className="text-xs text-muted-foreground">Applies today only, to this reservation. It is recorded with your account.</p>
      {error && (
        <Banner tone="critical" role="alert">
          {error}
        </Banner>
      )}
    </Modal>
  );
};
