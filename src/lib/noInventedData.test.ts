import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { assessFreshness } from './freshness';
import { parseInHouseReport } from '../parsing';
import { Guest } from '../types';

/**
 * Locks the nine audit findings fixed in this commit.
 *
 * Four of them were the same defect species: a falsy-`||` default inventing data that was then
 * displayed, divided by, or written to Firestore. `adults || 1` in three places and
 * `forecastCovers || 60` in a fourth. The project's own history records `adults || 1` being
 * deleted from the duplicate parser in `functions/` once already, and it was still live in
 * three files - so these are source-level guards, not just behavioural ones. A behavioural test
 * cannot stop somebody typing `|| 1` again.
 */

const SRC = join(process.cwd(), 'src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8').split('\r\n').join('\n');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Every production module under src/, excluding tests and the files awaiting deletion. */
function productionFiles(dir = SRC, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const relPath = full.slice(SRC.length + 1).split('\\').join('/');
    if (statSync(full).isDirectory()) productionFiles(full, acc);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) && !PENDING.includes(relPath)) acc.push(full);
  }
  return acc;
}

const PENDING = [
  'parsing/__fixtures__/sampleData.ts',
  'lib/excelFolderParser.ts',
  'components/BulkFolderUploader.tsx',
  'lib/historicalSeeder.ts',
  'components/AutomatedSyncManager.tsx',
  'components/DataQualityModal.tsx',
  'components/GuestSearch.tsx',
  'components/CheckInModal.tsx',
  'components/BatchCheckInModal.tsx',
  'components/ReportUploader.tsx',
  'components/OperaAuditModal.tsx',
];

const HEADER = [
  'RESORT', 'STAY_ROOMS', 'ROOM', 'ADULTS', 'CHILDREN', 'GUEST_NAME', 'RATE_CODE',
];
const row = (v: Record<string, string>) => HEADER.map((h) => v[h] ?? '').join('\t');
const tsv = (rows: string[]) => [HEADER.join('\t'), ...rows].join('\n');

describe('no headcount is ever invented', () => {
  it('no source file defaults a headcount to a number with a falsy ||', () => {
    // `adults || 1` was removed from three files and survived in a fourth; `occupiedPax || 2` and
    // `forecastMap[d] || 50` were further instances under other names. Scan every module.
    const banned = /\b(adults|children|infants|pax|occupants?|occupiedPax|assignPax|persons)\b[^;\n]{0,40}\|\|\s*[1-9]\d*\b/i;
    for (const f of productionFiles()) {
      const code = stripComments(readFileSync(f, 'utf8').split('\r\n').join('\n'));
      const match = code.match(banned);
      expect(match?.[0], `${f} invents a headcount: "${match?.[0]}"`).toBeUndefined();
    }
  });

  it('no screen invents a forecast, a capture rate or a peak hour', () => {
    // `forecastCovers || 60` was removed and `forecastMap[dateStr] || 50` survived beside it,
    // because the guard looked for one variable name. This one looks for the shape: any falsy
    // default to a positive number, and any hard-coded '08:00' fallback.
    for (const f of productionFiles().filter((x) => /Analytics|Forecast|analytics/.test(x))) {
      const code = stripComments(readFileSync(f, 'utf8').split('\r\n').join('\n'));
      expect(code, f).not.toMatch(/\|\|\s*[1-9]\d*\s*[;),\]}]/);
      expect(code, f).not.toMatch(/\|\|\s*'0?8:00'/);
    }
  });

  it('a zero-adult room contributes zero pax, not one', () => {
    // Room 108 on the real Novotel export is a live instance: a reservation with no guest
    // profile, parsed as adults 0 / children 0.
    const result = parseInHouseReport(
      tsv([
        row({ RESORT: 'HB4F8', STAY_ROOMS: '1', ROOM: '108', ADULTS: '0', CHILDREN: '0', GUEST_NAME: '' }),
        row({ RESORT: 'HB4F8', STAY_ROOMS: '1', ROOM: '109', ADULTS: '2', CHILDREN: '1', GUEST_NAME: 'REAL GUEST', RATE_CODE: 'RB1' }),
      ]),
      'novotel'
    );

    const empty = result.rooms.find((r) => r.roomNumber === '108');
    expect(empty?.adults).toBe(0);
    expect(empty?.children).toBe(0);
    expect(result.stats.totalGuests).toBe(3); // 2 + 1, with nothing from room 108
  });
});

describe('the parser reports entitlement, not occupancy', () => {
  it('splits breakfast into three buckets and has no single mislabelled total', () => {
    // `totalBreakfastPax` was (adults + children) for EVERY room with no entitlement check,
    // yet was written to metadata/reports as `totalEntitledBreakfast`. On the real Novotel
    // export it read 163 against Opera's own forecast of 98.
    const result = parseInHouseReport(
      tsv([
        row({ RESORT: 'HB4F8', STAY_ROOMS: '1', ROOM: '201', ADULTS: '2', GUEST_NAME: 'BB GUEST', RATE_CODE: 'RB1' }),
        row({ RESORT: 'HB4F8', STAY_ROOMS: '1', ROOM: '202', ADULTS: '2', GUEST_NAME: 'RO GUEST', RATE_CODE: 'RA1' }),
        row({ RESORT: 'HB4F8', STAY_ROOMS: '1', ROOM: '203', ADULTS: '3', GUEST_NAME: 'UNKNOWN CODE', RATE_CODE: 'C01MRO' }),
      ]),
      'novotel'
    );

    expect(result.stats).not.toHaveProperty('totalBreakfastPax');
    expect(result.stats.breakfastIncludedPax).toBe(2); // RB1 is BB in the referential
    expect(result.stats.breakfastExcludedPax).toBe(2); // RA1 is Room Only
    expect(result.stats.breakfastUnverifiedPax).toBe(3); // C01MRO is property-local
    expect(result.stats.breakfastUnverifiedCodes).toEqual(['C01MRO']);

    // The three buckets must account for everyone. Losing a room between them is the whole
    // failure mode.
    const { breakfastIncludedPax, breakfastExcludedPax, breakfastUnverifiedPax } = result.stats;
    expect(breakfastIncludedPax + breakfastExcludedPax + breakfastUnverifiedPax).toBe(
      result.stats.totalGuests
    );
  });
});

describe('failures reach the person at the door', () => {
  it('the check-in paths surface a rejected write instead of only logging it', () => {
    // The write wrappers reject now rather than resolving on failure. If the caller only
    // console.errors, the modal stops responding with no explanation and the host taps again.
    for (const f of ['components/CheckInModal.tsx', 'components/BatchCheckInModal.tsx']) {
      const code = read(f);
      expect(code, `${f} must hold an error message in state`).toMatch(/setErrorMessage\(/);
      expect(code, `${f} must render it`).toMatch(/role="alert"/);
    }
  });

  it('a permission error is not reported as a missing import', () => {
    const denied = assessFreshness({
      metadataDate: null,
      today: '2026-09-08',
      readError: { code: 'permission-denied', message: 'Missing or insufficient permissions.' },
    });

    expect(denied.level).toBe('critical');
    expect(denied.label).toBe('No access');
    expect(denied.message).toMatch(/permission/i);
    // The old message told staff to import, which would not have helped.
    expect(denied.message).not.toMatch(/Import this morning/);
    expect(denied.message).toMatch(/importing will not fix it/i);
  });

  it('still reports a genuinely missing import when the read succeeded', () => {
    const missing = assessFreshness({ metadataDate: null, today: '2026-09-08', readError: null });
    expect(missing.label).toBe('No data');
    // "has ever been imported", not "never been imported" - I have now got this string
    // backwards twice in this project, so it is quoted rather than paraphrased.
    expect(missing.message).toMatch(/has ever been imported/);
    expect(missing.message).toMatch(/Import this morning/);
  });

  it('distinguishes a non-permission read failure from both', () => {
    const broken = assessFreshness({
      metadataDate: null,
      today: '2026-09-08',
      readError: { code: 'unavailable', message: 'Backend unavailable' },
    });
    expect(broken.label).toBe('Cannot read');
    expect(broken.message).toMatch(/Backend unavailable/);
  });
});

describe('dead code does not linger', () => {
  it('src/lib/stats.ts is gone, and nothing references it', () => {
    // It held computeHouseStats, which had ZERO importers while carrying two of the bugs this
    // commit fixes - including folding the unverified bucket into "entitled". Repairing
    // unreachable code would have been theatre.
    expect(() => read('lib/stats.ts')).toThrow();

    for (const f of ['App.tsx', 'parsing/index.ts', 'lib/meals.ts']) {
      expect(read(f)).not.toMatch(/lib\/stats|computeHouseStats/);
    }
  });
});

/** Guard the guard: a broken helper would make the assertions above vacuous. */
describe('this test file is actually reading source', () => {
  it('finds real content in the files it checks', () => {
    expect(read('lib/meals.ts').length).toBeGreaterThan(1000);
    expect(stripComments(read('lib/meals.ts'))).toMatch(/assessBreakfast/);
  });

  it('strips comments so prose cannot satisfy or trip an assertion', () => {
    expect(stripComments('const a = 1; // adults || 1\n')).not.toMatch(/adults \|\| 1/);
    expect(stripComments('/* adults || 1 */ const b = 2;')).not.toMatch(/adults \|\| 1/);
    expect(stripComments('const c = adults || 1;')).toMatch(/adults \|\| 1/);
  });
});

/** Unused import guard so the Guest type import above is not dead. */
const _sample: Guest[] = [];
void _sample;

describe('the loading state is not a verdict', () => {
  it('the freshness banner has a state for "not yet known"', () => {
    // Without it, the mount state (metadataDate and readError both null) is indistinguishable
    // from a successful read of an empty property, and the banner told staff to import when
    // the real cause was authorisation. Verified in the browser: two consecutive frames of one
    // load gave contradictory instructions.
    const code = stripComments(read('lib/freshness.ts'));
    expect(code).toMatch(/metadataSettled/);
    expect(code).toMatch(/'pending'/);

    const app = stripComments(read('App.tsx'));
    // App must actually pass it, and must reset it when the property changes.
    expect(app).toMatch(/metadataSettled:\s*metaSettled/);
    expect(app).toMatch(/setMetaSettled\(false\)/);
    expect(app).toMatch(/setMetaSettled\(true\)/);
  });
});
