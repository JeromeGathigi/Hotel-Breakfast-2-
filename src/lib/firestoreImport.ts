import { auth, collection, commitInChunks, db, doc, getDoc, getDocs, serverTimestamp, logOperaAuditTrail } from '../firebase';
import type { CheckIn, Guest, ReportMetadata } from '../types';
import type { PackageIndex } from '../parsing/packageDetail';
import type { RoomOverride } from './overrides';
import { toJsDate } from './dates';
import { buildForecastImportOps, buildGuestImportOps, type CurrentList, type ForecastImportPlan, type GuestImportPlan, type HotelId, type ImportOp } from './guestImport';

export type { CurrentList };

/** Runs an ordered plan against Firestore, in chunks, preserving the order. */
async function execute(ops: ImportOp[]): Promise<void> {
  await commitInChunks(
    ops.map((op) => (batch) => {
      const ref = doc(db, op.path[0], ...op.path.slice(1));
      if (op.kind === 'set') batch.set(ref, op.data);
      else batch.delete(ref);
    })
  );
}

export async function readCurrentList(hotelId: HotelId): Promise<CurrentList> {
  const [guestsSnap, metaSnap, pkgSnap] = await Promise.all([
    getDocs(collection(db, 'hotels', hotelId, 'guests')),
    getDoc(doc(db, 'hotels', hotelId, 'metadata', 'reports')),
    getDoc(doc(db, 'hotels', hotelId, 'metadata', 'packages')),
  ]);
  // Document ids, not the stored roomNumber field: the 8 junk documents in production are keyed
  // by room-type codes and must be found to be removed.
  const guests = guestsSnap.docs.map((d) => ({ ...(d.data() as Guest), roomNumber: d.id }));
  return {
    guests,
    metadataDate: metaSnap.exists() ? ((metaSnap.data() as ReportMetadata).date ?? null) : null,
    packages: pkgSnap.exists() ? (pkgSnap.data() as PackageIndex) : null,
  };
}

function importer(): string {
  const email = auth?.currentUser?.email;
  if (!email) throw new Error('You are signed out.');
  return email;
}

export async function runGuestImport(plan: GuestImportPlan, args: { filename: string; today: string; current: CurrentList }): Promise<{ archived: number }> {
  const importedBy = importer();
  const h = plan.hotelId;
  const [checkinsSnap, overridesSnap] = plan.archiveDate
    ? await Promise.all([
        getDocs(collection(db, 'hotels', h, 'checkins', plan.archiveDate, 'rooms')),
        getDocs(collection(db, 'hotels', h, 'overrides')),
      ])
    : [null, null];
  const ops = buildGuestImportOps(plan, {
    filename: args.filename,
    importedBy,
    today: args.today,
    currentGuests: args.current.guests,
    archiveCheckins: checkinsSnap ? checkinsSnap.docs.map((d) => d.data() as CheckIn) : [],
    overrides: overridesSnap ? overridesSnap.docs.map((d) => d.data() as RoomOverride) : [],
    packages: args.current.packages,
    timestamp: serverTimestamp(),
    toDate: toJsDate,
  });
  await execute(ops);
  await logOperaAuditTrail(
    h,
    'REPORT_UPLOAD',
    `Imported "${args.filename}": ${plan.rooms.length} rooms, ${plan.addedRoomIds.length} arrived, ${plan.removedRoomIds.length} removed` +
      (plan.archiveDate ? `, ${plan.archiveDate} archived` : '')
  );
  return { archived: plan.archiveDate ? args.current.guests.length : 0 };
}

export async function runForecastImport(plan: ForecastImportPlan, filename: string): Promise<void> {
  const importedBy = importer();
  await execute(buildForecastImportOps(plan, { importedBy, timestamp: serverTimestamp() }));
  await logOperaAuditTrail(
    plan.hotelId,
    'REPORT_UPLOAD',
    `Imported package forecast "${filename}": ${plan.forecastDocs.length} days, ${plan.index?.reservations ?? 0} reservations`
  );
}
