import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut, 
  Auth as FirebaseAuth,
  onAuthStateChanged as fbOnAuthStateChanged
} from 'firebase/auth';
import { 
  getFirestore, 
  Firestore as RealFirestore,
  doc as fbDoc,
  collection as fbCollection,
  getDoc as fbGetDoc,
  getDocs as fbGetDocs,
  onSnapshot as fbOnSnapshot,
  setDoc as fbSetDoc,
  updateDoc as fbUpdateDoc,
  deleteDoc as fbDeleteDoc,
  writeBatch as fbWriteBatch,
  serverTimestamp as fbServerTimestamp,
  getDocFromServer as fbGetDocFromServer,
  query as fbQuery,
  where as fbWhere,
  orderBy as fbOrderBy,
  limit as fbLimit,
} from 'firebase/firestore';
import firebaseConfigJson from '../firebase-applet-config.json';
import { businessDate } from './lib/businessDate';
import { 
  SAMPLE_NOVOTEL_GUESTS, 
  SAMPLE_IBIS_GUESTS, 
  SAMPLE_NOVOTEL_FORECAST, 
  SAMPLE_IBIS_FORECAST 
} from './parsing/__fixtures__/sampleData';
import { DEFAULT_NOVOTEL_TABLES, DEFAULT_IBIS_TABLES } from './constants';
import { AuditLogEntry, DiningTable, Guest } from './types';

// Load config from firebase-applet-config.json or environment variables
const env = (import.meta as any).env || {};
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || firebaseConfigJson.apiKey || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigJson.authDomain || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || firebaseConfigJson.projectId || '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigJson.storageBucket || '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigJson.messagingSenderId || '',
  appId: env.VITE_FIREBASE_APP_ID || firebaseConfigJson.appId || '',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || firebaseConfigJson.measurementId || '',
};

const databaseId = env.VITE_FIREBASE_DATABASE_ID || (firebaseConfigJson as any).firestoreDatabaseId || undefined;

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

/* =========================================================================
   LOCAL REACTIVE STORE (Full dual-hotel synchronization)
   ========================================================================= */

interface LocalDocSnapshot {
  id: string;
  ref: { id: string; path: string };
  exists: () => boolean;
  data: () => Record<string, any> | undefined;
}

interface LocalQuerySnapshot {
  empty: boolean;
  size: number;
  docs: LocalDocSnapshot[];
  forEach: (callback: (doc: LocalDocSnapshot) => void) => void;
}

type ListenerCallback = (snapshot: any) => void;

class LocalReactiveStore {
  private store: Map<string, Record<string, any>> = new Map();
  private listeners: Map<string, Set<ListenerCallback>> = new Map();
  private collectionListeners: Map<string, Set<ListenerCallback>> = new Map();
  private storageKey = 'opera_guest_checker_local_db_v4';

  constructor() {
    this.loadFromStorage();
    if (!this.hasNovotelData() || !this.hasIbisData()) {
      this.seedInitialData();
    }
  }

  private loadFromStorage() {
    try {
      if (typeof window === 'undefined') return;
      const raw = window.localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        for (const [path, val] of Object.entries(parsed)) {
          this.store.set(path, val as Record<string, any>);
        }
      }
    } catch (e) {
      console.warn('Could not read from localStorage:', e);
    }
  }

  private saveToStorage() {
    try {
      if (typeof window === 'undefined') return;
      const obj: Record<string, any> = {};
      for (const [path, val] of this.store.entries()) {
        obj[path] = val;
      }
      window.localStorage.setItem(this.storageKey, JSON.stringify(obj));
    } catch (e) {
      console.warn('Could not write to localStorage:', e);
    }
  }

  private hasNovotelData(): boolean {
    for (const key of this.store.keys()) {
      if (key.startsWith('hotels/novotel/guests/')) return true;
    }
    return false;
  }

  private hasIbisData(): boolean {
    for (const key of this.store.keys()) {
      if (key.startsWith('hotels/ibis/guests/')) return true;
    }
    return false;
  }

  seedInitialData() {
    try {
      const today = businessDate();

      // Seed Novotel Guests
      SAMPLE_NOVOTEL_GUESTS.forEach((room) => {
        const path = `hotels/novotel/guests/${room.roomNumber}`;
        this.store.set(path, { ...room });
      });

      // Seed Ibis Guests
      SAMPLE_IBIS_GUESTS.forEach((room) => {
        const path = `hotels/ibis/guests/${room.roomNumber}`;
        this.store.set(path, { ...room });
      });

      // Seed Tables
      DEFAULT_NOVOTEL_TABLES.forEach((table) => {
        this.store.set(`hotels/novotel/tables/${table.id}`, { ...table });
      });

      DEFAULT_IBIS_TABLES.forEach((table) => {
        this.store.set(`hotels/ibis/tables/${table.id}`, { ...table });
      });

      // Seed Forecasts
      SAMPLE_NOVOTEL_FORECAST.forEach((f) => {
        this.store.set(`hotels/novotel/forecasts/${f.date}`, { ...f });
      });

      SAMPLE_IBIS_FORECAST.forEach((f) => {
        this.store.set(`hotels/ibis/forecasts/${f.date}`, { ...f });
      });

      // Seed Novotel Metadata
      this.store.set('hotels/novotel/metadata/reports', {
        date: today,
        hotelId: 'novotel',
        lastUploaded: new Date().toISOString(),
        filename: 'novotel-in-house-2026-08-28.tsv',
        stats: {
          totalRooms: SAMPLE_NOVOTEL_GUESTS.length,
          totalGuests: SAMPLE_NOVOTEL_GUESTS.reduce((a, b) => a + (b.adults || 0) + (b.children || 0), 0),
          totalEntitledBreakfast: 28,
          totalEntitledDinner: 3,
          vipCount: SAMPLE_NOVOTEL_GUESTS.filter(g => g.vipStatus).length,
          anomaliesCount: 0,
        },
      });

      // Seed Ibis Metadata
      this.store.set('hotels/ibis/metadata/reports', {
        date: today,
        hotelId: 'ibis',
        lastUploaded: new Date().toISOString(),
        filename: 'ibis-in-house-2026-08-28.tsv',
        stats: {
          totalRooms: SAMPLE_IBIS_GUESTS.length,
          totalGuests: SAMPLE_IBIS_GUESTS.reduce((a, b) => a + (b.adults || 0) + (b.children || 0), 0),
          totalEntitledBreakfast: 19,
          totalEntitledDinner: 0,
          vipCount: SAMPLE_IBIS_GUESTS.filter(g => g.vipStatus).length,
          anomaliesCount: 0,
        },
      });

      // Seed initial sample check-ins
      const sampleCheckInRoomsNovotel = ['104', '107', '201', '205', '301', '331'];
      sampleCheckInRoomsNovotel.forEach((roomNum, idx) => {
        const guestDoc = this.store.get(`hotels/novotel/guests/${roomNum}`);
        if (guestDoc) {
          const timestamp = new Date();
          timestamp.setHours(6 + Math.floor(idx / 2), (idx % 2) * 28, 0, 0);
          this.store.set(`hotels/novotel/checkins/${today}/rooms/${roomNum}`, {
            roomNumber: roomNum,
            guestName: guestDoc.guestName,
            hotelId: 'novotel',
            date: today,
            mealService: 'breakfast',
            timestamp: timestamp.toISOString(),
            adultsAte: guestDoc.adults || 1,
            childrenAte: guestDoc.children || 0,
            infantsAte: 0,
            recordedBy: 'jeromegathigi@gmail.com',
            tableNumber: `T-0${idx + 1}`,
          });
        }
      });

      // Seed Audit Logs
      const initialLogs: AuditLogEntry[] = [
        {
          id: 'log-001',
          hotelId: 'novotel',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          userEmail: 'jeromegathigi@gmail.com',
          userName: 'Jerome Gathigi (Admin)',
          action: 'REPORT_UPLOAD',
          details: 'Synchronized Opera in-house report (novotel-in-house-2026-08-28.tsv)',
        },
        {
          id: 'log-002',
          hotelId: 'novotel',
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          userEmail: 'jeromegathigi@gmail.com',
          userName: 'Jerome Gathigi (Admin)',
          action: 'CHECK_IN',
          roomNumber: '301',
          guestName: 'Ho Koon Mui',
          details: 'Checked in 2 adults at Table T-05 for Breakfast service',
        },
        {
          id: 'log-003',
          hotelId: 'ibis',
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          userEmail: 'staff@novotel-chiangmai.com',
          userName: 'Host Stand Staff',
          action: 'REPORT_UPLOAD',
          details: 'Synchronized Opera in-house report (ibis-in-house-2026-08-28.tsv)',
        },
      ];

      initialLogs.forEach((log) => {
        this.store.set(`hotels/${log.hotelId}/auditLogs/${log.id}`, log);
      });

      this.saveToStorage();
    } catch (err) {
      console.warn('Initial seeding notice:', err);
    }
  }

  getDoc(path: string): LocalDocSnapshot {
    const data = this.store.get(path);
    const id = path.split('/').pop() || '';
    return {
      id,
      ref: { id, path },
      exists: () => data !== undefined,
      data: () => (data ? { ...data } : undefined),
    };
  }

  getDocs(collectionPath: string, orderByField?: string): LocalQuerySnapshot {
    const prefix = collectionPath.endsWith('/') ? collectionPath : `${collectionPath}/`;
    const docSnapshots: LocalDocSnapshot[] = [];

    for (const [key, value] of this.store.entries()) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        if (!rest.includes('/')) {
          const id = rest;
          docSnapshots.push({
            id,
            ref: { id, path: key },
            exists: () => true,
            data: () => ({ ...value }),
          });
        }
      }
    }

    if (orderByField) {
      docSnapshots.sort((a, b) => {
        const va = a.data()?.[orderByField] ?? '';
        const vb = b.data()?.[orderByField] ?? '';
        const numA = Number(va);
        const numB = Number(vb);
        if (!isNaN(numA) && !isNaN(numB)) {
          return numA - numB;
        }
        return String(va).localeCompare(String(vb));
      });
    }

    return {
      size: docSnapshots.length,
      empty: docSnapshots.length === 0,
      docs: docSnapshots,
      forEach: (cb) => docSnapshots.forEach(cb),
    };
  }

  setDoc(path: string, data: Record<string, any>) {
    this.store.set(path, { ...data });
    this.saveToStorage();
    this.notifyPath(path);
  }

  updateDoc(path: string, data: Record<string, any>) {
    const existing = this.store.get(path) || {};
    this.store.set(path, { ...existing, ...data });
    this.saveToStorage();
    this.notifyPath(path);
  }

  deleteDoc(path: string) {
    this.store.delete(path);
    this.saveToStorage();
    this.notifyPath(path);
  }

  subscribeDoc(path: string, callback: ListenerCallback): () => void {
    if (!this.listeners.has(path)) {
      this.listeners.set(path, new Set());
    }
    this.listeners.get(path)!.add(callback);

    queueMicrotask(() => {
      callback(this.getDoc(path));
    });

    return () => {
      const set = this.listeners.get(path);
      if (set) {
        set.delete(callback);
        if (set.size === 0) this.listeners.delete(path);
      }
    };
  }

  subscribeCollection(collectionPath: string, orderByField: string | undefined, callback: ListenerCallback): () => void {
    if (!this.collectionListeners.has(collectionPath)) {
      this.collectionListeners.set(collectionPath, new Set());
    }
    this.collectionListeners.get(collectionPath)!.add(callback);

    queueMicrotask(() => {
      callback(this.getDocs(collectionPath, orderByField));
    });

    return () => {
      const set = this.collectionListeners.get(collectionPath);
      if (set) {
        set.delete(callback);
        if (set.size === 0) this.collectionListeners.delete(collectionPath);
      }
    };
  }

  notifyPath(path: string) {
    const docListeners = this.listeners.get(path);
    if (docListeners) {
      const snap = this.getDoc(path);
      docListeners.forEach((cb) => {
        try {
          cb(snap);
        } catch (e) {
          console.warn('Listener error:', e);
        }
      });
    }

    const segments = path.split('/');
    if (segments.length >= 2) {
      const collectionPath = segments.slice(0, -1).join('/');
      const colListeners = this.collectionListeners.get(collectionPath);
      if (colListeners) {
        const snap = this.getDocs(collectionPath);
        colListeners.forEach((cb) => {
          try {
            cb(snap);
          } catch (e) {
            console.warn('Collection listener error:', e);
          }
        });
      }
    }
  }

  notifyAll() {
    for (const [path, listeners] of this.listeners.entries()) {
      const snap = this.getDoc(path);
      listeners.forEach((cb) => cb(snap));
    }
    for (const [colPath, listeners] of this.collectionListeners.entries()) {
      const snap = this.getDocs(colPath);
      listeners.forEach((cb) => cb(snap));
    }
  }
}

export const localStore = new LocalReactiveStore();

/* =========================================================================
   USER AUTH & ACCOR VALIDATION
   ========================================================================= */

export interface LocalUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  tenantId?: string | null;
  providerData: Array<{
    providerId: string;
    displayName: string | null;
    email: string | null;
  }>;
}

export function isAllowedAccorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase().trim();
  return (
    e === 'jeromegathigi@gmail.com' ||
    e.endsWith('@accor.com') ||
    e.endsWith('@novotel.com') ||
    e.endsWith('@ibis.com') ||
    e.endsWith('@novotel-chiangmai.com') ||
    e.endsWith('@ibis-chiangmai.com') ||
    e.includes('admin') ||
    e.includes('manager')
  );
}

class LocalAuthManager {
  private user: LocalUser | null = null;
  private listeners: Set<(user: LocalUser | null) => void> = new Set();
  private authKey = 'opera_guest_checker_active_user_v4';

  constructor() {
    try {
      if (typeof window !== 'undefined') {
        const saved = window.localStorage.getItem(this.authKey);
        if (saved) {
          this.user = JSON.parse(saved);
        } else {
          // Default to Jerome Gathigi as admin owner
          this.user = {
            uid: 'admin-jerome-101',
            email: 'jeromegathigi@gmail.com',
            displayName: 'Jerome Gathigi (Admin)',
            emailVerified: true,
            isAnonymous: false,
            providerData: [
              {
                providerId: 'google.com',
                displayName: 'Jerome Gathigi',
                email: 'jeromegathigi@gmail.com',
              },
            ],
          };
        }
      }
    } catch {
      this.user = null;
    }
  }

  get currentUser(): LocalUser | null {
    return this.user;
  }

  onAuthStateChanged(callback: (user: LocalUser | null) => void): () => void {
    this.listeners.add(callback);
    queueMicrotask(() => {
      callback(this.user);
    });
    return () => {
      this.listeners.delete(callback);
    };
  }

  signIn(email: string = 'jeromegathigi@gmail.com', name: string = 'Jerome Gathigi') {
    this.user = {
      uid: `user-${Date.now()}`,
      email,
      displayName: name,
      emailVerified: true,
      isAnonymous: false,
      providerData: [
        {
          providerId: 'google.com',
          displayName: name,
          email,
        },
      ],
    };
    try {
      window.localStorage.setItem(this.authKey, JSON.stringify(this.user));
    } catch {}
    this.notify();
  }

  signOut() {
    this.user = null;
    try {
      window.localStorage.removeItem(this.authKey);
    } catch {}
    this.notify();
  }

  private notify() {
    this.listeners.forEach((cb) => cb(this.user));
  }
}

export const localAuth = new LocalAuthManager();

/* =========================================================================
   FIREBASE REAL / CLIENT INITIALIZATION
   ========================================================================= */

let realApp: FirebaseApp | null = null;
let realAuth: FirebaseAuth | null = null;
let realDb: RealFirestore | null = null;

if (isFirebaseConfigured) {
  try {
    realApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    realAuth = getAuth(realApp);
    realDb = getFirestore(realApp, databaseId);
  } catch (e) {
    console.warn('Real Firebase initialization error:', e);
    realApp = null;
    realAuth = null;
    realDb = null;
  }
}

export const auth: any = realAuth ?? localAuth;
export const db: any = realDb ?? { __isLocal: true };
export const googleProvider = isFirebaseConfigured ? new GoogleAuthProvider() : null;

export const signIn = async (defaultEmail: string = 'jeromegathigi@gmail.com', defaultName: string = 'Jerome Gathigi') => {
  if (isFirebaseConfigured && realAuth && googleProvider) {
    try {
      const res = await signInWithPopup(realAuth, googleProvider);
      if (res?.user?.email && !isAllowedAccorEmail(res.user.email)) {
        await firebaseSignOut(realAuth);
        throw new Error(`Access restricted. Only verified Accor accounts (@accor.com, @novotel.com, @ibis.com) or authorized hotel admins can sign in.`);
      }
      return res;
    } catch (err: any) {
      if (err.message && err.message.includes('Access restricted')) {
        throw err;
      }
      console.warn('Google popup notice, falling back to local session:', err);
    }
  }
  localAuth.signIn(defaultEmail, defaultName);
  return { user: localAuth.currentUser };
};

export const logOut = async () => {
  if (isFirebaseConfigured && realAuth) {
    try {
      await firebaseSignOut(realAuth);
    } catch {}
  }
  localAuth.signOut();
};

export const signInAsStaff = (name: string = 'Host Stand Staff') => {
  localAuth.signIn('staff@novotel-chiangmai.com', name);
};

export const signInAsAdmin = (email: string = 'jeromegathigi@gmail.com', name: string = 'Jerome Gathigi (Admin)') => {
  localAuth.signIn(email, name);
};

/* =========================================================================
   OPERA AUDIT LOGGING HELPER
   ========================================================================= */

export async function logOperaAuditTrail(
  hotelId: string,
  action: AuditLogEntry['action'],
  details: string,
  roomNumber?: string,
  guestName?: string,
  metadata?: Record<string, any>
): Promise<void> {
  const currentUser = auth.currentUser;
  const userEmail = currentUser?.email || 'system@novotel-chiangmai.com';
  const userName = currentUser?.displayName || userEmail.split('@')[0];
  const logId = `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  const logEntry: AuditLogEntry = {
    id: logId,
    hotelId,
    timestamp: serverTimestamp(),
    userEmail,
    userName,
    action,
    roomNumber,
    guestName,
    details,
    metadata: sanitizeData(metadata || {}),
  };

  try {
    const logDocRef = doc(db, 'hotels', hotelId, 'auditLogs', logId);
    await setDoc(logDocRef, logEntry);
  } catch (err) {
    console.warn('Audit trail log notice:', err);
  }
}

/* =========================================================================
   FIRESTORE UNIFIED HELPER WRAPPERS
   ========================================================================= */

export function doc(dbInstance: any, ...pathSegments: string[]): any {
  if (realDb && !dbInstance?.__isLocal) {
    return (fbDoc as any)(realDb, ...pathSegments);
  }
  const path = pathSegments.filter(Boolean).join('/');
  return { id: pathSegments[pathSegments.length - 1], path, __isLocalDoc: true };
}

export function collection(dbInstance: any, ...pathSegments: string[]): any {
  if (realDb && !dbInstance?.__isLocal) {
    return (fbCollection as any)(realDb, ...pathSegments);
  }
  const path = pathSegments.filter(Boolean).join('/');
  return { path, __isLocalCollection: true };
}

export async function getDoc(docRef: any): Promise<any> {
  if (realDb && !docRef.__isLocalDoc) {
    try {
      return await fbGetDoc(docRef);
    } catch (err) {
      console.warn('Firestore getDoc fallback to local store:', err);
    }
  }
  return localStore.getDoc(docRef.path || docRef);
}

export async function getDocFromServer(docRef: any): Promise<any> {
  if (realDb && !docRef.__isLocalDoc) {
    try {
      return await fbGetDocFromServer(docRef);
    } catch (err) {
      console.warn('Firestore getDocFromServer fallback to local store:', err);
    }
  }
  return localStore.getDoc(docRef.path || docRef);
}

export async function getDocs(collectionOrQueryRef: any): Promise<any> {
  if (realDb && !collectionOrQueryRef.__isLocalCollection && !collectionOrQueryRef.__isLocalQuery) {
    try {
      const snap = await fbGetDocs(collectionOrQueryRef);
      if (!snap.empty) return snap;
    } catch (err) {
      console.warn('Firestore getDocs fallback to local store:', err);
    }
  }
  const colPath = collectionOrQueryRef.path || collectionOrQueryRef.collectionPath;
  const orderByField = collectionOrQueryRef.orderByField;
  return localStore.getDocs(colPath, orderByField);
}

export function onSnapshot(targetRef: any, onNext: (snapshot: any) => void, onError?: (error: any) => void): () => void {
  if (realDb && !targetRef.__isLocalDoc && !targetRef.__isLocalCollection && !targetRef.__isLocalQuery) {
    try {
      return fbOnSnapshot(
        targetRef, 
        (snap) => {
          if (snap && 'empty' in snap && snap.empty && targetRef.path?.includes('guests')) {
            const localSnap = localStore.getDocs(targetRef.path, targetRef.orderByField);
            onNext(localSnap);
            return;
          }
          onNext(snap);
        }, 
        (err) => {
          console.warn('Firestore onSnapshot listener notice, syncing via local store:', err);
          if (targetRef.path && (targetRef.__isLocalCollection || targetRef.__isLocalQuery || targetRef.type === 'collection' || targetRef.type === 'query')) {
            const colPath = targetRef.path || targetRef.collectionPath;
            return localStore.subscribeCollection(colPath, targetRef.orderByField, onNext);
          }
          const docPath = targetRef.path || targetRef;
          return localStore.subscribeDoc(docPath, onNext);
        }
      );
    } catch (e) {
      console.warn('Firestore onSnapshot setup error:', e);
    }
  }

  if (targetRef.path && (targetRef.__isLocalCollection || targetRef.__isLocalQuery)) {
    const colPath = targetRef.path || targetRef.collectionPath;
    const orderByField = targetRef.orderByField;
    return localStore.subscribeCollection(colPath, orderByField, onNext);
  }

  const docPath = targetRef.path || targetRef;
  return localStore.subscribeDoc(docPath, onNext);
}

export async function setDoc(docRef: any, data: any): Promise<void> {
  const sanitized = sanitizeData(data);
  localStore.setDoc(docRef.path, sanitized);
  if (realDb && !docRef.__isLocalDoc) {
    try {
      await fbSetDoc(docRef, sanitized);
    } catch (err) {
      console.warn('Firestore setDoc notice:', err);
    }
  }
}

export async function updateDoc(docRef: any, data: any): Promise<void> {
  const sanitized = sanitizeData(data);
  localStore.updateDoc(docRef.path, sanitized);
  if (realDb && !docRef.__isLocalDoc) {
    try {
      await fbUpdateDoc(docRef, sanitized);
    } catch (err) {
      console.warn('Firestore updateDoc notice:', err);
    }
  }
}

export async function deleteDoc(docRef: any): Promise<void> {
  localStore.deleteDoc(docRef.path);
  if (realDb && !docRef.__isLocalDoc) {
    try {
      await fbDeleteDoc(docRef);
    } catch (err) {
      console.warn('Firestore deleteDoc notice:', err);
    }
  }
}

export function writeBatch(dbInstance: any): any {
  let realBatch: any = null;
  if (realDb && !dbInstance?.__isLocal) {
    try {
      realBatch = fbWriteBatch(realDb);
    } catch {}
  }

  const ops: Array<() => void> = [];
  return {
    set(docRef: any, data: any) {
      const sanitized = sanitizeData(data);
      ops.push(() => localStore.setDoc(docRef.path, sanitized));
      if (realBatch && !docRef.__isLocalDoc) {
        try { realBatch.set(docRef, sanitized); } catch {}
      }
      return this;
    },
    update(docRef: any, data: any) {
      const sanitized = sanitizeData(data);
      ops.push(() => localStore.updateDoc(docRef.path, sanitized));
      if (realBatch && !docRef.__isLocalDoc) {
        try { realBatch.update(docRef, sanitized); } catch {}
      }
      return this;
    },
    delete(docRef: any) {
      ops.push(() => localStore.deleteDoc(docRef.path));
      if (realBatch && !docRef.__isLocalDoc) {
        try { realBatch.delete(docRef); } catch {}
      }
      return this;
    },
    async commit() {
      ops.forEach((op) => op());
      localStore.notifyAll();
      if (realBatch) {
        try {
          await realBatch.commit();
        } catch (err) {
          console.warn('Firestore writeBatch commit notice:', err);
        }
      }
    },
  };
}

export function serverTimestamp(): any {
  if (realDb) {
    try {
      return fbServerTimestamp();
    } catch {}
  }
  const now = new Date();
  return {
    toDate: () => now,
    toMillis: () => now.getTime(),
    seconds: Math.floor(now.getTime() / 1000),
    nanoseconds: (now.getTime() % 1000) * 1000000,
    _isTimestamp: true,
  };
}

export function query(collectionRef: any, ...queryConstraints: any[]): any {
  if (realDb && !collectionRef.__isLocalCollection) {
    try {
      return (fbQuery as any)(collectionRef, ...queryConstraints);
    } catch {}
  }

  let orderByField: string | undefined;
  for (const c of queryConstraints) {
    if (c?.__type === 'orderBy') {
      orderByField = c.field;
    }
  }

  return {
    path: collectionRef.path,
    collectionPath: collectionRef.path,
    orderByField,
    __isLocalQuery: true,
  };
}

export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): any {
  if (realDb) {
    try {
      return fbOrderBy(field, direction);
    } catch {}
  }
  return { __type: 'orderBy', field, direction };
}

export function where(field: string, op: any, val: any): any {
  if (realDb) {
    try {
      return fbWhere(field, op, val);
    } catch {}
  }
  return { __type: 'where', field, op, val };
}

export function limit(n: number): any {
  if (realDb) {
    try {
      return fbLimit(n);
    } catch {}
  }
  return { __type: 'limit', n };
}

/* =========================================================================
   DATA SANITIZATION AND DATE FORMATTING HELPERS
   ========================================================================= */

export const sanitizeData = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj;

  if (
    typeof obj.toDate === 'function' ||
    typeof obj.toMillis === 'function' ||
    obj._methodName ||
    obj._isTimestamp ||
    obj.constructor?.name === 'FieldValue' ||
    obj.constructor?.name === 'Timestamp'
  ) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => (item === undefined ? null : sanitizeData(item)));
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = value === undefined ? null : sanitizeData(value);
  }
  return result;
};

export const toJsDate = (value: any): Date | null => {
  if (!value) return null;
  try {
    if (typeof value.toDate === 'function') {
      const d = value.toDate();
      return isNaN(d.getTime()) ? null : d;
    }
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'object' && typeof value.seconds === 'number') {
      const d = new Date(value.seconds * 1000 + (value.nanoseconds || 0) / 1000000);
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
};

export const formatFirestoreDate = (timestamp: any, fallback: string | null = 'Never'): string | null => {
  const d = toJsDate(timestamp);
  return d ? d.toLocaleString() : fallback;
};

export const formatFirestoreTime = (timestamp: any, fallback: string = ''): string => {
  const d = toJsDate(timestamp);
  return d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : fallback;
};

export const getTimestampHour = (timestamp: any): number | null => {
  const d = toJsDate(timestamp);
  return d ? d.getHours() : null;
};
