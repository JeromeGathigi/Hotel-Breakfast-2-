import { describe, it, expect } from 'vitest';
import { assessGuestBreakfast, summariseBreakfast } from './entitlement';
import { breakfastFromNotes } from './noteSignals';
import { applyOverride, type RoomOverride } from './overrides';
import type { PackageIndex } from '../parsing/packageDetail';
import type { Guest } from '../types';

const TODAY = '2026-09-02';

function guest(over: Partial<Guest> = {}): Guest {
  return {
    roomNumber: '301',
    guestName: 'TEST GUEST',
    arrivalDate: '2026-09-01',
    departureDate: '2026-09-04',
    mealPlan: 'RA1',
    rateCode: 'RA1',
    adults: 2,
    children: 0,
    resvNameId: 'R1',
    hotelId: 'novotel',
    notes: [],
    ...over,
  };
}

const note = (text: string) => ({ text, type: 'RES' });

function packages(byResv: PackageIndex['byResv'], reportDate = TODAY): PackageIndex {
  return { hotelId: 'novotel', reportDate, reservations: Object.keys(byResv).length, byResv };
}

describe('breakfastFromNotes', () => {
  it('reads the front office shorthand seen on the real exports', () => {
    expect(breakfastFromNotes([note('PM : 2 : RB')]).verdict).toBe('BF');
    expect(breakfastFromNotes([note('GA COMP BF AT 1,710+++ ON 30-31/8')]).verdict).toBe('BF');
    expect(breakfastFromNotes([note('GA COMP ABF AT 1,300+++')]).verdict).toBe('BF');
    expect(breakfastFromNotes([note('GA RO AT 1,170.00+++ ON 2/9')]).verdict).toBe('RO');
    expect(breakfastFromNotes([note('VCC RO AT 2,500 NET')]).verdict).toBe('RO');
  });

  it('treats a paid breakfast on a room-only rate as breakfast', () => {
    expect(breakfastFromNotes([note('GA RO AT 1430+++ ON 31/08 PAID ABF 1800NET')]).verdict).toBe('BF');
  });

  it('honours negation before anything else', () => {
    expect(breakfastFromNotes([note('NO BREAKFAST please')]).verdict).toBe('RO');
    expect(breakfastFromNotes([note('rate excl. BF')]).verdict).toBe('RO');
    expect(breakfastFromNotes([note('Breakfast not included')]).verdict).toBe('RO');
  });

  it('matches whole tokens only', () => {
    // TRIPRO is a real Novotel code; EURO, PROMO and BF350NET contain the letters but say nothing.
    expect(breakfastFromNotes([note('Booked via TRIPRO PROMO in EURO')]).verdict).toBeNull();
    expect(breakfastFromNotes([note('BF350NET')]).verdict).toBeNull();
    expect(breakfastFromNotes([note('Non-ALL member guest with eligible stay: invite them to join')]).verdict).toBeNull();
  });

  it('flags MBREAK without deciding it', () => {
    const s = breakfastFromNotes([note('GA RO AT 1,105+++ ON 2-3/9 MBREAK AT 400+++')]);
    expect(s.verdict).toBe('RO');
    expect(s.mentionsMbreak).toBe(true);
  });
});

describe('assessGuestBreakfast precedence', () => {
  it('an Opera breakfast package beats a Room Only rate code', () => {
    // Room 106 on 2 Sep: rate RA3S (Room Only in the referential), Opera package BFCOMP. The rate
    // code alone refused this guest.
    const a = assessGuestBreakfast(guest({ rateCode: 'RA3S', mealPlan: 'RA3S', resvNameId: 'P1' }), {
      today: TODAY,
      packages: packages({ P1: { p: 'BFCOMP', n: 1 } }),
    });
    expect(a).toMatchObject({ entitled: true, door: true, unverified: false, basis: 'opera-package', pax: 1 });
    expect(a.conflict).toBe(false);
  });

  it('no package on a fresh report means room only', () => {
    const a = assessGuestBreakfast(guest({ resvNameId: 'P2' }), { today: TODAY, packages: packages({ OTHER: { p: 'BF', n: 2 } }) });
    expect(a).toMatchObject({ entitled: false, door: false, basis: 'opera-package', pax: 0 });
  });

  it('absence proves nothing when the report is stale or predates the arrival', () => {
    const stale = assessGuestBreakfast(guest({ resvNameId: 'P2', rateCode: 'RB1' }), {
      today: TODAY,
      packages: packages({ OTHER: { p: 'BF', n: 2 } }, '2026-08-28'),
    });
    expect(stale.basis).not.toBe('opera-package');
    expect(stale.entitled).toBe(true); // falls through to the rate: RB1 is BB

    const lateBooking = assessGuestBreakfast(guest({ resvNameId: 'P2', arrivalDate: '2026-09-02', rateCode: 'RB1' }), {
      today: TODAY,
      packages: packages({ OTHER: { p: 'BF', n: 2 } }, '2026-09-01'),
    });
    expect(lateBooking.basis).not.toBe('opera-package');
  });

  it('no package but a note saying breakfast is a conflict, and the door still serves', () => {
    // Room 113: "GA RO ... PAID ABF" - breakfast bought separately, so no package.
    const a = assessGuestBreakfast(guest({ resvNameId: 'P3', rateCode: 'DSO', notes: [note('GA RO AT 1430+++ PAID ABF 1800NET')] }), {
      today: TODAY,
      packages: packages({}),
    });
    expect(a).toMatchObject({ entitled: null, door: true, unverified: true, conflict: true });
  });

  it('a meeting-only package is ambiguous', () => {
    const a = assessGuestBreakfast(guest({ resvNameId: 'P4' }), { today: TODAY, packages: packages({ P4: { p: 'MBREAK', n: 2 } }) });
    expect(a).toMatchObject({ entitled: null, door: true, unverified: true });
    expect(a.reason).toMatch(/MBREAK/);
  });

  it('without package data, the note decides - the spec says DSO depends entirely on comments', () => {
    const bf = assessGuestBreakfast(guest({ rateCode: 'DSO', notes: [note('GA COMP BF AT 1,170+++')] }), { today: TODAY });
    expect(bf).toMatchObject({ entitled: true, basis: 'note', unverified: false, conflict: false });

    const ro = assessGuestBreakfast(guest({ rateCode: 'TRIPRO', notes: [note('GA RO AT 1,805+++')] }), { today: TODAY });
    expect(ro).toMatchObject({ entitled: false, basis: 'note' });
  });

  it('a room-only note on a breakfast rate needs a human', () => {
    const a = assessGuestBreakfast(guest({ rateCode: 'RB1', notes: [note('GA RO AT 2,000 NET')] }), { today: TODAY });
    expect(a).toMatchObject({ entitled: null, door: true, conflict: true });
  });

  it('a room-only note that mentions MBREAK is not decided', () => {
    const a = assessGuestBreakfast(guest({ rateCode: 'DSO', notes: [note('GA RO AT 1,105+++ MBREAK AT 400+++')] }), { today: TODAY });
    expect(a.entitled).toBeNull();
    expect(a.reason).toMatch(/MBREAK/);
  });

  it("the property's own rate list settles its local codes", () => {
    for (const code of ['C01', 'CREWESR', 'TGLLSR', 'LDR', 'PKGH1']) {
      const a = assessGuestBreakfast(guest({ rateCode: code, mealPlan: code }), { today: TODAY });
      expect(a, code).toMatchObject({ entitled: true, basis: 'property-list', unverified: false });
    }
    // C01MRO is not on the list: still unanswerable from the rate alone.
    expect(assessGuestBreakfast(guest({ rateCode: 'C01MRO', mealPlan: 'C01MRO' }), { today: TODAY }).entitled).toBeNull();
  });

  it('a correction for today wins, and only for that reservation and day', () => {
    const override: RoomOverride = {
      roomNumber: '301', date: TODAY, resvNameId: 'R1', kind: 'rate', breakfast: true, breakfastPax: 1,
      recordedBy: 'host@accor.com', recordedAt: '2026-09-02T06:10:00+07:00', note: 'FO confirmed',
    };
    expect(assessGuestBreakfast(guest({ rateCode: 'C01MRO' }), { today: TODAY, override })).toMatchObject({
      entitled: true, basis: 'correction', pax: 1, unverified: false,
    });
    // Tomorrow, or a different reservation in the same room, ignores it.
    expect(assessGuestBreakfast(guest({ rateCode: 'C01MRO' }), { today: '2026-09-03', override }).basis).not.toBe('correction');
    expect(assessGuestBreakfast(guest({ rateCode: 'C01MRO', resvNameId: 'R2' }), { today: TODAY, override }).basis).not.toBe('correction');
  });

  it("marks today's arrivals, whose package breakfast starts tomorrow", () => {
    expect(assessGuestBreakfast(guest({ arrivalDate: TODAY, rateCode: 'RB1' }), { today: TODAY }).arrivesToday).toBe(true);
    expect(assessGuestBreakfast(guest({ rateCode: 'RB1' }), { today: TODAY }).arrivesToday).toBe(false);
  });
});

describe('summariseBreakfast', () => {
  const rooms = [
    guest({ roomNumber: '1', rateCode: 'RB1', adults: 2 }), // included
    guest({ roomNumber: '2', rateCode: 'RA1', adults: 1 }), // excluded
    guest({ roomNumber: '3', rateCode: 'C01MRO', mealPlan: 'C01MRO', adults: 3 }), // unverified
    guest({ roomNumber: '4', rateCode: 'RB1', adults: 2, arrivalDate: TODAY }), // included, arrives today
  ];
  const s = summariseBreakfast(rooms, (g) => assessGuestBreakfast(g, { today: TODAY }));

  it('three buckets that always add up', () => {
    expect(s.includedPax + s.excludedPax + s.unverifiedPax).toBe(s.pax);
    expect(s).toMatchObject({ includedPax: 4, excludedPax: 1, unverifiedPax: 3, unverifiedCodes: ['C01MRO'] });
  });

  it("expected this morning leaves out today's arrivals, as Opera's forecast does", () => {
    expect(s.expectedTodayPax).toBe(2 + 3);
    expect(s.arrivalsTodayRooms).toBe(1);
  });
});

describe('applyOverride', () => {
  const base = guest({ adults: 0, issueType: 'no-adults' });
  const o: RoomOverride = {
    roomNumber: '301', date: TODAY, resvNameId: 'R1', kind: 'no-adults', adults: 2, breakfast: true,
    recordedBy: 'host@accor.com', recordedAt: 'now',
  };

  it('corrects the headcount and clears the data-quality flag', () => {
    const g = applyOverride(base, o, TODAY)!;
    expect(g.adults).toBe(2);
    expect(g.issueType).toBeNull();
    expect(g.correction?.by).toBe('host@accor.com');
  });

  it('removes a room a host marks as not occupied', () => {
    expect(applyOverride(guest({ issueType: 'no-details' }), { ...o, kind: 'no-details', occupied: false }, TODAY)).toBeNull();
  });

  it('leaves the guest untouched when the correction is for another day', () => {
    expect(applyOverride(base, o, '2026-09-03')).toBe(base);
  });
});
