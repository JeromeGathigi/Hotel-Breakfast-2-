import { describe, it, expect } from 'vitest';
import { parseInHouseReport } from './index';
import { entitledPax, hasMealEntitlement, overCapacityLabel, OVER_CAPACITY_REASONS } from '../lib/meals';
import { Guest } from '../types';

describe('Opera In-House Report Parser & Meal Rules', () => {
  it('parses double-tab leading rows, multi-line comment continuations, short rows, and rejects over-wide rows', () => {
    // 29 columns in header
    const headerRow = [
      'SHARE_NAMES',         // 0
      'ACCOMPANYING_NAMES',   // 1
      'CURRENCY',             // 2
      'COL3',                 // 3
      'COL4',                 // 4
      'RESORT',               // 5
      'COL6',                 // 6
      'COL7',                 // 7
      'ADULTS',               // 8
      'CHILDREN',             // 9
      'ROOM',                 // 10
      'COL11',                // 11
      'COMPANY_NAME',         // 12
      'GUEST_NAME',           // 13
      'ARRIVAL',              // 14
      'DEPARTURE',            // 15
      'RATE_CODE',            // 16
      'PRODUCTS',             // 17
      'VIP',                  // 18
      'RESV_NAME_ID',         // 19
      'SPECIAL_REQUESTS',     // 20
      'PREFERENCES',          // 21
      'IS_SHARED_YN',         // 22
      'RES_COMMENT_1',        // 23
      'RES_COMMENT_2',        // 24
      'RES_COMMENT_3',        // 25
      'RES_COMMENT_4',        // 26
      'RES_COMMENT_5',        // 27
      'RES_COMMENT_6'         // 28
    ].join('\t');

    // 1. Double-tab row: empty SHARE_NAMES and ACCOMPANYING_NAMES
    // Room 101, Company "Novotel Chiangmai", Guest "John Doe", Adults 1
    const doubleTabRow = [
      '',                     // 0
      '',                     // 1
      'THB',                  // 2
      '0',                    // 3
      '173',                  // 4
      'HB4F8',                // 5
      'N',                    // 6
      'N',                    // 7
      '1',                    // 8
      '0',                    // 9
      '101',                  // 10 (ROOM)
      '3',                    // 11
      'Novotel Chiangmai',    // 12 (COMPANY)
      'John Doe',             // 13 (GUEST_NAME)
      '28-AUG-26',            // 14
      '30-AUG-26',            // 15
      'BB',                   // 16
      'BF',                   // 17
      'VIP1',                 // 18
      'RES-101',              // 19
      '', '', 'N',
      'Comment1', 'Comment2', 'Comment3', 'Comment4', 'Comment5', 'Comment6'
    ].join('\t');

    // 2. Multi-line comment continuation row:
    // Room 102, Guest "Jane Smith" whose comment has a raw newline
    const multiLinePart1 = [
      '', '', 'THB', '0', '173', 'HB4F8', 'N', 'N', '2', '0',
      '102', '3', 'Tech Corp', 'Jane Smith', '28-AUG-26', '30-AUG-26',
      'BB', 'BF', '', 'RES-102', '', '', 'N',
      'GA RO AT 1,530+++ ON 25-31/8' // Comment 1 part 1
    ].join('\t');
    const multiLinePart2 = [
      'AT 1,300.50+++ ON 1/9', // Continuation of Comment 1
      'Comment2', 'Comment3', 'Comment4', 'Comment5', 'Comment6'
    ].join('\t');

    // 3. Short row: 23 columns (6 trailing RES_COMMENT columns omitted entirely)
    // Room 103, Guest "Alice Wonder", 0 adults
    const shortRow = [
      '', '', 'THB', '0', '173', 'HB4F8', 'N', 'N', '0', '0',
      '103', '3', 'Travel Co', 'Alice Wonder', '28-AUG-26', '30-AUG-26',
      'RO', '', '', 'RES-103', '', '', 'N'
    ].join('\t');

    // 4. Over-wide row: extra tab inside a field producing 30 columns (> 29)
    // Room 104, corrupt extra tab
    const overWideRow = [
      '', '', 'THB', '0', '173', 'HB4F8', 'N', 'N', '99999999', '0',
      '1', 'ExtraTabVal', '3', 'Company', 'Bob Corrupt', '28-AUG-26', '30-AUG-26',
      'BB', 'BF', '', 'RES-104', '', '', 'N',
      'Comment1', 'Comment2', 'Comment3', 'Comment4', 'Comment5', 'Comment6'
    ].join('\t');

    const fixture = [
      headerRow,
      doubleTabRow,
      multiLinePart1,
      multiLinePart2,
      shortRow,
      overWideRow
    ].join('\n');

    const result = parseInHouseReport(fixture, 'novotel');

    // Assertion 1: Double-tab row room number is read as "101", NOT company name "Novotel Chiangmai"
    const room101 = result.rooms.find((r) => r.roomNumber === '101');
    expect(room101).toBeDefined();
    expect(room101?.roomNumber).toBe('101');
    expect(room101?.guestName).toBe('John Doe');
    expect(room101?.companyName).toBe('Novotel Chiangmai');
    expect(result.rooms.some((r) => r.roomNumber.includes('Novotel'))).toBe(false);
    expect(result.rooms.some((r) => r.roomNumber === 'UNASSIGNED')).toBe(false);

    // Assertion 2: Newline-spanning row produces exactly 1 room (102), not 2
    const room102 = result.rooms.find((r) => r.roomNumber === '102');
    expect(room102).toBeDefined();
    expect(room102?.guestName).toBe('Jane Smith');
    expect(result.rooms.filter((r) => r.roomNumber === '102').length).toBe(1);

    // Assertion 3: Short row (omitted trailing columns) is kept as a valid room
    const room103 = result.rooms.find((r) => r.roomNumber === '103');
    expect(room103).toBeDefined();
    expect(room103?.roomNumber).toBe('103');
    expect(room103?.guestName).toBe('Alice Wonder');

    // Assertion 4: Over-wide row is not imported as a room (no phantom room "1") and is reported as anomaly
    expect(result.rooms.some((r) => r.guestName === 'Bob Corrupt')).toBe(false);
    expect(result.rooms.some((r) => r.roomNumber === '1' && r.adults > 1000)).toBe(false);
    expect(result.stats.discardedRecordsCount).toBeGreaterThanOrEqual(1);

    // Assertion 5: Room with ADULTS = 0 has adults === 0 and issueType === 'no-adults'
    expect(room103?.adults).toBe(0);
    expect(room103?.issueType).toBe('no-adults');
    expect(result.anomalies.some((a) => a.roomNumber === '103' && a.type === 'no-adults')).toBe(true);
  });

  it('entitledPax returns 0 for a Room Only plan', () => {
    const roGuest: Guest = {
      roomNumber: '201',
      guestName: 'Only Room',
      arrivalDate: '2026-08-28',
      departureDate: '2026-08-30',
      mealPlan: 'RO • Room Only',
      adults: 2,
      children: 1,
      hotelId: 'novotel',
      resvNameId: 'novotel-201',
      lastUpdated: '2026-08-30T00:00:00Z',
    };

    expect(hasMealEntitlement(roGuest.mealPlan, 'breakfast')).toBe(false);
    expect(entitledPax(roGuest, 'breakfast')).toBe(0);
  });

  it('a plan string containing HB4F8 is not entitled to dinner', () => {
    // HB4F8 is Novotel property resort code, not Half Board
    const resortCodePlan = 'RO HB4F8';
    expect(hasMealEntitlement(resortCodePlan, 'dinner')).toBe(false);

    const halfBoardPlan = 'Half Board Package';
    expect(hasMealEntitlement(halfBoardPlan, 'dinner')).toBe(true);

    const hbCodePlan = 'RATE-HB • Dinner';
    expect(hasMealEntitlement(hbCodePlan, 'dinner')).toBe(true);
  });

  it('overCapacityLabel(CHILD_COMPLIMENTARY) reflects property policy (under 12 for ibis, under 16 for novotel)', () => {
    const ibisLabel = overCapacityLabel(OVER_CAPACITY_REASONS.CHILD_COMPLIMENTARY, 'ibis');
    expect(ibisLabel).toContain('12');
    expect(ibisLabel).not.toContain('16');

    const novotelLabel = overCapacityLabel(OVER_CAPACITY_REASONS.CHILD_COMPLIMENTARY, 'novotel');
    expect(novotelLabel).toContain('16');
    expect(novotelLabel).not.toContain('12');
  });

  it('correctly merges shared rooms: highest adults record becomes primary and sharers become accompanying', () => {
    const headerRow = [
      'SHARE_NAMES', 'ACCOMPANYING_NAMES', 'CURRENCY', 'COL3', 'COL4', 'RESORT', 'COL6', 'COL7',
      'ADULTS', 'CHILDREN', 'ROOM', 'COL11', 'COMPANY_NAME', 'GUEST_NAME', 'ARRIVAL', 'DEPARTURE',
      'RATE_CODE', 'PRODUCTS', 'VIP', 'RESV_NAME_ID', 'SPECIAL_REQUESTS', 'PREFERENCES', 'IS_SHARED_YN',
      'RES_COMMENT_1', 'RES_COMMENT_2', 'RES_COMMENT_3', 'RES_COMMENT_4', 'RES_COMMENT_5', 'RES_COMMENT_6'
    ].join('\t');

    // Primary record (2 adults) appears first
    const record1 = [
      'Sharer One / Sharer Two', '', 'THB', '0', '173', 'HB4F8', 'N', 'N',
      '2', '0', '305', '3', 'Global Travel', 'Primary Master', '28-AUG-26', '30-AUG-26',
      'BB', 'BF', '', 'RES-305-1', '', '', 'Y',
      '', '', '', '', '', ''
    ].join('\t');

    // Sharer 1 record (0 adults) appears second
    const record2 = [
      '', '', 'THB', '0', '173', 'HB4F8', 'N', 'N',
      '0', '0', '305', '3', 'Global Travel', 'Sharer One', '28-AUG-26', '30-AUG-26',
      'BB', 'BF', '', 'RES-305-2', '', '', 'Y',
      '', '', '', '', '', ''
    ].join('\t');

    // Sharer 2 record (0 adults) appears third
    const record3 = [
      '', '', 'THB', '0', '173', 'HB4F8', 'N', 'N',
      '0', '0', '305', '3', 'Global Travel', 'Sharer Two', '28-AUG-26', '30-AUG-26',
      'BB', 'BF', '', 'RES-305-3', '', '', 'Y',
      '', '', '', '', '', ''
    ].join('\t');

    const fixture = [headerRow, record1, record2, record3].join('\n');
    const result = parseInHouseReport(fixture, 'novotel');

    const room305 = result.rooms.find((r) => r.roomNumber === '305');
    expect(room305).toBeDefined();
    expect(room305?.roomNumber).toBe('305');
    expect(room305?.adults).toBe(2);
    expect(room305?.guestName).toBe('Primary Master');
    expect(room305?.accompanyingGuests).toContain('Sharer One');
    expect(room305?.accompanyingGuests).toContain('Sharer Two');
    expect(room305?.accompanyingGuests).not.toContain('Primary Master');
  });

  it('preserves blank-details rooms (e.g. Room 118) with issueType: "no-details" rather than silently skipping', () => {
    const headerRow = [
      'SHARE_NAMES', 'ACCOMPANYING_NAMES', 'CURRENCY', 'COL3', 'COL4', 'RESORT', 'COL6', 'COL7',
      'ADULTS', 'CHILDREN', 'ROOM', 'COL11', 'COMPANY_NAME', 'GUEST_NAME', 'ARRIVAL', 'DEPARTURE',
      'RATE_CODE', 'PRODUCTS', 'VIP', 'RESV_NAME_ID', 'SPECIAL_REQUESTS', 'PREFERENCES', 'IS_SHARED_YN',
      'RES_COMMENT_1', 'RES_COMMENT_2', 'RES_COMMENT_3', 'RES_COMMENT_4', 'RES_COMMENT_5', 'RES_COMMENT_6'
    ].join('\t');

    // Room 118 has room number but no guest name or dates
    const blankRoomRow = [
      '', '', 'THB', '0', '173', 'HB4F8', 'N', 'N',
      '0', '0', '118', '3', '', '', '', '',
      '', '', '', '', '', '', 'N',
      '', '', '', '', '', ''
    ].join('\t');

    const fixture = [headerRow, blankRoomRow].join('\n');
    const result = parseInHouseReport(fixture, 'novotel');

    const room118 = result.rooms.find((r) => r.roomNumber === '118');
    expect(room118).toBeDefined();
    expect(room118?.roomNumber).toBe('118');
    expect(room118?.guestName).toBe('RESERVED / NO DETAILS');
    expect(room118?.adults).toBe(0);
    expect(room118?.issueType).toBe('no-details');
    expect(result.anomalies.some((a) => a.roomNumber === '118' && a.type === 'no-details')).toBe(true);
  });
});
