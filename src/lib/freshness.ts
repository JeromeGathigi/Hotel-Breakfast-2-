/**
 * How much to trust the guest list currently on screen.
 *
 * The app already subscribes to `hotels/{id}/metadata/reports` in App.tsx and has done all
 * along — but never rendered any of it, so a stale or wrong list looked identical to a
 * correct one. On 31 Aug 2026 the live list was eight documents parsed out of the Package
 * Forecast, and the interface showed a green "Live" indicator throughout.
 *
 * A silent automation is worse than a manual one. This is the piece that tells a host at
 * the door that what they are looking at cannot be relied on.
 */

/**
 * 'pending' exists because the other three all make an ASSERTION about the list, and until the
 * metadata subscription has come back there is nothing to assert. Observed live on 8 Sep 2026:
 * loading the app while signed out rendered
 *
 *     "No Opera report has ever been imported ... Import this morning's export before service."
 *
 * for about two seconds, and only then flipped to the correct "You do not have permission —
 * importing will not fix it." Both readings came from the same load; the first was simply the
 * mount state, where `metadataDate` and `readError` are both null, being indistinguishable from
 * a successful read of an empty property.
 *
 * A host who reads the first frame leaves to pull an Opera export they are not allowed to
 * import. An instruction that gets retracted two seconds later is worse than no instruction.
 */
export type FreshnessLevel = 'ok' | 'warn' | 'critical' | 'pending';

export interface Freshness {
  level: FreshnessLevel;
  /** Empty when level is 'ok'. */
  message: string;
  /** Short label for the header indicator. */
  label: string;
}

/** Hours after which an import is treated as failed rather than merely late. */
export const STALE_AFTER_HOURS = 26;

export function assessFreshness(args: {
  /** `metadata.date` — the business date the loaded list belongs to. */
  metadataDate?: string | null;
  /** `metadata.lastUploaded` as a Date, if present. */
  lastUploaded?: Date | null;
  /** Today's business date from businessDate(). */
  today: string;
  /**
   * Set when the metadata subscription itself failed - typically Firestore
   * `permission-denied`. Without this, a read the user is not allowed to make looks identical
   * to a morning nobody imported, and the banner sends staff to do the wrong thing. Observed
   * live: signed out, the app said "no report has ever been imported" when the real cause was
   * authorisation.
   */
  readError?: { code?: string; message?: string } | null;
  /**
   * False until the metadata subscription has delivered its first snapshot OR its first error.
   * Defaults to true so every existing caller and test keeps its current meaning; only the
   * live subscription in App.tsx passes false, and only while it is genuinely waiting.
   */
  metadataSettled?: boolean;
  now?: Date;
}): Freshness {
  const { metadataDate, lastUploaded, today, readError } = args;
  const settled = args.metadataSettled ?? true;
  const now = args.now ?? new Date();

  // Checked before readError and metadataDate, both of which are legitimately null while the
  // read is still in flight. This is the whole point of the state: say nothing yet.
  if (!settled) {
    return {
      level: 'pending',
      label: 'Checking',
      message:
        'Checking with Opera for this morning’s guest list. Do not start seating from this ' +
        'screen until it says what it found.',
    };
  }

  if (readError) {
    const denied = (readError.code || '').includes('permission-denied');
    return {
      level: 'critical',
      label: denied ? 'No access' : 'Cannot read',
      message: denied
        ? 'You do not have permission to read this property’s guest list, so nothing is shown. ' +
          'This is not a missing import — importing will not fix it. Sign in with your Accor ' +
          'account, and if you already have, ask an administrator to grant you access.'
        : `The guest list could not be loaded${readError.message ? `: ${readError.message}` : ''}. ` +
          'Nothing on this screen can be relied on. Check the connection, then tell IT if it persists.',
    };
  }

  if (!metadataDate) {
    return {
      level: 'critical',
      label: 'No data',
      message:
        'No Opera report has ever been imported for this property, so there is no guest list. ' +
        'Import this morning’s "Guests INH - By Room" export before service.',
    };
  }

  if (lastUploaded) {
    const hours = (now.getTime() - lastUploaded.getTime()) / 36e5;
    if (hours > STALE_AFTER_HOURS) {
      return {
        level: 'critical',
        label: 'Sync failed',
        message:
          `The last Opera import was ${Math.floor(hours)} hours ago. The automated sync has ` +
          'probably stopped — tell IT, and import the export manually so the door has a list.',
      };
    }
  }

  if (metadataDate !== today) {
    return {
      level: 'warn',
      label: 'Stale',
      message:
        `This guest list is from ${metadataDate}, not today (${today}). It is very likely ` +
        'yesterday’s house. Import this morning’s Opera export before relying on it.',
    };
  }

  return { level: 'ok', label: 'Current', message: '' };
}
