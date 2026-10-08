/**
 * Who may do what. The SAME rules are enforced server-side in firestore.rules; a test reads that
 * file and fails if the two disagree.
 *
 * Previously the UI decided "admin" from a four-entry email list in a client component while the
 * rules honoured a different two-entry list plus boolean `admin`/`staff` claims - and
 * scripts/setClaims.ts wrote a `role` claim that neither of them read. So gm@novotel-chiangmai.com
 * saw the admin screens over a database that refused its reads and writes, and a role granted with
 * the script did nothing at all.
 *
 *   admin    import Opera files, edit the floor plan, data maintenance, everything below
 *   manager  manifest, forecast, analytics, settings, audit log, everything below
 *   staff    the door: check-in, corrections, floor plan seating, menu
 *   none     signed in but not authorised - sees an explanation, nothing else
 */

export type Role = 'admin' | 'manager' | 'staff' | 'none';

/**
 * Admins by account, kept for the owner. Must equal the list in firestore.rules.
 * `jeromegathigi@gmail.com` stays: the owner asked for it explicitly.
 */
export const OWNER_ADMIN_EMAILS: readonly string[] = ['jeromegathigi@gmail.com', 'admin@novotel-chiangmai.com'];

/** A verified address on this domain is door staff without needing a claim. */
export const STAFF_EMAIL_DOMAIN = 'accor.com';

export interface AccessInput {
  email?: string | null;
  emailVerified?: boolean;
  claims?: Record<string, unknown> | null;
}

export function resolveRole({ email, emailVerified, claims }: AccessInput): Role {
  const claimRole = typeof claims?.role === 'string' ? claims.role : '';
  const mail = String(email ?? '').trim().toLowerCase();

  // Claims are set server-side (scripts/setClaims.ts), so they need no email check. The legacy
  // boolean claims are still honoured in case one was ever set by hand.
  if (claimRole === 'admin' || claims?.admin === true) return 'admin';
  if (emailVerified && OWNER_ADMIN_EMAILS.includes(mail)) return 'admin';
  if (claimRole === 'manager') return 'manager';
  if (claimRole === 'staff' || claims?.staff === true) return 'staff';
  // An unverified address proves nothing: with email/password sign-in enabled, anyone could
  // register someone@accor.com. The rules require email_verified for the same reason.
  if (emailVerified && mail.endsWith(`@${STAFF_EMAIL_DOMAIN}`) && mail.split('@')[0].length > 0) return 'staff';
  return 'none';
}

export const canUseDoor = (r: Role) => r !== 'none';
export const canManage = (r: Role) => r === 'admin' || r === 'manager';
export const canImport = (r: Role) => r === 'admin';

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  staff: 'Host stand',
  none: 'No access',
};
