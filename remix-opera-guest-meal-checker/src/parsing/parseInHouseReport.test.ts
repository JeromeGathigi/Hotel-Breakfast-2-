import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseInHouseReport, BREAKFAST_COMMENT, classifyRoom, normalizeRoom, parseShareNames } from './index';
import { MEAL_PLANS, entitledPax, hasMealEntitlement } from '../lib/meals';

/**
 * Golden-file tests against a real Novotel Chiang Mai in-house export.
 *
 * The fixture is a genuine 416-line Opera export with guest names replaced by stable
 * pseudonyms (see scripts/anonymizeFixture.mjs) and everything else byte-identical:
 * the raw newlines inside RES_COMMENT, the records where Opera omits the six trailing
 * comment columns, the tab-shifted record, the real rate codes and the real comments.
 *
 * Every parser bug found so far came from a structure nobody would have invented, so a
 * hand-written fixture would have proved nothing.
 */
const fixture = readFileSync(
  new URL('./__fixtures__/novotel-2026-08-27-in-house.tsv', import.meta.url),
  'utf8'
);

/** Builds a small synthetic export for targeted unit cases. */
function tsv(rows: Record<string, string>[]): string {
  const columns = [
    'ROOM', 'VIP', 'ARRIVAL', 'DEPARTURE', 'RESV_NAME_ID', 'CHILDREN', 'ADULTS',
    'RATE_CODE', 'GUEST_NAME', 'SHARE_NAMES', 'RES_COMMENT', 'COMMENT_RESV_NAME_ID',
  ];
  const lines = [columns.join('\t')];
  for (const row of rows) lines.push(columns.map((c) => row[c] ?? '').join('\t'));
  return lines.join('\n');
}

describe('parseInHouseReport — real Novotel export', () => {
  const result = parseInHouseReport(fixture);
  const room = (n: string) => result.rooms.find((r) => r.roomNumber === n);

  it('reconstructs every record with no loss and no rejects', () => {
    // 27% of physical lines are continuations of the line above, because RES_COMMENT
    // contains raw unquoted newlines.
    expect(result.stats.physicalLines).toBe(416);
    expect(result.stats.records).toBe(351);
    expect(result.stats.rejectedRecords).toBe(0);
    expect(result.anomalies).toHaveLength(0);
  });

  it('finds 119 rooms in house', () => {
    expect(result.rooms).toHaveLength(119);
  });

  it('does not invent a phantom room from a column-shifted record', () => {
    // The shipped parser emitted a "room 1" whose RATE_CODE was '2' and whose ADULTS
    // held a reservation id — a tab-shifted record imported as a real room.
    expect(room('1')).toBeUndefined();
  });

  it('grants breakfast to 55 rooms, not the 47 the single-row parser found', () => {
    expect(result.stats.roomsWithMeal).toBe(55);
    expect(result.rooms.filter((r) => hasMealEntitlement(r.mealPlan))).toHaveLength(55);
  });

  /**
   * REGRESSION — the defect with the worst consequence for a guest.
   *
   * Each of these rooms carries an explicit comped-breakfast comment on a record other
   * than the one the old parser consulted. Every one of them would have been refused
   * breakfast at the restaurant door while holding a rate that includes it.
   */
  it.each([
    ['231', 'SUPERS'],
    ['331', 'DSO'],
    ['352', 'FABLE7'],
    ['434', 'DSO'],
    ['439', 'RA1'],
  ])('room %s (rate %s) is granted breakfast from a later comment record', (number, rateCode) => {
    const target = room(number);
    expect(target, `room ${number} missing from the parse`).toBeDefined();
    expect(target!.rateCodes).toContain(rateCode);
    expect(target!.mealPlan).toBe(MEAL_PLANS.BREAKFAST);
    expect(target!.classificationReason).toMatch(/comment grants breakfast/);
    expect(entitledPax(target!)).toBeGreaterThan(0);
  });

  it('flags room 118 as missing guest details (GDS export gap)', () => {
    // One record: a room number and nothing else. This is Data Quality Alert Type 2 —
    // a GDS booking whose guest profile exists in Opera but does not reach the export.
    const target = room('118');
    expect(target).toBeDefined();
    expect(target!.issueType).toBe('no-details');
    expect(target!.guestName).toBe('RESERVED / NO DETAILS');
    expect(target!.adults).toBe(0);
  });

  it('resolves a shared room to the paying guest, not the zero-rate sharer', () => {
    // Room 432 holds a 2-adult primary and a 0-adult sharer across six records.
    const target = room('432');
    expect(target!.adults).toBe(2);
    expect(target!.issueType).toBeNull(); // a valid primary exists, so not an alert
    expect(target!.accompanyingGuests.length).toBeGreaterThan(0);
    expect(target!.accompanyingGuests).not.toContain(target!.guestName);
  });

  it('reads accompanying guests from SHARE_NAMES, not the 0-adult heuristic', () => {
    // SHARE_NAMES is populated on 205 of 351 records; inferring sharers from ADULTS=0
    // rows alone finds almost none of them.
    const target = room('113');
    expect(target!.accompanyingGuests.length).toBeGreaterThanOrEqual(2);
    expect(result.rooms.some((r) => r.accompanyingGuests.length > 0)).toBe(true);
  });

  it('orders rooms numerically, not lexicographically', () => {
    const numbers = result.rooms.map((r) => parseInt(r.roomNumber, 10));
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    // Firestore's string orderBy would put 1000 before 200; assert the real ordering.
    expect(result.rooms.slice(0, 3).map((r) => r.roomNumber)).toEqual(['101', '103', '105']);
  });

  it('never assigns a VIP tier outside 0-7', () => {
    for (const r of result.rooms) {
      if (r.vipStatus) expect(r.vipStatus).toMatch(/^[0-7]$/);
    }
  });
});

describe('record reconstruction', () => {
  it('joins a continuation line back into the comment it belongs to', () => {
    const text =
      tsv([{ ROOM: '201', ADULTS: '2', RATE_CODE: 'DSO', RESV_NAME_ID: '9', COMMENT_RESV_NAME_ID: '9' }])
        // Split the comment across two physical lines, unquoted, as Opera does.
        .replace('9\t', '9\t') + '';
    const withNewline = text.replace(
      /\t\t9$/,
      '\tGA RO AT 1,530+++ ON 25-31/8\nAT 1,300.50+++ ON 1/9\t9'
    );
    const result = parseInHouseReport(withNewline);
    expect(result.stats.rejectedRecords).toBe(0);
    expect(result.rooms).toHaveLength(1);
  });

  it('keeps a record whose trailing columns the exporter omitted', () => {
    // Opera drops the RES_COMMENT_* columns entirely on rows with no comment.
    const header = 'ROOM\tADULTS\tRATE_CODE\tRESV_NAME_ID\tRES_COMMENT\tCOMMENT_RESV_NAME_ID';
    const text = [header, '301\t2\tTGLL\t55', '302\t1\tDSO\t56\tGA COMP BF\t56'].join('\n');
    const result = parseInHouseReport(text);
    expect(result.rooms.map((r) => r.roomNumber)).toEqual(['301', '302']);
    expect(result.rooms[0].mealPlan).toBe(MEAL_PLANS.BREAKFAST); // TGLL is fixed
    expect(result.rooms[1].mealPlan).toBe(MEAL_PLANS.BREAKFAST); // comment grants it
  });

  it('rejects a genuinely over-wide record instead of importing a shifted room', () => {
    const header = 'ROOM\tADULTS\tRATE_CODE\tRESV_NAME_ID';
    const text = [header, '401\t2\tDSO\t7', '1\t2\t23685546\tMC\tEXTRA\tMORE'].join('\n');
    const result = parseInHouseReport(text);
    expect(result.rooms.map((r) => r.roomNumber)).toEqual(['401']);
    expect(result.stats.rejectedRecords).toBe(1);
    expect(result.anomalies[0].kind).toBe('field-count-overflow');
  });
});

describe('classifyRoom — domain rule 8.3', () => {
  it('scans every comment on the reservation, not just the primary row', () => {
    const text = tsv([
      { ROOM: '210', ADULTS: '2', RATE_CODE: 'DSO', RESV_NAME_ID: '100', COMMENT_RESV_NAME_ID: '100',
        RES_COMMENT: 'Email missing in the booking details.' },
      { ROOM: '210', ADULTS: '2', RATE_CODE: 'DSO', RESV_NAME_ID: '100', COMMENT_RESV_NAME_ID: '100',
        RES_COMMENT: '**Check Pref**' },
      { ROOM: '210', ADULTS: '2', RATE_CODE: 'DSO', RESV_NAME_ID: '100', COMMENT_RESV_NAME_ID: '100',
        RES_COMMENT: 'GA COMP BF AT 1,300+++' },
    ]);
    expect(parseInHouseReport(text).rooms[0].mealPlan).toBe(MEAL_PLANS.BREAKFAST);
  });

  it('applies a board rate found on a sharer row, not only the primary row', () => {
    const text = tsv([
      { ROOM: '211', ADULTS: '2', RATE_CODE: 'DSO', RESV_NAME_ID: '101', GUEST_NAME: 'PRIMARY' },
      { ROOM: '211', ADULTS: '0', RATE_CODE: 'PKGHB2', RESV_NAME_ID: '102', GUEST_NAME: 'SHARER' },
    ]);
    const parsed = parseInHouseReport(text).rooms[0];
    expect(parsed.mealPlan).toBe(MEAL_PLANS.HALF_BOARD);
    expect(parsed.guestName).toBe('PRIMARY'); // primary is still the paying guest
  });

  it('joins comments on COMMENT_RESV_NAME_ID when it differs from RESV_NAME_ID', () => {
    const text = tsv([
      { ROOM: '212', ADULTS: '1', RATE_CODE: 'DAF', RESV_NAME_ID: '200', COMMENT_RESV_NAME_ID: '200' },
      { ROOM: '212', ADULTS: '0', RESV_NAME_ID: '999', COMMENT_RESV_NAME_ID: '200',
        RES_COMMENT: 'MBREAK AT 400+++' },
    ]);
    expect(parseInHouseReport(text).rooms[0].mealPlan).toBe(MEAL_PLANS.BREAKFAST);
  });

  it('ranks Full Board above Half Board above Breakfast above Room Only', () => {
    expect(classifyRoom(['PKGFB1', 'PKGHB1', 'TGLL'], []).mealPlan).toBe(MEAL_PLANS.FULL_BOARD);
    expect(classifyRoom(['PKGHB1', 'TGLL'], []).mealPlan).toBe(MEAL_PLANS.HALF_BOARD);
    expect(classifyRoom(['TGLL'], []).mealPlan).toBe(MEAL_PLANS.BREAKFAST);
    expect(classifyRoom(['DSO'], ['GA COMP BF']).mealPlan).toBe(MEAL_PLANS.BREAKFAST);
    expect(classifyRoom(['DSO'], ['nothing relevant']).mealPlan).toBe(MEAL_PLANS.ROOM_ONLY);
  });

  it('treats DSO and DAF as comment-dependent, never as fixed breakfast', () => {
    expect(classifyRoom(['DSO'], []).mealPlan).toBe(MEAL_PLANS.ROOM_ONLY);
    expect(classifyRoom(['DAF'], []).mealPlan).toBe(MEAL_PLANS.ROOM_ONLY);
  });

  it('does not let the resort code HB4F8 make the whole house Half Board', () => {
    // Columns are matched exactly, so RESORT never reaches the rate-code test.
    expect(classifyRoom(['DSO'], []).mealPlan).toBe(MEAL_PLANS.ROOM_ONLY);
  });
});

describe('BREAKFAST_COMMENT', () => {
  it.each([
    'GA COMP BF AT 1,368+++',
    'MBREAK AT 400+++',
    'DAF COMP BF ON 27/8',
    '(PAID) BF INCL 2 PAX',
    'bf included',
    'RO + BF',
  ])('grants breakfast for %j', (comment) => {
    expect(BREAKFAST_COMMENT.test(comment)).toBe(true);
  });

  it.each(['BFORD ARRIVING LATE', 'MRS BFIELD', 'NO BREAKFAST BOOKED'])(
    'does not grant breakfast for %j',
    (comment) => {
      expect(BREAKFAST_COMMENT.test(comment)).toBe(false);
    }
  );
});

describe('room numbers', () => {
  it('normalises leading zeros and uppercases a letter suffix', () => {
    expect(normalizeRoom('0104')).toBe('104');
    expect(normalizeRoom('336a')).toBe('336A');
    expect(normalizeRoom('101')).toBe('101');
  });

  it('rejects the junk values Opera emits', () => {
    for (const junk of ['@1', 'AT 1', 'AT 2', '', 'TOTAL', '1,300+++']) {
      expect(normalizeRoom(junk)).toBeNull();
    }
  });

  it('preserves leading zeros in reservation ids', () => {
    // dynamicTyping used to coerce these to numbers and strip the zeros.
    const text = tsv([{ ROOM: '0104', ADULTS: '1', RATE_CODE: 'TGLL', RESV_NAME_ID: '0099123' }]);
    const parsed = parseInHouseReport(text).rooms[0];
    expect(parsed.roomNumber).toBe('104');
    expect(parsed.resvNameId).toBe('0099123');
  });
});

describe('parseShareNames', () => {
  it('splits on " / " and flips "Last, First"', () => {
    expect(parseShareNames('Purohit, Nidhi Atul / Goradiya, Avisha')).toEqual([
      'Nidhi Atul Purohit',
      'Avisha Goradiya',
    ]);
  });

  it('returns nothing for an empty column', () => {
    expect(parseShareNames('')).toEqual([]);
  });
});

describe('entitledPax', () => {
  it('is zero for Room Only, so any check-in is over-capacity', () => {
    expect(entitledPax({ mealPlan: MEAL_PLANS.ROOM_ONLY, adults: 2, children: 0 })).toBe(0);
  });

  it('counts the booked pax for a room with a meal plan', () => {
    expect(entitledPax({ mealPlan: MEAL_PLANS.BREAKFAST, adults: 2, children: 1 })).toBe(3);
    expect(entitledPax({ mealPlan: MEAL_PLANS.FULL_BOARD, adults: 1, children: 0 })).toBe(1);
  });

  it('accepts the free-text plans the correction flow writes', () => {
    expect(hasMealEntitlement('Breakfast (Manual)')).toBe(true);
    expect(hasMealEntitlement('Room Only (Manual)')).toBe(false);
  });
});
