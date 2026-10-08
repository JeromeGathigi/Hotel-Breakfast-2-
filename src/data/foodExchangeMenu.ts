/**
 * Food Exchange à la carte menu - Novotel Chiang Mai Nimman Journeyhub.
 *
 * Transcribed from `Food-Exchange-Chiang-Mai-Menu042025.pdf` (April 2025 edition), 16 pages,
 * 13 with text. Names, descriptions and prices were read from the PDF's text layer in reading
 * order and cross-checked against a second extraction in layout order, because the menu is a
 * multi-column design and a naive read pairs the wrong price with the wrong dish. On page 3 a
 * single extracted line reads `THB 120 02 THB 150 03 THB 150 04` against three dish names from
 * an earlier line - so every price here was matched by hand, not by a regex.
 *
 * ## TWO THINGS TO READ BEFORE USING THIS ANYWHERE A GUEST IS SERVED
 *
 * ### 1. There is NO allergen data here, and the printed menu has it
 *
 * The PDF marks 14 major allergens per dish, plus Chef Recommend / Vegetarian / Spicy, using
 * ICONS. Icons carry no text, so they do not survive extraction - in the raw text they appear
 * as bare commas, e.g. the Wagyu Beef Burger's description extracts as `, , , , , `.
 *
 * That means this dataset is NOT a substitute for the menu when someone asks about an allergy.
 * Any screen built on it must say so, and must not imply completeness. The menu's own words:
 * "Please indicate allergies if any to your server. Food may contain traces of nuts and dairy
 * products."
 *
 * `dietary` is set ONLY where the dish's own name or description contains the literal word -
 * Vegetarian Spring Roll, Vegetarian Club Sandwich, Phad Kra Pao Je ("with Plant Based"),
 * Plant-Based Cheese Burger, Vegan pizza. Five items, and that is the whole list.
 *
 * Everything else is deliberately unflagged, including dishes that are probably vegetarian.
 * The PDF marks them with the same unreadable icon set as the allergens, so flagging them
 * would mean publishing my guess as the hotel's statement. Some of those guesses would have
 * been wrong: naan commonly contains dairy, Four Cheese is only vegetarian with non-animal
 * rennet, and a "Vegetable Samosa" says vegetable, not vegetarian. A guest with a dietary
 * requirement is owed the printed menu and the server, not an inference.
 *
 * ### 2. Prices are NET
 *
 * "All prices are Thai Baht and exclusive of 7% tax and 10% service charge" - the PDF's own
 * footer, on every page. So a menu price is not what the guest pays and is not revenue. Use
 * `grossPriceThb()` rather than multiplying by hand, and note the order matters: service
 * charge is applied first, then VAT on the total. 250 net is 294.25 gross, not 292.50.
 */

/** Sections in menu order. */
export type MenuSectionId =
  | 'snack'
  | 'go-healthy'
  | 'main-thai'
  | 'local-northern-thai'
  | 'little-india'
  | 'soup'
  | 'mains-western'
  | 'pizza'
  | 'from-the-grill'
  | 'desserts';

export interface MenuSection {
  id: MenuSectionId;
  title: string;
  /** Page in the source PDF, for anyone checking a transcription against the original. */
  sourcePages: number[];
  note?: string;
}

export interface PriceVariant {
  /** What distinguishes this price, e.g. 'Chicken', 'Minced Pork', 'Crispy Pork'. */
  label: string;
  priceThb: number;
}

export interface MenuItem {
  section: MenuSectionId;
  /** The menu's own item number within its section. Not globally unique. */
  itemNumber: number;
  name: string;
  description?: string;
  /** Net price in THB. Null when the dish has variants - read `variants` instead. */
  priceThb: number | null;
  variants?: PriceVariant[];
  /** As printed, e.g. '110 - 120 KCAL' or '239 KCAL'. Only the Go Healthy section carries it. */
  kcal?: string;
  /**
   * Set ONLY where the dish's own name or description contains the literal word. Five items
   * qualify. This is NOT the PDF's icon set, which is unreadable from the text layer, so
   * absence means "the menu does not say so in words" - never "free of".
   */
  dietary?: Array<'vegetarian' | 'plant-based'>;
  /** Set when the transcription is uncertain. Surfaced in the UI rather than hidden. */
  verify?: string;
}

/** The PDF's own footer, on every page. */
export const PRICE_BASIS_NOTE =
  'All prices are Thai Baht and exclusive of 7% tax and 10% service charge.';

export const ALLERGEN_NOTE =
  'Please indicate allergies if any to your server. Food may contain traces of nuts and dairy products.';

/**
 * Allergen data is deliberately absent. The PDF encodes 14 major allergens as icons, which
 * carry no text and cannot be transcribed from it. Do not add a partial allergen list here:
 * a half-complete allergen table is more dangerous than none, because it invites reliance.
 */
export const ALLERGENS_NOT_CAPTURED = true as const;

export const MENU_SOURCE = {
  filename: 'Food-Exchange-Chiang-Mai-Menu042025.pdf',
  edition: '2025-04',
  outlet: 'Food Exchange',
  venueId: 'FX',
  hotelId: 'novotel',
  hotelName: 'Novotel Chiang Mai Nimman Journeyhub',
  /** Food Exchange serves lunch and dinner; breakfast is a buffet and is not in this menu. */
  services: ['lunch', 'dinner'] as const,
} as const;

const VAT_RATE = 0.07;
const SERVICE_CHARGE_RATE = 0.1;

/**
 * What the guest actually pays. Service charge first, then VAT on the total - the standard
 * Thai order, and the reason a naive `net * 1.17` is wrong by the VAT on the service charge.
 */
export function grossPriceThb(netThb: number): number {
  return Math.round(netThb * (1 + SERVICE_CHARGE_RATE) * (1 + VAT_RATE) * 100) / 100;
}

export const MENU_SECTIONS: MenuSection[] = [
  { id: 'snack', title: 'Snack', sourcePages: [3] },
  {
    id: 'go-healthy',
    title: 'Go Healthy',
    sourcePages: [4],
    note: 'The only section with calorie counts, printed as bands rather than exact figures.',
  },
  { id: 'main-thai', title: 'Main — Thai', sourcePages: [5, 6] },
  { id: 'local-northern-thai', title: 'Local Northern Thai', sourcePages: [6] },
  { id: 'little-india', title: 'Little India', sourcePages: [7, 8] },
  { id: 'soup', title: 'Soup', sourcePages: [9] },
  {
    id: 'mains-western',
    title: 'Mains — Western',
    sourcePages: [10, 11],
    note: 'Pasta is priced by sauce; the pasta shape (spaghetti, fusilli, fettuccini) is a free choice.',
  },
  {
    id: 'pizza',
    title: 'Pizza',
    sourcePages: [12],
    note: 'Grouped by base: Red (1-5), White (6-9), Lanna (10-11), Vegan (12).',
  },
  {
    id: 'from-the-grill',
    title: 'From the Grill',
    sourcePages: [13],
    note: 'Sauces and side dishes are listed as selections; see GRILL_ACCOMPANIMENTS.',
  },
  { id: 'desserts', title: 'Desserts', sourcePages: [14] },
];

export const MENU_ITEMS: MenuItem[] = [
  // ---- Snack -------------------------------------------------------------
  { section: 'snack', itemNumber: 1, name: 'Shrimp Golden Bag', description: 'Shrimp Golden Bag with Plum Sauce', priceThb: 220 },
  { section: 'snack', itemNumber: 2, name: 'French Fries', description: 'Served with Ketchup and Mayonnaise', priceThb: 120 },
  { section: 'snack', itemNumber: 3, name: 'Roasted Cashew Nut', description: 'Seasoning with Salt', priceThb: 150 },
  { section: 'snack', itemNumber: 4, name: 'Vegetarian Spring Roll', description: 'Served with Plum Sauce', priceThb: 150, dietary: ['vegetarian'] },
  { section: 'snack', itemNumber: 5, name: 'Nacho Chips', description: 'Nacho Chips with Avocado Salsa', priceThb: 180 },
  { section: 'snack', itemNumber: 6, name: 'Sun Dried Pork', description: 'Served with Chili Sauce', priceThb: 290 },
  { section: 'snack', itemNumber: 7, name: 'Buffalo Chicken Wings', description: 'Buffalo Chicken Wings with Celery Stick', priceThb: 220 },

  // ---- Go Healthy --------------------------------------------------------
  { section: 'go-healthy', itemNumber: 1, name: 'Tabbouleh Salad', description: 'Chopped Vegetables, Fresh Parsley and Quinoa, tossed with Lime Juice and Olive Oil', priceThb: 250, kcal: 'Less than 200 KCAL' },
  { section: 'go-healthy', itemNumber: 2, name: 'Moo Yang Numtok', description: 'Traditional E-San Grilled Pork Spicy Salad', priceThb: 290, kcal: '110 - 120 KCAL' },
  { section: 'go-healthy', itemNumber: 3, name: 'Pla Goong', description: 'Thai Shrimp Salad with Chili Paste and Lemongrass', priceThb: 300, kcal: '150 - 200 KCAL', verify: 'Item number inferred from column position; both this and Yam Talay are THB 300, so the price is unaffected either way.' },
  { section: 'go-healthy', itemNumber: 4, name: 'Yam Talay', description: 'Seafood Spicy Salad', priceThb: 300, kcal: '145 - 150 KCAL' },
  { section: 'go-healthy', itemNumber: 5, name: 'Som Tam', description: 'Spicy Papaya Salad', priceThb: 180, kcal: '55 KCAL' },
  { section: 'go-healthy', itemNumber: 6, name: 'Roasted Chicken Breast', description: 'Roasted Organic Chicken Benja, Assorted Mushroom, Broccoli, Mirin-Pineapple Reduction', priceThb: 390, kcal: '239 KCAL' },
  { section: 'go-healthy', itemNumber: 7, name: 'Grilled Salmon Steak', description: 'Grilled Norwegian Salmon served with Quinoa, Sugar Peas and Mango Salsa', priceThb: 680, kcal: '500 - 600 KCAL' },
  { section: 'go-healthy', itemNumber: 8, name: 'Caesar Salad', description: 'Lettuce with Bacon, Croutons, Anchovies, and Parmesan', priceThb: 270, kcal: '600 - 630 KCAL' },
  { section: 'go-healthy', itemNumber: 9, name: 'French Tuna Salad Niçoise', description: 'Tuna in Oil, Lettuce, Boiled Potato, Egg, Beans, Tomato and Olives, finished with a Lemon Dressing', priceThb: 380, kcal: '500 - 520 KCAL' },

  // ---- Main, Thai --------------------------------------------------------
  {
    section: 'main-thai', itemNumber: 1, name: 'Phad Kra Pao',
    description: 'Stir Fried Thai Basil with Chicken or Minced Pork or Crispy Pork',
    priceThb: null,
    variants: [
      { label: 'Chicken', priceThb: 280 },
      { label: 'Minced Pork', priceThb: 300 },
      { label: 'Crispy Pork', priceThb: 480 },
    ],
  },
  {
    section: 'main-thai', itemNumber: 2, name: 'Khao Phad Moo / Gai',
    description: 'Thai Style Fried Rice with Pork or Chicken',
    priceThb: null,
    variants: [
      { label: 'Pork', priceThb: 240 },
      { label: 'Chicken', priceThb: 220 },
    ],
  },
  {
    section: 'main-thai', itemNumber: 3, name: 'Phad Thai Gai or Goong',
    description: 'Fried Rice Noodle with Chicken or River Prawn with Tangy Tamarind Sauce',
    priceThb: null,
    variants: [
      { label: 'Chicken', priceThb: 290 },
      { label: 'River Prawn', priceThb: 420 },
    ],
  },
  {
    section: 'main-thai', itemNumber: 4, name: 'Phad See Eiw Moo / Gai',
    description: 'Fried Noodle with Pork or Chicken',
    priceThb: null,
    variants: [
      { label: 'Pork', priceThb: 240 },
      { label: 'Chicken', priceThb: 220 },
    ],
  },
  { section: 'main-thai', itemNumber: 5, name: 'Pla Piew Waan', description: 'Stir-Fried Sea Bass Fillet with Sweet & Sour Sauce with Rice', priceThb: 290 },
  { section: 'main-thai', itemNumber: 6, name: 'Grilled Duck Red Curry', description: 'Grilled Duck Curry, Pineapple, Grape, Cherry Eggplant served with Rice', priceThb: 280 },
  { section: 'main-thai', itemNumber: 7, name: 'Keang Kiew Waan Gai', description: 'Thai Green Curry Chicken served with Rice', priceThb: 250 },
  { section: 'main-thai', itemNumber: 8, name: 'Phad Kra Pao Je', description: 'Stir Fried Thai Basil with Plant Based', priceThb: 250, dietary: ['plant-based'] },
  { section: 'main-thai', itemNumber: 9, name: 'Phad Pak Ruam', description: 'Stir Fried Mixed Vegetable', priceThb: 190 },
  { section: 'main-thai', itemNumber: 10, name: 'Phad Normai Farang Goong', description: 'Stir Fried Asparagus with Shrimp', priceThb: 320 },

  // ---- Local Northern Thai ----------------------------------------------
  { section: 'local-northern-thai', itemNumber: 1, name: 'Khao Soy Gai', description: 'Northern Thai Style Egg Noodles with Organic Chicken Benja Curry', priceThb: 250 },
  { section: 'local-northern-thai', itemNumber: 2, name: 'Larb Moo', description: 'Northern Thai Style Spicy Minced Pork Salad', priceThb: 220 },
  { section: 'local-northern-thai', itemNumber: 3, name: 'Keang Hang-Lay', description: 'Northern Curry Pork Belly with Ginger', priceThb: 250 },
  { section: 'local-northern-thai', itemNumber: 4, name: 'Jor Phad Kard', description: 'Braised Baby Pork Ribs with False Pak Choi', priceThb: 220 },

  // ---- Little India ------------------------------------------------------
  { section: 'little-india', itemNumber: 1, name: 'Chicken Masala Curry', description: 'Chicken Masala', priceThb: 320 },
  { section: 'little-india', itemNumber: 2, name: 'Aloo Gobi', description: 'Spicy Potato and Cauliflower', priceThb: 290 },
  { section: 'little-india', itemNumber: 3, name: 'Aloo Palak', description: 'Potato Curry in Onion Tomato & Spinach Gravy', priceThb: 290 },
  { section: 'little-india', itemNumber: 4, name: 'Chana Masala', description: 'Chickpeas cooked in warming spices in lightly Caramelized Onion and Tangy Tomato', priceThb: 290, verify: 'Item number uncertain - the extraction placed a stray "01" beside this dish. Price is unambiguous.' },
  { section: 'little-india', itemNumber: 5, name: 'Mutton Rogan Josh', description: 'Rogan Josh Indian Goat Curry with a heady combination of intense spices in a Creamy Tomato Curry Sauce', priceThb: 550 },
  { section: 'little-india', itemNumber: 6, name: 'Palak Paneer', description: 'Indian Cottage Cheese simmered in Onion Tomato Spinach Gravy', priceThb: 320 },
  { section: 'little-india', itemNumber: 7, name: 'Cocktail Vegetable Samosa', description: 'Cocktail Vegetable Samosa, 10 pcs', priceThb: 250 },
  { section: 'little-india', itemNumber: 8, name: 'Indian Bread', description: 'Selection of Indian Bread: Paratha, Naan Bread, Garlic Naan Bread', priceThb: 70 },
  { section: 'little-india', itemNumber: 9, name: 'Basmati Rice', priceThb: 70 },
  { section: 'little-india', itemNumber: 10, name: 'Papadum', description: 'Papadum, 5 pcs', priceThb: 70 },
  { section: 'little-india', itemNumber: 11, name: 'Indian Salad', description: 'Indian Green Salad', priceThb: 70 },
  { section: 'little-india', itemNumber: 12, name: 'Masala Tea', priceThb: 150 },

  // ---- Soup --------------------------------------------------------------
  { section: 'soup', itemNumber: 1, name: 'Tom Yum Goong', description: 'Thai Spicy Soup with River Prawn', priceThb: 380 },
  { section: 'soup', itemNumber: 2, name: 'Tom Kha Gai', description: 'Chicken Simmered in Coconut Milk', priceThb: 220 },
  { section: 'soup', itemNumber: 3, name: 'Tom Yum Hed', description: 'Spicy Soup with Mixed Mushrooms', priceThb: 210 },
  { section: 'soup', itemNumber: 4, name: 'Wild Mushroom Soup', description: 'Wild Mushroom Soup with Truffle Foam and Garlic Bread', priceThb: 250 },
  { section: 'soup', itemNumber: 5, name: 'French Onion Soup', description: 'French Onion Soup with Cheese Crouton', priceThb: 250 },

  // ---- Mains, Western ----------------------------------------------------
  { section: 'mains-western', itemNumber: 1, name: 'Wagyu Beef Burger', description: 'Gherkins, Tomato, Lettuce, Egg, Cheese, Honey Caramelized Onions', priceThb: 380 },
  { section: 'mains-western', itemNumber: 2, name: 'Cajun Chicken Burger', description: 'Spicy Cajun Chicken Burger, Tomato, Onions, Capsicum, Cheese, Lettuce', priceThb: 320 },
  { section: 'mains-western', itemNumber: 3, name: 'Plant-Based Cheese Burger', description: 'Tomato, Honey Caramelized Onions, Plant-Based Cheese, Lettuce', priceThb: 320, dietary: ['plant-based'] },
  { section: 'mains-western', itemNumber: 4, name: 'Traditional Lasagna Bolognese', description: 'The Classic Lasagna Baked, a Homemade Meat Sauce Layered with a Pasta Sheet and Plenty of Cheese', priceThb: 320 },
  { section: 'mains-western', itemNumber: 5, name: 'Club Sandwich', description: 'Grilled Chicken, Bacon, Ham, Fried Egg, Lettuce, Tomato, Cheese', priceThb: 320 },
  { section: 'mains-western', itemNumber: 6, name: 'Vegetarian Club Sandwich', description: 'Lettuce, Avocado, Tomato, Cheese', priceThb: 290, dietary: ['vegetarian'] },
  { section: 'mains-western', itemNumber: 7, name: 'Fish & Chips', description: 'Dredge the Fish in Beer Batter and Steak Fries', priceThb: 320 },
  { section: 'mains-western', itemNumber: 8, name: 'Pasta — Bolognese (Beef)', description: 'Choice of Spaghetti, Fusilli or Fettuccini', priceThb: 310 },
  { section: 'mains-western', itemNumber: 9, name: 'Pasta — Carbonara (Pork)', description: 'Choice of Spaghetti, Fusilli or Fettuccini', priceThb: 290 },
  { section: 'mains-western', itemNumber: 10, name: 'Pasta — Pomodoro (Tomato)', description: 'Choice of Spaghetti, Fusilli or Fettuccini', priceThb: 270 },

  // ---- Pizza -------------------------------------------------------------
  { section: 'pizza', itemNumber: 1, name: 'Artichoke, Mushroom & Ham', description: 'Red base. Pickled artichoke, champignons, mozzarella and cooked ham', priceThb: 380 },
  { section: 'pizza', itemNumber: 2, name: 'Hawaiian', description: 'Red base. Bacon, cooked ham, pineapple, onion relish', priceThb: 350 },
  { section: 'pizza', itemNumber: 3, name: 'Di Mare', description: 'Red base. Seafood pizza: prawn, calamari, mussel, scallop', priceThb: 420 },
  { section: 'pizza', itemNumber: 4, name: 'Prosciutto & Rocket', description: 'Red base. Parma ham, artichoke, garlic oil, buffalo mozzarella, wild rocket', priceThb: 350 },
  { section: 'pizza', itemNumber: 5, name: 'Napolitano', description: 'Red base. Tomato, basil, buffalo mozzarella', priceThb: 300 },
  { section: 'pizza', itemNumber: 6, name: 'Smoked Salmon', description: 'White base. Smoked salmon, caper, dill pickled, horseradish, shallot and mozzarella', priceThb: 380 },
  { section: 'pizza', itemNumber: 7, name: 'Four Cheese & Champignons', description: 'White base. Imported cheese and champignons', priceThb: 400 },
  { section: 'pizza', itemNumber: 8, name: 'Seafood Thermidor', description: 'White base. Creamy seafood, grana padano, champignons, mozzarella', priceThb: 420 },
  { section: 'pizza', itemNumber: 9, name: 'Carbonara', description: 'White base. Bacon, egg yolk, cream cheese, mozzarella, grana padano', priceThb: 380 },
  { section: 'pizza', itemNumber: 10, name: 'Muang', description: 'Lanna base. Minced pork chili, Chiang Mai sausage, pork bologna, mozzarella', priceThb: 300 },
  { section: 'pizza', itemNumber: 11, name: 'Larb Kua', description: 'Lanna base. Minced pork spicy, mozzarella', priceThb: 300 },
  { section: 'pizza', itemNumber: 12, name: 'Vegan', description: 'Plant based cheese, champignons, tomato, artichoke', priceThb: 320, dietary: ['plant-based'] },

  // ---- From the Grill ----------------------------------------------------
  { section: 'from-the-grill', itemNumber: 1, name: 'Beef Angus Striploin', priceThb: 980 },
  { section: 'from-the-grill', itemNumber: 2, name: 'Barbecue Pork Spare Ribs', priceThb: 650 },
  { section: 'from-the-grill', itemNumber: 3, name: 'Grilled Rack of Lamb', description: 'with Salsa Verde', priceThb: 750 },
  { section: 'from-the-grill', itemNumber: 4, name: 'Grilled Chicken with Lemongrass', priceThb: 350 },
  { section: 'from-the-grill', itemNumber: 5, name: 'Pan-seared Snow Fish', description: 'with White Miso Sauce', priceThb: 620 },

  // ---- Desserts ----------------------------------------------------------
  { section: 'desserts', itemNumber: 1, name: 'Mango Sticky Rice', description: 'Mango Sticky Rice with Coconut Milk', priceThb: 220 },
  { section: 'desserts', itemNumber: 2, name: 'Ice Cream', description: '2 scoops of your choice: Vanilla, Chocolate, Strawberry', priceThb: 180 },
  { section: 'desserts', itemNumber: 3, name: 'Ice Cream Sundae', description: 'Vanilla Ice Cream, 3 scoops, topped with Chocolate Sauce, Whipped Cream and a Maraschino Cherry', priceThb: 220 },
  { section: 'desserts', itemNumber: 4, name: 'Chocolate Lava Cake', description: 'Molten Chocolate Lava Cake', priceThb: 230 },
  { section: 'desserts', itemNumber: 5, name: 'Banana Split', description: 'A combination of Vanilla, Strawberry and Chocolate Ice Cream served with a banana lengthwise and toppings', priceThb: 220 },
  { section: 'desserts', itemNumber: 6, name: 'Seasonal Fresh Fruits', priceThb: 210 },
  { section: 'desserts', itemNumber: 7, name: 'Mixed Fruit Tart', priceThb: 220, verify: 'Price read from a jumbled column on page 14; confirm against the printed menu before quoting it.' },
  { section: 'desserts', itemNumber: 8, name: 'Cheeses and Cold Cuts', description: 'Emmental, Gouda and Cheddar cheeses; Italian cold cuts of pork bologna, chicken bologna and smoked chicken breast; green and black olives, pickles and crackers', priceThb: 499 },
];

/**
 * The grill's sauces and sides are printed as selections rather than priced individually.
 * Only one price - THB 120 - is legible on page 13, and it is NOT clear from the text whether
 * it applies to a side dish, to every side, or to something else. Left unpriced on purpose
 * rather than attaching a guessed number to a list staff might quote from.
 */
export const GRILL_ACCOMPANIMENTS = {
  sauces: [
    'Black Pepper', 'Apple', 'Mushroom', 'Mint',
    'Buttered Lemon', 'Bearnaise', 'Thai Spicy Sauce', 'Dried Chili Sauce',
  ],
  sideDishes: [
    'Stir Fried Mixed Vegetables', 'Steak Fries', 'Sautéed Spinach',
    'Grilled Asparagus', 'Steamed Broccoli', 'Mashed Potatoes',
  ],
  priceNote:
    'The printed menu shows THB 120 against this area of page 13, but the text extraction does '
    + 'not make clear what it applies to. Confirm with the outlet before quoting a price for a '
    + 'sauce or a side.',
} as const;

/** Items whose transcription needs a human check against the printed menu. */
export function itemsNeedingVerification(): MenuItem[] {
  return MENU_ITEMS.filter((item) => Boolean(item.verify));
}

/** Lowest and highest net price in a section, ignoring items with no single price. */
export function sectionPriceRange(section: MenuSectionId): { min: number; max: number } | null {
  const prices = MENU_ITEMS.filter((i) => i.section === section).flatMap((i) =>
    i.priceThb !== null ? [i.priceThb] : (i.variants ?? []).map((v) => v.priceThb)
  );
  if (prices.length === 0) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}
