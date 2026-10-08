import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describeCredential } from './lib/adminApp';
import { directoryOptionsFromEnv, processDirectory } from './importOpera';

/**
 * Watches a folder and imports every Opera export dropped into it - scripts/importOpera.ts on a loop.
 *
 *     npm run opera:watch
 *
 * OPERA_IMPORT_DIR        folder to watch (default ./opera-incoming)
 * OPERA_ARCHIVE_DIR       imported files go here (default ./opera-processed)
 * OPERA_REJECTED_DIR      refused files go here, with a .reason.txt (default ./opera-rejected)
 * OPERA_HOTEL_ID          novotel or ibis - only for files that cannot say which hotel they are
 * OPERA_POLL_INTERVAL_MS  pause between passes (default 10000)
 * OPERA_SETTLE_MS         skip files modified more recently than this (default 5000)
 *
 * Unattended means no one can tick a confirmation, so anything the Import screen would ask about -
 * yesterday's list, a list half the size of the last one - is refused and moved aside, never
 * imported. Passes never overlap: the next one starts only after the previous has finished.
 * Ctrl+C once finishes the current pass and exits; twice exits at once.
 */

const incoming = path.resolve(process.cwd(), process.env.OPERA_IMPORT_DIR ?? 'opera-incoming');
const intervalMs = Math.max(1000, Number(process.env.OPERA_POLL_INTERVAL_MS) || 10_000);
const settleMs = Math.max(0, Number(process.env.OPERA_SETTLE_MS ?? 5_000) || 0);

let stopping = false;
process.on('SIGINT', () => {
  if (stopping) process.exit(130);
  stopping = true;
  console.log('[opera-watch] Stopping after the current pass. Ctrl+C again to exit now.');
});

async function run() {
  const opts = directoryOptionsFromEnv({ settleMs });
  await fs.mkdir(incoming, { recursive: true });
  console.log(`[opera-watch] ${await describeCredential()}`);
  console.log(`[opera-watch] Watching ${incoming} every ${intervalMs / 1000}s. Imported -> ${opts.processedDir}; refused -> ${opts.rejectedDir}`);

  const failures = new Map<string, number>();
  while (!stopping) {
    try {
      await processDirectory(incoming, opts, failures);
    } catch (error) {
      console.error('[opera-watch] Pass failed:', error instanceof Error ? error.message : error);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

run().catch((error) => {
  console.error('[opera-watch] Fatal:', error instanceof Error ? error.message : error);
  process.exit(1);
});
