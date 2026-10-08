import type { CheckIn, Guest, MealForecastItem, ReportMetadata } from '../types';
import { RESORT_CODES, isValidRoomNumber, type ParseResult } from '../parsing';
import { assessImport, assessForecastImport } from './importGuard';
import { assessGuestBreakfast, summariseBreakfast } from './entitlement';
import { applyOverride, type RoomOverride } from './overrides';
import { addDays, bangkokHour } from './businessDate';
import { FORECAST_PRODUCTS, parsePackageForecast } from '../parsing/forecastExport';
import { buildPackageIndex, parsePackageDetail, type PackageIndex } from '../parsing/packageDetail';

/**
 * Importing Opera files: the single implementation behind the app's Import screen and
 * scripts/importOpera.ts.
 *
 * They used to be two implementations that disagreed. The app's import set each room in the new
 * file and NEVER removed anything - so a guest who checked out stayed on the door list, with their
 * breakfast entitlement, until someone else was put in that room. The CLI did remove departed rooms,
 * but saved guests without their notes, block code or rate code, and wrote every row to whichever
 * hotel its environment variable named, whatever the file said.
 *
 * Everything here is pure: it plans the writes, and a thin adapter for each SDK performs them.
 */

export type HotelId = 'novotel' | 'ibis';

const HOTEL_NAME: Record<HotelId, string> = { novotel: 'Novotel', ibis: 'ibis' };
const RESORT_OF: Record<HotelId, string> = { novotel: 'HB4F8', ibis: 'HB9U9' };

/* =========================================================================
   GUEST LIST (Opera "Guests INH - By Room")
   ========================================================================= */

export interface GuestImportPlan {
  ok: boolean;
  /** Why the import is refused. Empty when ok. */
  reason: string;
  /** Problems the operator must explicitly accept before the import is allowed. */
  confirmations: string[];
  /** Worth knowing; no action needed. */
  warnings: string[];
  hotelId: HotelId;
  rooms: Guest[];
  addedRoomIds: string[];
  removedRoomIds: string[];
  /** Business date of the list being replaced, archived first; null when there is nothing to archive. */
  archiveDate: string | null;
  stats: NonNullable<ReportMetadata['stats']>;
}

/** A hotel's list as it stands before an import. Read by src/lib/firestoreImport.ts and scripts/lib/adminImport.ts. */
export interface CurrentList {
  /** Keyed by DOCUMENT id: the junk documents in production are room-type codes and must be found to be removed. */
  guests: Guest[];
  metadataDate: string | null;
  packages: PackageIndex | null;
}

export interface GuestImportInput {
  parsed: ParseResult;
  filename: string;
  rawText: string;
  targetHotelId: HotelId;
  today: string;
  current: { roomIds: string[]; metadataDate: string | null };
  packages?: PackageIndex | null;
}

const refuse = (hotelId: HotelId, reason: string): GuestImportPlan => ({
  ok: false,
  reason,
  confirmations: [],
  warnings: [],
  hotelId,
  rooms: [],
  addedRoomIds: [],
  removedRoomIds: [],
  archiveDate: null,
  stats: { totalRooms: 0, totalGuests: 0, totalEntitledBreakfast: 0, vipCount: 0, anomaliesCount: 0 },
});

export function planGuestListImport(input: GuestImportInput): GuestImportPlan {
  const { parsed, filename, rawText, targetHotelId, today, current } = input;
  const guard = assessImport(parsed, filename, rawText);
  if (!guard.ok) return refuse(targetHotelId, guard.reason);

  const confirmations: string[] = [];
  const warnings = [...guard.warnings];

  // Which property the FILE says it is. Never guessed from a filename or room-number ranges.
  const hotelsInFile = new Set(parsed.resortCodes.map((c) => RESORT_CODES[c]).filter(Boolean));
  if (hotelsInFile.size > 1) {
    return refuse(
      targetHotelId,
      `This export contains rooms from both hotels (${parsed.resortCodes.join(' and ')}). Export each ` +
        `property's "Guests INH - By Room" report separately and import them one at a time.`
    );
  }
  const fileHotel = [...hotelsInFile][0] as HotelId | undefined;
  if (fileHotel && fileHotel !== targetHotelId) {
    return refuse(
      targetHotelId,
      `This export is for ${HOTEL_NAME[fileHotel]} (resort ${RESORT_OF[fileHotel]}), but you are importing ` +
        `into ${HOTEL_NAME[targetHotelId]}. Switch to ${HOTEL_NAME[fileHotel]} first. Nothing was written.`
    );
  }
  if (!fileHotel) {
    confirmations.push(
      `The file has no RESORT column, so it cannot confirm it is ${HOTEL_NAME[targetHotelId]}'s guest list. ` +
        `Import only if you exported it from ${HOTEL_NAME[targetHotelId]}'s Opera.`
    );
  }

  // Whether the FILE is from today. A list pulled for day D has every arrival on or before D and
  // every departure on or after D.
  if (parsed.dateWindow) {
    const { latestArrival, earliestDeparture } = parsed.dateWindow;
    if (earliestDeparture < today) {
      confirmations.push(
        `This is not today's list: it still has guests due to leave on ${earliestDeparture}, so it was ` +
          `exported on or before that day. Importing it would show an old house as today's.`
      );
    }
    if (latestArrival > today) {
      confirmations.push(
        `The file contains arrivals dated ${latestArrival}, after today (${today}). Check that this ` +
          `device's date and the export are right before importing.`
      );
    }
  } else {
    warnings.push('No usable arrival or departure dates in the file, so its date cannot be checked.');
  }

  const rooms = parsed.rooms.filter((r) => r.hotelId === targetHotelId || !fileHotel);
  const newIds = new Set(rooms.map((r) => r.roomNumber));
  const currentIds = new Set(current.roomIds);
  const addedRoomIds = [...newIds].filter((id) => !currentIds.has(id)).sort(numericSort);
  const removedRoomIds = [...currentIds].filter((id) => !newIds.has(id)).sort(numericSort);

  if (currentIds.size >= 20 && rooms.length < currentIds.size * 0.5) {
    confirmations.push(
      `The new list has ${rooms.length} rooms; the list it replaces has ${currentIds.size}. If the export ` +
        `was cut short, the missing rooms would disappear from the door.`
    );
  }

  const summary = summariseBreakfast(rooms, (g) => assessGuestBreakfast(g, { today, packages: input.packages ?? null }));

  return {
    ok: true,
    reason: '',
    confirmations,
    warnings,
    hotelId: targetHotelId,
    rooms,
    addedRoomIds,
    removedRoomIds,
    archiveDate:
      current.roomIds.some(isValidRoomNumber) && current.metadataDate && current.metadataDate !== today
        ? current.metadataDate
        : null,
    stats: {
      totalRooms: rooms.length,
      totalGuests: summary.pax,
      totalEntitledBreakfast: summary.includedPax,
      totalUnverifiedBreakfast: summary.unverifiedPax,
      unverifiedRateCodes: summary.unverifiedCodes,
      totalEntitledDinner: parsed.stats.totalDinnerPax,
      vipCount: rooms.filter((g) => g.vipStatus).length,
      anomaliesCount: parsed.anomalies.length,
      departedRooms: removedRoomIds.length,
      arrivedRooms: addedRoomIds.length,
    },
  };
}

function numericSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

/* =========================================================================
   THE DAY'S SUMMARY, written when its list is archived
   ========================================================================= */

/**
 * One document per hotel per business date, at hotels/{id}/history/{date}. Written when that day's
 * list is replaced by the next import, so the archive and the day's check-ins are both final.
 *
 * This is the daily aggregate the spec's analytics page needs (section 10: rooms and persons booked
 * with meals, rooms and persons that came, no-shows) and the reason no scheduled job is needed: on
 * the Spark plan nothing can run on a schedule, but the next morning's import always runs.
 */
export interface DaySummary {
  date: string;
  hotelId: HotelId;
  source: 'guest-list-archive';
  rooms: number;
  pax: number;
  booked: { rooms: number; adults: number; children: number; pax: number; unverifiedRooms: number; unverifiedPax: number };
  actual: { rooms: number; adults: number; children: number; infants: number; pax: number; byHour: Record<string, number> };
  noShow: { rooms: number; pax: number };
  /** Checked in without a confirmed booking: room-only or unverified rooms that ate. */
  unbooked: { rooms: number; pax: number };
}

export function summariseDay(args: {
  date: string;
  hotelId: HotelId;
  guests: Guest[];
  checkins: CheckIn[];
  overrides: RoomOverride[];
  packages: PackageIndex | null;
  toDate: (ts: unknown) => Date | null;
}): DaySummary {
  const { date, hotelId, checkins, packages, toDate } = args;
  const overrideByRoom = new Map(args.overrides.filter((o) => o.date === date).map((o) => [o.roomNumber, o]));
  const guests = args.guests
    .map((g) => applyOverride(g, overrideByRoom.get(g.roomNumber), date))
    .filter((g): g is Guest => g !== null);

  const breakfastCheckins = checkins.filter((c) => (c.mealService ?? 'breakfast') === 'breakfast');
  const ate = new Map(breakfastCheckins.map((c) => [c.roomNumber, c]));

  const s: DaySummary = {
    date,
    hotelId,
    source: 'guest-list-archive',
    rooms: guests.length,
    pax: 0,
    booked: { rooms: 0, adults: 0, children: 0, pax: 0, unverifiedRooms: 0, unverifiedPax: 0 },
    actual: { rooms: 0, adults: 0, children: 0, infants: 0, pax: 0, byHour: {} },
    noShow: { rooms: 0, pax: 0 },
    unbooked: { rooms: 0, pax: 0 },
  };

  for (const g of guests) {
    const roomPax = (Number(g.adults) || 0) + (Number(g.children) || 0);
    s.pax += roomPax;
    const a = assessGuestBreakfast(g, { today: date, packages, override: overrideByRoom.get(g.roomNumber) ?? null });
    if (a.arrivesToday) continue; // their first breakfast is tomorrow
    const checkin = ate.get(g.roomNumber);
    if (a.unverified) {
      s.booked.unverifiedRooms += 1;
      s.booked.unverifiedPax += roomPax;
    } else if (a.entitled) {
      s.booked.rooms += 1;
      s.booked.adults += Number(g.adults) || 0;
      s.booked.children += Number(g.children) || 0;
      s.booked.pax += a.pax;
      if (!checkin) {
        s.noShow.rooms += 1;
        s.noShow.pax += a.pax;
      }
    }
    if (checkin && !(a.entitled && !a.unverified)) {
      s.unbooked.rooms += 1;
      s.unbooked.pax += (Number(checkin.adultsAte) || 0) + (Number(checkin.childrenAte) || 0);
    }
  }

  for (const c of breakfastCheckins) {
    const pax = (Number(c.adultsAte) || 0) + (Number(c.childrenAte) || 0) + (Number(c.infantsAte) || 0);
    s.actual.rooms += 1;
    s.actual.adults += Number(c.adultsAte) || 0;
    s.actual.children += Number(c.childrenAte) || 0;
    s.actual.infants += Number(c.infantsAte) || 0;
    s.actual.pax += pax;
    const at = toDate(c.timestamp);
    if (at) {
      const hour = String(bangkokHour(at)).padStart(2, '0');
      s.actual.byHour[hour] = (s.actual.byHour[hour] ?? 0) + pax;
    }
  }
  return s;
}

/** What the archive keeps per room: what the analytics need, without the free-text notes. */
export function archiveRecord(g: Guest, date: string, packages: PackageIndex | null, override: RoomOverride | null) {
  const a = assessGuestBreakfast(g, { today: date, packages, override });
  return {
    roomNumber: g.roomNumber,
    guestName: g.guestName,
    accompanyingGuests: g.accompanyingGuests ?? [],
    hotelId: g.hotelId,
    adults: Number(g.adults) || 0,
    children: Number(g.children) || 0,
    rateCode: g.rateCode ?? '',
    mealPlan: g.mealPlan ?? '',
    blockCode: g.blockCode ?? '',
    companyName: g.companyName ?? '',
    vipStatus: g.vipStatus ?? null,
    arrivalDate: g.arrivalDate ?? '',
    departureDate: g.departureDate ?? '',
    breakfast: { entitled: a.entitled, unverified: a.unverified, basis: a.basis, pax: a.pax },
  };
}

/* =========================================================================
   PACKAGE FORECAST
   ========================================================================= */

export interface ForecastImportPlan {
  ok: boolean;
  reason: string;
  confirmations: string[];
  warnings: string[];
  hotelId: HotelId;
  forecastDocs: MealForecastItem[];
  index: PackageIndex | null;
  /** Reservations in the file that also appear in each hotel's current guest list. */
  overlap: Record<HotelId, number> | null;
  todayBreakfast: number | null;
}

export function planForecastImport(input: {
  rawText: string;
  filename: string;
  targetHotelId: HotelId;
  today: string;
  currentResvIds: Partial<Record<HotelId, string[]>>;
}): ForecastImportPlan {
  const { rawText, filename, targetHotelId, today } = input;
  const parsed = parsePackageForecast(rawText, targetHotelId);
  const guard = assessForecastImport(parsed, filename);
  const empty: ForecastImportPlan = {
    ok: false,
    reason: guard.reason,
    confirmations: [],
    warnings: [],
    hotelId: targetHotelId,
    forecastDocs: [],
    index: null,
    overlap: null,
    todayBreakfast: null,
  };
  if (!guard.ok) return empty;

  const confirmations: string[] = [];
  const warnings = [...guard.warnings];
  const detail = parsePackageDetail(rawText);
  warnings.push(...detail.anomalies.filter((a) => !warnings.includes(a)));
  const index = detail.reservations.length ? buildPackageIndex(targetHotelId, detail, filename) : null;

  // The forecast carries no resort code. Tell the properties apart by which hotel's current guests
  // it lists - never by filename.
  let overlap: Record<HotelId, number> | null = null;
  if (index) {
    const ids = new Set(Object.keys(index.byResv));
    const count = (h: HotelId) => (input.currentResvIds[h] ?? []).filter((id) => ids.has(id)).length;
    overlap = { novotel: count('novotel'), ibis: count('ibis') };
    const other: HotelId = targetHotelId === 'novotel' ? 'ibis' : 'novotel';
    if (overlap[other] > overlap[targetHotelId] && overlap[other] >= 5) {
      return {
        ...empty,
        reason:
          `This forecast lists ${overlap[other]} of ${HOTEL_NAME[other]}'s current guests and ${overlap[targetHotelId]} ` +
          `of ${HOTEL_NAME[targetHotelId]}'s, so it is ${HOTEL_NAME[other]}'s forecast. Switch to ` +
          `${HOTEL_NAME[other]} first. Nothing was written.`,
        overlap,
      };
    }
    if (overlap[targetHotelId] === 0) {
      confirmations.push(
        `None of the reservations in this forecast are in ${HOTEL_NAME[targetHotelId]}'s current guest list, so ` +
          `the app cannot confirm which hotel it belongs to. Import only if you exported it from ` +
          `${HOTEL_NAME[targetHotelId]}'s Opera.`
      );
    }
    if (index.reportDate && index.reportDate < addDays(today, -1)) {
      confirmations.push(
        `Opera produced this forecast on ${index.reportDate}. Reservations made since then are missing, so it ` +
          `cannot confirm who has breakfast today.`
      );
    }
  } else {
    warnings.push(
      'This forecast has no per-reservation block, so it gives daily totals only and cannot confirm breakfast room by room.'
    );
  }

  return {
    ok: true,
    reason: '',
    confirmations,
    warnings,
    hotelId: targetHotelId,
    forecastDocs: forecastDocsFrom(parsed.rows, targetHotelId, filename, detail.reportDate),
    index,
    overlap,
    todayBreakfast: parsed.breakfastByDate[today] ?? null,
  };
}

/** Per-date documents for hotels/{id}/forecasts/{date}. Meeting products are never breakfast covers. */
export function forecastDocsFrom(
  rows: ReturnType<typeof parsePackageForecast>['rows'],
  hotelId: HotelId,
  filename: string,
  reportDate: string
): MealForecastItem[] {
  const byDate = new Map<string, MealForecastItem>();
  for (const r of rows) {
    let item = byDate.get(r.stayDate);
    if (!item) {
      item = {
        source: 'package-forecast',
        filename,
        reportDate,
        date: r.stayDate,
        dayOfWeek: r.dayOfWeek,
        hotelId,
        packages: {},
        totalBreakfast: 0,
        totalLunch: 0,
        totalDinner: 0,
        totalBreaks: 0,
        meetingPackages: 0,
        totalCovers: 0,
      };
      byDate.set(r.stayDate, item);
    }
    item.packages[r.productCode] = r.packages;
    const service = FORECAST_PRODUCTS[r.productCode]?.service;
    if (r.isBreakfast) item.totalBreakfast += r.packages;
    else if (service === 'dinner') item.totalDinner += r.packages;
    else if (service === 'meeting-break' || r.productCode === 'MBUFF') {
      item.totalBreaks += r.packages;
      item.meetingPackages = (item.meetingPackages ?? 0) + r.packages;
    }
  }
  for (const item of byDate.values()) item.totalCovers = item.totalBreakfast + item.totalLunch + item.totalDinner;
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** True for forecast documents written by the previous, over-counting parser. */
export function isLegacyForecast(doc: Partial<MealForecastItem>): boolean {
  return doc.source !== 'package-forecast';
}

/* =========================================================================
   WRITE PLANS - executed in order by src/lib/firestoreImport.ts (app) and scripts/importOpera.ts
   ========================================================================= */

export type ImportOp =
  | { kind: 'set'; path: string[]; data: Record<string, unknown> }
  | { kind: 'delete'; path: string[] };

/**
 * The ordered writes for a guest-list import:
 *
 *   1. archive the outgoing list and its day's summary   (history/{date})
 *   2. write the new list                                 (guests/{room})
 *   3. remove rooms that are no longer in house            (guests/{room})
 *   4. metadata/reports LAST
 *
 * Sets come before deletes, so an interrupted import leaves extra rooms rather than missing ones,
 * and metadata comes last, so an interrupted import still reads as "not today's list" on the door's
 * freshness banner instead of certifying a half-written one.
 */
export function buildGuestImportOps(
  plan: GuestImportPlan,
  ctx: {
    filename: string;
    importedBy: string;
    today: string;
    currentGuests: Guest[];
    archiveCheckins: CheckIn[];
    overrides: RoomOverride[];
    packages: PackageIndex | null;
    timestamp: unknown;
    toDate: (ts: unknown) => Date | null;
  }
): ImportOp[] {
  const h = plan.hotelId;
  const ops: ImportOp[] = [];

  if (plan.archiveDate) {
    const date = plan.archiveDate;
    const overrideByRoom = new Map(ctx.overrides.filter((o) => o.date === date).map((o) => [o.roomNumber, o]));
    const archivable = ctx.currentGuests.filter((g) => isValidRoomNumber(g.roomNumber));
    for (const g of archivable) {
      ops.push({
        kind: 'set',
        path: ['hotels', h, 'history', date, 'guests', g.roomNumber],
        data: archiveRecord(g, date, ctx.packages, overrideByRoom.get(g.roomNumber) ?? null),
      });
    }
    const summary = summariseDay({
      date,
      hotelId: h,
      guests: archivable,
      checkins: ctx.archiveCheckins,
      overrides: ctx.overrides,
      packages: ctx.packages,
      toDate: ctx.toDate,
    });
    ops.push({ kind: 'set', path: ['hotels', h, 'history', date], data: { ...summary, archivedAt: ctx.timestamp } as unknown as Record<string, unknown> });
  }

  for (const g of plan.rooms) {
    ops.push({ kind: 'set', path: ['hotels', h, 'guests', g.roomNumber], data: { ...g, hotelId: h } as unknown as Record<string, unknown> });
  }
  for (const id of plan.removedRoomIds) {
    ops.push({ kind: 'delete', path: ['hotels', h, 'guests', id] });
  }

  const metadata: ReportMetadata = {
    date: ctx.today,
    hotelId: h,
    lastUploaded: ctx.timestamp,
    filename: ctx.filename,
    uploadedBy: ctx.importedBy,
    resortCode: RESORT_OF[h],
    stats: plan.stats,
    anomaliesCount: plan.stats.anomaliesCount,
  };
  ops.push({ kind: 'set', path: ['hotels', h, 'metadata', 'reports'], data: metadata as unknown as Record<string, unknown> });
  return ops;
}

/** Forecast documents for every date in the file, then the package index. */
export function buildForecastImportOps(
  plan: ForecastImportPlan,
  ctx: { importedBy: string; timestamp: unknown }
): ImportOp[] {
  const h = plan.hotelId;
  const ops: ImportOp[] = plan.forecastDocs.map((d) => ({
    kind: 'set' as const,
    path: ['hotels', h, 'forecasts', d.date],
    data: { ...d, importedAt: ctx.timestamp } as unknown as Record<string, unknown>,
  }));
  if (plan.index) {
    ops.push({
      kind: 'set',
      path: ['hotels', h, 'metadata', 'packages'],
      data: { ...plan.index, importedAt: ctx.timestamp, importedBy: ctx.importedBy } as unknown as Record<string, unknown>,
    });
  }
  return ops;
}
