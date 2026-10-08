import { describe, it, expect } from 'vitest';
import {
  MENU_ITEMS,
  MENU_SECTIONS,
  MENU_SOURCE,
  GRILL_ACCOMPANIMENTS,
  ALLERGENS_NOT_CAPTURED,
  PRICE_BASIS_NOTE,
  grossPriceThb,
  itemsNeedingVerification,
  sectionPriceRange,
  MenuSectionId,
} from './foodExchangeMenu';

/**
 * Locks the transcription of the April 2025 Food Exchange menu.
 *
 * These are golden assertions on hand-read data, so they serve a specific purpose: if anyone
 * re-transcribes from a new PDF edition, the diff has to be deliberate. A menu is price data
 * that staff quote to guests, and a silently shifted price is worse than an obviously missing
 * one.
 */

describe('menu source and integrity', () => {
  it('is the April 2025 Food Exchange menu, tied to the venue the app already models', () => {
    expect(MENU_SOURCE.edition).toBe('2025-04');
    expect(MENU_SOURCE.venueId).toBe('FX'); // matches src/lib/functionSpace.ts
    expect(MENU_SOURCE.hotelId).toBe('novotel');
    // Food Exchange is lunch and dinner. Breakfast there is a buffet and is not in this menu -
    // which is worth asserting, because this app is primarily a breakfast tool and someone will
    // eventually assume this menu covers it.
    expect(MENU_SOURCE.services).not.toContain('breakfast');
  });

  it('has every section populated and no orphan items', () => {
    const sectionIds = new Set(MENU_SECTIONS.map((s) => s.id));
    const used = new Set(MENU_ITEMS.map((i) => i.section));

    for (const id of used) {
      expect(sectionIds.has(id as MenuSectionId), `item references unknown section ${id}`).toBe(true);
    }
    for (const id of sectionIds) {
      expect(used.has(id), `section ${id} has no items`).toBe(true);
    }
  });

  it('transcribes 82 items across 10 sections', () => {
    expect(MENU_ITEMS).toHaveLength(82);
    expect(MENU_SECTIONS).toHaveLength(10);
  });

  it('numbers items contiguously from 1 within each section', () => {
    for (const section of MENU_SECTIONS) {
      const numbers = MENU_ITEMS.filter((i) => i.section === section.id)
        .map((i) => i.itemNumber)
        .sort((a, b) => a - b);
      const expected = Array.from({ length: numbers.length }, (_, k) => k + 1);
      expect(numbers, `${section.id} item numbers`).toEqual(expected);
    }
  });

  it('gives every item either a single price or variants, never neither and never both', () => {
    for (const item of MENU_ITEMS) {
      const hasSingle = item.priceThb !== null;
      const hasVariants = Array.isArray(item.variants) && item.variants.length > 0;
      expect(hasSingle !== hasVariants, `${item.name} must have exactly one of price or variants`).toBe(true);
    }
  });

  it('has no zero or negative prices', () => {
    // A zero price would read as "free" on screen. If a price is unknown it must be absent and
    // flagged, not zero - the same reasoning as revenue_thb being NULL rather than 0 elsewhere.
    for (const item of MENU_ITEMS) {
      if (item.priceThb !== null) expect(item.priceThb, item.name).toBeGreaterThan(0);
      for (const v of item.variants ?? []) expect(v.priceThb, `${item.name} / ${v.label}`).toBeGreaterThan(0);
    }
  });
});

describe('prices', () => {
  it('spot-checks the prices most likely to be mis-paired by the multi-column layout', () => {
    // Page 3 extracts as `THB 120 02 THB 150 03 THB 150 04` against three names from an
    // earlier line. These four are the ones a naive parse gets wrong.
    const byName = (name: string) => MENU_ITEMS.find((i) => i.name === name);
    expect(byName('Shrimp Golden Bag')?.priceThb).toBe(220);
    expect(byName('French Fries')?.priceThb).toBe(120);
    expect(byName('Roasted Cashew Nut')?.priceThb).toBe(150);
    expect(byName('Vegetarian Spring Roll')?.priceThb).toBe(150);

    // The most expensive and cheapest things on the menu, as anchors.
    expect(byName('Beef Angus Striploin')?.priceThb).toBe(980);
    expect(byName('Basmati Rice')?.priceThb).toBe(70);
  });

  it('keeps the three Phad Kra Pao proteins as separate prices', () => {
    const item = MENU_ITEMS.find((i) => i.name === 'Phad Kra Pao');
    expect(item?.priceThb).toBeNull();
    expect(item?.variants).toEqual([
      { label: 'Chicken', priceThb: 280 },
      { label: 'Minced Pork', priceThb: 300 },
      { label: 'Crispy Pork', priceThb: 480 },
    ]);
  });

  it('applies service charge before VAT, which is not the same as one combined rate', () => {
    // 250 * 1.10 * 1.07 = 294.25. A naive 250 * 1.17 gives 292.50 and loses the VAT charged on
    // the service charge. The gap grows with the bill.
    expect(grossPriceThb(250)).toBe(294.25);
    expect(grossPriceThb(250)).not.toBe(292.5);
    expect(grossPriceThb(980)).toBe(1153.46);
  });

  it('states that menu prices are net', () => {
    expect(PRICE_BASIS_NOTE).toMatch(/exclusive of 7% tax and 10% service charge/);
  });

  it('reports a sensible price range per section', () => {
    expect(sectionPriceRange('from-the-grill')).toEqual({ min: 350, max: 980 });
    expect(sectionPriceRange('little-india')).toEqual({ min: 70, max: 550 });
    // main-thai has variant-priced items, so the range must span those too.
    expect(sectionPriceRange('main-thai')).toEqual({ min: 190, max: 480 });
  });
});

describe('safety and honesty of the dataset', () => {
  it('declares that allergen data is not captured', () => {
    // The PDF encodes 14 major allergens as ICONS, which carry no text and cannot be
    // transcribed. Any UI over this data must say so rather than imply completeness.
    expect(ALLERGENS_NOT_CAPTURED).toBe(true);

    // And no item may carry an allergen field, so a partial list cannot creep in. A
    // half-complete allergen table is more dangerous than none: it invites reliance.
    for (const item of MENU_ITEMS) {
      expect(item, item.name).not.toHaveProperty('allergens');
    }
  });

  it('claims a dietary flag ONLY where the dish states it in words', () => {
    // The PDF marks Vegetarian with the same unreadable icon set as the allergens. So a flag
    // here may rest only on the dish's own wording - anything else would publish my inference
    // as the hotel's statement to a guest with a dietary requirement.
    //
    // This test previously allowed a looser list and caught a real mistake in this dataset:
    // "Cocktail Vegetable Samosa" had been flagged vegetarian, but the menu says VEGETABLE, not
    // vegetarian. Fifteen inferred flags were removed as a result. Some would have been wrong -
    // naan commonly contains dairy, and Four Cheese is only vegetarian with non-animal rennet.
    const flagged = MENU_ITEMS.filter((i) => i.dietary?.length);

    expect(flagged.map((i) => i.name).sort()).toEqual([
      'Phad Kra Pao Je',
      'Plant-Based Cheese Burger',
      'Vegan',
      'Vegetarian Club Sandwich',
      'Vegetarian Spring Roll',
    ]);

    for (const item of flagged) {
      const text = `${item.name} ${item.description ?? ''}`.toLowerCase();
      const statesItLiterally = /vegetarian|vegan|plant.?based|plant based/.test(text);
      expect(statesItLiterally, `${item.name} must state its dietary claim in words`).toBe(true);
    }
  });

  it('leaves probably-vegetarian dishes unflagged rather than inferring', () => {
    // Each of these is very likely vegetarian, and each is deliberately unflagged.
    for (const name of ['Basmati Rice', 'Papadum', 'Aloo Gobi', 'Cocktail Vegetable Samosa', 'Napolitano']) {
      const item = MENU_ITEMS.find((i) => i.name === name);
      expect(item, name).toBeDefined();
      expect(item?.dietary, `${name} must not carry an inferred dietary flag`).toBeUndefined();
    }
  });

  it('leaves the grill accompaniments unpriced rather than guessing', () => {
    expect(GRILL_ACCOMPANIMENTS.sauces).toHaveLength(8);
    expect(GRILL_ACCOMPANIMENTS.sideDishes).toHaveLength(6);
    expect(GRILL_ACCOMPANIMENTS.priceNote).toMatch(/Confirm with the outlet/);
    expect(GRILL_ACCOMPANIMENTS).not.toHaveProperty('priceThb');
  });

  it('surfaces the two items whose transcription is uncertain', () => {
    const flagged = itemsNeedingVerification();
    expect(flagged.map((i) => i.name).sort()).toEqual(['Chana Masala', 'Mixed Fruit Tart', 'Pla Goong']);
    for (const item of flagged) {
      expect(item.verify, item.name).toBeTruthy();
    }
  });
});
