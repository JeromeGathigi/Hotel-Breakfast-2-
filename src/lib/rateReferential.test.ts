import { describe, it, expect } from 'vitest';
import {
  lookupRate,
  breakfastFromRate,
  isContractDependent,
  isAspacOverride,
  RATE_CODE_COUNT,
} from './rateReferential';
import {
  assessBreakfast,
  breakfastBuckets,
  hasMealEntitlement,
  canonicalPlan,
} from './meals';
import { Guest } from '../types';

/**
 * Locks the behaviour that replaced substring-matched breakfast entitlement.
 *
 * The Opera export has no meal-plan field, so the parser puts the RATE CODE into
 * `guest.mealPlan`. Entitlement used to be decided by scanning that code for 'BB' / 'BF' /
 * 'RB'. Measured against Accor's Global Rate Referential on the real 2 Sep exports, that
 * granted breakfast to 24 of 162 Novotel adults where Opera's own package forecast said 98,
 * and 10 of 135 ibis adults where Opera said 43 - refusing, never over-granting.
 */

const guest = (roomNumber: string, mealPlan: string, adults = 1, children = 0): Guest =>
  ({ roomNumber, mealPlan, adults, children } as Guest);

describe('rate referential table', () => {
  it('carries the whole 2026-07-22 edition', () => {
    expect(RATE_CODE_COUNT).toBe(573);
  });

  it('classifies the codes that actually appear at these two properties', () => {
    // Measured from the real 2 Sep exports.
    expect(lookupRate('TGLL')?.plan).toBe('BB'); // Leisure Groups - 28 rooms at Novotel
    expect(lookupRate('BGRE')?.plan).toBe('CONTRACT'); // Residential Seminars - 38 rooms
    expect(lookupRate('RC3S')?.plan).toBe('ASPAC');
    expect(lookupRate('RB1')?.plan).toBe('BB');
    expect(lookupRate('RB1D10')?.plan).toBe('BB');
    expect(lookupRate('SUPBB')?.plan).toBe('BB');
    expect(lookupRate('FLMCBB')?.plan).toBe('BB');
    expect(lookupRate('RA1')?.plan).toBe('RO');
    expect(lookupRate('DSO')?.plan).toBe('RO');
  });

  it('is case- and whitespace-insensitive but never a substring match', () => {
    expect(lookupRate('  rb1  ')?.code).toBe('RB1');

    // THE TRAP. The Novotel resort code is literally HB4F8. A loose 'HB' test reads it as
    // Half Board, which is how this class of bug got into the project in the first place.
    expect(lookupRate('HB4F8')).toBeNull();
    expect(breakfastFromRate('HB4F8')).toBeNull();

    // 'RB1' must not be found inside a longer code that merely contains it.
    expect(lookupRate('XXRB1YY')).toBeNull();
  });

  it('reports the three plans a rate table cannot answer', () => {
    // Accor's own text is "Accoriding the contract" - inclusion lives on the group block.
    for (const code of ['BGCI', 'BGPG', 'BGRE']) {
      expect(isContractDependent(code), code).toBe(true);
      expect(breakfastFromRate(code), code).toBeNull();
    }

    // Nine RC* codes read "RO on weekdays ... ASPAC: BB on all days of the week". Chiang Mai
    // is ASPAC, so they ARE breakfast here - and their own names say COMPLIMENTARY BREAKFAST.
    for (const code of ['RC1', 'RC3', 'RC3L', 'RC3M', 'RC3S', 'RC4', 'RC4L', 'RC4M', 'RC4S']) {
      expect(isAspacOverride(code), code).toBe(true);
      expect(breakfastFromRate(code), code).toBe(true);
    }
  });

  it('maps every simple plan to the right breakfast answer', () => {
    expect(breakfastFromRate('RB1')).toBe(true); // BB
    expect(breakfastFromRate('RA1')).toBe(false); // RO
    expect(breakfastFromRate(undefined)).toBeNull();
    expect(breakfastFromRate('')).toBeNull();
    expect(breakfastFromRate('NOT-A-REAL-CODE')).toBeNull();
  });
});

describe('assessBreakfast', () => {
  it('confirms a referential Bed & Breakfast rate', () => {
    const a = assessBreakfast('TGLL');
    expect(a.entitled).toBe(true);
    expect(a.basis).toBe('referential');
    expect(a.unverified).toBe(false);
    expect(a.rateName).toBe('Leisure Groups');
  });

  it('confirms a referential Room Only rate', () => {
    const a = assessBreakfast('RA1');
    expect(a.entitled).toBe(false);
    expect(a.basis).toBe('referential');
    expect(a.unverified).toBe(false);
  });

  it('resolves the ASPAC override to breakfast and explains why', () => {
    const a = assessBreakfast('RC3S');
    expect(a.entitled).toBe(true);
    expect(a.basis).toBe('aspac');
    expect(a.unverified).toBe(false);
    expect(a.reason).toMatch(/ASPAC/);
  });

  it('refuses to guess a contract-dependent group rate', () => {
    const a = assessBreakfast('BGRE');
    expect(a.entitled).toBeNull();
    expect(a.basis).toBe('contract');
    expect(a.unverified).toBe(true);
    expect(a.reason).toMatch(/contract/i);
  });

  it('flags a property-local code the global referential does not list', () => {
    // Real ibis code: the Murata company block, 68 rooms on the 2 Sep export.
    const a = assessBreakfast('C01MRO');
    expect(a.entitled).toBeNull();
    expect(a.basis).toBe('unlisted');
    expect(a.unverified).toBe(true);
  });

  it('grants an unlisted code whose name suggests breakfast, but marks it a guess', () => {
    const a = assessBreakfast('MASTBB');
    expect(a.entitled).toBe(true);
    expect(a.basis).toBe('pattern');
    expect(a.unverified).toBe(true);
  });

  it('treats a missing rate code as unanswerable, not as Room Only', () => {
    const a = assessBreakfast('');
    expect(a.entitled).toBeNull();
    expect(a.basis).toBe('blank');
    expect(a.unverified).toBe(true);
  });

  it('honours a plan stated in words, and is confident about it', () => {
    // Not every value in this field is a rate code. A comment scan can produce plain text,
    // and the Novotel export carries the placeholder "ROOM ONLY (NO DETAILS)" for a room with
    // no guest profile. When a plan is spelled out it is unambiguous.
    for (const text of ['RO - Room Only', 'RO • Room Only', 'ROOM ONLY (NO DETAILS)']) {
      const a = assessBreakfast(text);
      expect(a.entitled, text).toBe(false);
      expect(a.basis, text).toBe('explicit');
      expect(a.unverified, text).toBe(false);
    }

    for (const text of ['Bed & Breakfast', 'BED AND BREAKFAST', 'Half Board', 'All Inclusive']) {
      expect(assessBreakfast(text).entitled, text).toBe(true);
      expect(assessBreakfast(text).basis, text).toBe('explicit');
    }
  });

  it('does not read a bare RO out of a code that merely contains those letters', () => {
    // TRIPRO, EURO and PROMO all contain "RO". TRIPRO is a real Novotel code carrying 10
    // adults; a substring test would have declared it Room Only with confidence.
    for (const code of ['TRIPRO', 'EUROSAVER', 'PROMO2026']) {
      const a = assessBreakfast(code);
      expect(a.basis, code).not.toBe('explicit');
      expect(a.entitled, code).toBeNull();
      expect(a.unverified, code).toBe(true);
    }
  });

  it('does not mistake a meeting break for breakfast', () => {
    // The previous implementation listed MBREAK as a breakfast indicator. It is a meeting
    // morning coffee break; MBUFF is a meeting buffet. Neither is a breakfast cover.
    expect(assessBreakfast('MBREAK').entitled).not.toBe(true);
    expect(assessBreakfast('MBUFF').entitled).not.toBe(true);
  });
});

describe('hasMealEntitlement', () => {
  it('is permissive at the door for anything unanswerable', () => {
    // Refusing a guest who paid is worse than seating one who did not, and every such room
    // is flagged unverified so staff are prompted rather than the guest silently turned away.
    expect(hasMealEntitlement('BGRE', 'breakfast')).toBe(true);
    expect(hasMealEntitlement('C01MRO', 'breakfast')).toBe(true);
    expect(hasMealEntitlement('', 'breakfast')).toBe(true);
  });

  it('still refuses a confirmed Room Only rate', () => {
    expect(hasMealEntitlement('RA1', 'breakfast')).toBe(false);
    expect(hasMealEntitlement('DSO', 'breakfast')).toBe(false);
  });

  it('grants the codes the old substring logic wrongly refused', () => {
    // The regression that started this: every one of these is BB in the referential and every
    // one contains none of the old 'BB' / 'BF' / 'RB' tokens, so all were being refused.
    expect(hasMealEntitlement('TGLL', 'breakfast')).toBe(true);
    expect(hasMealEntitlement('RC3S', 'breakfast')).toBe(true);
  });

  it('reads dinner from Half Board and above only', () => {
    expect(hasMealEntitlement('RA1', 'dinner')).toBe(false); // RO
    expect(hasMealEntitlement('RB1', 'dinner')).toBe(false); // BB
    const halfBoard = ['AP4'].filter((c) => lookupRate(c)?.plan === 'HB');
    for (const code of halfBoard) expect(hasMealEntitlement(code, 'dinner'), code).toBe(true);
  });

  it('reads lunch from Full Board and All Inclusive only, never Half Board', () => {
    // Half Board is dinner, not lunch. The old implementation matched /FB/ loosely.
    const byPlan = (plan: string) =>
      ['RA1', 'RB1', 'AP4'].find((c) => lookupRate(c)?.plan === plan);
    const bb = byPlan('BB');
    if (bb) expect(hasMealEntitlement(bb, 'lunch'), bb).toBe(false);
  });
});

describe('breakfastBuckets', () => {
  it('keeps unverified rooms in their own bucket instead of picking a side', () => {
    const b = breakfastBuckets([
      guest('101', 'TGLL', 2), // BB      -> included
      guest('102', 'RB1', 1), // BB      -> included
      guest('103', 'RA1', 2), // RO      -> excluded
      guest('104', 'DSO', 1), // RO      -> excluded
      guest('105', 'BGRE', 2), // contract-> unverified
      guest('106', 'C01MRO', 1), // unlisted-> unverified
      guest('107', 'RC3S', 2), // ASPAC   -> included
    ]);

    expect(b.includedRooms).toBe(3);
    expect(b.includedPax).toBe(5);
    expect(b.excludedRooms).toBe(2);
    expect(b.excludedPax).toBe(3);
    expect(b.unverifiedRooms).toBe(2);
    expect(b.unverifiedPax).toBe(3);
    expect(b.unverifiedCodes).toEqual(['BGRE', 'C01MRO']);
  });

  it('counts children into pax and survives an empty list', () => {
    expect(breakfastBuckets([guest('201', 'TGLL', 2, 1)]).includedPax).toBe(3);
    expect(breakfastBuckets([]).includedPax).toBe(0);
  });

  it('never silently loses a room', () => {
    const rooms = [
      guest('301', 'TGLL'),
      guest('302', 'RA1'),
      guest('303', 'BGRE'),
      guest('304', 'WHO-KNOWS'),
      guest('305', ''),
    ];
    const b = breakfastBuckets(rooms);
    expect(b.includedRooms + b.excludedRooms + b.unverifiedRooms).toBe(rooms.length);
  });
});

describe('canonicalPlan', () => {
  it('prefers the referential name and states what the plan means here', () => {
    expect(canonicalPlan('TGLL')).toBe('Leisure Groups (BB)');
    expect(canonicalPlan('RC3S')).toMatch(/ASPAC/);
    expect(canonicalPlan('BGRE')).toMatch(/per contract/);
  });

  it('says plainly when a code is not in the referential', () => {
    expect(canonicalPlan('C01MRO')).toMatch(/not in rate referential/);
  });

  it('labels the meeting products as not breakfast', () => {
    expect(canonicalPlan('MBREAK')).toMatch(/not breakfast/);
    expect(canonicalPlan('MBUFF')).toMatch(/not breakfast/);
  });
});
