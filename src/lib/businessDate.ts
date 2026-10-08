/**
 * The hotel business day, in Asia/Bangkok, rolling over at 04:00.
 *
 * A breakfast service that opens at 06:00 belongs to the business day that started at 04:00, and
 * a check-in recorded at 02:00 still belongs to the night before. Every key in Firestore that is
 * partitioned by day (`checkins/{date}`, `history/{date}`, `forecasts/{date}`) uses this value, so
 * it must never depend on the clock or timezone of the device it runs on.
 *
 * The previous implementation round-tripped through `toLocaleString()` and then did arithmetic on
 * the parsed result in the DEVICE's timezone. That is correct only while the device is in a zone
 * without DST, and the string format it relied on is implementation-defined. Everything here is
 * computed with Intl.DateTimeFormat in Asia/Bangkok directly.
 */

export const BUSINESS_TIMEZONE = 'Asia/Bangkok';

/** Hour (Bangkok) at which the business day changes. */
export const BUSINESS_DAY_ROLLOVER_HOUR = 4;

export interface BangkokParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
});

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Wall-clock components of an instant in Bangkok. */
export function bangkokParts(at: Date): BangkokParts {
  const out: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(at)) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    // Some engines render midnight as "24" even with h23; normalise.
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: WEEKDAYS.indexOf(out.weekday),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` of the Bangkok calendar date containing this instant. */
export function bangkokCalendarDate(at: Date): string {
  const p = bangkokParts(at);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/**
 * The business date: the Bangkok calendar date of (now - 4h). Bangkok has no DST, so subtracting
 * a fixed four hours of real time is exactly "before 04:00 belongs to the previous day".
 */
export function businessDate(now: Date = new Date()): string {
  return bangkokCalendarDate(new Date(now.getTime() - BUSINESS_DAY_ROLLOVER_HOUR * 3_600_000));
}

/** `YYYY-MM` of the business date. */
export function businessMonth(now: Date = new Date()): string {
  return businessDate(now).slice(0, 7);
}

/** Hour of day (0-23) in Bangkok. */
export function bangkokHour(date: Date): number {
  return bangkokParts(date).hour;
}

/** `HH:MM` (or `HH:MM:SS`) in Bangkok, 24-hour. Never the viewer's timezone. */
export function bangkokTime(date: Date, withSeconds = false): string {
  const p = bangkokParts(date);
  return withSeconds ? `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}` : `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Adds whole days to a `YYYY-MM-DD` string. Pure calendar arithmetic, no timezone involved. */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Saturday or Sunday, for a `YYYY-MM-DD` calendar date. */
export function isWeekendDate(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
}

/** Short weekday name for a `YYYY-MM-DD` calendar date. */
export function weekdayName(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** True for a well-formed `YYYY-MM-DD` that names a real calendar day. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** "Wed, 7 Oct 2026" for a `YYYY-MM-DD`. Formatted in UTC so the date cannot shift. */
export function formatBusinessDateDisplay(dateStr: string): string {
  if (!isIsoDate(dateStr)) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
