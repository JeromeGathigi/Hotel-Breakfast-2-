import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import type { CheckIn, Guest, ReportMetadata } from '../../src/types';
import type { CurrentList, HotelId, ImportOp } from '../../src/lib/guestImport';
import type { PackageIndex } from '../../src/parsing/packageDetail';
import type { RoomOverride } from '../../src/lib/overrides';

/**
 * The Admin SDK side of an import. The plan and the ordered writes come from src/lib/guestImport.ts,
 * the same code the app's Import screen runs; this file only reads and writes. Mirrors
 * src/lib/firestoreImport.ts, which does the same with the web SDK.
 */

/**
 * `undefined` becomes null, as the web adapter's sanitizeData does, so a document reads the same
 * whichever side wrote it. Only plain objects and arrays are walked: FieldValue sentinels and
 * Timestamps are class instances and pass through untouched.
 */
export function sanitizeForFirestore(value: unknown): unknown {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(sanitizeForFirestore);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeForFirestore(v);
    return out;
  }
  return value;
}

/** Runs an ordered plan in batches of 400 (Firestore's cap is 500), preserving the order. */
export async function executeOps(db: Firestore, ops: ImportOp[], chunkSize = 400): Promise<void> {
  for (let i = 0; i < ops.length; i += chunkSize) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + chunkSize)) {
      const ref = db.doc(op.path.join('/'));
      if (op.kind === 'set') batch.set(ref, sanitizeForFirestore(op.data) as DocumentData);
      else batch.delete(ref);
    }
    await batch.commit();
  }
}

export async function readCurrentList(db: Firestore, hotelId: HotelId): Promise<CurrentList> {
  const hotel = db.collection('hotels').doc(hotelId);
  const [guestsSnap, metaSnap, pkgSnap] = await Promise.all([
    hotel.collection('guests').get(),
    hotel.collection('metadata').doc('reports').get(),
    hotel.collection('metadata').doc('packages').get(),
  ]);
  return {
    guests: guestsSnap.docs.map((d) => ({ ...(d.data() as Guest), roomNumber: d.id })),
    metadataDate: metaSnap.exists ? ((metaSnap.data() as ReportMetadata).date ?? null) : null,
    packages: pkgSnap.exists ? (pkgSnap.data() as PackageIndex) : null,
  };
}

/** What the archive of `date` needs: that morning's check-ins and the corrections made at the door. */
export async function readArchiveInputs(db: Firestore, hotelId: HotelId, date: string): Promise<{ checkins: CheckIn[]; overrides: RoomOverride[] }> {
  const hotel = db.collection('hotels').doc(hotelId);
  const [checkinsSnap, overridesSnap] = await Promise.all([
    hotel.collection('checkins').doc(date).collection('rooms').get(),
    hotel.collection('overrides').get(),
  ]);
  return {
    checkins: checkinsSnap.docs.map((d) => d.data() as CheckIn),
    overrides: overridesSnap.docs.map((d) => d.data() as RoomOverride),
  };
}

/** Same document shape as the app's logOperaAuditTrail, attributed to the credential that wrote it. */
export async function writeAudit(
  db: Firestore,
  hotelId: HotelId,
  details: string,
  identity: string,
  timestamp: unknown,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const ref = db.collection('hotels').doc(hotelId).collection('auditLogs').doc();
  await ref.set(
    sanitizeForFirestore({
      id: ref.id,
      hotelId,
      timestamp,
      userEmail: identity,
      userName: 'Opera import script',
      action: 'REPORT_UPLOAD',
      roomNumber: null,
      guestName: null,
      details,
      metadata,
    }) as DocumentData
  );
}
