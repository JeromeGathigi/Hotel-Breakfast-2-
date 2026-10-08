import { describe, it, expect } from 'vitest';
import {
  parsePackageForecast,
  looksLikePackageForecast,
  forecastDateToIso,
  FORECAST_PRODUCTS,
} from './forecastExport';

const DETAIL_HEADER = [
  'STAY_DATE', 'STAY_DATE_CHAR', 'STAY_DAY', 'PRODUCT_ID', 'SUMTOTAL_PKGS',
  'SUMSUMTOTAL_PKGSPERSTAY_DATE', 'SUMSUMTOTAL_PKGSPERPRODUCT_ID', 'REPORT_ID', 'TOTAL_PKGS',
];

/**
 * One row per package UNIT, exactly as Opera writes it: SUMTOTAL_PKGS repeated identically on
 * every duplicate row for a (date, product) pair, TOTAL_PKGS always 1.
 */
function unitRows(dateChar: string, day: string, product: string, sumTotal: number): string[] {
  return Array.from({ length: sumTotal }, () =>
    ['02-SEP-26', dateChar, day, product, String(sumTotal), '0', '0', '214752247', '1'].join('\t')
  );
}

function buildForecast(rows: string[], reportTotal?: number): string {
  const lines = [DETAIL_HEADER.join('\t'), ...rows];
  if (reportTotal !== undefined) {
    // The nested second report block: a 21-column header, then a 16-column summary header,
    // then one summary row. SUM_TOTAL_PKGS_PERREPORT is the first column of the second.
    lines.push(['STAY_DATE2', 'STAY_DATE_CHAR2', 'STAY_DAY2', 'ROOMS_OCCUPIED1'].join('\t'));
    lines.push(['SUM_TOTAL_PKGS_PERREPORT', 'CF_RESORT_LOGO', 'SUMSUMTOTAL_PKGS_GRPPERREPO'].join('\t'));
    lines.push([String(reportTotal), '', ''].join('\t'));
  }
  return lines.join('\n');
}

describe('forecastDateToIso', () => {
  it('reads both date forms the export uses', () => {
    expect(forecastDateToIso('01-SEP-26')).toBe('2026-09-01');
    expect(forecastDateToIso('02-09-26')).toBe('2026-09-02');
    expect(forecastDateToIso('31-12-26')).toBe('2026-12-31');
  });

  it('is day-first, not month-first', () => {
    // 02-09-26 is 2 September, not 9 February. Getting this backwards would silently shift
    // every forecast by months.
    expect(forecastDateToIso('02-09-26')).toBe('2026-09-02');
    expect(forecastDateToIso('09-02-26')).toBe('2026-02-09');
  });

  it('returns empty rather than a wrong date', () => {
    expect(forecastDateToIso('')).toBe('');
    expect(forecastDateToIso('not a date')).toBe('');
    expect(forecastDateToIso('01-XXX-26')).toBe('');
  });
});

describe('deduplicating the per-unit rows', () => {
  it('reads SUMTOTAL_PKGS once instead of summing it across duplicates', () => {
    // THE TRAP. 16 breakfasts arrive as 16 rows each saying SUMTOTAL_PKGS = 16. Summing gives
    // 256 - the forecast multiplied by its own row count.
    const result = parsePackageForecast(buildForecast(unitRows('02-09-26', 'Wed', 'BF', 16)), 'novotel');

    expect(result.stats.detailRowsRead).toBe(16);
    expect(result.stats.distinctPairs).toBe(1);
    expect(result.rows[0].packages).toBe(16);
    expect(result.breakfastByDate['2026-09-02']).toBe(16);
    expect(result.breakfastByDate['2026-09-02']).not.toBe(256);
  });

  it('keeps distinct products on the same date separate', () => {
    const result = parsePackageForecast(
      buildForecast([
        ...unitRows('02-09-26', 'Wed', 'BF', 16),
        ...unitRows('02-09-26', 'Wed', 'BF350NET', 69),
        ...unitRows('02-09-26', 'Wed', 'BFCOMP', 12),
        ...unitRows('02-09-26', 'Wed', 'BFI200N', 1),
      ]),
      'novotel'
    );

    // The real Novotel figure for 2 September.
    expect(result.breakfastByDate['2026-09-02']).toBe(98);
    expect(result.stats.distinctPairs).toBe(4);
  });

  it('flags a file where the duplicated column disagrees with itself', () => {
    // SUMTOTAL_PKGS is meant to be constant across a pair's rows. If it is not, the whole
    // dedup assumption is unsafe and must be reported rather than silently resolved.
    const rows = unitRows('02-09-26', 'Wed', 'BF', 3);
    rows[1] = rows[1].replace(/\t3\t/, '\t99\t');
    const result = parsePackageForecast(buildForecast(rows), 'novotel');

    expect(result.anomalies.join(' ')).toMatch(/two different SUMTOTAL_PKGS/);
  });
});

describe('meal service mapping', () => {
  it('counts only genuine breakfast products', () => {
    const result = parsePackageForecast(
      buildForecast([
        ...unitRows('02-09-26', 'Wed', 'BF', 7),
        ...unitRows('02-09-26', 'Wed', 'CNFBB', 14),
        ...unitRows('02-09-26', 'Wed', 'MBREAK', 30),
        ...unitRows('02-09-26', 'Wed', 'MBUFF', 20),
        ...unitRows('02-09-26', 'Wed', 'DINNER', 25),
      ]),
      'ibis'
    );

    // MBREAK is a meeting MORNING COFFEE BREAK and MBUFF a meeting buffet. An earlier version
    // of the meal logic counted MBREAK as a breakfast cover; 30 phantom covers is a real
    // over-order.
    expect(result.breakfastByDate['2026-09-02']).toBe(21);
    expect(FORECAST_PRODUCTS.MBREAK.isBreakfast).toBe(false);
    expect(FORECAST_PRODUCTS.MBUFF.isBreakfast).toBe(false);
    expect(FORECAST_PRODUCTS.DINNER.isBreakfast).toBe(false);
  });

  it('does not assume an unknown product is breakfast', () => {
    const result = parsePackageForecast(
      buildForecast([...unitRows('02-09-26', 'Wed', 'BFMYSTERY', 40)]),
      'novotel'
    );

    // Guessing breakfast here would inflate the kitchen's number by 40. It is reported instead.
    expect(result.breakfastByDate['2026-09-02'] ?? 0).toBe(0);
    expect(result.unknownProducts).toEqual(['BFMYSTERY']);
    expect(result.anomalies.join(' ')).toMatch(/Unrecognised product code/);
  });
});

describe('the nested second report block', () => {
  it('stops at it, and reads its total as a cross-check', () => {
    const result = parsePackageForecast(
      buildForecast(unitRows('02-09-26', 'Wed', 'BF', 16), 16),
      'novotel'
    );

    expect(result.stats.reportTotalFromFooter).toBe(16);
    expect(result.stats.reportTotalComputed).toBe(16);
    expect(result.anomalies).toEqual([]);
    // Nothing from the summary block may become a forecast row.
    for (const row of result.rows) {
      expect(row.productCode).not.toMatch(/SUM_|CS_|STAY_DATE2/);
    }
  });

  it('reports a mismatch between the file total and the deduplicated rows', () => {
    const result = parsePackageForecast(
      buildForecast(unitRows('02-09-26', 'Wed', 'BF', 16), 999),
      'novotel'
    );
    expect(result.anomalies.join(' ')).toMatch(/does not match the sum of its/);
  });

  it('parses fine when the summary block is absent', () => {
    const result = parsePackageForecast(buildForecast(unitRows('02-09-26', 'Wed', 'BF', 5)), 'ibis');
    expect(result.stats.reportTotalFromFooter).toBeNull();
    expect(result.breakfastByDate['2026-09-02']).toBe(5);
    expect(result.anomalies).toEqual([]);
  });
});

describe('telling a forecast from a guest list', () => {
  it('recognises a forecast from its content, not its filename', () => {
    // The 8 junk documents in production came from a forecast being imported AS GUESTS. The
    // guard that blocked that matched on filename, which also blocked legitimate forecast
    // imports. Content detection is how the two are told apart properly.
    expect(looksLikePackageForecast(buildForecast(unitRows('02-09-26', 'Wed', 'BF', 2)))).toBe(true);
  });

  it('does not mistake an in-house guest list for a forecast', () => {
    const inHouse = ['ROOM\tGUEST_NAME\tADULTS\tRATE_CODE', '301\tA GUEST\t2\tRB1'].join('\n');
    expect(looksLikePackageForecast(inHouse)).toBe(false);
  });

  it('is not fooled by an empty or junk file', () => {
    expect(looksLikePackageForecast('')).toBe(false);
    expect(looksLikePackageForecast('some random text')).toBe(false);
  });
});

describe('hotel identity', () => {
  it('takes the property from the caller, because the file does not say', () => {
    // Unlike the in-house export, the forecast carries no resort code. It cannot be
    // self-identifying, so the caller must supply it - and must not guess from the filename.
    const text = buildForecast(unitRows('02-09-26', 'Wed', 'BF', 3));
    expect(parsePackageForecast(text, 'ibis').hotelId).toBe('ibis');
    expect(parsePackageForecast(text, 'novotel').hotelId).toBe('novotel');
  });
});
