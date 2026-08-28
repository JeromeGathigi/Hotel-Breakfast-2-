import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';

dotenv.config();

const [, , email, ...roleFlags] = process.argv;

if (!email) {
  console.error('Usage: node --loader tsx scripts/setClaims.ts <email> [staff] [admin]');
  process.exit(1);
}

const grantRoles = roleFlags.reduce<Record<string, boolean>>((acc, flag) => {
  if (flag === 'staff') acc.staff = true;
  if (flag === 'admin') acc.admin = true;
  return acc;
}, {});

if (Object.keys(grantRoles).length === 0) {
  grantRoles.staff = true;
}

const projectId = process.env.VITE_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID;
if (!projectId) {
  console.error('VITE_FIREBASE_PROJECT_ID is required.');
  process.exit(1);
}

initializeApp({ projectId });
const auth = getAuth();

const user = await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid, {
  ...user.customClaims,
  ...grantRoles,
});

console.log(`Updated claims for ${email}: ${JSON.stringify({ ...user.customClaims, ...grantRoles })}`);
