import { promises as fs } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { businessDate } from '../src/lib/businessDate';
import { parseInHouseReport } from '../src/parsing';
import type { Guest } from '../src/types';

dotenv.config();
dotenv.config({ path: '.env.local' });

const HOTEL_ID = process.env.OPERA_HOTEL_ID ?? process.env.VITE_FIREBASE_PROJECT_ID ?? 'novotel';
const DEFAULT_INCOMING_DIR = path.resolve(process.cwd(), 'opera-incoming');
const DEFAULT_ARCHIVE_DIR = path.resolve(process.cwd(), 'opera-processed');

function log(message: string, ...args: unknown[]) {
  console.log(`[opera-import][${new Date().toISOString()}] ${message}`, ...args);
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function resolveServiceAccount(): Promise<Record<string, unknown> | null> {
  const envJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? process.env.OPERA_SERVICE_ACCOUNT_JSON;
  if (envJson) {
    try {
      return JSON.parse(envJson);
    } catch (error) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON is invalid: ${(error as Error).message}`);
    }
  }

  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    process.env.OPERA_SERVICE_ACCOUNT_PATH,
    path.resolve(process.cwd(), 'firebase-service-account.json'),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      const fileText = await fs.readFile(candidate, 'utf8');
      return JSON.parse(fileText);
    }
  }

  return null;
}

async function resolveFirestoreDatabaseId(): Promise<string> {
  const envDbId = process.env.FIRESTORE_DATABASE_ID;
  if (envDbId) return envDbId;

  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (await fileExists(configPath)) {
    try {
      const configText = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configText);
      if (config.firestoreDatabaseId) {
        return config.firestoreDatabaseId;
      }
    } catch {
      // continue to throw
    }
  }

  throw new Error('Missing Firestore database ID. Set FIRESTORE_DATABASE_ID or check firebase-applet-config.json.');
}

let cachedDb: ReturnType<typeof getFirestore> | null = null;

async function getDb() {
  if (cachedDb) return cachedDb;

  const databaseId = await resolveFirestoreDatabaseId();
  const serviceAccount = await resolveServiceAccount();
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID;

  let app;
  if (serviceAccount) {
    app = initializeApp({
      credential: cert(serviceAccount as any),
      projectId: (serviceAccount as any).project_id || projectId,
    });
  } else if (projectId) {
    app = initializeApp({
      projectId,
      credential: applicationDefault(),
    });
  } else {
    throw new Error('Missing Firebase configuration. Set VITE_FIREBASE_PROJECT_ID and either a service account or ADC credentials.');
  }

  cachedDb = getFirestore(app, databaseId);
  return cachedDb;
}

function buildGuestRecord(room: ReturnType<typeof parseInHouseReport>['rooms'][number], hotelId: string = 'novotel'): Guest {
  return {
    roomNumber: room.roomNumber,
    guestName: room.guestName ?? '',
    arrivalDate: room.arrivalDate,
    departureDate: room.departureDate,
    mealPlan: room.mealPlan,
    adults: Number(room.adults) || 0,
    children: Number(room.children) || 0,
    resvNameId: room.resvNameId,
    accompanyingGuests: room.accompanyingGuests ?? [],
    vipStatus: room.vipStatus ?? null,
    issueType: room.issueType ?? null,
    hotelId: room.hotelId || hotelId,
    lastUpdated: new Date().toISOString(),
  };
}

async function archiveFile(filePath: string) {
  const archiveDir = process.env.OPERA_ARCHIVE_DIR ?? DEFAULT_ARCHIVE_DIR;
  await fs.mkdir(archiveDir, { recursive: true });
  const fileName = path.basename(filePath);
  const target = path.join(archiveDir, fileName);
  const finalTarget = await uniqueArchiveTarget(target);
  await fs.rename(filePath, finalTarget);
  return finalTarget;
}

async function uniqueArchiveTarget(target: string): Promise<string> {
  let candidate = target;
  let counter = 1;
  while (await fileExists(candidate)) {
    const ext = path.extname(target);
    const base = path.basename(target, ext);
    candidate = path.join(path.dirname(target), `${base}-${counter}${ext}`);
    counter += 1;
  }
  return candidate;
}

export async function importFile(filePath: string, hotelId: string = HOTEL_ID) {
  const rawText = await fs.readFile(filePath, 'utf8');
  const parsed = parseInHouseReport(rawText, hotelId);

  if (parsed.rooms.length === 0) {
    throw new Error(`No rows parsed from ${filePath}. Check that the file is a valid Opera Guest In-house export.`);
  }

  const db = await getDb();
  const guestsCollection = db.collection('hotels').doc(hotelId).collection('guests');
  const metadataRef = db.collection('hotels').doc(hotelId).collection('metadata').doc('reports');

  const BATCH_SIZE = 400;
  const newRoomIds = new Set<string>();

  // 1. Perform SETS first in chunks of <= 400
  let setBatch = db.batch();
  let opCount = 0;

  for (const room of parsed.rooms) {
    const guest = buildGuestRecord(room, hotelId);
    newRoomIds.add(guest.roomNumber);
    setBatch.set(guestsCollection.doc(guest.roomNumber), {
      ...guest,
      lastUpdated: new Date(),
      vipStatus: guest.vipStatus ?? null,
      issueType: guest.issueType ?? null,
    });
    opCount++;

    if (opCount >= BATCH_SIZE) {
      await setBatch.commit();
      setBatch = db.batch();
      opCount = 0;
    }
  }

  if (opCount > 0) {
    await setBatch.commit();
  }

  // 2. Perform DELETES of old rooms no longer in the active export
  const existingDocs = await guestsCollection.listDocuments();
  let deleteBatch = db.batch();
  opCount = 0;

  for (const docRef of existingDocs) {
    if (!newRoomIds.has(docRef.id)) {
      deleteBatch.delete(docRef);
      opCount++;
      if (opCount >= BATCH_SIZE) {
        await deleteBatch.commit();
        deleteBatch = db.batch();
        opCount = 0;
      }
    }
  }

  if (opCount > 0) {
    await deleteBatch.commit();
  }

  // 3. Set metadata
  await metadataRef.set({
    date: businessDate(),
    lastUploaded: new Date(),
    uploadedBy: 'opera-automation',
  });

  log(`Imported ${parsed.rooms.length} rooms into hotel ${hotelId} from ${path.basename(filePath)}.`);
  return parsed;
}

export async function importDirectory(targetDir: string, hotelId: string = HOTEL_ID) {
  const entries = await fs.readdir(targetDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /\.(txt|csv)$/i.test(entry.name))
    .map((entry) => path.join(targetDir, entry.name));

  if (files.length === 0) {
    log(`No new Opera files found in ${targetDir}.`);
    return [];
  }

  const results: { file: string; stats: ReturnType<typeof parseInHouseReport>['stats'] }[] = [];

  for (const file of files) {
    const parsed = await importFile(file, hotelId);
    const archived = await archiveFile(file);
    results.push({ file: archived, stats: parsed.stats });
  }

  return results;
}

async function main() {
  const rawTarget = process.argv[2] ?? process.env.OPERA_IMPORT_DIR ?? DEFAULT_INCOMING_DIR;
  const resolvedTarget = path.resolve(process.cwd(), rawTarget);
  const hotelId = process.env.OPERA_HOTEL_ID ?? HOTEL_ID;

  if (await fileExists(resolvedTarget) && (await fs.stat(resolvedTarget)).isFile()) {
    await importFile(resolvedTarget, hotelId);
    await archiveFile(resolvedTarget);
    log(`Completed single-file import for ${resolvedTarget}.`);
    return;
  }

  if (!(await fileExists(resolvedTarget))) {
    await fs.mkdir(resolvedTarget, { recursive: true });
    log(`Created watch directory ${resolvedTarget}.`);
  }

  const results = await importDirectory(resolvedTarget, hotelId);
  if (results.length > 0) {
    console.table(results.map((result) => ({ file: path.basename(result.file), rooms: result.stats.totalRooms, breakfastPax: result.stats.totalBreakfastPax })));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[opera-import] Failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
