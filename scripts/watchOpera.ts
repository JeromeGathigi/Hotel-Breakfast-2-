import path from 'node:path';
import dotenv from 'dotenv';
import { importDirectory } from './importOpera';

dotenv.config();
dotenv.config({ path: '.env.local' });

const HOTEL_ID = process.env.OPERA_HOTEL_ID ?? process.env.VITE_FIREBASE_PROJECT_ID ?? 'novotel';
const INCOMING_DIR = path.resolve(process.cwd(), process.env.OPERA_IMPORT_DIR ?? 'opera-incoming');
const POLL_INTERVAL_MS = parseInt(process.env.OPERA_POLL_INTERVAL_MS ?? '10000', 10);

async function runWatcher() {
  console.log(`[opera-watch] Watching incoming folder: ${INCOMING_DIR} every ${POLL_INTERVAL_MS / 1000}s`);

  const poll = async () => {
    try {
      await importDirectory(INCOMING_DIR, HOTEL_ID);
    } catch (err) {
      console.error('[opera-watch] Error during directory import:', err instanceof Error ? err.message : err);
    }
  };

  await poll();
  setInterval(poll, POLL_INTERVAL_MS);
}

runWatcher().catch((err) => {
  console.error('[opera-watch] Fatal error:', err);
  process.exit(1);
});
