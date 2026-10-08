import { getAdminAuth, describeCredential } from './lib/adminApp';

/**
 * Grants and revokes the Firebase custom claims the app's role model reads.
 *
 * ## Why claims rather than an email list
 *
 * Authority used to be decided in the client from an email string, in two places, by SUBSTRING:
 *
 *     isAdminUser         ... || e.includes('admin') || e.includes('manager')
 *     isAllowedAccorEmail ... || e.includes('admin') || e.includes('manager')
 *
 * so `admin@gmail.com` passed sign-in and `manager.trainee@accor.com` was handed the admin
 * interface. Both are exact-match now, and the client no longer keeps its own list at all:
 * src/lib/access.ts and firestore.rules both read the `role` claim this script writes (a test
 * fails if they drift). Until that change the rules read boolean `admin`/`staff` claims instead,
 * so a role set here had no effect anywhere.
 *
 * ## Usage
 *
 *     npx tsx scripts/setClaims.ts --list
 *     npx tsx scripts/setClaims.ts --email=host.name@accor.com --role=staff
 *     npx tsx scripts/setClaims.ts --email=fb.manager@accor.com --role=manager
 *     npx tsx scripts/setClaims.ts --email=someone@accor.com --role=admin
 *     npx tsx scripts/setClaims.ts --email=someone@accor.com --role=none    # revoke
 *
 * Dry run by DEFAULT for any change; pass --apply to write.
 *
 * ## After a change
 *
 * A custom claim reaches the client only on the next ID-token refresh. The user must sign out
 * and back in, or the client must call getIdToken(true). Until then the UI still sees the old
 * role - which is why src/hooks/useAccess.ts reads claims through onIdTokenChanged rather than
 * onAuthStateChanged: a claim refresh changes the token, not the auth state.
 *
 * Roles: staff = the door (check-in, corrections, seating) and Food Exchange orders, kitchen and
 * menu; manager = + Opera imports, floor-plan editing, manifest, forecast, analytics, sales,
 * settings and the bill's manager-only changes; admin = + data maintenance. src/lib/access.ts
 * lists them in full. A verified @accor.com address is staff without any claim.
 *
 * ## What this deliberately does NOT do
 *
 * It never creates users and never sets or reads a password. Accounts are created by signing
 * in with Google. `jeromegathigi@gmail.com` stays an admin - the owner asked for that
 * explicitly - and this script will refuse to demote the last remaining admin.
 */

type Role = 'staff' | 'manager' | 'admin' | 'none';

const VALID_ROLES: Role[] = ['staff', 'manager', 'admin', 'none'];

/** The owner's account. It is also in OWNER_ADMIN_EMAILS (src/lib/access.ts) and firestore.rules. */
const PROTECTED_ADMIN = 'jeromegathigi@gmail.com';

function arg(name: string): string | undefined {
  return process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

async function listUsers() {
  const auth = await getAdminAuth();
  const page = await auth.listUsers(1000);

  if (page.users.length === 0) {
    console.log('No users have signed in yet. An account is created by signing in with Google.');
    return;
  }

  console.log(`${page.users.length} user(s):\n`);
  console.log(`  ${'EMAIL'.padEnd(38)} ${'ROLE'.padEnd(8)} ${'LAST SIGN-IN'.padEnd(22)} UID`);
  console.log(`  ${'-'.repeat(38)} ${'-'.repeat(8)} ${'-'.repeat(22)} ---`);
  for (const user of page.users) {
    const role = (user.customClaims as any)?.role ?? '(none)';
    const last = user.metadata.lastSignInTime ?? '(never)';
    console.log(`  ${(user.email ?? '(no email)').padEnd(38)} ${String(role).padEnd(8)} ${last.padEnd(22)} ${user.uid}`);
  }

  const admins = page.users.filter((u) => (u.customClaims as any)?.role === 'admin');
  const count = (r: string) => page.users.filter((u) => (u.customClaims as any)?.role === r).length;
  console.log(`\n${admins.length} admin(s), ${count('manager')} manager(s), ${count('staff')} staff.`);
  if (admins.length === 0) {
    console.log('WARNING: nobody holds the admin claim. Once the rules require it, nobody can import.');
  }
}

async function setRole(email: string, role: Role, shouldApply: boolean) {
  const auth = await getAdminAuth();

  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    console.error(`No account exists for ${email}.`);
    console.error('They must sign in with Google once before a claim can be attached.');
    process.exit(1);
  }

  const current = (user.customClaims as any)?.role ?? '(none)';

  if (role === 'none' && email.toLowerCase() === PROTECTED_ADMIN) {
    console.error(`Refusing to revoke ${PROTECTED_ADMIN}. The owner needs it to sign in.`);
    process.exit(1);
  }

  if (role !== 'admin' && current === 'admin') {
    const page = await auth.listUsers(1000);
    const otherAdmins = page.users.filter(
      (u) => (u.customClaims as any)?.role === 'admin' && u.uid !== user.uid
    );
    if (otherAdmins.length === 0) {
      console.error(`Refusing to demote ${email}: they are the only admin, and nobody would be`);
      console.error('able to import the guest list or grant the claim back. Promote someone first.');
      process.exit(1);
    }
  }

  console.log(`${email}: role ${current} -> ${role === 'none' ? '(none)' : role}`);

  if (!shouldApply) {
    console.log('\nDry run - nothing written. Re-run with --apply.');
    return;
  }

  // Replaces the whole claims object; there is no merge, so anything not set here is dropped.
  await auth.setCustomUserClaims(user.uid, role === 'none' ? {} : { role });
  console.log('Written.');
  console.log('\nThe claim reaches the client on the next ID-token refresh. Ask them to sign out');
  console.log('and back in, or have the client call getIdToken(true).');
}

async function main() {
  const args = process.argv.slice(2);
  console.log(`[set-claims] ${await describeCredential()}\n`);

  if (args.includes('--list') || args.length === 0) {
    await listUsers();
    if (args.length === 0) {
      console.log('\nTo change a role:');
      console.log('  npx tsx scripts/setClaims.ts --email=<address> --role=<staff|manager|admin|none> [--apply]');
    }
    return;
  }

  const email = arg('email');
  const role = arg('role') as Role | undefined;

  if (!email || !role) {
    console.error('Both --email and --role are required. --role must be staff, manager, admin or none.');
    process.exit(1);
  }
  if (!VALID_ROLES.includes(role)) {
    console.error(`Unknown role ${role}. Valid roles: ${VALID_ROLES.join(', ')}.`);
    process.exit(1);
  }

  await setRole(email, role, args.includes('--apply'));
}

main().catch((error) => {
  console.error('[set-claims] FAILED:', error);
  process.exit(1);
});
