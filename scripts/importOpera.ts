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

let cachedDb: ReturnType<typeof getFirestore> | null = null;

async function getDb() {
  if (cachedDb) return cachedDb;

  const serviceAccount = await resolveServiceAccount();
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID;

  if (serviceAccount) {
    initializeApp({
      credential: cert(serviceAccount as any),
      projectId: (serviceAccount as any).project_id || projectId,
    });
    cachedDb = getFirestore();
    return cachedDb;
  }

  if (!projectId) {
    throw new Error('Missing Firebase configuration. Set VITE_FIREBASE_PROJECT_ID and either a service account or ADC credentials.');
  }

  initializeApp({
    projectId,
    credential: applicationDefault(),
  });

  cachedDb = getFirestore();
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
  const parsed = parseInHouseReport(rawText);

  if (parsed.rooms.length === 0) {
    throw new Error(`No rows parsed from ${filePath}. Check that the file is a valid Opera Guest In-house export.`);
  }

  const db = await getDb();
  const batch = db.batch();
  const guestsCollection = db.collection('hotels').doc(hotelId).collection('guests');
  const metadataRef = db.collection('hotels').doc(hotelId).collection('metadata').doc('reports');

  const existing = await guestsCollection.listDocuments();
  for (const guestDoc of existing) {
    batch.delete(guestDoc);
  }

  parsed.rooms.forEach((room) => {
    const guest = buildGuestRecord(room);
    batch.set(guestsCollection.doc(guest.roomNumber), {
      ...guest,
      lastUpdated: new Date(),
      vipStatus: guest.vipStatus ?? null,
      issueType: guest.issueType ?? null,
    });
  });

  batch.set(metadataRef, {
    date: businessDate(),
    lastUploaded: new Date(),
    uploadedBy: 'opera-automation',
  });

  await batch.commit();

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
