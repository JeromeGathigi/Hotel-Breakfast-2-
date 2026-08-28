export const HOTEL_TZ = 'Asia/Bangkok';
export const DAY_BOUNDARY_HOUR = 4;

function getLocalParts(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: HOTEL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
  );

  return {
    year: Number(map.year ?? 0),
    month: Number(map.month ?? 0),
    day: Number(map.day ?? 0),
    // `hour12: false` resolves to the h23 cycle on modern engines but to h24 on some
    // older ICU builds and browsers, where local midnight formats as "24" rather than
    // "00". Left unnormalised, 24 < DAY_BOUNDARY_HOUR is false and every check-in
    // between 00:00 and 00:59 Bangkok would be filed under the wrong business date.
    hour: Number(map.hour ?? 0) % 24,
  };
}

export function businessDate(at: Date = new Date()): string {
  const { year, month, day, hour } = getLocalParts(at);

  if (hour < DAY_BOUNDARY_HOUR) {
    const previous = new Date(Date.UTC(year, month - 1, day));
    previous.setUTCDate(previous.getUTCDate() - 1);

    const previousParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(previous);

    const previousMap = Object.fromEntries(
      previousParts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
    );

    return `${previousMap.year}-${previousMap.month}-${previousMap.day}`;
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function businessMonth(at: Date = new Date()): string {
  return businessDate(at).slice(0, 7);
}

/** Hour 0-23 of an instant in Asia/Bangkok, independent of the viewer's timezone. */
export function bangkokHour(at: Date): number {
  const hour = new Intl.DateTimeFormat('en-CA', {
    timeZone: HOTEL_TZ,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(at).find((part) => part.type === 'hour')?.value ?? '0';
  return Number(hour) % 24;
}
