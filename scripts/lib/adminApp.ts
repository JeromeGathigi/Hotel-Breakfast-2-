import { promises as fs } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

/**
 * Shared Firebase Admin bootstrap for everything under scripts/.
 *
 * Extracted from scripts/importOpera.ts rather than copied. This project has already been
 * bitten twice by two implementations of one job drifting apart - a second Opera parser in
 * functions/ that reintroduced every defect the tested one had fixed, and five overlapping
 * ingestion paths of which only one used the good parser. Credential and database resolution
 * is exactly the kind of thing that must have one home.
 *
 * ## The named-database trap
 *
 * This project's Firestore database is NOT `(default)`. It is
 * `ai-studio-hotelbreakfast2-acad9cf6-2960-4fc6-9358-4df6deffdf81`, and the project contains
 * no `(default)` database at all - the console lists three named AI Studio databases and
 * nothing else. `getFirestore(app)` without a database id therefore talks to a database that
 * does not exist, silently. Always go through `getDb()`.
 */

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', quiet: true });

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads the service account, or returns null to fall back to Application Default Credentials.
 *
 * Nothing here ever logs the credential, and the repo's .gitignore blocks
 * `*service-account*.json` and `.env*`. Generate the key yourself in the Firebase console
 * (Project settings -> Service accounts -> Generate new private key) and point
 * FIREBASE_SERVICE_ACCOUNT_PATH at it; it never needs to be pasted anywhere.
 */
export async function resolveServiceAccount(): Promise<Record<string, unknown> | null> {
  const envJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? process.env.OPERA_SERVICE_ACCOUNT_JSON;
  if (envJson) {
    try {
      return JSON.parse(envJson);
    } catch (error) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON is invalid: ${(error as Error).message}`);
    }
  }

  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    process.env.OPERA_SERVICE_ACCOUNT_PATH,
    path.resolve(process.cwd(), 'firebase-service-account.json'),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return JSON.parse(await fs.readFile(candidate, 'utf8'));
    }
  }

  return null;
}

/** The named database id, from the environment or from firebase-applet-config.json. */
export async function resolveFirestoreDatabaseId(): Promise<string> {
  const envDbId = process.env.FIRESTORE_DATABASE_ID;
  if (envDbId) return envDbId;

  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (await fileExists(configPath)) {
    try {
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      if (config.firestoreDatabaseId) return config.firestoreDatabaseId;
    } catch {
      // fall through to the error below
    }
  }

  throw new Error(
    'Missing Firestore database ID. Set FIRESTORE_DATABASE_ID, or check that ' +
      'firebase-applet-config.json still carries firestoreDatabaseId.'
  );
}

let cachedApp: ReturnType<typeof initializeApp> | null = null;

async function getApp() {
  if (cachedApp) return cachedApp;
  const existing = getApps();
  if (existing.length > 0) {
    cachedApp = existing[0];
    return cachedApp;
  }

  const serviceAccount = await resolveServiceAccount();
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID;

  if (serviceAccount) {
    cachedApp = initializeApp({
      credential: cert(serviceAccount as any),
      projectId: (serviceAccount as any).project_id || projectId,
    });
  } else if (projectId) {
    cachedApp = initializeApp({ projectId, credential: applicationDefault() });
  } else {
    throw new Error(
      'Missing Firebase configuration. Set VITE_FIREBASE_PROJECT_ID and either a service ' +
        'account (FIREBASE_SERVICE_ACCOUNT_PATH) or Application Default Credentials.'
    );
  }
  return cachedApp;
}

let cachedDb: Firestore | null = null;

/** Firestore, pointed at the NAMED database. Never call getFirestore(app) directly. */
export async function getDb(): Promise<Firestore> {
  if (cachedDb) return cachedDb;
  const app = await getApp();
  cachedDb = getFirestore(app, await resolveFirestoreDatabaseId());
  return cachedDb;
}

/** Firebase Auth admin, for setting the custom claims the role model reads. */
export async function getAdminAuth() {
  return getAuth(await getApp());
}

/**
 * Who a script's writes are attributed to in the audit log and metadata: the service account's
 * client_email, or the OS user running under Application Default Credentials. Never a made-up name.
 */
export async function scriptIdentity(): Promise<string> {
  const serviceAccount = await resolveServiceAccount();
  const email = serviceAccount ? (serviceAccount as { client_email?: unknown }).client_email : null;
  if (typeof email === 'string' && email) return email;
  const user = process.env.USERNAME || process.env.USER;
  return user ? `application-default-credentials (${user})` : 'application-default-credentials';
}

/** Describes how this process authenticated, for a script to print before it acts. */
export async function describeCredential(): Promise<string> {
  const serviceAccount = await resolveServiceAccount();
  const databaseId = await resolveFirestoreDatabaseId();
  const how = serviceAccount
    ? `service account ${(serviceAccount as any).client_email ?? '(unknown client_email)'}`
    : 'Application Default Credentials';
  return `${how} -> database ${databaseId}`;
}
