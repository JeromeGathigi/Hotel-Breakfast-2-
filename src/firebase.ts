import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Auth,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
  clearIndexedDbPersistence,
  setDoc as fbSetDoc,
  updateDoc as fbUpdateDoc,
  writeBatch as fbWriteBatch,
  serverTimestamp,
  doc,
  type DocumentReference,
  type Firestore,
  type SetOptions,
  type WriteBatch,
} from 'firebase/firestore';
import firebaseConfigJson from '../firebase-applet-config.json';
import type { AuditLogEntry } from './types';
import { bangkokTime, formatBusinessDateDisplay, bangkokCalendarDate } from './lib/businessDate';

/**
 * The data layer: the real Firebase SDK and nothing pretending to be it.
 *
 * This file used to be an AI Studio demo harness - a hand-rolled `LocalReactiveStore` mirrored
 * every write into localStorage and served it back whenever a Firestore read failed. In practice:
 *  - guest names and check-ins persisted in the browser's localStorage on shared door tablets,
 *    and were never cleared on sign-out;
 *  - a read that Firestore REFUSED (e.g. signed out) was answered from that cache, so a signed-out
 *    viewer could be shown data they were not allowed to read;
 *  - an empty server answer was replaced with cached data, showing stale lists as current.
 * All of that is gone. Reads and writes go to Firestore; errors reach the caller.
 *
 * Offline at the door is handled by Firestore's own persistent cache instead: the list stays
 * readable through a Wi-Fi drop and a page reload, and check-ins made offline are queued and sent
 * when the connection returns. Sign-out clears that cache.
 */

const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const configJson = firebaseConfigJson as Record<string, string | undefined>;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || configJson.apiKey || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || configJson.authDomain || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || configJson.projectId || '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || configJson.storageBucket || '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || configJson.messagingSenderId || '',
  appId: env.VITE_FIREBASE_APP_ID || configJson.appId || '',
};

/**
 * The project's Firestore database is a NAMED database. There is no `(default)` database in this
 * project, so connecting without the id silently talks to nothing.
 */
export const firestoreDatabaseId: string =
  env.VITE_FIREBASE_DATABASE_ID || configJson.firestoreDatabaseId || '';

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firestoreDatabaseId);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

if (isFirebaseConfigured) {
  const existing = getApps()[0];
  app = existing ?? initializeApp(firebaseConfig);
  authInstance = getAuth(app);
  // initializeFirestore may run only once per app. When this module is re-evaluated (Vite hot
  // reload) the app already exists, so take the instance it already has - with the same cache.
  dbInstance = existing
    ? getFirestore(app, firestoreDatabaseId)
    : initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }, firestoreDatabaseId);
}

/**
 * Non-null by construction everywhere the app renders data: App.tsx shows a configuration error
 * and renders nothing else when `isFirebaseConfigured` is false.
 */
export const auth = authInstance as Auth;
export const db = dbInstance as Firestore;

export {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';

/* =========================================================================
   WRITES
   ========================================================================= */

/**
 * Firestore rejects `undefined` field values. Convert them to null so a missing optional field
 * clears the stored value rather than failing the write (the spec's sanitize() rule, section 13).
 */
export function sanitizeData<T>(obj: T): T {
  if (obj === undefined) return null as T;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => (v === undefined ? null : sanitizeData(v))) as T;
  // Only plain objects are walked. Everything else - Date, Timestamp, the serverTimestamp()
  // sentinel, document references - is a class instance Firestore understands as-is.
  const proto = Object.getPrototypeOf(obj);
  if (proto !== Object.prototype && proto !== null) return obj;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) out[k] = v === undefined ? null : sanitizeData(v);
  return out as T;
}

/** Any document shape: typed interfaces (Guest, CheckIn, ...) as well as ad-hoc objects. */
type DocData = object;

export function setDoc(ref: DocumentReference, data: DocData, options?: SetOptions): Promise<void> {
  const clean = sanitizeData(data) as Record<string, unknown>;
  return options ? fbSetDoc(ref, clean, options) : fbSetDoc(ref, clean);
}

export function updateDoc(ref: DocumentReference, data: DocData): Promise<void> {
  return fbUpdateDoc(ref, sanitizeData(data) as Record<string, unknown>);
}

/** A WriteBatch whose set/update sanitise their data the same way. */
export function writeBatch(firestore: Firestore = db): WriteBatch {
  const batch = fbWriteBatch(firestore);
  const set = batch.set.bind(batch) as (ref: DocumentReference, data: unknown, options?: SetOptions) => WriteBatch;
  const update = batch.update.bind(batch) as (ref: DocumentReference, data: unknown) => WriteBatch;
  (batch as unknown as { set: unknown }).set = (ref: DocumentReference, data: unknown, options?: SetOptions) =>
    options ? set(ref, sanitizeData(data), options) : set(ref, sanitizeData(data));
  (batch as unknown as { update: unknown }).update = (ref: DocumentReference, data: unknown) => update(ref, sanitizeData(data));
  return batch;
}

/** Chunks a long list of operations into batches below Firestore's 500-operation cap. */
export async function commitInChunks(
  ops: Array<(batch: WriteBatch) => void>,
  chunkSize = 400
): Promise<void> {
  for (let i = 0; i < ops.length; i += chunkSize) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + chunkSize)) op(batch);
    await batch.commit();
  }
}

/* =========================================================================
   OFFLINE-TOLERANT WRITES FOR THE DOOR
   ========================================================================= */

export interface BackgroundWriteError {
  label: string;
  error: unknown;
}

const backgroundErrorListeners = new Set<(e: BackgroundWriteError) => void>();

/** Subscribe to writes that failed AFTER the screen had already moved on. */
export function onBackgroundWriteError(cb: (e: BackgroundWriteError) => void): () => void {
  backgroundErrorListeners.add(cb);
  return () => backgroundErrorListeners.delete(cb);
}

/**
 * Waits for a write, but not forever.
 *
 * Firestore resolves a write only when the SERVER acknowledges it. Offline, the write is applied
 * to the local cache immediately (every listener shows it) but the promise stays pending until the
 * connection returns - so awaiting it left the check-in modal spinning at the door while the guest
 * waited. After `timeoutMs` this returns 'queued' and the caller can move on; if the write later
 * fails, every `onBackgroundWriteError` listener hears about it, so it is never silently lost.
 * A failure inside the timeout (e.g. permission denied) still rejects to the caller.
 */
export async function settleWrite(write: Promise<unknown>, label: string, timeoutMs = 4000): Promise<'saved' | 'queued'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const queued = new Promise<'queued'>((resolve) => {
    timer = setTimeout(() => resolve('queued'), timeoutMs);
  });
  const saved = write.then(() => 'saved' as const);
  const outcome = await Promise.race([saved, queued]).finally(() => clearTimeout(timer));
  if (outcome === 'queued') {
    saved.catch((error) => backgroundErrorListeners.forEach((cb) => cb({ label, error })));
  }
  return outcome;
}

/* =========================================================================
   AUTH
   ========================================================================= */

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/** Google sign-in. Every failure propagates - none of them becomes a session. */
export async function signInWithGoogle(): Promise<void> {
  if (!isFirebaseConfigured) throw new Error('Firebase is not configured for this build.');
  await signInWithPopup(auth, googleProvider);
}

/**
 * localStorage keys the old local store used. They can hold guest names and check-ins from
 * earlier versions of this app, on a shared device, so they are removed on every start.
 */
const LEGACY_LOCAL_KEYS = ['opera_guest_checker_local_db_v4', 'opera_guest_checker_active_user_v4'];

export function purgeLegacyLocalData(): void {
  try {
    for (const key of LEGACY_LOCAL_KEYS) window.localStorage.removeItem(key);
  } catch {
    // Storage blocked (private mode): there is nothing to purge either.
  }
}

/**
 * Signs out and removes this device's cached copy of the hotel data. Firestore's cache can only
 * be cleared once the instance is terminated, so the page reloads afterwards.
 */
export async function signOutAndClearDevice(): Promise<void> {
  try {
    await firebaseSignOut(auth);
  } finally {
    try {
      await terminate(db);
      await clearIndexedDbPersistence(db);
    } catch (error) {
      // Another tab still holds the cache open. The session is ended either way; the cache is
      // cleared by the last tab to sign out.
      console.error('Could not clear the offline cache on this device:', error);
    }
    purgeLegacyLocalData();
    window.location.reload();
  }
}

/* =========================================================================
   AUDIT TRAIL
   ========================================================================= */

/**
 * Appends to hotels/{hotelId}/auditLogs. Never fatal: a failed audit write must not stop a guest
 * being served - but it is reported, because the audit trail now has a gap.
 *
 * Attribution is the signed-in account and nothing else. This used to fall back to
 * 'system@novotel-chiangmai.com' when nobody was signed in, recording an action against an
 * account that did not perform it.
 */
export async function logOperaAuditTrail(
  hotelId: string,
  action: AuditLogEntry['action'],
  details: string,
  roomNumber?: string,
  guestName?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const user = auth?.currentUser;
  if (!user?.email) {
    console.error(`Audit entry not written - nobody is signed in: ${action} ${details}`);
    return;
  }
  const logId = `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await setDoc(doc(db, 'hotels', hotelId, 'auditLogs', logId), {
      id: logId,
      hotelId,
      timestamp: serverTimestamp(),
      userEmail: user.email,
      userName: user.displayName || user.email.split('@')[0],
      action,
      roomNumber: roomNumber ?? null,
      guestName: guestName ?? null,
      details,
      metadata: metadata ?? {},
    });
  } catch (error) {
    console.error('Audit trail write FAILED - the audit log is now incomplete:', error);
  }
}

/* =========================================================================
   DATES (always Asia/Bangkok, never the viewer's timezone)
   ========================================================================= */

export function toJsDate(value: unknown): Date | null {
  if (!value) return null;
  try {
    const v = value as { toDate?: () => Date; seconds?: number; nanoseconds?: number };
    if (typeof v.toDate === 'function') {
      const d = v.toDate();
      return isNaN(d.getTime()) ? null : d;
    }
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof v.seconds === 'number') {
      const d = new Date(v.seconds * 1000 + (v.nanoseconds || 0) / 1e6);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
  } catch {
    return null;
  }
  return null;
}

/** "07:42" in Bangkok, or the fallback when there is no usable timestamp. */
export function formatFirestoreTime(timestamp: unknown, fallback = ''): string {
  const d = toJsDate(timestamp);
  return d ? bangkokTime(d) : fallback;
}

/** "Wed, 7 Oct 2026 07:42" in Bangkok. */
export function formatFirestoreDate(timestamp: unknown, fallback: string | null = 'Never'): string | null {
  const d = toJsDate(timestamp);
  return d ? `${formatBusinessDateDisplay(bangkokCalendarDate(d))} ${bangkokTime(d)}` : fallback;
}
