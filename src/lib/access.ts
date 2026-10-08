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
 *   admin    data maintenance, everything below
 *   manager  Opera imports, editing the floor plan, manifest, forecast, analytics, sales,
 *            settings, audit log; on a Food Exchange bill: discounts, complimentary payments,
 *            removing a payment, voiding a dish already served, reopening a closed bill;
 *            everything below
 *   staff    the door (check-in, bookings, corrections, seating) and Food Exchange orders,
 *            kitchen and menu, including marking a dish sold out and counting the cash drawer
 *   none     signed in but not authorised - sees an explanation, nothing else
 *
 * On 8 Oct 2026 the owner moved the Opera import and the floor plan from administrators to
 * managers - the morning import is a front-office or duty-manager task - and sold-out dishes from
 * managers to everyone at the door, since the kitchen and the hosts find out first.
 *
 * ROLE_DUTIES below says the same in words for Settings > Access, and src/navigation.ts decides
 * the screens from these functions - nothing else in the app compares role strings.
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
/** Opera imports, which replace the in-house list. */
export const canImport = (r: Role) => canManage(r);
/** Tables and saved layouts. Seating, clearing and merging are door work (canUseDoor). */
export const canEditFloorPlan = (r: Role) => canManage(r);
/** Marking a Food Exchange dish sold out, or available again. */
export const canMarkSoldOut = (r: Role) => canUseDoor(r);
/** Settings > Data maintenance: permanently removes documents. */
export const canMaintainData = (r: Role) => r === 'admin';

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  staff: 'Host stand',
  none: 'No access',
};

/** What each role adds to the one below it, for Settings > Access. */
export const ROLE_DUTIES: Record<Exclude<Role, 'none'>, string[]> = {
  staff: [
    'Check-in, group check-in, corrections to a room for today, seating, clearing and merging tables',
    'Bookings: reservations and the waiting list, seating them, no-shows and cancellations',
    'Food Exchange (Novotel): orders, the kitchen screen and the menu; voiding a dish not yet served; payments by cash, card, QR or room charge; closing a bill; marking a dish sold out; counting the cash drawer',
  ],
  manager: [
    "The morning's Opera imports",
    'In-house manifest, meal forecast, analytics, Food Exchange sales and the CSV exports',
    'Editing the floor plan and saved layouts',
    'On a bill: discounts, complimentary payments, removing a payment, voiding a dish already served, reopening a closed bill',
    'Settings: data status, rate codes, audit log',
  ],
  admin: ['Settings › Data maintenance: permanently removing the records earlier versions wrote'],
};
