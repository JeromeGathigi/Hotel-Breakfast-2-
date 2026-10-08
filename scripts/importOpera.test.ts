import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { directoryOptionsFromEnv, processDirectory, type FileOutcome, type ImportOptions } from './importOpera';

/** The folder handling, with the Firestore import replaced by a stub. No network, no credentials. */

let root: string;
const dir = (name: string) => path.join(root, name);
const list = async (name: string) => (await fs.readdir(dir(name)).catch(() => [] as string[])).sort();

const outcome = (status: FileOutcome['status'], reasons: string[] = []): FileOutcome => ({
  status,
  kind: 'guest-list',
  hotelId: 'novotel',
  summary: status,
  warnings: [],
  reasons,
});

const options = (over = {}) =>
  directoryOptionsFromEnv({ processedDir: dir('processed'), rejectedDir: dir('rejected'), settleMs: 0, maxAttempts: 2, ...over });

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'opera-import-test-'));
  await fs.mkdir(dir('incoming'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe('processDirectory', () => {
  it('moves an imported file to processed, and a refused one aside with its reasons', async () => {
    await fs.writeFile(dir('incoming/good.txt'), 'x');
    await fs.writeFile(dir('incoming/stale.txt'), 'x');
    await fs.writeFile(dir('incoming/notes.pdf'), 'x'); // not an Opera export: left alone
    const stub = async (file: string) =>
      path.basename(file) === 'good.txt' ? outcome('imported') : outcome('refused', ["This is not today's list"]);

    await processDirectory(dir('incoming'), options(), new Map(), stub);

    expect(await list('incoming')).toEqual(['notes.pdf']);
    expect(await list('processed')).toEqual(['good.txt']);
    expect(await list('rejected')).toEqual(['stale.txt', 'stale.txt.reason.txt']);
    expect(await fs.readFile(dir('rejected/stale.txt.reason.txt'), 'utf8')).toMatch(/- This is not today's list/);
  });

  it('never overwrites an earlier file of the same name', async () => {
    await fs.mkdir(dir('processed'));
    await fs.writeFile(dir('processed/list.txt'), 'yesterday');
    await fs.writeFile(dir('incoming/list.txt'), 'today');
    await processDirectory(dir('incoming'), options(), new Map(), async () => outcome('imported'));
    expect(await list('processed')).toEqual(['list-1.txt', 'list.txt']);
    expect(await fs.readFile(dir('processed/list.txt'), 'utf8')).toBe('yesterday');
  });

  it('retries a failing file, then sets it aside instead of failing forever', async () => {
    await fs.writeFile(dir('incoming/flaky.txt'), 'x');
    const failures = new Map<string, number>();
    const boom = async () => {
      throw new Error('PERMISSION_DENIED');
    };
    await processDirectory(dir('incoming'), options(), failures, boom);
    expect(await list('incoming')).toEqual(['flaky.txt']); // first failure: kept for the next pass
    await processDirectory(dir('incoming'), options(), failures, boom);
    expect(await list('incoming')).toEqual([]);
    expect(await fs.readFile(dir('rejected/flaky.txt.reason.txt'), 'utf8')).toMatch(/Failed 2 times\. Last error: PERMISSION_DENIED/);
  });

  it('skips a file that is still being written', async () => {
    await fs.writeFile(dir('incoming/fresh.txt'), 'x');
    const seen: string[] = [];
    await processDirectory(dir('incoming'), options({ settleMs: 60_000 }), new Map(), async (f: string) => {
      seen.push(f);
      return outcome('imported');
    });
    expect(seen).toEqual([]);
    expect(await list('incoming')).toEqual(['fresh.txt']);
  });

  it('a dry run reads every file and moves none', async () => {
    await fs.writeFile(dir('incoming/a.txt'), 'x');
    await fs.writeFile(dir('incoming/b.txt'), 'x');
    const seen: ImportOptions[] = [];
    await processDirectory(dir('incoming'), options({ dryRun: true }), new Map(), async (_f: string, o: ImportOptions) => {
      seen.push(o);
      return outcome('refused', ['needs --accept']);
    });
    expect(seen).toHaveLength(2);
    expect(await list('incoming')).toEqual(['a.txt', 'b.txt']);
    expect(await list('rejected')).toEqual([]);
  });

  it('ignores an OPERA_HOTEL_ID that is not a hotel - the project id the old importer wrote guests under', () => {
    const before = process.env.OPERA_HOTEL_ID;
    process.env.OPERA_HOTEL_ID = 'polished-bonfire-cdtd0';
    try {
      expect(directoryOptionsFromEnv().configuredHotel).toBeNull();
      process.env.OPERA_HOTEL_ID = 'IBIS';
      expect(directoryOptionsFromEnv().configuredHotel).toBe('ibis');
    } finally {
      if (before === undefined) delete process.env.OPERA_HOTEL_ID;
      else process.env.OPERA_HOTEL_ID = before;
    }
  });
});
