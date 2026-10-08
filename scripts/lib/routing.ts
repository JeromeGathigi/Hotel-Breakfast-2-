import type { ParseResult } from '../../src/parsing';
import { RESORT_CODES } from '../../src/parsing';
import { looksLikePackageForecast } from '../../src/parsing/forecastExport';
import type { ForecastImportPlan, HotelId } from '../../src/lib/guestImport';

/**
 * Which hotel an Opera file belongs to, for the unattended importer.
 *
 * The importer used to write every file to `OPERA_HOTEL_ID ?? VITE_FIREBASE_PROJECT_ID ?? 'novotel'`.
 * The middle term is the Firebase project id, so a machine with only the app's .env.local wrote the
 * guest list to `hotels/polished-bonfire-cdtd0/guests` - a hotel the app never reads - and reported
 * success. The file now decides: a guest list by its RESORT column, a forecast by which hotel's
 * current guests it lists. A configured hotel is used only when the file cannot say.
 */

export const HOTEL_IDS: readonly HotelId[] = ['novotel', 'ibis'];

/** 'novotel' or 'ibis', case-insensitively; anything else (a project id, a typo) is null. */
export function asHotelId(value: unknown): HotelId | null {
  const v = String(value ?? '').trim().toLowerCase();
  return (HOTEL_IDS as readonly string[]).includes(v) ? (v as HotelId) : null;
}

export type OperaFileKind = 'guest-list' | 'package-forecast';

/** By content, never by filename. A forecast has STAY_DATE and PRODUCT_ID columns and no ROOM. */
export function operaFileKind(rawText: string): OperaFileKind {
  return looksLikePackageForecast(rawText) ? 'package-forecast' : 'guest-list';
}

/**
 * Text of an export as the Import screen's FileReader decodes it: a byte-order mark picks the
 * encoding and is removed. Node's `readFile(path, 'utf8')` would turn a UTF-16 export into text
 * with a NUL between every character, so the same file could import in the browser and fail here.
 */
export function decodeExport(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  return new TextDecoder('utf-8').decode(bytes);
}

export interface Routing {
  hotelId: HotelId | null;
  /** Why no hotel could be chosen. Empty when hotelId is set. */
  reason: string;
}

/**
 * The hotel a guest list is imported into: the operator's explicit choice, else the file's RESORT
 * column, else the configured hotel. An explicit choice that disagrees with the file is passed
 * through on purpose - planGuestListImport refuses it with a message naming both.
 */
export function routeGuestList(parsed: Pick<ParseResult, 'resortCodes'>, explicit: HotelId | null, configured: HotelId | null): Routing {
  if (explicit) return { hotelId: explicit, reason: '' };
  const inFile = [...new Set(parsed.resortCodes.map((c) => RESORT_CODES[c]).filter(Boolean))];
  if (inFile.length >= 1) return { hotelId: inFile[0], reason: '' }; // two hotels: the plan refuses the file
  if (configured) return { hotelId: configured, reason: '' };
  return { hotelId: null, reason: 'The file has no RESORT column, so it cannot say which hotel it belongs to.' };
}

/**
 * Picks between the forecast plans made for each hotel. The forecast names no property; the hotel
 * whose current guest list shares the most reservations with it is the one it belongs to.
 */
export function pickForecastPlan(plans: ForecastImportPlan[], configured: HotelId | null): { plan: ForecastImportPlan | null; reason: string } {
  if (plans.length === 0) return { plan: null, reason: 'Nothing to import.' };
  if (plans.length === 1) return { plan: plans[0], reason: plans[0].ok ? '' : plans[0].reason };

  const ok = plans.filter((p) => p.ok);
  // Every plan refused: the file itself is wrong (not a forecast, empty, ...). Same reason for each.
  if (ok.length === 0) return { plan: null, reason: plans[0].reason };

  const scored = ok
    .map((p) => ({ p, shared: p.overlap?.[p.hotelId] ?? 0 }))
    .sort((a, b) => b.shared - a.shared);
  const [best, next] = scored;
  if (best.shared > 0 && (!next || best.shared > next.shared)) return { plan: best.p, reason: '' };
  if (best.shared > 0) {
    return {
      plan: null,
      reason: `This forecast shares ${best.shared} reservations with each hotel's guest list, so it cannot be assigned automatically.`,
    };
  }
  const fallback = configured ? ok.find((p) => p.hotelId === configured) : undefined;
  if (fallback) return { plan: fallback, reason: '' };
  return {
    plan: null,
    reason: 'None of the reservations in this forecast are in either hotel\'s current guest list, so it cannot say which hotel it belongs to.',
  };
}
