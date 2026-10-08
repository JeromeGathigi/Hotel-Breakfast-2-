import type { ParseResult } from '../parsing';
import { looksLikePackageForecast } from '../parsing/forecastExport';
import type { ForecastParseResult } from '../parsing/forecastExport';

/**
 * Decides whether a parsed Opera report is safe to write to Firestore.
 *
 * Why this exists as one shared function: there are three independent callers of
 * `parseInHouseReport` — the in-app uploader, the browser sync service and the CLI
 * importer — and each had its own guard. They disagreed, and one of them was wrong in a
 * way that reached production:
 *
 *     // src/lib/operaSyncService.ts, before this file existed
 *     if (parseResult.rooms.length === 0 && parseResult.forecasts.length === 0) { throw }
 *
 * The `&&` means a Package Forecast — zero rooms, many forecast rows — sails straight
 * through and proceeds to write. On 31 Aug 2026 `pkgforecast_84272763.txt` was imported and
 * the live guest list became eight documents keyed by Opera room-category codes (KGAGS,
 * KGB, KGBBC, SDDMV, SKC, TWB), with `anomaliesCount: 0`.
 *
 * An import that writes nothing useful must fail loudly. A guest list that is silently
 * wrong is worse than one that is obviously missing, because staff trust it.
 */

/**
 * Flat rather than a discriminated union on purpose: this project compiles with
 * `strict: false`, where narrowing `{ok: true} | {ok: false}` by truthiness does not give
 * access to the branch-specific field. A flat shape needs no narrowing at three call sites.
 */
export interface ImportAssessment {
  ok: boolean;
  /** Populated only when `ok` is false. */
  reason: string;
  warnings: string[];
}

/** Filenames that are definitely not the Guests In-house report. */
const WRONG_REPORT_PATTERNS: { pattern: RegExp; report: string }[] = [
  { pattern: /pkg.?forecast|package.?forecast/i, report: 'Package Forecast' },
  { pattern: /pkgs?_?by_?day/i, report: 'Packages by Day' },
];

/**
 * Assesses a file being imported AS A GUEST LIST.
 *
 * Pass `rawText` whenever you have it. Content is authoritative and the filename is only a
 * fallback hint, because the filename rule cut both ways: it correctly refused a forecast
 * imported as guests, but it ALSO refused a forecast imported as a forecast, which is a
 * legitimate operation now that `parsePackageForecast` exists. A file's name is not its shape.
 */
export function assessImport(
  parsed: ParseResult,
  filename = '',
  rawText?: string
): ImportAssessment {
  const rooms = parsed.rooms.length;
  const invalid = parsed.stats.invalidRoomRows ?? 0;
  const warnings: string[] = [];

  // 1. Content first. A package forecast has a STAY_DATE/PRODUCT_ID header and no ROOM column,
  //    so it can never be a door list whatever it is called.
  if (rawText !== undefined) {
    if (looksLikePackageForecast(rawText)) {
      return {
        ok: false,
        warnings: [],
        reason:
          `"${filename || 'This file'}" is a Package Forecast, not a guest list — its header ` +
          `has STAY_DATE and PRODUCT_ID and no ROOM column. It is forecast by product code, ` +
          `so importing it here would create one "guest" per room type: that is exactly how ` +
          `the eight documents KGAGS, KGB, KGBBC, SDDMV, SKC, TWB, TWBBC and UNASSIGNED got ` +
          `into the live guest list on 31 August. Import it as a forecast instead.`,
      };
    }
    // Content says this is not a forecast, so the filename heuristic below is not consulted.
    // A file named "pkgforecast-something" that genuinely contains an in-house export should
    // import, and a misnamed good file is a far more likely accident than a mislabelled bad one.
  } else {
    // 1b. No content available: fall back to the filename hint.
    for (const { pattern, report } of WRONG_REPORT_PATTERNS) {
      if (pattern.test(filename)) {
        return {
          ok: false,
          warnings: [],
          reason:
            `"${filename}" looks like the ${report} report. This app needs the ` +
            `"Guests INH - By Room" in-house report, exported as tab-delimited text. The ` +
            `${report} has no room numbers, only hotel-wide totals, so it cannot produce a ` +
            `door list.`,
        };
      }
    }
  }

  // 2. No rooms means nothing to serve breakfast to. Note this is deliberately NOT
  //    conditional on the forecast count — that was the bug.
  if (rooms === 0) {
    const roomCodeHint =
      invalid > 0
        ? ` ${invalid} row(s) had a ROOM value that is not a room number — Opera room-type ` +
          `codes such as KGAGS or TWB appear in the Package Forecast, not the in-house report.`
        : '';
    return {
      ok: false,
      warnings: [],
      reason:
        `No rooms could be read from "${filename || 'the uploaded file'}", so nothing was ` +
        `written and the existing guest list is untouched.${roomCodeHint} Check that this is ` +
        `the "Guests INH - By Room" report exported as tab-delimited text.`,
    };
  }

  // 3. More rejected rows than accepted ones means the wrong file even if a few rows
  //    happened to look like room numbers.
  if (invalid > rooms) {
    return {
      ok: false,
      warnings: [],
      reason:
        `Rejected ${invalid} row(s) but accepted only ${rooms}, so "${filename || 'this file'}" ` +
        `is almost certainly not the in-house report. Nothing was written.`,
    };
  }

  if (invalid > 0) {
    warnings.push(
      `${invalid} row(s) were skipped because their ROOM value was not a room number. ` +
        `Review the anomaly list before relying on these totals.`
    );
  }

  // 4. A plausible in-house export for two properties should not be tiny. This is a soft
  //    signal only — a genuinely quiet night is possible.
  if (rooms < 10) {
    warnings.push(
      `Only ${rooms} room(s) were read. That is unusually low for this property — confirm the ` +
        `export covered the whole house.`
    );
  }

  return { ok: true, reason: '', warnings };
}

/**
 * Assesses a file being imported AS A FORECAST — the mirror of `assessImport`.
 *
 * The forecast is the authoritative breakfast count, so a bad one is not harmless: the kitchen
 * cooks to it. It must fail loudly for the same reason a bad guest list must.
 */
export function assessForecastImport(
  parsed: ForecastParseResult,
  filename = ''
): ImportAssessment {
  const warnings: string[] = [];

  if (parsed.rows.length === 0) {
    return {
      ok: false,
      warnings: [],
      reason:
        `No forecast rows could be read from "${filename || 'the uploaded file'}". Check that ` +
        `this is the package forecast exported as tab-delimited text — its header should ` +
        `begin STAY_DATE, STAY_DATE_CHAR, STAY_DAY, PRODUCT_ID.`,
    };
  }

  // Every product unrecognised means the product vocabulary has changed, not that one code is
  // new. Counting none of them as breakfast would silently forecast zero covers.
  if (parsed.unknownProducts.length > 0 && Object.keys(parsed.breakfastByDate).length === 0) {
    return {
      ok: false,
      warnings: [],
      reason:
        `None of the product codes in "${filename || 'this file'}" are recognised ` +
        `(${parsed.unknownProducts.join(', ')}), so the forecast would show zero breakfasts ` +
        `for every date. Nothing was written. Someone needs to say what these products are ` +
        `before this file can be trusted.`,
    };
  }

  if (parsed.unknownProducts.length > 0) {
    warnings.push(
      `Unrecognised product code(s): ${parsed.unknownProducts.join(', ')}. They are counted ` +
        `in no meal service, so covers for the affected dates may be understated.`
    );
  }

  // The file's own total is the best available check on the deduplication.
  const { reportTotalFromFooter, reportTotalComputed } = parsed.stats;
  if (reportTotalFromFooter !== null && reportTotalFromFooter !== reportTotalComputed) {
    warnings.push(
      `The file's own total (${reportTotalFromFooter}) does not match the sum of its ` +
        `deduplicated rows (${reportTotalComputed}). The per-unit row format may have changed.`
    );
  }

  parsed.anomalies.forEach((a) => {
    if (!warnings.includes(a)) warnings.push(a);
  });

  return { ok: true, reason: '', warnings };
}
