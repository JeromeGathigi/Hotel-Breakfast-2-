import { describe, expect, it } from 'vitest';
import { parseFunctionExport, parseTHB, parseStatus, splitCsvLine } from './functionExport';
import { expandSpaces, usesFoodExchange, restaurantServicePeriod } from '../lib/functionSpace';

/** Header and rows copied from the live OptiqC&E Reports table, 1 Sep 2026. */
const REPORTS_CSV = [
  'Lost Date,Event Name,Client/Company,Event Type,Owner,Space(s),Expected Pax,Expected Revenue,Lost Reason,Lost Notes',
  '"Sep 1, 2026, 12:07 PM","Department of Example Studies, Faculty of Humanities, Example University",-,Meeting,Seller.ONE@example.com,MR 1,24,"THB 50,400",chose another hotel at 450,-',
  '"Sep 1, 2026, 10:07 AM","Example Media Co.,Ltd.(EMC)",-,Meeting,seller.one@example.com,MR 2-3,40,"THB 90,000",Lost to a competitor,-',
  '"Jul 1, 2026, 03:18 PM","Sample Trading Co.,Ltd",-,Meeting,seller.two@example.com,MR 2-4,50,"THB 37,500",not awarded,-',
].join('\n');

describe('splitCsvLine', () => {
  it('keeps commas inside quoted fields — company names are full of them', () => {
    const cells = splitCsvLine('"Example Media Co.,Ltd.(EMC)",Meeting,"THB 90,000"');
    expect(cells).toEqual(['Example Media Co.,Ltd.(EMC)', 'Meeting', 'THB 90,000']);
  });
});

describe('parseTHB', () => {
  it('reads the exported currency format', () => {
    expect(parseTHB('THB 52,250')).toBe(52250);
    expect(parseTHB('37500')).toBe(37500);
  });

  it('returns null rather than guessing zero', () => {
    expect(parseTHB('-')).toBeNull();
    expect(parseTHB('')).toBeNull();
    expect(parseTHB('n/a')).toBeNull();
  });
});

describe('parseStatus', () => {
  it('maps the four OptiqC&E statuses', () => {
    expect(parseStatus('Definite')).toBe('definite');
    expect(parseStatus('Tentative')).toBe('tentative');
    expect(parseStatus('Prospect')).toBe('prospect');
    expect(parseStatus('Lost')).toBe('lost');
  });

  it('maps cancelled onto lost, which is how the property records it', () => {
    expect(parseStatus('Cancelled')).toBe('lost');
  });

  it('returns null for anything unrecognised so the caller can default explicitly', () => {
    expect(parseStatus('Held')).toBeNull();
  });
});

describe('parseFunctionExport', () => {
  const result = parseFunctionExport(REPORTS_CSV, 'lost');

  it('reads every row of the real Reports export', () => {
    expect(result.events).toHaveLength(3);
    expect(result.rejected).toHaveLength(0);
  });

  it('keeps company names containing commas intact', () => {
    expect(result.events[1].eventName).toBe('Example Media Co.,Ltd.(EMC)');
    expect(result.events[2].eventName).toBe('Sample Trading Co.,Ltd');
  });

  it('reads spaces, pax and revenue', () => {
    expect(result.events[0].spacesRaw).toBe('MR 1');
    expect(result.events[0].expectedPax).toBe(24);
    expect(result.events[0].valueTHB).toBe(50400);
  });

  it('expands a combined-room booking read from the export', () => {
    expect(expandSpaces(result.events[2].spacesRaw)).toEqual(['MR2', 'MR3', 'MR4']);
    expect(usesFoodExchange(result.events[2])).toBe(false);
  });

  it('refuses a file that is not the Reports export', () => {
    const wrong = parseFunctionExport('Room,Guest Name,Adults\n101,SOMEONE,2');
    expect(wrong.events).toHaveLength(0);
    expect(wrong.rejected[0].reason).toMatch(/Event Name/);
  });

  it('rejects a row with no readable start date instead of defaulting to today', () => {
    const csv = [
      'Event Name,Space(s),Start,Expected Pax',
      'Some Event,MR 1,not-a-date,20',
    ].join('\n');
    const r = parseFunctionExport(csv);
    expect(r.events).toHaveLength(0);
    expect(r.rejected[0].reason).toMatch(/start date/);
  });

  it('reports unmapped headers so aliases can be pinned when a real export lands', () => {
    expect(result.unmappedHeaders).toContain('lost reason');
  });

  it('reads a restaurant booking and classifies it as dinner', () => {
    const csv = [
      'Event Name,Space(s),Start,Expected Pax,Status',
      'Gala Dinner,FX,2026-09-02T11:00:00Z,120,Definite',
    ].join('\n');
    const r = parseFunctionExport(csv);
    expect(r.events).toHaveLength(1);
    expect(usesFoodExchange(r.events[0])).toBe(true);
    expect(restaurantServicePeriod(r.events[0])).toBe('dinner');
  });
});
