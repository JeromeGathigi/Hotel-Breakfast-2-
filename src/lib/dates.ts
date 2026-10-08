import { bangkokCalendarDate, bangkokTime, formatBusinessDateDisplay } from './businessDate';

/** A Firestore Timestamp, a Date, an ISO string, or {seconds} - as a Date, or null. No Firebase import. */
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

/** "07:42" in Bangkok. */
export function timeInBangkok(value: unknown, fallback = ''): string {
  const d = toJsDate(value);
  return d ? bangkokTime(d) : fallback;
}

/** "Wed, 7 Oct 2026 07:42" in Bangkok. */
export function dateTimeInBangkok(value: unknown, fallback = '—'): string {
  const d = toJsDate(value);
  return d ? `${formatBusinessDateDisplay(bangkokCalendarDate(d))} ${bangkokTime(d)}` : fallback;
}
