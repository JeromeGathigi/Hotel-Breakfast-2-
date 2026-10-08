import { describe, it, expect } from 'vitest';
import { parseInHouseReport } from '../parsing';
import { forecastDocsFrom, isLegacyForecast, planForecastImport, planGuestListImport, summariseDay } from './guestImport';
import type { CheckIn, Guest } from '../types';

const TODAY = '2026-09-02';
const HEADER = ['RESORT', 'ROOM', 'ADULTS', 'CHILDREN', 'GUEST_NAME', 'RATE_CODE', 'ARRIVAL', 'DEPARTURE', 'RESV_NAME_ID'];

function inHouse(rows: Array<Partial<Record<(typeof HEADER)[number], string>>>): string {
  const base = { RESORT: 'HB4F8', ADULTS: '2', CHILDREN: '0', RATE_CODE: 'RB1', ARRIVAL: '01-SEP-26', DEPARTURE: '04-SEP-26' };
  return [HEADER.join('\t'), ...rows.map((r, i) => HEADER.map((h) => (r as any)[h] ?? (base as any)[h] ?? (h === 'GUEST_NAME' ? `GUEST ${i}` : h === 'RESV_NAME_ID' ? `R${i}` : '')).join('\t'))].join('\n');
}

function plan(text: string, over: Partial<Parameters<typeof planGuestListImport>[0]> = {}) {
  const parsed = parseInHouseReport(text, over.targetHotelId ?? 'novotel', { today: TODAY });
  return planGuestListImport({
    parsed,
    filename: 'guests.txt',
    rawText: text,
    targetHotelId: 'novotel',
    today: TODAY,
    current: { roomIds: [], metadataDate: null },
    ...over,
  });
}

const rooms = (n: number, extra: Partial<Record<string, string>> = {}) =>
  Array.from({ length: n }, (_, i) => ({ ROOM: String(101 + i), ...extra }));

describe('planGuestListImport', () => {
  it('replaces the list: departed rooms are removed, not left on the door', () => {
    const p = plan(inHouse(rooms(12)), { current: { roomIds: ['101', '102', '999'], metadataDate: '2026-09-01' } });
    expect(p.ok).toBe(true);
    expect(p.removedRoomIds).toEqual(['999']);
    expect(p.addedRoomIds).toHaveLength(10);
  });

  it("archives yesterday's list before replacing it, but not a same-day re-import", () => {
    expect(plan(inHouse(rooms(12)), { current: { roomIds: ['101'], metadataDate: '2026-09-01' } }).archiveDate).toBe('2026-09-01');
    expect(plan(inHouse(rooms(12)), { current: { roomIds: ['101'], metadataDate: TODAY } }).archiveDate).toBeNull();
  });

  it('never archives junk that is not a room - the 8 room-type documents in production', () => {
    const p = plan(inHouse(rooms(12)), { current: { roomIds: ['KGAGS', 'TWB', 'UNASSIGNED'], metadataDate: '2026-08-31' } });
    expect(p.archiveDate).toBeNull();
    expect(p.removedRoomIds).toEqual(['KGAGS', 'TWB', 'UNASSIGNED']);
  });

  it('refuses a file for the other property', () => {
    const p = plan(inHouse(rooms(12, { RESORT: 'HB9U9' })));
    expect(p.ok).toBe(false);
    expect(p.reason).toMatch(/for ibis \(resort HB9U9\), but you are importing into Novotel/);
  });

  it('refuses a file holding both properties', () => {
    const p = plan(inHouse([...rooms(6), ...rooms(6, { RESORT: 'HB9U9' }).map((r, i) => ({ ...r, ROOM: String(201 + i) }))]));
    expect(p.ok).toBe(false);
    expect(p.reason).toMatch(/both hotels/);
  });

  it('asks for confirmation when the file cannot say which property it is', () => {
    const p = plan(inHouse(rooms(12, { RESORT: '' })));
    expect(p.ok).toBe(true);
    expect(p.confirmations.join(' ')).toMatch(/no RESORT column/);
  });

  it("asks for confirmation when the file is not today's", () => {
    const p = plan(inHouse(rooms(12)), { today: '2026-09-06' });
    expect(p.confirmations.join(' ')).toMatch(/not today's list.*2026-09-04/);
  });

  it('asks for confirmation when the list shrinks by more than half', () => {
    const current = Array.from({ length: 40 }, (_, i) => String(101 + i));
    const p = plan(inHouse(rooms(12)), { current: { roomIds: current, metadataDate: '2026-09-01' } });
    expect(p.confirmations.join(' ')).toMatch(/12 rooms; the list it replaces has 40/);
  });

  it('still refuses a package forecast imported as a guest list', () => {
    const forecast = ['STAY_DATE\tSTAY_DATE_CHAR\tSTAY_DAY\tPRODUCT_ID\tSUMTOTAL_PKGS', '02-SEP-26\t02-09-26\tWed\tBF\t3'].join('\n');
    const p = plan(forecast);
    expect(p.ok).toBe(false);
    expect(p.reason).toMatch(/Package Forecast/);
  });
});

describe('summariseDay', () => {
  const g = (room: string, rate: string, over: Partial<Guest> = {}): Guest => ({
    roomNumber: room, guestName: 'G', arrivalDate: '2026-09-01', departureDate: '2026-09-04', mealPlan: rate, rateCode: rate,
    adults: 2, children: 0, resvNameId: room, hotelId: 'novotel', ...over,
  });
  const c = (room: string, hourUtc: number, adults = 2): CheckIn => ({
    roomNumber: room, guestName: 'G', hotelId: 'novotel', date: TODAY, mealService: 'breakfast',
    timestamp: new Date(Date.UTC(2026, 8, 1, hourUtc, 15)), adultsAte: adults, childrenAte: 0, infantsAte: 0, recordedBy: 'h@accor.com',
  });

  const day = summariseDay({
    date: TODAY,
    hotelId: 'novotel',
    guests: [
      g('101', 'RB1'), // booked, came
      g('102', 'RB1'), // booked, no-show
      g('103', 'RA1'), // room only, came anyway (paid)
      g('104', 'C01MRO'), // unverified
      g('105', 'RB1', { arrivalDate: TODAY }), // arrived today: first breakfast tomorrow
    ],
    checkins: [c('101', 0), c('103', 1, 1)], // 07:15 and 08:15 Bangkok
    overrides: [],
    packages: null,
    toDate: (t) => (t instanceof Date ? t : null),
  });

  it('counts booked rooms and no-shows, leaving out today\'s arrivals', () => {
    expect(day.booked).toMatchObject({ rooms: 2, pax: 4, unverifiedRooms: 1, unverifiedPax: 2 });
    expect(day.noShow).toEqual({ rooms: 1, pax: 2 });
  });

  it('counts what actually came, by Bangkok hour', () => {
    expect(day.actual).toMatchObject({ rooms: 2, pax: 3, byHour: { '07': 2, '08': 1 } });
  });

  it('keeps guests who ate without a confirmed booking apart', () => {
    expect(day.unbooked).toEqual({ rooms: 1, pax: 1 });
  });
});

describe('package forecast import', () => {
  const rows = [
    { stayDate: TODAY, dayOfWeek: 'Wed', productCode: 'BF350NET', packages: 69, isBreakfast: true },
    { stayDate: TODAY, dayOfWeek: 'Wed', productCode: 'MBREAK', packages: 4, isBreakfast: false },
    { stayDate: TODAY, dayOfWeek: 'Wed', productCode: 'DINNER', packages: 5, isBreakfast: false },
  ];

  it('never counts meeting packages as restaurant covers', () => {
    const [d] = forecastDocsFrom(rows, 'novotel', 'f.txt', TODAY);
    expect(d).toMatchObject({ totalBreakfast: 69, meetingPackages: 4, totalDinner: 5, totalCovers: 74, source: 'package-forecast' });
  });

  it('marks documents from the old over-counting parser as legacy', () => {
    expect(isLegacyForecast({ date: TODAY })).toBe(true);
    expect(isLegacyForecast({ source: 'package-forecast' })).toBe(false);
  });

  it('refuses a file that is not a forecast', () => {
    expect(planForecastImport({ rawText: 'ROOM\tGUEST_NAME', filename: 'x', targetHotelId: 'novotel', today: TODAY, currentResvIds: {} }).ok).toBe(false);
  });
});
