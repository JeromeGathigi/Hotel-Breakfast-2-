import { describe, it, expect } from 'vitest';
import { buildPackageIndex, classifyPackages, lookupPackages, parsePackageDetail } from './packageDetail';

/** The 41-column per-reservation header, exactly as Opera writes it after the summary block. */
const HEADER = [
  'PRODUCT_ID1', 'PRODUCT_DESC', 'STAY_DATE1', 'CONFIRMATION_NO', 'ADULTS', 'CHILDREN', 'GUEST_NAME',
  'RESV_STATUS', 'REPORT_ID1', 'INSERT_DATE', 'NUMBER1', 'STAY_DATE_CHAR1', 'TOTAL_PKGS1', 'ARRIVAL_DAY_YN',
  'STAY_DAY1', 'PKG_QTY', 'CALCULATION_RULE', 'QUANTITY', 'PERSONS', 'NO_OF_ROOMS', 'TRUNC_ARRIVAL',
  'TRUNC_DEPARTURE', 'RESV_NAME_ID', 'GUEST_NAME_ID', 'ROOM', 'ROOM_CATEGORY', 'ROOM_CATEGORY_LABEL',
  'BOOKED_ROOM_CATEGORY', 'BOOKED_ROOM_CATEGORY_LABEL', 'ROOM_CLASS', 'GUEST_FIRST_NAME', 'DISPLAY_NAME',
  'COMPUTED_RESV_STATUS', 'RES_STATUS', 'RATE_CODE', 'PRODUCTS', 'POS_NEXT_DAY_YN', 'GUARANTEE_CODE',
  'RESERVE_INVENTORY_YN', 'PKG_FORCAST_GROUP', 'GROUP_SELL_SEQ',
];

function row(v: Record<string, string>): string {
  const base: Record<string, string> = {
    INSERT_DATE: '02-SEP-26',
    GUEST_NAME: 'TEST GUEST',
    PERSONS: '2',
    TRUNC_ARRIVAL: '01-SEP-26',
    TRUNC_DEPARTURE: '04-SEP-26',
    PKG_FORCAST_GROUP: 'BKF',
  };
  return HEADER.map((h) => v[h] ?? base[h] ?? '').join('\t');
}

/** A forecast file: detail rows first, then the per-reservation block, then the summary. */
function file(rows: string[], withSummary = true): string {
  const lines = [
    ['STAY_DATE', 'STAY_DATE_CHAR', 'STAY_DAY', 'PRODUCT_ID', 'SUMTOTAL_PKGS'].join('\t'),
    ['02-SEP-26', '02-09-26', 'Wed', 'BF', '2'].join('\t'),
    HEADER.join('\t'),
    ...rows,
  ];
  if (withSummary) {
    lines.push(['STAY_DATE2', 'STAY_DATE_CHAR2'].join('\t'));
    lines.push(['SUM_TOTAL_PKGS_PERREPORT'].join('\t'), '2');
  }
  return lines.join('\n');
}

describe('parsePackageDetail', () => {
  it('reads one reservation per row, keyed by RESV_NAME_ID', () => {
    const r = parsePackageDetail(
      file([
        row({ RESV_NAME_ID: '1001', PRODUCTS: 'BF350NET', PERSONS: '2', ROOM: '424', RATE_CODE: 'tgllsr' }),
        row({ RESV_NAME_ID: '1002', PRODUCTS: 'BF350NET,DINNER', PERSONS: '1' }),
      ])
    );
    expect(r.reportDate).toBe('2026-09-02');
    expect(r.reservations).toHaveLength(2);
    expect(r.reservations[0]).toMatchObject({
      resvNameId: '1001',
      products: ['BF350NET'],
      persons: 2,
      room: '424',
      rateCode: 'TGLLSR',
      arrival: '2026-09-01',
      departure: '2026-09-04',
    });
    expect(r.reservations[1].products).toEqual(['BF350NET', 'DINNER']);
  });

  it('stops at the summary block that follows', () => {
    const r = parsePackageDetail(file([row({ RESV_NAME_ID: '1001', PRODUCTS: 'BF' })]));
    expect(r.reservations.map((x) => x.resvNameId)).toEqual(['1001']);
  });

  it('reports a file with no reservation block instead of guessing', () => {
    const r = parsePackageDetail(['STAY_DATE\tPRODUCT_ID', '02-SEP-26\tBF'].join('\n'));
    expect(r.reservations).toEqual([]);
    expect(r.anomalies.join(' ')).toMatch(/no per-reservation package block/);
  });

  it('never assumes an unknown product is breakfast, and says so', () => {
    const r = parsePackageDetail(file([row({ RESV_NAME_ID: '1001', PRODUCTS: 'BFMYSTERY' })]));
    expect(r.anomalies.join(' ')).toMatch(/Unrecognised package product\(s\): BFMYSTERY/);
    expect(classifyPackages(r.reservations[0].products)).toBe('none');
  });
});

describe('classifyPackages', () => {
  it('knows the breakfast products of both properties', () => {
    for (const p of ['BF', 'BF350NET', 'BF260NET', 'BFCOMP', 'BFI200N', 'CNFBB']) {
      expect(classifyPackages([p])).toBe('breakfast');
    }
  });

  it('treats MBREAK / MBUFF as ambiguous, not as breakfast and not as room only', () => {
    // Opera files both in its BKF forecast group; the spec counts MBREAK as breakfast; the only
    // front-office note that mentions MBREAK says "room only". Someone has to decide.
    expect(classifyPackages(['MBREAK'])).toBe('meeting-only');
    expect(classifyPackages(['MBUFF'])).toBe('meeting-only');
    expect(classifyPackages(['MBREAK', 'BF'])).toBe('breakfast');
  });

  it('counts dinner-only as no breakfast', () => {
    expect(classifyPackages(['DINNER'])).toBe('none');
    expect(classifyPackages(['DINNVT'])).toBe('none');
  });
});

describe('the stored index', () => {
  it('keeps no guest names', () => {
    const detail = parsePackageDetail(file([row({ RESV_NAME_ID: '1001', PRODUCTS: 'BF', GUEST_NAME: 'SOMEONE REAL' })]));
    const index = buildPackageIndex('novotel', detail, 'forcast Novotel.txt');
    expect(JSON.stringify(index)).not.toMatch(/SOMEONE REAL/);
    expect(index).toMatchObject({ hotelId: 'novotel', reportDate: '2026-09-02', reservations: 1 });
  });

  it('distinguishes "no package" from "no data"', () => {
    const index = buildPackageIndex('novotel', parsePackageDetail(file([row({ RESV_NAME_ID: '1001', PRODUCTS: 'BF' })])));
    expect(lookupPackages(index, '1001')).toMatchObject({ present: true, status: 'breakfast', persons: 2 });
    expect(lookupPackages(index, '9999')).toMatchObject({ present: false, status: 'none' });
    expect(lookupPackages(null, '1001')).toBeNull();
  });
});
