import { describe, expect, it } from 'vitest';
import {
  expandSpaces,
  usesFoodExchange,
  restaurantServicePeriod,
  startsDuringBreakfastService,
  normaliseStatusCode,
  displayCompany,
  setupStyleFromNotes,
  eventBusinessDates,
  eventsOnDate,
  spaceOccupancy,
  isCancelled,
  paxOnDate,
  revenueOnDate,
  type FunctionEvent,
} from './functionSpace';

/** Shaped from the real OptiqC&E event txbNL309zj99HG92GSPL. */
function ev(over: Partial<FunctionEvent> = {}): FunctionEvent {
  return {
    id: 'txbNL309zj99HG92GSPL',
    hotelId: 'novotel',
    eventName: 'Example Health Foundation (EHF)',
    clientCompany: '-',
    eventType: 'Meeting',
    owner: 'seller.one@example.com',
    spacesRaw: 'MR 2-4',
    expectedPax: 55,
    status: 'definite',
    startsAt: '2026-08-31T01:00:00.000Z',
    endsAt: '2026-09-04T10:00:00.000Z',
    notes: 'Classroom',
    valueTHB: 156750,
    lastUpdated: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

describe('expandSpaces', () => {
  it('expands a combined-room range, because MR 2-4 is three rooms not one', () => {
    expect(expandSpaces('MR 2-4')).toEqual(['MR2', 'MR3', 'MR4']);
    expect(expandSpaces('MR 1-4')).toEqual(['MR1', 'MR2', 'MR3', 'MR4']);
    expect(expandSpaces('MR 2-3')).toEqual(['MR2', 'MR3']);
  });

  it('handles a single room and the spacing variants OptiqC&E emits', () => {
    expect(expandSpaces('MR 1')).toEqual(['MR1']);
    expect(expandSpaces('MR4')).toEqual(['MR4']);
    expect(expandSpaces('mr 2 - 4')).toEqual(['MR2', 'MR3', 'MR4']);
  });

  it('recognises the Food Exchange restaurant', () => {
    expect(expandSpaces('FX')).toEqual(['FX']);
    expect(expandSpaces('Food Exchange')).toEqual(['FX']);
  });

  it('returns nothing for an unrecognised space rather than inventing a room', () => {
    expect(expandSpaces('')).toEqual([]);
    expect(expandSpaces('Poolside')).toEqual([]);
    expect(expandSpaces('MR 9')).toEqual([]);
  });
});

describe('Food Exchange bookings', () => {
  it('identifies an event booked into the restaurant', () => {
    expect(usesFoodExchange(ev({ spacesRaw: 'FX' }))).toBe(true);
    expect(usesFoodExchange(ev({ spacesRaw: 'MR 1-4' }))).toBe(false);
  });

  it('classifies FX bookings as lunch or dinner, never breakfast', () => {
    // Per the property: the restaurant is never sold as function space during breakfast,
    // because in-house guests need it. 11:00 Bangkok = 04:00Z, 19:00 Bangkok = 12:00Z.
    const lunch = ev({ spacesRaw: 'FX', startsAt: '2026-09-02T04:00:00.000Z' });
    const dinner = ev({ spacesRaw: 'FX', startsAt: '2026-09-02T12:00:00.000Z' });
    expect(restaurantServicePeriod(lunch)).toBe('lunch');
    expect(restaurantServicePeriod(dinner)).toBe('dinner');
  });

  it('returns no service period for meeting-room events', () => {
    expect(restaurantServicePeriod(ev({ spacesRaw: 'MR 2-3' }))).toBeNull();
  });

  it('flags an FX event starting inside breakfast service as a data-quality signal', () => {
    // The property says this cannot happen, so if it appears it is an error or a genuine
    // exception someone must know about - not something to assume away.
    const during = ev({ spacesRaw: 'FX', startsAt: '2026-09-02T01:00:00.000Z' }); // 08:00 BKK
    expect(startsDuringBreakfastService(during)).toBe(true);

    const after = ev({ spacesRaw: 'FX', startsAt: '2026-09-02T04:00:00.000Z' }); // 11:00 BKK
    expect(startsDuringBreakfastService(after)).toBe(false);
  });

  it('does not flag meeting rooms that start during breakfast - that is normal', () => {
    // Real MR events routinely start at 08:00, which overlaps breakfast and is expected.
    const mr = ev({ spacesRaw: 'MR 2-4', startsAt: '2026-09-02T01:00:00.000Z' });
    expect(startsDuringBreakfastService(mr)).toBe(false);
  });
});

describe('displayCompany', () => {
  it('falls back to the event name, and says so, when Client/Company is empty', () => {
    // Client/Company was '-' on every OptiqC&E row inspected.
    const r = displayCompany(ev({ clientCompany: '-' }));
    expect(r.name).toBe('Example Health Foundation (EHF)');
    expect(r.fromEventName).toBe(true);
  });

  it('prefers a real Client/Company when one is present', () => {
    const r = displayCompany(ev({ clientCompany: 'EHF Thailand' }));
    expect(r.name).toBe('EHF Thailand');
    expect(r.fromEventName).toBe(false);
  });
});

describe('setupStyleFromNotes', () => {
  it('extracts the setup style from free-text notes', () => {
    expect(setupStyleFromNotes('Classroom')).toBe('Classroom');
    expect(setupStyleFromNotes('please set U-Shape for 20')).toBe('U-Shape');
  });

  it('returns null rather than guessing', () => {
    expect(setupStyleFromNotes('')).toBeNull();
    expect(setupStyleFromNotes('client will confirm layout')).toBeNull();
  });
});

describe('multi-day events', () => {
  it('covers every day from start to end inclusive', () => {
    // One real event ran 31 Aug to 4 Sep. A day sheet needs one row per day.
    expect(eventBusinessDates(ev())).toEqual([
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
    ]);
  });

  it('handles a single-day event', () => {
    const single = ev({ startsAt: '2026-09-02T01:00:00.000Z', endsAt: '2026-09-02T06:00:00.000Z' });
    expect(eventBusinessDates(single)).toEqual(['2026-09-02']);
  });

  it('returns nothing for a malformed range instead of looping', () => {
    expect(eventBusinessDates(ev({ startsAt: 'not-a-date', endsAt: 'also-not' }))).toEqual([]);
  });
});

describe('eventsOnDate', () => {
  it('includes a multi-day event on each of its days and sorts definite first', () => {
    const tentative = ev({ id: 'b', status: 'tentative', startsAt: '2026-09-02T00:00:00.000Z', endsAt: '2026-09-02T09:00:00.000Z' });
    const list = eventsOnDate([tentative, ev()], '2026-09-02');
    expect(list.map((e) => e.id)).toEqual(['txbNL309zj99HG92GSPL', 'b']);
  });

  it('excludes days outside the event range', () => {
    expect(eventsOnDate([ev()], '2026-09-05')).toEqual([]);
  });
});

describe('spaceOccupancy', () => {
  it('marks every room in a combined booking as occupied', () => {
    const occ = spaceOccupancy([ev({ spacesRaw: 'MR 2-4' })], '2026-09-01');
    expect(occ.MR1).toHaveLength(0);
    expect(occ.MR2).toHaveLength(1);
    expect(occ.MR3).toHaveLength(1);
    expect(occ.MR4).toHaveLength(1);
    expect(occ.FX).toHaveLength(0);
  });

  it('ignores lost events — a lost booking does not hold a room', () => {
    const lost = ev({ id: 'lost', status: 'lost', spacesRaw: 'MR 1' });
    const occ = spaceOccupancy([lost], '2026-09-01');
    expect(occ.MR1).toHaveLength(0);
  });
});

describe('lost means cancelled (per the property team)', () => {
  it('treats a lost event as cancelled', () => {
    expect(isCancelled(ev({ status: 'lost' }))).toBe(true);
    expect(isCancelled(ev({ status: 'definite' }))).toBe(false);
  });

  it('excludes cancelled and non-definite events from pax and revenue totals', () => {
    const list = [
      ev({ id: 'd', status: 'definite', expectedPax: 55, valueTHB: 52250 }),
      ev({ id: 't', status: 'tentative', expectedPax: 40, valueTHB: 90000 }),
      ev({ id: 'l', status: 'lost', expectedPax: 50, valueTHB: 37500 }),
    ];
    expect(paxOnDate(list, '2026-09-01')).toBe(55);
    expect(revenueOnDate(list, '2026-09-01')).toBe(52250);
  });
});

/**
 * Every distinct Venue spelling found in the 1,001 rows of the OTB
 * "Function Room Block.xlsx" workbook. Twenty-eight ways of naming seven rooms,
 * including a typo ("roon"), inconsistent case and spacing, an undecided either/or, and
 * two spaces OptiqC&E does not list at all.
 */
describe('venue normalisation against the real workbook vocabulary', () => {
  it.each([
    ['Meeting 1', ['MR1']],
    ['meeting 1', ['MR1']],
    ['Meeting1', ['MR1']],
    ['Meeting room 1', ['MR1']],
    ['Meeting 4', ['MR4']],
    ['meeting 4', ['MR4']],
    ['Meeting room 4', ['MR4']],
    ['Meeting 2-3', ['MR2', 'MR3']],
    ['meeting 2-3', ['MR2', 'MR3']],
    ['Meeting room 2-3', ['MR2', 'MR3']],
    ['Meeting roon 2-3', ['MR2', 'MR3']],
    ['Meeting 1-3', ['MR1', 'MR2', 'MR3']],
    ['Meeting 1- 3', ['MR1', 'MR2', 'MR3']],
    ['Meeting 2-4', ['MR2', 'MR3', 'MR4']],
    ['Meeting 1-4', ['MR1', 'MR2', 'MR3', 'MR4']],
    ['Meeting 1- 4', ['MR1', 'MR2', 'MR3', 'MR4']],
    ['Meeting 1 - 4', ['MR1', 'MR2', 'MR3', 'MR4']],
    ['Meeting1-4', ['MR1', 'MR2', 'MR3', 'MR4']],
    ['meeting 1- 4', ['MR1', 'MR2', 'MR3', 'MR4']],
    ['Meeting room 1-4', ['MR1', 'MR2', 'MR3', 'MR4']],
    ['Food Exchange', ['FX']],
    ['food Exchange', ['FX']],
    ['Hotel Restaurant', ['FX']],
    ['Food Exchange / Thai Buffet', ['FX']],
    ['Gourmet Bar', ['GB']],
    ['Recreation room', ['REC']],
  ])('resolves %j', (raw, expected) => {
    expect(expandSpaces(raw as string)).toEqual(expected);
  });

  it('unions an undecided either/or rather than picking the first', () => {
    // "Food Exchange or Meeting room 2-3" is a booking whose venue is not yet settled.
    // Both possibilities must show as potentially occupied.
    expect(expandSpaces('Food Exchange or Meeting room 2-3')).toEqual(['FX', 'MR2', 'MR3']);
  });

  it('resolves what it can from a multi-venue row and nothing it cannot', () => {
    // "Meeting room" with no number is genuinely ambiguous, so only the restaurant is
    // resolved. Better to under-claim than to invent a room number.
    expect(expandSpaces('Lobby / Guest room / Restaurant / Meeting room')).toEqual(['FX']);
  });

  it('returns nothing for an unrecognised venue instead of guessing', () => {
    expect(expandSpaces('Poolside Terrace')).toEqual([]);
    expect(expandSpaces('')).toEqual([]);
  });
});

describe('status codes across all three sources', () => {
  it.each([
    ['DEF', 'definite'],
    ['TEN', 'tentative'],
    ['BID', 'prospect'],
    ['Definite', 'definite'],
    ['Tentative', 'tentative'],
    ['Prospect', 'prospect'],
    ['Lost', 'lost'],
  ])('maps %s to %s', (code, expected) => {
    expect(normaliseStatusCode(code as string)).toBe(expected);
  });

  it('maps BOTH cancellation spellings — CXL in the function workbook, CLX in GRC', () => {
    expect(normaliseStatusCode('CXL')).toBe('lost');
    expect(normaliseStatusCode('CLX')).toBe('lost');
    expect(normaliseStatusCode('Cancelled')).toBe('lost');
  });

  it('treats a Private house booking as committed, not a sales stage', () => {
    expect(normaliseStatusCode('Private')).toBe('definite');
  });

  it('returns null for an unknown code so the caller defaults explicitly', () => {
    expect(normaliseStatusCode('WAITLIST')).toBeNull();
    expect(normaliseStatusCode('')).toBeNull();
  });
});
