import { MENU_ITEMS, MENU_SECTIONS, type MenuItem, type MenuSectionId } from '../data/foodExchangeMenu';

/**
 * The menu as something you can sell: one entry per price. A dish with variants ("Phad Kra Pao:
 * Chicken 280, Minced Pork 300, Crispy Pork 480") becomes three entries, so the price on the order
 * is always one the menu prints - never typed by hand at the table.
 *
 * Sold-out ("86") is per DISH (`baseId`): when the kitchen runs out of basil, every Phad Kra Pao
 * goes, whatever the protein.
 */

export interface CatalogEntry {
  menuItemId: string;
  baseId: string;
  section: MenuSectionId;
  sectionTitle: string;
  itemNumber: number;
  name: string;
  description?: string;
  unitPriceThb: number;
  dietary?: MenuItem['dietary'];
  /** The transcription is uncertain - shown so staff check the printed menu before charging. */
  verify?: string;
}

export const baseItemId = (item: Pick<MenuItem, 'section' | 'itemNumber'>) => `${item.section}-${item.itemNumber}`;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function buildCatalog(items: MenuItem[] = MENU_ITEMS): CatalogEntry[] {
  const titles = new Map(MENU_SECTIONS.map((s) => [s.id, s.title]));
  const out: CatalogEntry[] = [];
  for (const item of items) {
    const base = {
      baseId: baseItemId(item),
      section: item.section,
      sectionTitle: titles.get(item.section) ?? item.section,
      itemNumber: item.itemNumber,
      description: item.description,
      dietary: item.dietary,
      verify: item.verify,
    };
    if (item.priceThb !== null) {
      out.push({ ...base, menuItemId: base.baseId, name: item.name, unitPriceThb: item.priceThb });
    }
    for (const v of item.variants ?? []) {
      out.push({ ...base, menuItemId: `${base.baseId}:${slug(v.label)}`, name: `${item.name} - ${v.label}`, unitPriceThb: v.priceThb });
    }
  }
  return out;
}

/** Name, description, section or the printed item number ("pizza 3"). */
export function searchCatalog(entries: CatalogEntry[], query: string): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  const words = q.split(/\s+/);
  return entries.filter((e) => {
    const hay = `${e.name} ${e.description ?? ''} ${e.sectionTitle} ${e.itemNumber}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** One entry per dish - what sells out - for the kitchen's sold-out list. */
export interface Dish {
  baseId: string;
  name: string;
  sectionTitle: string;
}

export function buildDishes(items: MenuItem[] = MENU_ITEMS): Dish[] {
  const titles = new Map(MENU_SECTIONS.map((s) => [s.id, s.title]));
  return items.map((item) => ({ baseId: baseItemId(item), name: item.name, sectionTitle: titles.get(item.section) ?? item.section }));
}

const DISH_NAMES = new Map(buildDishes().map((d) => [d.baseId, d.name]));

/** "Phad Kra Pao" for `main-thai-1`; the id itself if the menu no longer has it. */
export const dishName = (baseId: string) => DISH_NAMES.get(baseId) ?? baseId;

/** The sold-out list after marking one dish out (true) or back (false). */
export function toggleSoldOut(soldOut: readonly string[], baseId: string, out: boolean): string[] {
  return out ? [...new Set([...soldOut, baseId])] : soldOut.filter((id) => id !== baseId);
}
