import { getDb, describeCredential } from './lib/adminApp';
import { isValidRoomNumber } from '../src/parsing';

/**
 * Removes documents from `hotels/{id}/guests` whose id is not a room number.
 *
 * ## Why this exists
 *
 * On 31 August a package-forecast export (`pkgforecast_84272763.txt`) was imported as if it
 * were an in-house guest list. The forecast is keyed by ROOM TYPE, not by room, so the import
 * wrote one "guest" per room-type code. Verified in the console on 3 September, the live
 * Novotel guest collection contains exactly these eight documents and no real guests at all:
 *
 *     KGAGS  KGB  KGBBC  SDDMV  SKC  TWB  TWBBC  UNASSIGNED
 *
 * These are room types (King Bed, Twin Bed, and so on) plus an UNASSIGNED bucket. A host
 * searching for room 412 finds nothing; a host searching "KGB" finds a guest that does not
 * exist.
 *
 * `src/lib/importGuard.ts` now refuses that file, so this cannot recur - but the bad data is
 * still there, and it is what the app shows today.
 *
 * ## Safety
 *
 * Dry run by DEFAULT. It prints what it would delete and exits. Pass --apply to act.
 *
 * It deletes only documents whose id fails `isValidRoomNumber` - the same predicate the parser
 * uses to reject a row - so a real room can never be caught by it. Room numbers are digits with
 * an optional single letter suffix (412, 412A). Every id it would keep and every id it would
 * delete is printed, so the decision is auditable before anything is destroyed.
 *
 * Usage:
 *     npx tsx scripts/clearJunkGuests.ts                 # dry run, both hotels
 *     npx tsx scripts/clearJunkGuests.ts --apply         # delete, both hotels
 *     npx tsx scripts/clearJunkGuests.ts --hotel=ibis    # restrict to one property
 */

const HOTELS = ['novotel', 'ibis'] as const;

interface Plan {
  hotelId: string;
  keep: string[];
  remove: string[];
  total: number;
}

async function planFor(hotelId: string): Promise<Plan> {
  const db = await getDb();
  const snapshot = await db.collection(`hotels/${hotelId}/guests`).get();

  const keep: string[] = [];
  const remove: string[] = [];
  snapshot.docs.forEach((doc) => {
    (isValidRoomNumber(doc.id) ? keep : remove).push(doc.id);
  });

  return { hotelId, keep: keep.sort(), remove: remove.sort(), total: snapshot.size };
}

async function apply(plan: Plan): Promise<number> {
  const db = await getDb();
  let deleted = 0;

  // Chunk well below the 500-operation batch cap.
  for (let i = 0; i < plan.remove.length; i += 400) {
    const slice = plan.remove.slice(i, i + 400);
    const batch = db.batch();
    for (const id of slice) {
      batch.delete(db.doc(`hotels/${plan.hotelId}/guests/${id}`));
    }
    await batch.commit();
    deleted += slice.length;
  }
  return deleted;
}

async function main() {
  const args = process.argv.slice(2);
  const shouldApply = args.includes('--apply');
  const only = args.find((a) => a.startsWith('--hotel='))?.split('=')[1];
  const hotels = only ? [only] : [...HOTELS];

  console.log(`[clear-junk-guests] ${await describeCredential()}`);
  console.log(`[clear-junk-guests] mode: ${shouldApply ? 'APPLY - will delete' : 'DRY RUN - nothing will be deleted'}\n`);

  let totalToRemove = 0;

  for (const hotelId of hotels) {
    const plan = await planFor(hotelId);
    totalToRemove += plan.remove.length;

    console.log(`${hotelId}: ${plan.total} document(s) in hotels/${hotelId}/guests`);
    console.log(`  keep   (${plan.keep.length}): ${plan.keep.join(', ') || '(none)'}`);
    console.log(`  DELETE (${plan.remove.length}): ${plan.remove.join(', ') || '(none)'}`);

    if (plan.keep.length === 0 && plan.remove.length > 0) {
      console.log('  note: this collection contains NO valid room numbers at all, so the');
      console.log('        guest list the app is showing today is entirely junk.');
    }

    if (shouldApply && plan.remove.length > 0) {
      const deleted = await apply(plan);
      console.log(`  deleted ${deleted} document(s)`);
    }
    console.log('');
  }

  if (!shouldApply && totalToRemove > 0) {
    console.log(`Nothing was deleted. Re-run with --apply to remove ${totalToRemove} document(s).`);
  }
  if (totalToRemove === 0) {
    console.log('Nothing to do - every document id is a valid room number.');
  }
}

main().catch((error) => {
  console.error('[clear-junk-guests] FAILED:', error);
  process.exit(1);
});
