import { promises as fs } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
import { importFile } from './importOpera';

dotenv.config();
dotenv.config({ path: '.env.local' });

const WATCH_DIR = path.resolve(process.cwd(), process.env.OPERA_WATCH_DIR ?? 'opera-incoming');
const ARCHIVE_DIR = path.resolve(process.cwd(), process.env.OPERA_ARCHIVE_DIR ?? 'opera-processed');
const HOTEL_ID = process.env.OPERA_HOTEL_ID ?? 'novotel';

function log(message: string, ...args: unknown[]) {
  console.log(`[opera-watch][${new Date().toISOString()}] ${message}`, ...args);
}

async function ensureDirectories() {
  await fs.mkdir(WATCH_DIR, { recursive: true });
  await fs.mkdir(ARCHIVE_DIR, { recursive: true });
}

const seen = new Set<string>();

async function scanForFiles() {
  const entries = await fs.readdir(WATCH_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /\.(txt|csv)$/i.test(entry.name))
    .map((entry) => path.join(WATCH_DIR, entry.name));

  for (const file of files) {
    const stat = await fs.stat(file);
    const key = `${file}:${stat.mtimeMs}`;
    if (seen.has(key)) continue;

    seen.add(key);
    try {
      await importFile(file, HOTEL_ID);
      await fs.rename(file, path.join(ARCHIVE_DIR, path.basename(file)));
      log(`Imported and archived ${path.basename(file)}`);
    } catch (error) {
      console.error(`[opera-watch] Failed to process ${file}:`, error instanceof Error ? error.message : error);
    }
  }
}

async function startWatching() {
  await ensureDirectories();
  await scanForFiles();

  log(`Watching ${WATCH_DIR} for Opera Guest In-house exports. Archive: ${ARCHIVE_DIR}`);

  // Polling is reliable on Windows and avoids external dependencies.
  const interval = Number(process.env.OPERA_WATCH_INTERVAL_MS ?? 5000);
  setInterval(() => {
    void scanForFiles();
  }, interval);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startWatching().catch((error) => {
    console.error('[opera-watch] Startup failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
