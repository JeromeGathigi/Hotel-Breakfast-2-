import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { describeCredential, getDb, scriptIdentity } from './lib/adminApp';
import { executeOps, readArchiveInputs, readCurrentList, writeAudit } from './lib/adminImport';
import { HOTEL_IDS, asHotelId, decodeExport, operaFileKind, pickForecastPlan, routeGuestList, type OperaFileKind } from './lib/routing';
import { businessDate } from '../src/lib/businessDate';
import { toJsDate } from '../src/lib/dates';
import { parseInHouseReport } from '../src/parsing';
import { buildForecastImportOps, buildGuestImportOps, planForecastImport, planGuestListImport, type HotelId } from '../src/lib/guestImport';

/**
 * Imports Opera exports into Firestore without the app: the same plan, checks and ordered writes
 * as the Import & export screen (src/lib/guestImport.ts), executed with the Admin SDK.
 *
 *     npm run opera:import -- <file or folder> [--hotel=novotel|ibis] [--accept] [--dry-run]
 *
 * - The kind of file is read from its content: a "Guests INH - By Room" guest list, or a package
 *   forecast. The hotel comes from the file (the guest list's RESORT column; the forecast's
 *   reservations); --hotel or OPERA_HOTEL_ID only fills in when the file cannot say.
 * - Anything the Import screen would ask a person to confirm - a list that is not today's, a list
 *   that shrank by half, a file with no RESORT column - is refused unless --accept is given.
 * - --dry-run reads Firestore and prints the plan; it writes nothing and moves nothing.
 *
 * A folder is processed oldest file first. Imported files move to OPERA_ARCHIVE_DIR
 * (opera-processed); refused ones move to OPERA_REJECTED_DIR (opera-rejected) with a .reason.txt
 * beside them, so a refused file is never retried silently. A single file named on the command line
 * is left where it is when refused, for the operator to re-run.
 *
 * The folders hold guest names and are git-ignored. Credentials: see scripts/lib/adminApp.ts.
 */

export interface ImportOptions {
  /** --hotel. Checked against the file and refused if it disagrees - never trusted over it. */
  hotel: HotelId | null;
  /** OPERA_HOTEL_ID. Used only when the file itself cannot say which hotel it is. */
  configuredHotel: HotelId | null;
  /** --accept: the operator has read the confirmations and accepts them. */
  accept: boolean;
  /** --dry-run: plan and print; write nothing. */
  dryRun: boolean;
  /** Business date; defaults to now in Bangkok (04:00 rollover). */
  today?: string;
}

/** Flat on purpose: the project compiles without `strict`, where union narrowing is unreliable. */
export interface FileOutcome {
  status: 'imported' | 'planned' | 'refused';
  kind: OperaFileKind;
  hotelId: HotelId | null;
  summary: string;
  warnings: string[];
  /** Why the file was refused, or what --accept would accept. Empty unless refused. */
  reasons: string[];
}

const HOTEL_HINT = 'Re-run with --hotel=novotel or --hotel=ibis, or set OPERA_HOTEL_ID.';

function log(message: string) {
  console.log(`[opera-import][${new Date().toISOString()}] ${message}`);
}

function refused(kind: OperaFileKind, hotelId: HotelId | null, reasons: string[], warnings: string[] = [], summary = 'refused'): FileOutcome {
  return { status: 'refused', kind, hotelId, summary, warnings, reasons };
}

export async function processFile(filePath: string, opts: ImportOptions): Promise<FileOutcome> {
  const filename = path.basename(filePath);
  const rawText = decodeExport(await fs.readFile(filePath));
  const today = opts.today ?? businessDate();
  const db = await getDb();
  return operaFileKind(rawText) === 'package-forecast'
    ? importForecast(db, rawText, filename, today, opts)
    : importGuestList(db, rawText, filename, today, opts);
}

async function importGuestList(db: Firestore, rawText: string, filename: string, today: string, opts: ImportOptions): Promise<FileOutcome> {
  // Rows without a RESORT value take this hotel; when the file has RESORT values they win.
  const parsed = parseInHouseReport(rawText, opts.hotel ?? opts.configuredHotel ?? 'novotel', { today });
  const route = routeGuestList(parsed, opts.hotel, opts.configuredHotel);
  if (!route.hotelId) return refused('guest-list', null, [`${route.reason} ${HOTEL_HINT}`]);
  const hotelId = route.hotelId;

  const current = await readCurrentList(db, hotelId);
  const plan = planGuestListImport({
    parsed,
    filename,
    rawText,
    targetHotelId: hotelId,
    today,
    current: { roomIds: current.guests.map((g) => g.roomNumber), metadataDate: current.metadataDate },
    packages: current.packages,
  });
  if (!plan.ok) return refused('guest-list', hotelId, [plan.reason]);

  const summary =
    `${plan.rooms.length} rooms into ${hotelId}: ${plan.addedRoomIds.length} arrived, ${plan.removedRoomIds.length} departed` +
    (plan.archiveDate ? `, the ${plan.archiveDate} list archived first` : '') +
    `; breakfast ${plan.stats.totalEntitledBreakfast} pax confirmed, ${plan.stats.totalUnverifiedBreakfast ?? 0} to check`;
  if (plan.confirmations.length && !opts.accept) {
    return refused('guest-list', hotelId, plan.confirmations, plan.warnings, `needs --accept (${summary})`);
  }
  if (opts.dryRun) return { status: 'planned', kind: 'guest-list', hotelId, summary, warnings: plan.warnings, reasons: [] };

  const identity = await scriptIdentity();
  const archive = plan.archiveDate ? await readArchiveInputs(db, hotelId, plan.archiveDate) : { checkins: [], overrides: [] };
  const ops = buildGuestImportOps(plan, {
    filename,
    importedBy: identity,
    today,
    currentGuests: current.guests,
    archiveCheckins: archive.checkins,
    overrides: archive.overrides,
    packages: current.packages,
    timestamp: FieldValue.serverTimestamp(),
    toDate: toJsDate,
  });
  await executeOps(db, ops);
  const warnings = [...plan.warnings, ...(await audit(db, hotelId, `Imported "${filename}": ${summary}`, identity))];
  return { status: 'imported', kind: 'guest-list', hotelId, summary, warnings, reasons: [] };
}

async function importForecast(db: Firestore, rawText: string, filename: string, today: string, opts: ImportOptions): Promise<FileOutcome> {
  // The forecast names no property: compare its reservations with BOTH hotels' current lists.
  const lists = await Promise.all(HOTEL_IDS.map((h) => readCurrentList(db, h)));
  const currentResvIds: Partial<Record<HotelId, string[]>> = {};
  HOTEL_IDS.forEach((h, i) => (currentResvIds[h] = lists[i].guests.map((g) => g.resvNameId).filter(Boolean)));

  const targets = opts.hotel ? [opts.hotel] : [...HOTEL_IDS];
  const plans = targets.map((h) => planForecastImport({ rawText, filename, targetHotelId: h, today, currentResvIds }));
  const { plan, reason } = pickForecastPlan(plans, opts.configuredHotel);
  if (!plan) return refused('package-forecast', null, [opts.hotel ? reason : `${reason} ${HOTEL_HINT}`]);
  if (!plan.ok) return refused('package-forecast', plan.hotelId, [plan.reason]);

  const summary =
    `${plan.forecastDocs.length} days into ${plan.hotelId}` +
    (plan.index ? `, packages for ${plan.index.reservations} reservations` : '') +
    (plan.todayBreakfast !== null ? `; ${plan.todayBreakfast} breakfasts forecast for ${today}` : '');
  if (plan.confirmations.length && !opts.accept) {
    return refused('package-forecast', plan.hotelId, plan.confirmations, plan.warnings, `needs --accept (${summary})`);
  }
  if (opts.dryRun) return { status: 'planned', kind: 'package-forecast', hotelId: plan.hotelId, summary, warnings: plan.warnings, reasons: [] };

  const identity = await scriptIdentity();
  await executeOps(db, buildForecastImportOps(plan, { importedBy: identity, timestamp: FieldValue.serverTimestamp() }));
  const warnings = [...plan.warnings, ...(await audit(db, plan.hotelId, `Imported package forecast "${filename}": ${summary}`, identity))];
  return { status: 'imported', kind: 'package-forecast', hotelId: plan.hotelId, summary, warnings, reasons: [] };
}

/** The import has already landed; a failed audit entry is reported, not turned into a failed import that would be retried. */
async function audit(db: Firestore, hotelId: HotelId, details: string, identity: string): Promise<string[]> {
  try {
    await writeAudit(db, hotelId, details, identity, FieldValue.serverTimestamp(), { source: 'scripts/importOpera.ts' });
    return [];
  } catch (error) {
    return [`The import was written, but its audit-log entry failed: ${(error as Error)?.message ?? error}`];
  }
}

/* =========================================================================
   FILES AND FOLDERS
   ========================================================================= */

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/** Moves a file into `dir` without overwriting anything already there. */
export async function moveInto(dir: string, filePath: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  let target = path.join(dir, `${base}${ext}`);
  for (let n = 1; await exists(target); n++) target = path.join(dir, `${base}-${n}${ext}`);
  try {
    await fs.rename(filePath, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    await fs.copyFile(filePath, target); // another drive: rename cannot cross it
    await fs.unlink(filePath);
  }
  return target;
}

async function quarantine(dir: string, filePath: string, reasons: string[]): Promise<string> {
  const target = await moveInto(dir, filePath);
  const note = [`${path.basename(filePath)} was not imported (${new Date().toISOString()}):`, '', ...reasons.map((r) => `- ${r}`), ''];
  await fs.writeFile(`${target}.reason.txt`, note.join('\n'), 'utf8');
  return target;
}

export function report(file: string, outcome: FileOutcome) {
  const name = path.basename(file);
  const what = outcome.kind === 'package-forecast' ? 'forecast' : 'guest list';
  if (outcome.status === 'refused') {
    log(`REFUSED ${what} ${name}: ${outcome.summary}`);
    outcome.reasons.forEach((r) => log(`  - ${r}`));
  } else {
    log(`${outcome.status === 'planned' ? 'DRY RUN' : 'Imported'} ${what} ${name}: ${outcome.summary}`);
  }
  outcome.warnings.forEach((w) => log(`  note: ${w}`));
}

export interface DirectoryOptions extends ImportOptions {
  processedDir: string;
  rejectedDir: string;
  /** Files modified more recently than this are skipped: Opera may still be writing them. */
  settleMs: number;
  /** A file that keeps failing (not refusing) is quarantined after this many attempts. */
  maxAttempts: number;
}

const OPERA_FILE = /\.(txt|tsv|csv)$/i;

/**
 * One pass over a folder. `failures` carries attempt counts between passes of the watcher;
 * `processOne` is replaceable so the file handling can be tested without Firestore.
 */
export async function processDirectory(
  dir: string,
  opts: DirectoryOptions,
  failures = new Map<string, number>(),
  processOne: (file: string, opts: ImportOptions) => Promise<FileOutcome> = processFile
): Promise<FileOutcome[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: { file: string; mtime: number }[] = [];
  for (const e of entries) {
    if (!e.isFile() || !OPERA_FILE.test(e.name)) continue;
    const file = path.join(dir, e.name);
    files.push({ file, mtime: (await fs.stat(file)).mtimeMs });
  }
  files.sort((a, b) => a.mtime - b.mtime); // a backlog imports in the order Opera produced it

  const outcomes: FileOutcome[] = [];
  for (const { file, mtime } of files) {
    // Only when asked: NTFS times have sub-millisecond precision, so a file written this millisecond
    // can look newer than Date.now() and would be skipped even with settleMs = 0.
    if (opts.settleMs > 0 && Date.now() - mtime < opts.settleMs) continue;
    try {
      const outcome = await processOne(file, opts);
      report(file, outcome);
      outcomes.push(outcome);
      failures.delete(file);
      if (opts.dryRun) continue;
      if (outcome.status === 'imported') await moveInto(opts.processedDir, file);
      else if (outcome.status === 'refused') log(`  moved to ${await quarantine(opts.rejectedDir, file, outcome.reasons)}`);
    } catch (error) {
      const attempts = (failures.get(file) ?? 0) + 1;
      failures.set(file, attempts);
      const message = (error as Error)?.message ?? String(error);
      log(`FAILED ${path.basename(file)} (attempt ${attempts} of ${opts.maxAttempts}): ${message}`);
      if (attempts >= opts.maxAttempts && !opts.dryRun) {
        failures.delete(file);
        log(`  moved to ${await quarantine(opts.rejectedDir, file, [`Failed ${attempts} times. Last error: ${message}`])}`);
      }
    }
  }
  return outcomes;
}

/* =========================================================================
   COMMAND LINE
   ========================================================================= */

export function directoryOptionsFromEnv(overrides: Partial<DirectoryOptions> = {}): DirectoryOptions {
  const configured = process.env.OPERA_HOTEL_ID;
  if (configured && !asHotelId(configured)) {
    log(`OPERA_HOTEL_ID="${configured}" is not novotel or ibis and is ignored. Files must name their hotel.`);
  }
  return {
    hotel: null,
    configuredHotel: asHotelId(configured),
    accept: false,
    dryRun: false,
    processedDir: path.resolve(process.cwd(), process.env.OPERA_ARCHIVE_DIR ?? 'opera-processed'),
    rejectedDir: path.resolve(process.cwd(), process.env.OPERA_REJECTED_DIR ?? 'opera-rejected'),
    settleMs: 0,
    maxAttempts: 5,
    ...overrides,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  const unknown = args.filter((a) => a.startsWith('--') && !/^--(hotel=.+|accept|dry-run)$/.test(a));
  if (unknown.length) throw new Error(`Unknown option ${unknown.join(' ')}. Options: --hotel=novotel|ibis --accept --dry-run`);

  const hotelArg = flag('hotel')?.split('=')[1];
  const hotel = hotelArg === undefined ? null : asHotelId(hotelArg);
  if (hotelArg !== undefined && !hotel) throw new Error(`--hotel must be novotel or ibis, not "${hotelArg}".`);

  const opts = directoryOptionsFromEnv({ hotel, accept: Boolean(flag('accept')), dryRun: Boolean(flag('dry-run')) });
  const target = path.resolve(process.cwd(), args.find((a) => !a.startsWith('--')) ?? process.env.OPERA_IMPORT_DIR ?? 'opera-incoming');

  log(`${await describeCredential()}${opts.dryRun ? ' - DRY RUN, nothing will be written' : ''}`);

  if ((await exists(target)) && (await fs.stat(target)).isFile()) {
    const outcome = await processFile(target, opts);
    report(target, outcome);
    if (outcome.status === 'imported') log(`  moved to ${await moveInto(opts.processedDir, target)}`);
    if (outcome.status === 'refused') process.exitCode = 2;
    return;
  }

  if (!(await exists(target))) {
    await fs.mkdir(target, { recursive: true });
    log(`Created ${target}. Drop Opera exports here and run again.`);
    return;
  }
  const outcomes = await processDirectory(target, opts);
  if (outcomes.length === 0) log(`No Opera files in ${target}.`);
  if (outcomes.some((o) => o.status === 'refused')) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[opera-import] Failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
