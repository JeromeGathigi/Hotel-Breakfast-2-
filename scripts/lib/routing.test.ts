import { describe, it, expect } from 'vitest';
import { asHotelId, decodeExport, operaFileKind, pickForecastPlan, routeGuestList } from './routing';
import { planGuestListImport, type ForecastImportPlan, type HotelId } from '../../src/lib/guestImport';
import { parseInHouseReport } from '../../src/parsing';

const TODAY = '2026-09-02';
const GUEST_HEADER = ['RESORT', 'ROOM', 'ADULTS', 'CHILDREN', 'GUEST_NAME', 'RATE_CODE', 'ARRIVAL', 'DEPARTURE', 'RESV_NAME_ID'];
const guestList = (resort: string, n = 12) =>
  [GUEST_HEADER.join('\t'), ...Array.from({ length: n }, (_, i) => [resort, String(101 + i), '2', '0', `GUEST ${i}`, 'RB1', '01-SEP-26', '04-SEP-26', `R${i}`].join('\t'))].join('\n');
const FORECAST = ['STAY_DATE\tSTAY_DATE_CHAR\tSTAY_DAY\tPRODUCT_ID\tSUMTOTAL_PKGS', '02-SEP-26\t02-09-26\tWed\tBF\t3'].join('\n');

describe('asHotelId', () => {
  it('accepts the two hotels and nothing else - not the Firebase project id the old importer fell back to', () => {
    expect(asHotelId('Novotel')).toBe('novotel');
    expect(asHotelId(' ibis ')).toBe('ibis');
    expect(asHotelId('polished-bonfire-cdtd0')).toBeNull();
    expect(asHotelId(undefined)).toBeNull();
  });
});

describe('operaFileKind / decodeExport', () => {
  it('tells a forecast from a guest list by content', () => {
    expect(operaFileKind(FORECAST)).toBe('package-forecast');
    expect(operaFileKind(guestList('HB4F8'))).toBe('guest-list');
  });

  it('removes a UTF-8 byte-order mark', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(FORECAST)]);
    expect(decodeExport(withBom)).toBe(FORECAST);
  });

  it('decodes a UTF-16 export as the browser does, where a utf8 read gives NUL-riddled text', () => {
    const utf16 = new Uint8Array(2 + FORECAST.length * 2);
    utf16[0] = 0xff;
    utf16[1] = 0xfe;
    for (let i = 0; i < FORECAST.length; i++) utf16[2 + i * 2] = FORECAST.charCodeAt(i);
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(utf16.subarray(2))).toContain('\u0000');
    expect(decodeExport(utf16)).toBe(FORECAST);
    expect(operaFileKind(decodeExport(utf16))).toBe('package-forecast');
  });
});

describe('routeGuestList', () => {
  const parse = (text: string) => parseInHouseReport(text, 'novotel', { today: TODAY });

  it("uses the file's RESORT column over the configured hotel", () => {
    expect(routeGuestList(parse(guestList('HB9U9')), null, 'novotel')).toEqual({ hotelId: 'ibis', reason: '' });
  });

  it('uses the configured hotel only when the file cannot say', () => {
    expect(routeGuestList(parse(guestList('')), null, 'ibis').hotelId).toBe('ibis');
    const none = routeGuestList(parse(guestList('')), null, null);
    expect(none.hotelId).toBeNull();
    expect(none.reason).toMatch(/no RESORT column/);
  });

  it('passes an explicit hotel through, and the plan then refuses a file for the other one', () => {
    const text = guestList('HB9U9');
    const parsed = parse(text);
    const route = routeGuestList(parsed, 'novotel', null);
    expect(route.hotelId).toBe('novotel');
    const plan = planGuestListImport({
      parsed,
      filename: 'guests.txt',
      rawText: text,
      targetHotelId: route.hotelId as HotelId,
      today: TODAY,
      current: { roomIds: [], metadataDate: null },
    });
    expect(plan.ok).toBe(false);
    expect(plan.reason).toMatch(/for ibis/);
  });
});

describe('pickForecastPlan', () => {
  const fplan = (hotelId: HotelId, overlap: Record<HotelId, number> | null, ok = true, reason = ''): ForecastImportPlan => ({
    ok,
    reason,
    confirmations: [],
    warnings: [],
    hotelId,
    forecastDocs: [],
    index: null,
    overlap,
    todayBreakfast: null,
  });

  it('chooses the hotel whose guests the forecast lists', () => {
    const overlap = { novotel: 2, ibis: 30 };
    const picked = pickForecastPlan([fplan('novotel', overlap, false, "it is ibis's forecast"), fplan('ibis', overlap)], null);
    expect(picked.plan?.hotelId).toBe('ibis');
  });

  it('prefers the larger overlap when both plans are allowed', () => {
    const overlap = { novotel: 3, ibis: 2 };
    expect(pickForecastPlan([fplan('novotel', overlap), fplan('ibis', overlap)], 'ibis').plan?.hotelId).toBe('novotel');
  });

  it('refuses a tie rather than guessing', () => {
    const overlap = { novotel: 4, ibis: 4 };
    const picked = pickForecastPlan([fplan('novotel', overlap), fplan('ibis', overlap)], null);
    expect(picked.plan).toBeNull();
    expect(picked.reason).toMatch(/cannot be assigned automatically/);
  });

  it('falls back to the configured hotel only when no reservation matches either list', () => {
    const overlap = { novotel: 0, ibis: 0 };
    expect(pickForecastPlan([fplan('novotel', overlap), fplan('ibis', overlap)], 'ibis').plan?.hotelId).toBe('ibis');
    expect(pickForecastPlan([fplan('novotel', overlap), fplan('ibis', overlap)], null).plan).toBeNull();
  });

  it("reports the file's own problem when every plan refuses it", () => {
    const picked = pickForecastPlan([fplan('novotel', null, false, 'not a forecast'), fplan('ibis', null, false, 'not a forecast')], 'novotel');
    expect(picked).toEqual({ plan: null, reason: 'not a forecast' });
  });

  it('with an explicit hotel, returns that plan as it stands', () => {
    const only = fplan('novotel', { novotel: 0, ibis: 9 }, false, "it is ibis's forecast");
    expect(pickForecastPlan([only], null)).toEqual({ plan: only, reason: "it is ibis's forecast" });
  });
});
