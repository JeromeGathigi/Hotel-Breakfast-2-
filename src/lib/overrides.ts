import type { Guest } from '../types';

/**
 * A correction a host or manager makes at the door - the spec's Data Quality Alert forms
 * (section 7) - and the "front office confirmed" answer to a rate code the app cannot decide.
 *
 * Stored at hotels/{hotelId}/overrides/{roomNumber}, which staff may write (the guest list itself is
 * admin-only and is replaced by every import). The previous form wrote straight into the guest
 * document instead: that needed admin rights a host does not have, and the next import erased it.
 *
 * A correction is scoped to ONE business day and ONE reservation. It is applied only while both
 * still match, so it can never leak to tomorrow's list or to the next guest in the same room.
 */
export interface RoomOverride {
  roomNumber: string;
  date: string;
  resvNameId: string;
  kind: 'no-adults' | 'no-details' | 'rate';
  /** No-details rooms: is anyone actually in it? false removes the room from today's list. */
  occupied?: boolean;
  guestName?: string;
  adults?: number;
  children?: number;
  /** Breakfast confirmed by a person, not inferred. */
  breakfast?: boolean;
  /** How many of the room's guests the breakfast covers. */
  breakfastPax?: number;
  /** Free text: who confirmed it, and how. */
  note?: string;
  recordedBy: string;
  recordedAt: string;
}

export function overrideApplies(
  override: RoomOverride | null | undefined,
  guest: Pick<Guest, 'roomNumber' | 'resvNameId'>,
  today: string
): override is RoomOverride {
  if (!override) return false;
  return (
    override.date === today &&
    override.roomNumber === guest.roomNumber &&
    String(override.resvNameId ?? '') === String(guest.resvNameId ?? '')
  );
}

/**
 * The guest as the door should see it today. Returns null when a correction says the room is
 * not occupied, so it drops out of the list and every count.
 */
export function applyOverride(guest: Guest, override: RoomOverride | null | undefined, today: string): Guest | null {
  if (!overrideApplies(override, guest, today)) return guest;
  if (override.occupied === false) return null;

  const corrected: Guest = { ...guest };
  if (override.guestName && override.guestName.trim()) corrected.guestName = override.guestName.trim();
  if (Number.isFinite(override.adults)) corrected.adults = Math.max(0, Number(override.adults));
  if (Number.isFinite(override.children)) corrected.children = Math.max(0, Number(override.children));
  // A corrected room is no longer a data-quality problem.
  corrected.issueType = null;
  corrected.correction = {
    kind: override.kind,
    by: override.recordedBy,
    at: override.recordedAt,
    note: override.note ?? '',
  };
  return corrected;
}

/** One line for the audit log and the guest card: what the correction says about the room. */
export function describeCorrection(o: Pick<RoomOverride, 'kind' | 'occupied' | 'adults' | 'breakfast' | 'note'>): string {
  const what =
    o.occupied === false
      ? 'not occupied today'
      : o.kind === 'rate'
        ? o.breakfast
          ? 'breakfast confirmed'
          : 'room only confirmed'
        : `${o.adults ?? '-'} adults, breakfast ${o.breakfast === undefined ? 'unchanged' : o.breakfast ? 'yes' : 'no'}`;
  // A rate confirmation's note already says it ("Front office confirmed room only").
  if (o.kind === 'rate' && o.note) return o.note;
  return o.note ? `${what} - ${o.note}` : what;
}

/**
 * Rooms a correction took off today's list ("not occupied"), so the door can still show them and
 * put them back. Without this, a room marked by mistake stayed hidden until the next import.
 */
export function roomsRemovedToday(guests: Guest[], overrides: RoomOverride[], today: string): Array<{ guest: Guest; override: RoomOverride }> {
  const byRoom = new Map(overrides.map((o) => [o.roomNumber, o]));
  const out: Array<{ guest: Guest; override: RoomOverride }> = [];
  for (const guest of guests) {
    const override = byRoom.get(guest.roomNumber);
    if (overrideApplies(override, guest, today) && override.occupied === false) out.push({ guest, override });
  }
  return out.sort((a, b) => a.guest.roomNumber.localeCompare(b.guest.roomNumber, undefined, { numeric: true }));
}
