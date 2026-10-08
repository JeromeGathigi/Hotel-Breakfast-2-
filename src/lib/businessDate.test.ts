import { describe, it, expect } from 'vitest';
import {
  addDays,
  bangkokHour,
  bangkokTime,
  businessDate,
  businessMonth,
  formatBusinessDateDisplay,
  isIsoDate,
  isWeekendDate,
  weekdayName,
} from './businessDate';

// Instants are written in UTC; Bangkok is UTC+7 with no DST.
const at = (iso: string) => new Date(iso);

describe('businessDate', () => {
  it('rolls over at 04:00 Bangkok, not at midnight and not at 07:00', () => {
    // 03:59 Bangkok on 8 Sep = 20:59 UTC on 7 Sep -> still the 7th
    expect(businessDate(at('2026-09-07T20:59:00Z'))).toBe('2026-09-07');
    // 04:00 Bangkok on 8 Sep = 21:00 UTC on 7 Sep -> the 8th
    expect(businessDate(at('2026-09-07T21:00:00Z'))).toBe('2026-09-08');
    // 06:30 Bangkok, breakfast service -> the 8th. The original UTC bug said the 7th here.
    expect(businessDate(at('2026-09-07T23:30:00Z'))).toBe('2026-09-08');
  });

  it('keeps the small hours with the night before', () => {
    // 02:00 Bangkok on 1 Jan 2027 is still New Year's Eve business day
    expect(businessDate(at('2026-12-31T19:00:00Z'))).toBe('2026-12-31');
    expect(businessDate(at('2026-12-31T21:00:00Z'))).toBe('2027-01-01');
  });

  it('crosses month and leap-year boundaries', () => {
    expect(businessDate(at('2028-02-28T21:30:00Z'))).toBe('2028-02-29');
    expect(businessDate(at('2028-02-29T21:30:00Z'))).toBe('2028-03-01');
    expect(businessMonth(at('2026-09-30T20:00:00Z'))).toBe('2026-09');
    expect(businessMonth(at('2026-09-30T21:00:00Z'))).toBe('2026-10');
  });
});

describe('Bangkok wall clock', () => {
  it('reports the Bangkok hour and time whatever the device timezone', () => {
    expect(bangkokHour(at('2026-09-07T23:15:00Z'))).toBe(6);
    expect(bangkokTime(at('2026-09-07T23:15:09Z'))).toBe('06:15');
    expect(bangkokTime(at('2026-09-07T23:15:09Z'), true)).toBe('06:15:09');
    expect(bangkokHour(at('2026-09-07T17:00:00Z'))).toBe(0); // midnight is 0, never 24
  });
});

describe('calendar helpers', () => {
  it('adds days across month ends', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('knows weekends and weekday names', () => {
    expect(isWeekendDate('2026-09-05')).toBe(true); // Saturday
    expect(isWeekendDate('2026-09-06')).toBe(true); // Sunday
    expect(isWeekendDate('2026-09-07')).toBe(false);
    expect(weekdayName('2026-09-02')).toBe('Wed');
  });

  it('validates ISO dates strictly', () => {
    expect(isIsoDate('2026-09-02')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('02-09-26')).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });

  it('formats a business date without shifting it', () => {
    expect(formatBusinessDateDisplay('2026-10-07')).toBe('Wed, 7 Oct 2026');
    expect(formatBusinessDateDisplay('not a date')).toBe('not a date');
  });
});
