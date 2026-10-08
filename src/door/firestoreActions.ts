import { auth, db, doc, deleteDoc, logOperaAuditTrail, serverTimestamp, setDoc, settleWrite, writeBatch } from '../firebase';
import type { CheckIn, DiningTable } from '../types';
import { checkinDocId } from '../lib/checkins';
import type { RoomOverride } from '../lib/overrides';
import type { CheckInInput, CorrectionInput, DoorActions, WriteResult } from './actions';

/**
 * The door's writes, against Firestore.
 *
 * Attribution is always the signed-in account. These used to fall back to
 * 'staff@novotel-chiangmai.com' when nobody was signed in - a record attributed to an account
 * that did not exist and did not act. The security rules now also refuse a check-in or a correction
 * whose recordedBy is not the caller.
 */
function whoAmI(): string {
  const email = auth?.currentUser?.email;
  if (!email) throw new Error('You are signed out. Sign in again to record check-ins.');
  return email;
}

const OCCUPANCY_RELEASE = {
  status: 'available',
  occupiedByRoom: null,
  occupiedByGuest: null,
  occupiedPax: null,
  occupiedSince: null,
  mealService: null,
};

export function firestoreDoorActions(hotelId: string, today: string, tables: DiningTable[]): DoorActions {
  const tableById = new Map(tables.map((t) => [t.id, t]));
  const groupIds = (t: DiningTable) => [t.id, ...(t.mergedTables ?? [])];

  return {
    async checkIn(input: CheckInInput): Promise<WriteResult> {
      const recordedBy = whoAmI();
      const { guest, service, table } = input;

      // Refuse to seat over another room. The old flow overwrote the occupant without a word.
      // Checked against the live table subscription rather than a fresh read, which would fail
      // offline - exactly when the door most needs to keep working.
      if (table) {
        const live = tableById.get(table.id);
        if (live?.status === 'occupied' && live.occupiedByRoom && live.occupiedByRoom !== guest.roomNumber) {
          throw new Error(`table ${table.tableNumber} is now occupied by room ${live.occupiedByRoom}. Choose another table.`);
        }
      }

      const record: CheckIn = {
        roomNumber: guest.roomNumber,
        guestName: guest.guestName,
        hotelId,
        date: today,
        timestamp: input.existing?.timestamp ?? serverTimestamp(),
        mealService: service,
        adultsAte: input.adults,
        childrenAte: input.children,
        infantsAte: input.infants,
        recordedBy,
        tableNumber: table ? table.tableNumber : null,
        tableId: table ? table.id : null,
        checkedGuestNames: input.checkedGuestNames,
        bookedPax: input.booked.pax,
        entitlementBasis: input.basis,
        overCapacityReasonCodes: input.overCapacity?.childReasons ?? [],
        overCapacityOtherReason: [input.overCapacity?.childOtherText, input.overCapacity?.adultReasonText].filter(Boolean).join(' / '),
        authorizingStaff: input.overCapacity?.authorizingStaff ?? '',
      };

      const batch = writeBatch(db);
      batch.set(doc(db, 'hotels', hotelId, 'checkins', today, 'rooms', checkinDocId(guest.roomNumber, service)), record as unknown as Record<string, unknown>);

      // Release the table this room held before, if it moved.
      if (input.previousTableId && input.previousTableId !== table?.id) {
        const prev = tableById.get(input.previousTableId);
        for (const id of prev ? groupIds(prev) : [input.previousTableId]) {
          batch.update(doc(db, 'hotels', hotelId, 'tables', id), OCCUPANCY_RELEASE);
        }
      }
      if (table) {
        const occupancy = {
          status: 'occupied',
          occupiedByRoom: guest.roomNumber,
          occupiedByGuest: guest.guestName,
          occupiedPax: input.adults + input.children + input.infants,
          // An instant, not "07:42" in the device's locale: the turnover timer parses this, and a
          // locale string is ambiguous across devices and midnight.
          occupiedSince: new Date().toISOString(),
          mealService: service,
        };
        for (const id of groupIds(table)) batch.update(doc(db, 'hotels', hotelId, 'tables', id), occupancy);
      }

      // One batch, so a check-in and its table can never half-succeed. The old flow wrote them one
      // after another and, when the table write was refused, told the host "nothing was recorded"
      // even though the check-in had been saved.
      const result = await settleWrite(batch.commit(), `check-in for room ${guest.roomNumber}`);
      const total = input.adults + input.children + input.infants;
      void logOperaAuditTrail(
        hotelId,
        input.existing ? 'CHECK_IN_PARTIAL' : 'CHECK_IN',
        `${input.existing ? 'Updated' : 'Checked in'} room ${guest.roomNumber} for ${service}: ${total} (booked ${input.booked.pax})` +
          (table ? ` at table ${table.tableNumber}` : '') +
          (input.overCapacity ? ` - over capacity, authorised by ${input.overCapacity.authorizingStaff}` : ''),
        guest.roomNumber,
        guest.guestName,
        { service, adults: input.adults, children: input.children, infants: input.infants, booked: input.booked.pax, basis: input.basis }
      );
      return result;
    },

    async undoCheckIn(guest, service, checkIn): Promise<WriteResult> {
      whoAmI();
      const batch = writeBatch(db);
      batch.delete(doc(db, 'hotels', hotelId, 'checkins', today, 'rooms', checkinDocId(guest.roomNumber, service)));
      const held = checkIn.tableId ? tableById.get(checkIn.tableId) : null;
      if (held && held.occupiedByRoom === guest.roomNumber) {
        for (const id of groupIds(held)) batch.update(doc(db, 'hotels', hotelId, 'tables', id), OCCUPANCY_RELEASE);
      }
      const result = await settleWrite(batch.commit(), `cancelling room ${guest.roomNumber}`);
      void logOperaAuditTrail(hotelId, 'CHECK_OUT_RESET', `Cancelled the ${service} check-in for room ${guest.roomNumber}`, guest.roomNumber, guest.guestName);
      return result;
    },

    async saveCorrection(input: CorrectionInput): Promise<WriteResult> {
      const recordedBy = whoAmI();
      const record: RoomOverride = { ...input, date: today, recordedBy, recordedAt: new Date().toISOString() };
      const result = await settleWrite(
        setDoc(doc(db, 'hotels', hotelId, 'overrides', input.roomNumber), record as unknown as Record<string, unknown>),
        `correction for room ${input.roomNumber}`
      );
      void logOperaAuditTrail(
        hotelId,
        'GUEST_OVERRIDE',
        `Corrected room ${input.roomNumber} (${input.kind}): ` +
          (input.occupied === false
            ? 'not occupied'
            : `${input.adults ?? '-'} adults, breakfast ${input.breakfast === undefined ? 'unchanged' : input.breakfast ? 'yes' : 'no'}`) +
          (input.note ? ` - ${input.note}` : ''),
        input.roomNumber
      );
      return result;
    },
  };
}

/** Removes a correction, e.g. one made against the wrong room. */
export async function clearCorrection(hotelId: string, roomNumber: string): Promise<void> {
  await deleteDoc(doc(db, 'hotels', hotelId, 'overrides', roomNumber));
}
