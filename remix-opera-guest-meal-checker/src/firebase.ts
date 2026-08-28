import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? '',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, import.meta.env.VITE_FIREBASE_DATABASE_ID ?? undefined);
export const googleProvider = new GoogleAuthProvider();

export const signIn = () => signInWithPopup(auth, googleProvider);
export const logOut = () => signOut(auth);

/**
 * Recursively cleans objects before Firestore writes.
 * Replaces undefined values with null or defaults without destroying Firestore
 * FieldValues (such as serverTimestamp()), Timestamps, or Dates.
 */
export const sanitizeData = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj;

  if (
    typeof obj.toDate === 'function' ||
    typeof obj.toMillis === 'function' ||
    obj._methodName ||
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

export const formatFirestoreDate = (timestamp: any, fallback: string = 'Never'): string => {
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
