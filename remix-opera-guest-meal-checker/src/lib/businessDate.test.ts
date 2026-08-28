import { describe, expect, it } from 'vitest';
import { bangkokHour, DAY_BOUNDARY_HOUR, businessDate, businessMonth } from './businessDate';

/** Bangkok is UTC+7 with no DST, so local = UTC + 7h. */
const bangkok = (iso: string) => new Date(iso);

describe('businessDate', () => {
  it('keeps the current business date in Bangkok time', () => {
    expect(businessDate(bangkok('2026-08-25T22:05:00Z'))).toBe('2026-08-26'); // 05:05 local
    expect(businessDate(bangkok('2026-08-26T00:30:00Z'))).toBe('2026-08-26'); // 07:30 local
    expect(businessDate(bangkok('2026-08-25T20:00:00Z'))).toBe('2026-08-25'); // 03:00 local
    expect(businessDate(bangkok('2026-08-25T21:00:00Z'))).toBe('2026-08-26'); // 04:00 local
  });

  /**
   * REGRESSION — the defect that wiped the guest list mid-service.
   *
   * The app previously derived "today" from `new Date().toISOString()`, the UTC date,
   * which advances at 07:00 Bangkok — one hour into breakfast service. The whole
   * 06:00-10:30 window must resolve to one business date or check-ins split across two
   * Firestore paths and the daily reset fires while guests are still eating.
   */
  it('maps the entire breakfast service window to a single business date', () => {
    const service = [
      '2026-08-25T23:00:00Z', // 06:00 local — service opens
      '2026-08-25T23:59:00Z', // 06:59 local
      '2026-08-26T00:00:00Z', // 07:00 local — the old UTC rollover
      '2026-08-26T00:01:00Z', // 07:01 local
      '2026-08-26T02:00:00Z', // 09:00 local
      '2026-08-26T03:30:00Z', // 10:30 local — service closes
    ].map((iso) => businessDate(bangkok(iso)));

    expect(new Set(service).size).toBe(1);
    expect(service[0]).toBe('2026-08-26');
  });

  it('rolls over at 04:00 local, well clear of service', () => {
    expect(DAY_BOUNDARY_HOUR).toBe(4);
    expect(businessDate(bangkok('2026-08-25T20:59:59Z'))).toBe('2026-08-25'); // 03:59:59
    expect(businessDate(bangkok('2026-08-25T21:00:00Z'))).toBe('2026-08-26'); // 04:00:00
  });

  it('handles local midnight, where some engines format the hour as 24', () => {
    expect(businessDate(bangkok('2026-08-25T17:00:00Z'))).toBe('2026-08-25'); // 00:00 local 26th
    expect(businessDate(bangkok('2026-08-25T17:59:00Z'))).toBe('2026-08-25'); // 00:59 local 26th
  });

  it('rolls back across a month boundary', () => {
    expect(businessDate(bangkok('2026-08-31T18:00:00Z'))).toBe('2026-08-31'); // 01:00 local 1 Sep
    expect(businessDate(bangkok('2026-08-31T21:00:00Z'))).toBe('2026-09-01'); // 04:00 local 1 Sep
  });

  it('rolls back across a year boundary', () => {
    expect(businessDate(bangkok('2026-12-31T18:00:00Z'))).toBe('2026-12-31'); // 01:00 local 1 Jan
  });

  it('derives the business month from the business date', () => {
    expect(businessMonth(bangkok('2026-08-31T18:00:00Z'))).toBe('2026-08');
    expect(businessMonth(bangkok('2026-08-31T21:00:00Z'))).toBe('2026-09');
  });

  it('reports the Bangkok hour independent of the browser timezone', () => {
    expect(bangkokHour(new Date('2026-08-25T23:00:00Z'))).toBe(6);
  });
});
