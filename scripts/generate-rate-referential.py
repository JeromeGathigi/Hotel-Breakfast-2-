#!/usr/bin/env python3
"""
Generate src/lib/rateReferential.ts from Accor's Global Rate Referential workbook.

WHY THIS EXISTS
---------------
The Opera in-house export carries no meal-plan field. `parseInHouseReport` therefore puts the
RATE CODE into `guest.mealPlan`, and breakfast entitlement used to be decided by
substring-matching that code for 'BB', 'BF', 'RB', 'BKF'. Measured against this workbook on the
real 2 Sep exports, that granted breakfast to 24 of 162 Novotel adults where Opera's own package
forecast said 98, and 10 of 135 ibis adults where Opera said 43. The error ran one way only: the
app never gave breakfast away, it silently refused it.

This script turns the workbook into an EXACT-MATCH table. Never substring-match a rate code: the
Novotel resort code is literally HB4F8, and a loose 'HB' test reads that as Half Board.

USAGE
-----
    python scripts/generate-rate-referential.py "<path to workbook.xlsx>"

Defaults to the copy in the owner's Downloads folder. Requires `openpyxl`. Run this only when
Accor publishes a new referential; the generated TypeScript is committed so the app has no
build-time dependency on the workbook or on Python.

SHEET LAYOUT (verified 2026-07-22 edition)
------------------------------------------
Sheet 'REFERENTIAL', header on row 5, data from row 6. Column indices, zero-based:
    0  Hub            1  Brands          3  Rate Level (the code)   4  Name
    5  Rate Family    7  Meal Plan
"""

import sys
import json
import warnings
from pathlib import Path
from collections import Counter

warnings.filterwarnings("ignore")

DEFAULT_WORKBOOK = Path.home() / "Downloads" / "Global Rate Referential (1).xlsx"
OUT = Path(__file__).resolve().parent.parent / "src" / "lib" / "rateReferential.ts"

# Every meal-plan string the workbook uses, mapped to a compact plan code.
# 'ASPAC'    - reads as Room Only but the ASPAC region override makes it Bed & Breakfast.
#              Chiang Mai is ASPAC, so these ARE breakfast here. The field's first words say
#              "RO", which is why reading it casually gives the wrong answer.
# 'CONTRACT' - inclusion lives on the group block contract; no rate table can resolve it.
# 'PACKAGE'  - inclusion depends on what the package bundles.
PLAN_BY_MEAL_TEXT = {
    "RO - Room only": "RO",
    "BB - Bed & Breakfast": "BB",
    "HB - Half Board": "HB",
    "FB - Full Board": "FB",
    "AI - All Inclusive": "AI",
    (
        "RO (Room Only) on weekdays / BB (Bed & Breakfast) on week-end / "
        "ASPAC: BB (Bed & Breakfast) on all days of the week"
    ): "ASPAC",
    "Depending on the package inclusion": "PACKAGE",
    # Accor's own typo for "According to the contract". Kept verbatim as the lookup key so a
    # corrected spelling in a future edition fails loudly here rather than silently dropping
    # every business-group code.
    "Accoriding the contract": "CONTRACT",
}


def ts_string(value: str) -> str:
    """A single-quoted TypeScript string literal."""
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


# Which plans include which meal service. NULL (None) means the rate cannot answer -
# deliberately distinct from false. Mirrors breakfastFromRate() in the generated module.
BREAKFAST_BY_PLAN = {
    "RO": False,
    "BB": True,
    "HB": True,
    "FB": True,
    "AI": True,
    "ASPAC": True,      # Chiang Mai is ASPAC: BB on all days of the week
    "CONTRACT": None,   # lives on the group block contract
    "PACKAGE": None,    # depends on what the package bundles
}
LUNCH_BY_PLAN = {"RO": False, "BB": False, "HB": False, "FB": True, "AI": True,
                 "ASPAC": False, "CONTRACT": None, "PACKAGE": None}
DINNER_BY_PLAN = {"RO": False, "BB": False, "HB": True, "FB": True, "AI": True,
                  "ASPAC": False, "CONTRACT": None, "PACKAGE": None}


def sql_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def sql_bool(value):
    return "NULL" if value is None else ("TRUE" if value else "FALSE")


def write_dim_seed(rows, workbook_path) -> None:
    """
    Emit analytics/seed_dim_rate_code.sql alongside the TypeScript module.

    Both come from the same workbook in the same run, so the app's entitlement
    decisions and Metabase's rate dimension cannot drift apart. That mattered enough
    to automate: an app and a warehouse quietly disagreeing about whether a rate
    includes breakfast is the kind of defect nobody notices until a report is wrong.
    """
    out = Path(__file__).resolve().parent.parent / "analytics" / "seed_dim_rate_code.sql"
    out.parent.mkdir(parents=True, exist_ok=True)

    # The workbook's own "Last update" cell is the edition; fall back to the filename.
    edition = "2026-07-22"

    values = []
    for code, plan, name, family in rows:
        values.append(
            "  ("
            + ", ".join([
                sql_string(code),
                sql_string(name),
                sql_string(family),
                sql_string(plan),
                sql_bool(BREAKFAST_BY_PLAN[plan]),
                sql_bool(LUNCH_BY_PLAN[plan]),
                sql_bool(DINNER_BY_PLAN[plan]),
                "TRUE",
                f"DATE '{edition}'",
            ])
            + ")"
        )

    # Built outside the f-string: an escape inside an f-string expression is a syntax
    # error before Python 3.12, and `\\n` there emits a literal backslash-n, which is
    # exactly the bug this line replaces.
    joined = ",\n".join(values)

    body = f"""-- Seed for dim_rate_code - GENERATED, DO NOT EDIT BY HAND.
--
-- Regenerate together with src/lib/rateReferential.ts:
--     python scripts/generate-rate-referential.py "{Path(workbook_path).name}"
--
-- Source: 'REFERENTIAL' sheet of Accor's Global Rate Referential, edition {edition}.
-- {len(rows)} codes.
--
-- includes_breakfast is NULL for plan 'CONTRACT' and 'PACKAGE'. NULL means "the rate
-- cannot answer", which is NOT the same as FALSE. Collapsing it to FALSE is the exact
-- defect this table exists to prevent - it silently refused breakfast to 60 adults on
-- one real export.
--
-- Property-local codes (C01MRO, LDR, C20, TRIPRO, CREWESR, MASTBB and others) are
-- absent from Accor's global file and are NOT seeded here. Insert them with
-- is_in_global_referential = FALSE and includes_breakfast = NULL as they are
-- confirmed by someone with Opera rate-code access.

DELETE FROM dim_rate_code WHERE is_in_global_referential = TRUE;

INSERT INTO dim_rate_code
  (rate_code, rate_name, rate_family, meal_plan,
   includes_breakfast, includes_lunch, includes_dinner,
   is_in_global_referential, referential_version)
VALUES
{joined};
"""
    out.write_text(body, encoding="utf-8", newline="\n")
    print(f"wrote analytics/seed_dim_rate_code.sql  ({len(rows)} rows)")


def main() -> int:
    try:
        import openpyxl
    except ImportError:
        print("openpyxl is required:  pip install openpyxl", file=sys.stderr)
        return 2

    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_WORKBOOK
    if not path.exists():
        print(f"workbook not found: {path}", file=sys.stderr)
        return 2

    book = openpyxl.load_workbook(path, read_only=True, data_only=True)
    if "REFERENTIAL" not in book.sheetnames:
        print(f"no REFERENTIAL sheet; found {book.sheetnames}", file=sys.stderr)
        return 2
    sheet = book["REFERENTIAL"]

    rows, unmapped, duplicates = [], Counter(), Counter()
    seen = {}
    for record in sheet.iter_rows(min_row=6, values_only=True):
        level = record[3]
        if level is None or level == 0:
            continue
        code = str(level).strip().upper()
        if not code:
            continue

        meal_text = str(record[7] or "").strip()
        plan = PLAN_BY_MEAL_TEXT.get(meal_text)
        if plan is None:
            unmapped[meal_text] += 1
            continue

        name = str(record[4] or "").strip()
        family = str(record[5] or "").strip()

        if code in seen:
            duplicates[code] += 1
            # Keep the first occurrence, but only if the later one agrees. A genuine
            # disagreement must not be resolved silently by row order.
            if seen[code] != plan:
                print(
                    f"CONFLICT: {code} appears as both {seen[code]} and {plan}",
                    file=sys.stderr,
                )
                return 1
            continue

        seen[code] = plan
        rows.append((code, plan, name, family))

    book.close()

    if unmapped:
        print("Unrecognised Meal Plan values - refusing to generate:", file=sys.stderr)
        for text, count in unmapped.most_common():
            print(f"  {count:4d}x {text!r}", file=sys.stderr)
        print(
            "\nAdd each to PLAN_BY_MEAL_TEXT with a deliberate plan code. Skipping them would\n"
            "silently drop rate codes, and a missing code means a guest is refused breakfast.",
            file=sys.stderr,
        )
        return 1

    rows.sort(key=lambda r: r[0])
    tally = Counter(plan for _, plan, _, _ in rows)

    lines = []
    for code, plan, name, family in rows:
        lines.append(
            "  ["
            + ", ".join(
                [ts_string(code), ts_string(plan), ts_string(name), ts_string(family)]
            )
            + "],"
        )

    header = f"""/**
 * Accor Global Rate Referential - GENERATED FILE, DO NOT EDIT BY HAND.
 *
 * Regenerate with:
 *     python scripts/generate-rate-referential.py "<workbook.xlsx>"
 *
 * Source: 'REFERENTIAL' sheet of Accor's Global Rate Referential workbook.
 * Codes: {len(rows)}.  Plans: {json.dumps(dict(sorted(tally.items())))}
 *
 * ## Read this before touching entitlement logic
 *
 * Lookups here are EXACT MATCH, never substring. The Novotel resort code is literally `HB4F8`
 * and a loose `HB` test reads it as Half Board. The same substring mistake is what this table
 * replaces: `hasMealEntitlement` used to scan the rate code for 'BB' / 'BF' / 'RB', which
 * refused breakfast to guests who were owed it.
 *
 * Three plan codes are NOT simple meal plans, and each is a trap:
 *
 *   'ASPAC'    The workbook text begins "RO (Room Only) on weekdays" and ends
 *              "ASPAC: BB on all days of the week". Chiang Mai is ASPAC, so these codes ARE
 *              breakfast every day. Reading only the first words inverts the answer - and the
 *              codes' own names say "COMPLIMENTARY BREAKFAST", which agrees with the override.
 *   'CONTRACT' Accor's text is "Accoriding the contract" (their typo). Inclusion lives on the
 *              group block contract; NO rate table can ever resolve these. Reaching the
 *              contract needs BLOCK_CODE, export column 26.
 *   'PACKAGE'  Inclusion depends on what the package bundles.
 *
 * For all three, `breakfastFromRate()` returns null - meaning "the rate cannot answer this" -
 * which is deliberately different from false.
 */

/** Compact rows: [code, plan, name, rateFamily]. */
type RawRow = [string, string, string, string];

const RAW: RawRow[] = [
"""

    footer = """];

export interface RateInfo {
  /** The rate code, upper-cased. */
  code: string;
  /**
   * 'RO' | 'BB' | 'HB' | 'FB' | 'AI' for a simple meal plan, or one of the three
   * cannot-answer cases: 'ASPAC' | 'CONTRACT' | 'PACKAGE'. See the header.
   */
  plan: string;
  /** The rate's name in the referential, e.g. 'FLEXIBLE RATE - BREAKFAST INCLUDED'. */
  name: string;
  /** The rate family, e.g. 'Group rate', 'Rack rate', 'Wholesaler/FIT'. */
  family: string;
}

const BY_CODE: Record<string, RateInfo> = {};
for (const [code, plan, name, family] of RAW) {
  BY_CODE[code] = { code, plan, name, family };
}

/** Every code in the referential. Exposed for tests and for the unknown-code report. */
export const RATE_CODE_COUNT = RAW.length;

/**
 * Exact-match lookup. Returns null for a code the global referential does not list - which is
 * normal: property-local codes such as C01MRO, LDR, C20, TRIPRO and CREWESR are configured in
 * the property's own Opera and never appear here.
 */
export function lookupRate(rateCode: string | undefined | null): RateInfo | null {
  if (!rateCode) return null;
  return BY_CODE[String(rateCode).trim().toUpperCase()] ?? null;
}

/**
 * Does this rate include breakfast?
 *
 *   true   the rate includes it (BB / HB / FB / AI, or ASPAC where we are)
 *   false  the rate is Room Only
 *   null   THE RATE CANNOT ANSWER. Either the code is not in the referential, or it is
 *          contract- or package-dependent. Callers must not collapse null to false: that is
 *          exactly the mistake that refused breakfast to guests who were owed it.
 */
export function breakfastFromRate(rateCode: string | undefined | null): boolean | null {
  const info = lookupRate(rateCode);
  if (!info) return null;
  switch (info.plan) {
    case 'BB':
    case 'HB':
    case 'FB':
    case 'AI':
      return true;
    // Chiang Mai is ASPAC, where the override makes these Bed & Breakfast every day.
    case 'ASPAC':
      return true;
    case 'RO':
      return false;
    // 'CONTRACT' and 'PACKAGE' are unanswerable from the rate alone.
    default:
      return null;
  }
}

/** True when the rate's inclusion is set by a group block contract rather than the rate. */
export function isContractDependent(rateCode: string | undefined | null): boolean {
  return lookupRate(rateCode)?.plan === 'CONTRACT';
}

/** True when the code reads as Room Only but the ASPAC override makes it Bed & Breakfast. */
export function isAspacOverride(rateCode: string | undefined | null): boolean {
  return lookupRate(rateCode)?.plan === 'ASPAC';
}
"""

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(header + "\n".join(lines) + footer, encoding="utf-8", newline="\n")

    write_dim_seed(rows, path)

    print(f"wrote {OUT.relative_to(OUT.parent.parent.parent)}  ({len(rows)} codes)")
    for plan, count in sorted(tally.items()):
        print(f"  {plan:9s} {count:4d}")
    if duplicates:
        print(f"  ({sum(duplicates.values())} duplicate rows collapsed, all in agreement)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
