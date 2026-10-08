import { FORECAST_PRODUCTS, forecastDateToIso } from './forecastExport';

/**
 * The per-reservation block at the end of Opera's package-forecast export.
 *
 * `parsePackageForecast` reads the per-date totals and stops at this block, because it is not
 * forecast detail. But it is something more useful: one row per reservation with
 *
 *     RESV_NAME_ID   - the same key as the in-house export
 *     PRODUCTS       - "BF350NET", "BF", "BFCOMP", "BF350NET,DINNER", "MBREAK", ...
 *     PERSONS        - how many people the package covers
 *     ROOM, RATE_CODE, TRUNC_ARRIVAL, TRUNC_DEPARTURE, INSERT_DATE (when Opera produced the report)
 *
 * i.e. Opera's own record of which reservations carry a breakfast package. On the 2 Sep exports,
 * summing PERSONS over in-house reservations with a breakfast product (excluding that day's
 * arrivals, whose breakfast starts the next morning) gives 97 at Novotel against Opera's own
 * forecast of 98, and 41 at ibis against 43 - where the rate-code model alone could confirm 20 and
 * 7. PERSONS equalled the room's adults + children on every reservation that matched.
 *
 * A reservation absent from this block has no breakfast package - verified on the same exports:
 * every Novotel room departing that day was present, so absence is not a departure artefact.
 */

export interface PackageReservation {
  resvNameId: string;
  /** Distinct product codes across the reservation's rows, upper-case. */
  products: string[];
  persons: number;
  /** Room number when Opera has assigned one (checked-in reservations); '' otherwise. */
  room: string;
  rateCode: string;
  arrival: string;
  departure: string;
}

export interface PackageDetailResult {
  /** INSERT_DATE: the day Opera produced the report, ISO. '' when the block is absent. */
  reportDate: string;
  reservations: PackageReservation[];
  anomalies: string[];
}

/** Breakfast products by code. Unknown codes are never assumed to be breakfast. */
function isBreakfastProduct(code: string): boolean {
  return FORECAST_PRODUCTS[code]?.isBreakfast === true;
}

/** MBREAK and MBUFF: Opera files them under its breakfast forecast group, the spec counts MBREAK
 *  as breakfast, and the one front-office note that mentions MBREAK says "room only". Ambiguous. */
const MEETING_PRODUCTS = new Set(['MBREAK', 'MBUFF']);

export type PackageBreakfast = 'breakfast' | 'meeting-only' | 'none';

/** A breakfast product decides it; failing that, MBREAK/MBUFF make it ambiguous; else none. */
export function classifyPackages(products: string[]): PackageBreakfast {
  if (products.some(isBreakfastProduct)) return 'breakfast';
  if (products.some((p) => MEETING_PRODUCTS.has(p))) return 'meeting-only';
  return 'none';
}

export function parsePackageDetail(rawText: string): PackageDetailResult {
  const anomalies: string[] = [];
  const lines = String(rawText ?? '').split(/\r?\n/);
  const headerIndex = lines.findIndex((l) => {
    const cells = l.split('\t').map((c) => c.trim());
    return cells.includes('CONFIRMATION_NO') && cells.includes('RESV_NAME_ID') && cells.includes('PRODUCTS');
  });
  if (headerIndex === -1) {
    return { reportDate: '', reservations: [], anomalies: ['The file has no per-reservation package block.'] };
  }

  const headers = lines[headerIndex].split('\t').map((c) => c.trim());
  const col = (name: string) => headers.indexOf(name);
  const need = ['RESV_NAME_ID', 'PRODUCTS', 'PERSONS'];
  const missing = need.filter((n) => col(n) === -1);
  if (missing.length) {
    return { reportDate: '', reservations: [], anomalies: [`Package block is missing ${missing.join(', ')}.`] };
  }

  const byResv = new Map<string, PackageReservation>();
  const reportDates = new Set<string>();

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = line.split('\t').map((c) => c.trim());
    // The summary section that follows has its own headers; nothing after it is a reservation.
    if (cells.includes('STAY_DATE2') || cells.includes('SUM_TOTAL_PKGS_PERREPORT') || cells[0] === 'LOGO') break;

    const get = (name: string) => (col(name) === -1 ? '' : cells[col(name)] ?? '');
    const resvNameId = get('RESV_NAME_ID');
    if (!resvNameId) {
      anomalies.push(`Package row ${i + 1} has no RESV_NAME_ID and was skipped.`);
      continue;
    }

    const products = get('PRODUCTS')
      .split(',')
      .map((p) => p.trim().toUpperCase())
      .filter(Boolean);
    const persons = Number.parseInt(get('PERSONS'), 10);
    const insert = forecastDateToIso(get('INSERT_DATE'));
    if (insert) reportDates.add(insert);

    const existing = byResv.get(resvNameId);
    if (existing) {
      // One row per reservation in every export seen so far; merge defensively if that changes.
      existing.products = [...new Set([...existing.products, ...products])];
      if (Number.isFinite(persons)) existing.persons = Math.max(existing.persons, persons);
      existing.room = existing.room || get('ROOM');
      continue;
    }

    byResv.set(resvNameId, {
      resvNameId,
      products,
      persons: Number.isFinite(persons) ? persons : 0,
      room: get('ROOM'),
      rateCode: get('RATE_CODE').toUpperCase(),
      arrival: forecastDateToIso(get('TRUNC_ARRIVAL')),
      departure: forecastDateToIso(get('TRUNC_DEPARTURE')),
    });
  }

  if (reportDates.size > 1) {
    anomalies.push(`The package block carries more than one INSERT_DATE (${[...reportDates].sort().join(', ')}).`);
  }
  const unknown = new Set<string>();
  for (const r of byResv.values()) for (const p of r.products) if (!FORECAST_PRODUCTS[p]) unknown.add(p);
  if (unknown.size) {
    anomalies.push(
      `Unrecognised package product(s): ${[...unknown].sort().join(', ')}. Reservations carrying only ` +
        `these are not counted as breakfast.`
    );
  }

  return {
    reportDate: [...reportDates].sort().pop() ?? '',
    reservations: [...byResv.values()],
    anomalies,
  };
}

/**
 * The compact form stored in Firestore at hotels/{id}/metadata/packages. No guest names - the
 * block carries them, but nothing downstream needs them, so they never leave the browser.
 */
export interface PackageIndex {
  hotelId: string;
  /** The day Opera produced the report (INSERT_DATE). */
  reportDate: string;
  reservations: number;
  /** resvNameId -> products joined with ',', persons, room. */
  byResv: Record<string, { p: string; n: number; r?: string }>;
  filename?: string;
  importedAt?: unknown;
  importedBy?: string;
}

export function buildPackageIndex(hotelId: string, detail: PackageDetailResult, filename = ''): PackageIndex {
  const byResv: PackageIndex['byResv'] = {};
  for (const r of detail.reservations) {
    byResv[r.resvNameId] = { p: r.products.join(','), n: r.persons, ...(r.room ? { r: r.room } : {}) };
  }
  return { hotelId, reportDate: detail.reportDate, reservations: detail.reservations.length, byResv, filename };
}

export interface PackageLookup {
  /** The reservation appears in Opera's package block. */
  present: boolean;
  status: PackageBreakfast;
  products: string[];
  persons: number;
}

export function lookupPackages(index: PackageIndex | null | undefined, resvNameId: string): PackageLookup | null {
  if (!index || !index.byResv) return null;
  const hit = index.byResv[resvNameId];
  if (!hit) return { present: false, status: 'none', products: [], persons: 0 };
  const products = String(hit.p ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return { present: true, status: classifyPackages(products), products, persons: Number(hit.n) || 0 };
}
