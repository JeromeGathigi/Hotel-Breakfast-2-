/**
 * Parser for Opera's package-forecast export ("forcast Novotel.txt" / "forcast ibis.txt").
 *
 * ## Why this matters more than it looks
 *
 * This file is the AUTHORITATIVE breakfast count and nothing in the app read it until now.
 * Opera knows how many breakfast packages are attached to reservations; the app was inferring
 * entitlement from rate codes and getting a very different answer. On the 2 September exports:
 *
 *     novotel  app granted 24 adults of 162   Opera forecast: 98
 *     ibis     app granted 10 adults of 135   Opera forecast: 43
 *
 * ## Three traps in the file format
 *
 * 1. ONE ROW PER PACKAGE UNIT. `TOTAL_PKGS` is 1 on every row and `SUMTOTAL_PKGS` is repeated
 *    IDENTICALLY on every duplicate row for a (date, product) pair. So 16 breakfasts on 2 Sep
 *    is sixteen rows each saying `SUMTOTAL_PKGS = 16`. Summing that column multiplies the
 *    forecast by its own row count - 256 instead of 16. Deduplicate on
 *    (STAY_DATE_CHAR, PRODUCT_ID) and read the value once.
 *
 * 2. A NESTED SECOND REPORT BLOCK at the end of the file: a 21-column header
 *    (STAY_DATE2, ROOMS_OCCUPIED1, ADULTS_IN_HOUSE1, PKG_FORCAST_GROUP1 ...), then a
 *    16-column summary header (SUM_TOTAL_PKGS_PERREPORT, CS_TOTAL_SUMMARY_ROWS ...), then one
 *    summary row. Parsing must stop at it. Its total is useful as a cross-check but its rows
 *    are not forecast detail.
 *
 * 3. MBREAK IS NOT BREAKFAST. It is a meeting morning coffee break, and MBUFF a meeting
 *    buffet. An earlier version of the meal logic counted MBREAK as a breakfast cover.
 */

/** Product codes seen across both properties' exports, and what service each belongs to. */
export const FORECAST_PRODUCTS: Record<
  string,
  { label: string; service: 'breakfast' | 'lunch' | 'dinner' | 'meeting-break'; isBreakfast: boolean }
> = {
  BF: { label: 'Breakfast', service: 'breakfast', isBreakfast: true },
  BFCOMP: { label: 'Complimentary Breakfast', service: 'breakfast', isBreakfast: true },
  BF350NET: { label: 'Breakfast 350 net (Novotel)', service: 'breakfast', isBreakfast: true },
  BF260NET: { label: 'Breakfast 260 net (ibis)', service: 'breakfast', isBreakfast: true },
  BFI200N: { label: 'Breakfast infant 200 net', service: 'breakfast', isBreakfast: true },
  CNFBB: { label: 'Conference Bed & Breakfast', service: 'breakfast', isBreakfast: true },
  // Meeting products. Named on the breakfast page of a forecast but served to a meeting room,
  // not to the restaurant, and not a breakfast cover.
  MBREAK: { label: 'Meeting morning break', service: 'meeting-break', isBreakfast: false },
  MBUFF: { label: 'Meeting buffet', service: 'lunch', isBreakfast: false },
  DINNER: { label: 'Dinner', service: 'dinner', isBreakfast: false },
  DINNVT: { label: 'Dinner (set)', service: 'dinner', isBreakfast: false },
};

export interface ForecastRow {
  /** Business date being forecast, ISO. */
  stayDate: string;
  /** Day name as printed, e.g. 'Wed'. */
  dayOfWeek: string;
  productCode: string;
  /** SUMTOTAL_PKGS for this (stayDate, productCode) - read once, never summed. */
  packages: number;
  isBreakfast: boolean;
}

export interface ForecastParseResult {
  hotelId: string;
  rows: ForecastRow[];
  /** Breakfast packages per stay date, already filtered to breakfast products. */
  breakfastByDate: Record<string, number>;
  /** Product codes present in the file that FORECAST_PRODUCTS does not know. */
  unknownProducts: string[];
  stats: {
    detailRowsRead: number;
    distinctPairs: number;
    dateCount: number;
    /** SUM_TOTAL_PKGS_PERREPORT from the nested summary block, when present. */
    reportTotalFromFooter: number | null;
    /** Sum of every deduplicated `packages` value, for cross-checking against the footer. */
    reportTotalComputed: number;
  };
  anomalies: string[];
}

/** `01-SEP-26` or `01-09-26` -> `2026-09-01`. Returns '' when unparseable. */
export function forecastDateToIso(raw: string): string {
  const value = (raw || '').trim();
  if (!value) return '';

  const MONTHS: Record<string, string> = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
  };

  // 01-SEP-26
  const named = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (named) {
    const month = MONTHS[named[2].toUpperCase()];
    if (!month) return '';
    const year = named[3].length === 2 ? `20${named[3]}` : named[3];
    return `${year}-${month}-${named[1].padStart(2, '0')}`;
  }

  // 01-09-26, day first — the export's STAY_DATE_CHAR form.
  const numeric = value.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (numeric) {
    const year = numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3];
    return `${year}-${numeric[2].padStart(2, '0')}-${numeric[1].padStart(2, '0')}`;
  }

  return '';
}

/**
 * Parses the package-forecast export.
 *
 * `hotelId` must be supplied by the caller: unlike the in-house export, this file carries no
 * resort code, so it cannot be self-identifying. Detect the property from the in-house export
 * or from the operator's choice - never from the filename, and never guess.
 */
export function parsePackageForecast(rawText: string, hotelId: string): ForecastParseResult {
  const anomalies: string[] = [];
  const lines = String(rawText ?? '').split(/\r?\n/);

  let headers: string[] = [];
  let detailRowsRead = 0;
  /** (stayDate|product) -> packages. A Map keeps the dedup explicit. */
  const pairs = new Map<string, ForecastRow>();
  const unknown = new Set<string>();
  let reportTotalFromFooter: number | null = null;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (!line.trim()) continue;
    const cells = line.split('\t').map((c) => c.trim());

    // The detail header.
    if (cells.includes('STAY_DATE') && cells.includes('PRODUCT_ID')) {
      headers = cells;
      continue;
    }

    // Trap 2: the nested second report block. Everything from here on is summary, not detail.
    // Read the report total for a cross-check, then stop.
    if (cells.includes('STAY_DATE2') || cells.includes('SUM_TOTAL_PKGS_PERREPORT')) {
      // The summary section has two headers - a 21-column one then a 16-column one - so scan
      // forward for whichever carries SUM_TOTAL_PKGS_PERREPORT and read that COLUMN of the
      // following row.
      //
      // An earlier version used `lines.indexOf(line)` to find its own position, which returns
      // the index of the FIRST line equal to this string rather than this line's index, and
      // then read field 0 regardless of where the column actually sits. It returned null on
      // both real files.
      for (let j = lineIndex; j < lines.length; j++) {
        const summaryHeader = lines[j].split('\t').map((c) => c.trim());
        const column = summaryHeader.indexOf('SUM_TOTAL_PKGS_PERREPORT');
        if (column === -1) continue;
        const values = (lines[j + 1] ?? '').split('\t').map((c) => c.trim());
        const total = parseInt(values[column] ?? '', 10);
        if (Number.isFinite(total)) reportTotalFromFooter = total;
        break;
      }
      break;
    }

    if (headers.length === 0) continue;

    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (cells[i] !== undefined) row[h] = cells[i];
    });

    const rawDate = row['STAY_DATE_CHAR'] || row['STAY_DATE'] || '';
    const stayDate = forecastDateToIso(rawDate);
    const productCode = (row['PRODUCT_ID'] || '').toUpperCase();
    if (!stayDate || !productCode) continue;

    detailRowsRead += 1;

    // Trap 1: read SUMTOTAL_PKGS once per (date, product). It is identical on every duplicate
    // row, so summing it multiplies the forecast by its own row count.
    const packages = parseInt(row['SUMTOTAL_PKGS'] || '', 10);
    if (!Number.isFinite(packages)) {
      anomalies.push(`Row for ${stayDate} / ${productCode} has an unreadable SUMTOTAL_PKGS.`);
      continue;
    }

    const known = FORECAST_PRODUCTS[productCode];
    if (!known) unknown.add(productCode);

    const key = `${stayDate}|${productCode}`;
    const existing = pairs.get(key);

    if (existing && existing.packages !== packages) {
      // Should never happen: the column is meant to be constant across duplicates. If it is
      // not, the file's shape has changed and the dedup assumption needs rechecking.
      anomalies.push(
        `${stayDate} / ${productCode} reports two different SUMTOTAL_PKGS values ` +
          `(${existing.packages} and ${packages}). The deduplication assumption may no longer hold.`
      );
    }

    if (!existing) {
      pairs.set(key, {
        stayDate,
        dayOfWeek: row['STAY_DAY'] || '',
        productCode,
        packages,
        // Trap 3: an unknown product is NOT assumed to be breakfast. Counting it would inflate
        // the kitchen's number; it is reported in unknownProducts instead.
        isBreakfast: known ? known.isBreakfast : false,
      });
    }
  }

  const rows = [...pairs.values()].sort(
    (a, b) => a.stayDate.localeCompare(b.stayDate) || a.productCode.localeCompare(b.productCode)
  );

  const breakfastByDate: Record<string, number> = {};
  for (const row of rows) {
    if (!row.isBreakfast) continue;
    breakfastByDate[row.stayDate] = (breakfastByDate[row.stayDate] ?? 0) + row.packages;
  }

  if (unknown.size > 0) {
    anomalies.push(
      `Unrecognised product code(s): ${[...unknown].sort().join(', ')}. They are counted in ` +
        `no meal service until someone says what they are - assuming breakfast would inflate ` +
        `the kitchen's number.`
    );
  }

  const reportTotalComputed = rows.reduce((sum, r) => sum + r.packages, 0);

  if (reportTotalFromFooter !== null && reportTotalFromFooter !== reportTotalComputed) {
    anomalies.push(
      `The file's own total (${reportTotalFromFooter}) does not match the sum of its ` +
        `deduplicated rows (${reportTotalComputed}). Treat both with suspicion.`
    );
  }

  return {
    hotelId,
    rows,
    breakfastByDate,
    unknownProducts: [...unknown].sort(),
    stats: {
      detailRowsRead,
      distinctPairs: rows.length,
      dateCount: Object.keys(
        rows.reduce<Record<string, true>>((acc, r) => ((acc[r.stayDate] = true), acc), {})
      ).length,
      reportTotalFromFooter,
      reportTotalComputed,
    },
    anomalies,
  };
}

/**
 * Is this text a package forecast rather than an in-house guest list?
 *
 * Detected from CONTENT, never from the filename. The 8 junk documents in production came from
 * a forecast file being imported as guests, and `src/lib/importGuard.ts` blocked that by
 * filename - which also blocked legitimate forecast imports. This is how the guard tells the
 * two apart properly.
 */
export function looksLikePackageForecast(rawText: string): boolean {
  const head = String(rawText ?? '').slice(0, 4000);
  const firstLine = head.split(/\r?\n/, 1)[0] ?? '';
  const cells = firstLine.split('\t').map((c) => c.trim());
  return cells.includes('STAY_DATE') && cells.includes('PRODUCT_ID') && !cells.includes('ROOM');
}
