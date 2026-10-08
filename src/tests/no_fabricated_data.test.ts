import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join, relative, sep } from 'path';
import { OWNER_ADMIN_EMAILS, resolveRole } from '../lib/access';

/**
 * Architectural guards. The defects these protect against were wiring, not wrong outputs from a
 * function, so a unit test on a helper would not have caught any of them:
 *
 *  - sample guests written over the live list by four separate paths;
 *  - an empty `guests` snapshot replaced with seeded samples;
 *  - every write reporting success when Firestore refused it;
 *  - a hand-rolled local store that kept guest data in localStorage on shared tablets and served
 *    it back when a read was refused;
 *  - admin sessions handed out with no credential;
 *  - "historical" data generated with Math.random() and written to production.
 */

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

/**
 * Files the owner has been asked to approve deleting (the session's safety check blocked the
 * deletion). They are dead - excluded from the typecheck and imported by nothing - and these
 * guards make sure they stay that way.
 */
export const PENDING_DELETION = [
  'src/parsing/__fixtures__/sampleData.ts',
  'src/lib/excelFolderParser.ts',
  'src/components/BulkFolderUploader.tsx',
  'src/lib/historicalSeeder.ts',
  'src/components/AutomatedSyncManager.tsx',
  'src/components/DataQualityModal.tsx',
  'src/components/GuestSearch.tsx',
  'src/components/CheckInModal.tsx',
  'src/components/BatchCheckInModal.tsx',
  'src/components/ReportUploader.tsx',
  'src/components/OperaAuditModal.tsx',
];

const rel = (f: string) => relative(ROOT, f).split(sep).join('/');

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) && !PENDING_DELETION.includes(rel(full))) {
      acc.push(full);
    }
  }
  return acc;
}

const read = (f: string) => readFileSync(f, 'utf8').split('\r\n').join('\n');
const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const firebaseSource = () => withoutComments(read(join(SRC, 'firebase.ts')));

const files = sourceFiles(SRC);

describe('the guards are reading real source', () => {
  it('finds a non-trivial number of production modules', () => {
    expect(files.length).toBeGreaterThan(25);
    expect(firebaseSource()).toMatch(/initializeFirestore/);
  });
});

describe('no fabricated hotel data reaches production code', () => {
  it('nothing imports the sample fixtures or the files awaiting deletion', () => {
    const banned = /(?:from|import)\s*\(?\s*['"][^'"]*(?:__fixtures__\/sampleData|excelFolderParser|BulkFolderUploader|historicalSeeder|AutomatedSyncManager|DataQualityModal|GuestSearch|CheckInModal|BatchCheckInModal|ReportUploader|OperaAuditModal)['"]/;
    const offenders = files.filter((f) => banned.test(withoutComments(read(f)))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('no production module references the sample constants', () => {
    const offenders = files.filter((f) => /SAMPLE_(NOVOTEL|IBIS)_(GUESTS|FORECAST)/.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('no production module generates data with Math.random', () => {
    // The seeder and the bulk uploader wrote random VIP counts, random check-ins and random
    // forecasts to production. The one legitimate use is a unique suffix for audit-log ids.
    const offenders = files
      .filter((f) => /Math\.random\(\)/.test(withoutComments(read(f))))
      .map(rel)
      .filter((f) => f !== 'src/firebase.ts');
    expect(offenders).toEqual([]);
    expect(firebaseSource().match(/Math\.random\(\)/g) ?? []).toHaveLength(1);
  });
});

describe('the data layer is Firestore, not a stand-in', () => {
  const src = firebaseSource();

  it('has no local document store and writes no hotel data to localStorage', () => {
    expect(src).not.toMatch(/class\s+Local\w*Store/);
    expect(src).not.toMatch(/localStorage\.setItem/);
    expect(src).not.toMatch(/localStore\./);
  });

  it('re-exports the SDK readers instead of wrapping them in a cache fallback', () => {
    // The wrappers caught a refused read and answered from the local cache, so a signed-out
    // viewer could be shown data they were not allowed to read.
    expect(src).toMatch(/export\s*\{[^}]*\bgetDocs\b[^}]*\bonSnapshot\b[^}]*\}\s*from 'firebase\/firestore'/);
    expect(src).not.toMatch(/function getDocs|function getDoc\b|function onSnapshot/);
  });

  it('removes the old store\'s localStorage keys, which can hold guest names', () => {
    expect(src).toMatch(/opera_guest_checker_local_db_v4/);
    expect(src).toMatch(/removeItem\(key\)/);
  });

  it('uses Firestore\'s own offline cache, and clears it on sign-out', () => {
    expect(src).toMatch(/persistentLocalCache\(/);
    const signOut = src.slice(src.indexOf('export async function signOutAndClearDevice'));
    expect(signOut).toMatch(/clearIndexedDbPersistence\(db\)/);
  });

  it('a write that fails after the screen moved on is still reported', () => {
    const settle = src.slice(src.indexOf('export async function settleWrite'));
    expect(settle.slice(0, settle.indexOf('\n}\n'))).toMatch(/backgroundErrorListeners\.forEach/);
  });

  it('never attributes an audit entry to an account that did not act', () => {
    expect(src).not.toMatch(/system@novotel-chiangmai\.com/);
    expect(src).not.toMatch(/staff@novotel-chiangmai\.com/);
  });
});

describe('nobody gets authority without a credential', () => {
  it('no credential-free sign-in path exists anywhere', () => {
    for (const f of files) {
      const code = withoutComments(read(f));
      expect(code, rel(f)).not.toMatch(/signInAsAdmin|signInAsStaff|LocalAuthManager/);
    }
  });

  it('a failed Google sign-in propagates', () => {
    const fn = firebaseSource().slice(firebaseSource().indexOf('export async function signInWithGoogle'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toMatch(/await signInWithPopup/);
    expect(body).not.toMatch(/catch/);
  });

  it('no module decides access by substring', () => {
    for (const f of files) {
      expect(withoutComments(read(f)), rel(f)).not.toMatch(/includes\(\s*'(admin|manager)'\s*\)/);
    }
  });

  it('the owner can still sign in and is still an admin', () => {
    // The owner asked for this explicitly: jeromegathigi@gmail.com must keep working for now.
    expect(OWNER_ADMIN_EMAILS).toContain('jeromegathigi@gmail.com');
    expect(resolveRole({ email: 'jeromegathigi@gmail.com', emailVerified: true })).toBe('admin');
  });
});

/** Relative imports of a module, resolved to files. Type-only imports count: being strict costs nothing here. */
function localImports(file: string): string[] {
  const specs = [...withoutComments(read(file)).matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)].map((m) => m[1]);
  const resolved: string[] = [];
  for (const spec of specs) {
    const base = join(dirname(file), spec);
    const hit = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].map((ext) => base + ext).find((p) => existsSync(p) && statSync(p).isFile());
    if (hit) resolved.push(hit);
  }
  return resolved;
}

function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    if (/\.tsx?$/.test(f)) queue.push(...localImports(f));
  }
  return new Set([...seen].map(rel));
}

describe('the dev-only door preview stays out of the app', () => {
  // src/dev/doorPreview.tsx renders the door with invented "PREVIEW GUEST" rooms so the UI can be
  // reviewed without signing in. It must never be bundled into the app, and it must never be able
  // to write: nothing it loads may reach Firebase.
  it('nothing outside src/dev imports it, and the app entry does not load it', () => {
    const importsDev = /(?:from|import)\s*\(?\s*['"][^'"]*\/dev\/[^'"]*['"]/;
    const offenders = files.filter((f) => !rel(f).startsWith('src/dev/') && importsDev.test(withoutComments(read(f)))).map(rel);
    expect(offenders).toEqual([]);
    expect(read(join(ROOT, 'index.html'))).not.toMatch(/src\/dev|dev\//);
    expect(reachableFrom(join(SRC, 'main.tsx')).has('src/dev/doorPreview.tsx')).toBe(false);
  });

  it('cannot reach Firebase, even through the screens it renders', () => {
    const reached = reachableFrom(join(SRC, 'dev', 'doorPreview.tsx'));
    expect(reached.has('src/door/DoorView.tsx')).toBe(true); // the walk is really following imports
    expect([...reached].filter((f) => /firebase|firestoreActions|useDoorData|firestoreImport|firestoreOrders/.test(f))).toEqual([]);
  });

  it('every dev preview is equally cut off from Firebase', () => {
    const previews = readdirSync(join(SRC, 'dev')).filter((f) => /\.tsx?$/.test(f));
    expect(previews).toContain('ordersPreview.tsx');
    for (const p of previews) {
      const reached = reachableFrom(join(SRC, 'dev', p));
      expect([...reached].filter((f) => /firebase|firestore[A-Z]|useDoorData/.test(f)), p).toEqual([]);
    }
    expect(reachableFrom(join(SRC, 'dev', 'ordersPreview.tsx')).has('src/orders/OrdersView.tsx')).toBe(true);
  });
});
