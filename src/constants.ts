import { DiningTable, FloorFeature } from './types';

export interface HotelInfo {
  id: string;
  name: string;
  shortName: string;
  resortCode: string;
  theme: string;
  restaurantName: string;
  restaurantUrl: string;
  tagline: string;
  cuisine: string;
  description: string;
  features: string[];
  primaryColor: string;
  accentColor: string;
  bgBadge: string;
  accentBadge: string;
}

export const HOTELS: HotelInfo[] = [
  {
    id: 'novotel',
    name: 'Novotel Chiang Mai Nimman Journeyhub',
    shortName: 'Novotel',
    resortCode: 'HB4F8',
    theme: 'theme-novotel',
    restaurantName: 'Food Exchange',
    restaurantUrl: 'https://www.novotelchiangmai.com/restaurants-bars/food-exchange/',
    tagline: 'Food Exchange • All-Day Dining & Terrace',
    cuisine: 'International Buffet, Local Northern Thai, Artisan Pizzas & Friday Seafood Buffet',
    description: 'Modern all-day dining restaurant featuring contemporary Northern Thai accents, outdoor garden terrace, international breakfast buffet with live stations, and Friday Seafood Buffets.',
    features: [
      'International Breakfast Buffet (06:00 - 10:30 | Weekends until 12:00 Midday)',
      'Live Egg, Asian Noodle & Congee Stations',
      'Friday Seafood Buffet (17:30 - 21:00, THB 999 net)',
      'Authentic Northern Thai & Western À La Carte'
    ],
    primaryColor: '#1A3A6D',
    accentColor: '#1A3A6D',
    bgBadge: 'bg-[#1A3A6D] text-white',
    accentBadge: 'bg-[#1A3A6D]/10 text-[#1A3A6D] border border-[#1A3A6D]/20',
  },
  {
    id: 'ibis',
    name: 'ibis Chiang Mai Nimman Journeyhub',
    shortName: 'ibis',
    resortCode: 'HB9U9',
    theme: 'theme-ibis',
    restaurantName: "Delhi Street & Charlie's Corner",
    restaurantUrl: 'https://www.ibischiangmai.com/eat-drink/delhi-street/',
    tagline: "Delhi Street & Charlie's Corner",
    cuisine: 'Authentic Indian Cuisine, Vegan/Vegetarian Sets, Street Food & 24/7 Bar',
    description: 'Vibrant dining celebrating authentic Indian street food culture with organic vegan sets, monthly "Delhi Meets The World" fusion specials, and Charlie\'s Corner 24/7 pop-rock bar & alfresco terrace.',
    features: [
      'Morning Breakfast Buffet (06:00 - 10:30 | Weekends until 12:00 Midday)',
      'Delhi Street Authentic Indian & Vegan Sets (11:30 - 21:30)',
      'Delhi Meets The World Monthly Specials',
      "Charlie's Corner 24/7 Bar, Craft Beers & Alfresco"
    ],
    primaryColor: '#E2001A',
    accentColor: '#E2001A',
    bgBadge: 'bg-[#E2001A] text-white',
    accentBadge: 'bg-[#E2001A]/10 text-[#E2001A] border border-[#E2001A]/20',
  },
];

export const VIP_LEVELS = [
  { level: '1', label: 'VIP 1 • Classic', color: 'bg-[#0A162B]/5 text-[#0A162B] border border-[#0A162B]/10 font-mono-custom' },
  { level: '2', label: 'VIP 2 • Silver', color: 'bg-slate-200/80 text-slate-800 border border-slate-300 font-mono-custom' },
  { level: '3', label: 'VIP 3 • Gold', color: 'bg-amber-100 text-amber-900 border border-amber-300 font-mono-custom' },
  { level: '4', label: 'VIP 4 • Platinum', color: 'bg-cyan-100 text-cyan-900 border border-cyan-300 font-mono-custom' },
  { level: '5', label: 'VIP 5 • Diamond', color: 'bg-indigo-100 text-indigo-900 border border-indigo-300 font-mono-custom' },
  { level: '6', label: 'VIP 6 • Ambassador', color: 'bg-purple-100 text-purple-900 border border-purple-300 font-mono-custom' },
  { level: '7', label: 'VIP 7 • GM Guest', color: 'bg-rose-100 text-rose-900 border border-rose-300 font-mono-custom' },
];

export const MEAL_SERVICES = [
  {
    id: 'breakfast',
    name: 'Breakfast Service',
    time: '06:00 - 10:30 (Weekends until 12:00)',
    description: 'International Morning Buffet, Live Stations • Weekdays 06:00-10:30 | Weekends & Holidays until 12:00 Midday',
    iconName: 'Coffee',
  },
  {
    id: 'lunch',
    name: 'Lunch Service',
    time: '12:00 - 15:00',
    description: 'Food Exchange À La Carte & Delhi Street Authentic Indian & Vegan Sets',
    iconName: 'Utensils',
  },
  {
    id: 'dinner',
    name: 'Dinner Service',
    time: '18:00 - 22:00',
    description: 'Food Exchange Seafood Buffet & À La Carte, Delhi Street & Charlie\'s Corner',
    iconName: 'Moon',
  },
] as const;

export const OVER_CAPACITY_REASONS = {
  STAFF_APPROVED: 'STAFF_APPROVED',
  ROOM_CHARGE: 'ROOM_CHARGE',
  CHILD_COMPLIMENTARY: 'CHILD_COMPLIMENTARY',
  VIP_BENEFIT: 'VIP_BENEFIT',
  CONFERENCE_EXTRA: 'CONFERENCE_EXTRA',
  OTHER: 'OTHER',
};

export const DEFAULT_NOVOTEL_TABLES: DiningTable[] = [
  // 1. Main Dining Row 1 (y: 40) - 4x 2-tops, 2x 4-tops (6 tables)
  { id: 'n-fx-01', tableNumber: 'FX-01', capacity: 2, zone: 'Main Dining', status: 'available', x: 22, y: 40, shape: 'square' },
  { id: 'n-fx-02', tableNumber: 'FX-02', capacity: 2, zone: 'Main Dining', status: 'available', x: 29, y: 40, shape: 'square' },
  { id: 'n-fx-03', tableNumber: 'FX-03', capacity: 2, zone: 'Main Dining', status: 'available', x: 36, y: 40, shape: 'square' },
  { id: 'n-fx-04', tableNumber: 'FX-04', capacity: 2, zone: 'Main Dining', status: 'available', x: 43, y: 40, shape: 'square' },
  { id: 'n-fx-05', tableNumber: 'FX-05', capacity: 4, zone: 'Main Dining', status: 'available', x: 52, y: 40, shape: 'rectangle' },
  { id: 'n-fx-06', tableNumber: 'FX-06', capacity: 4, zone: 'Main Dining', status: 'available', x: 59, y: 40, shape: 'rectangle' },

  // 2. Main Dining Row 2 (y: 62) - 5x 4-tops (5 tables)
  { id: 'n-fx-07', tableNumber: 'FX-07', capacity: 4, zone: 'Main Dining', status: 'available', x: 29, y: 62, shape: 'rectangle' },
  { id: 'n-fx-08', tableNumber: 'FX-08', capacity: 4, zone: 'Main Dining', status: 'available', x: 36, y: 62, shape: 'rectangle' },
  { id: 'n-fx-09', tableNumber: 'FX-09', capacity: 4, zone: 'Main Dining', status: 'available', x: 43, y: 62, shape: 'rectangle' },
  { id: 'n-fx-10', tableNumber: 'FX-10', capacity: 4, zone: 'Main Dining', status: 'available', x: 50, y: 62, shape: 'rectangle' },
  { id: 'n-fx-11', tableNumber: 'FX-11', capacity: 4, zone: 'Main Dining', status: 'available', x: 57, y: 62, shape: 'rectangle' },

  // 3. Main Dining Row 3 (y: 86) - 6x 2-tops (6 tables)
  { id: 'n-fx-12', tableNumber: 'FX-12', capacity: 2, zone: 'Main Dining', status: 'available', x: 25, y: 86, shape: 'square' },
  { id: 'n-fx-13', tableNumber: 'FX-13', capacity: 2, zone: 'Main Dining', status: 'available', x: 32, y: 86, shape: 'square' },
  { id: 'n-fx-14', tableNumber: 'FX-14', capacity: 2, zone: 'Main Dining', status: 'available', x: 39, y: 86, shape: 'square' },
  { id: 'n-fx-15', tableNumber: 'FX-15', capacity: 2, zone: 'Main Dining', status: 'available', x: 46, y: 86, shape: 'square' },
  { id: 'n-fx-16', tableNumber: 'FX-16', capacity: 2, zone: 'Main Dining', status: 'available', x: 53, y: 86, shape: 'square' },
  { id: 'n-fx-17', tableNumber: 'FX-17', capacity: 2, zone: 'Main Dining', status: 'available', x: 60, y: 86, shape: 'square' },

  // 4. Gourmet Bar (Enclosed Room Top-Right) - Diagonal Row 1 (y: 12) (3 tables)
  { id: 'n-gb-01', tableNumber: 'GB-01', capacity: 4, zone: 'Gourmet Bar', status: 'available', x: 53, y: 12, shape: 'diamond' },
  { id: 'n-gb-02', tableNumber: 'GB-02', capacity: 4, zone: 'Gourmet Bar', status: 'available', x: 62, y: 12, shape: 'diamond' },
  { id: 'n-gb-03', tableNumber: 'GB-03', capacity: 4, zone: 'Gourmet Bar', status: 'available', x: 70, y: 12, shape: 'diamond' },

  // 5. Gourmet Bar - Diagonal Row 2 (y: 24) (3 tables)
  { id: 'n-gb-04', tableNumber: 'GB-04', capacity: 4, zone: 'Gourmet Bar', status: 'available', x: 53, y: 24, shape: 'diamond' },
  { id: 'n-gb-05', tableNumber: 'GB-05', capacity: 4, zone: 'Gourmet Bar', status: 'available', x: 62, y: 24, shape: 'diamond' },
  { id: 'n-gb-06', tableNumber: 'GB-06', capacity: 4, zone: 'Gourmet Bar', status: 'available', x: 70, y: 24, shape: 'diamond' },

  // 6. Gourmet Bar - Round Feature Table (y: 17, x: 79) (1 table)
  { id: 'n-gb-07', tableNumber: 'GB-07', capacity: 4, zone: 'Gourmet Bar', status: 'available', x: 79, y: 17, shape: 'round' },

  // 7. Window Booths (Right Wall x: 95) (5 tables)
  { id: 'n-wb-01', tableNumber: 'WB-01', capacity: 4, zone: 'Window Booths', status: 'available', x: 95, y: 20, shape: 'booth' },
  { id: 'n-wb-02', tableNumber: 'WB-02', capacity: 4, zone: 'Window Booths', status: 'available', x: 95, y: 30, shape: 'booth' },
  { id: 'n-wb-03', tableNumber: 'WB-03', capacity: 4, zone: 'Window Booths', status: 'available', x: 95, y: 55, shape: 'booth' },
  { id: 'n-wb-04', tableNumber: 'WB-04', capacity: 4, zone: 'Window Booths', status: 'available', x: 95, y: 65, shape: 'booth' },
  { id: 'n-wb-05', tableNumber: 'WB-05', capacity: 4, zone: 'Window Booths', status: 'available', x: 95, y: 75, shape: 'booth' },

  // 8. Wall Banquette (Left Wall x: 8) (3 tables)
  { id: 'n-wbq-01', tableNumber: 'WBQ-01', capacity: 2, zone: 'Wall Banquette', status: 'available', x: 8, y: 50, shape: 'rectangle' },
  { id: 'n-wbq-02', tableNumber: 'WBQ-02', capacity: 2, zone: 'Wall Banquette', status: 'available', x: 8, y: 62, shape: 'rectangle' },
  { id: 'n-wbq-03', tableNumber: 'WBQ-03', capacity: 2, zone: 'Wall Banquette', status: 'available', x: 8, y: 74, shape: 'rectangle' },

  // 9. Wall Banquette (Bottom Wall y: 96) (2 tables)
  { id: 'n-wbq-04', tableNumber: 'WBQ-04', capacity: 2, zone: 'Wall Banquette', status: 'available', x: 70, y: 96, shape: 'rectangle' },
  { id: 'n-wbq-05', tableNumber: 'WBQ-05', capacity: 2, zone: 'Wall Banquette', status: 'available', x: 80, y: 96, shape: 'rectangle' },
];

export const DEFAULT_IBIS_TABLES: DiningTable[] = [
  // 1. Main Dining Block Row 1 (y: 45) - 4x 4-tops (4 tables)
  { id: 'i-cc-01', tableNumber: 'CC-01', capacity: 4, zone: 'Main Dining', status: 'available', x: 40, y: 45, shape: 'square' },
  { id: 'i-cc-02', tableNumber: 'CC-02', capacity: 4, zone: 'Main Dining', status: 'available', x: 48, y: 45, shape: 'square' },
  { id: 'i-cc-03', tableNumber: 'CC-03', capacity: 4, zone: 'Main Dining', status: 'available', x: 56, y: 45, shape: 'square' },
  { id: 'i-cc-04', tableNumber: 'CC-04', capacity: 4, zone: 'Main Dining', status: 'available', x: 64, y: 45, shape: 'square' },

  // 2. Main Dining Block Row 2 (y: 57) - 4x 4-tops (4 tables)
  { id: 'i-cc-05', tableNumber: 'CC-05', capacity: 4, zone: 'Main Dining', status: 'available', x: 40, y: 57, shape: 'square' },
  { id: 'i-cc-06', tableNumber: 'CC-06', capacity: 4, zone: 'Main Dining', status: 'available', x: 48, y: 57, shape: 'square' },
  { id: 'i-cc-07', tableNumber: 'CC-07', capacity: 4, zone: 'Main Dining', status: 'available', x: 56, y: 57, shape: 'square' },
  { id: 'i-cc-08', tableNumber: 'CC-08', capacity: 4, zone: 'Main Dining', status: 'available', x: 64, y: 57, shape: 'square' },

  // 3. Main Dining Lower Row (y: 78) - 5x 2-tops (5 tables)
  { id: 'i-cc-09', tableNumber: 'CC-09', capacity: 2, zone: 'Main Dining', status: 'available', x: 38, y: 78, shape: 'square' },
  { id: 'i-cc-10', tableNumber: 'CC-10', capacity: 2, zone: 'Main Dining', status: 'available', x: 46, y: 78, shape: 'square' },
  { id: 'i-cc-11', tableNumber: 'CC-11', capacity: 2, zone: 'Main Dining', status: 'available', x: 54, y: 78, shape: 'square' },
  { id: 'i-cc-12', tableNumber: 'CC-12', capacity: 2, zone: 'Main Dining', status: 'available', x: 62, y: 78, shape: 'square' },
  { id: 'i-cc-13', tableNumber: 'CC-13', capacity: 2, zone: 'Main Dining', status: 'available', x: 70, y: 78, shape: 'square' },

  // 4. Main Dining Round Tables (Right Wall x: 78) (2 tables)
  { id: 'i-cc-14', tableNumber: 'CC-14', capacity: 4, zone: 'Main Dining', status: 'available', x: 78, y: 45, shape: 'round' },
  { id: 'i-cc-15', tableNumber: 'CC-15', capacity: 4, zone: 'Main Dining', status: 'available', x: 78, y: 62, shape: 'round' },

  // 5. Window Booths (Right Wall x: 92) (3 tables)
  { id: 'i-wb-01', tableNumber: 'WB-01', capacity: 4, zone: 'Window Booths', status: 'available', x: 92, y: 30, shape: 'booth' },
  { id: 'i-wb-02', tableNumber: 'WB-02', capacity: 4, zone: 'Window Booths', status: 'available', x: 92, y: 42, shape: 'booth' },
  { id: 'i-wb-03', tableNumber: 'WB-03', capacity: 4, zone: 'Window Booths', status: 'available', x: 92, y: 54, shape: 'booth' },

  // 6. Terrace (Outside Right Wall x: 98) (2 tables)
  { id: 'i-ter-01', tableNumber: 'TER-01', capacity: 2, zone: 'Terrace', status: 'available', x: 98, y: 40, shape: 'square' },
  { id: 'i-ter-02', tableNumber: 'TER-02', capacity: 2, zone: 'Terrace', status: 'available', x: 98, y: 48, shape: 'square' },

  // 7. Outdoor Smoking Terrace (Bottom y: 92) (3 tables)
  { id: 'i-smk-01', tableNumber: 'SMK-01', capacity: 4, zone: 'Smoking Terrace', status: 'available', x: 42, y: 92, shape: 'square', isSmoking: true },
  { id: 'i-smk-02', tableNumber: 'SMK-02', capacity: 4, zone: 'Smoking Terrace', status: 'available', x: 50, y: 92, shape: 'square', isSmoking: true },
  { id: 'i-smk-03', tableNumber: 'SMK-03', capacity: 4, zone: 'Smoking Terrace', status: 'available', x: 58, y: 92, shape: 'square', isSmoking: true },
];

export const NOVOTEL_FLOOR_FEATURES: FloorFeature[] = [
  { id: 'n-boh', kind: 'back-of-house', label: 'Back of House / Kitchen', x: 0, y: 30, w: 16, h: 70 },
  { id: 'n-buffet-top', kind: 'buffet', label: 'Buffet Counter (Hot Line)', x: 66, y: 42, w: 24, h: 5 },
  { id: 'n-buffet-bot', kind: 'buffet', label: 'Buffet Counter (Cold Station)', x: 62, y: 90, w: 24, h: 5 },
  { id: 'n-buffet-isl', kind: 'island', label: 'Buffet Island', x: 68, y: 62, w: 14, h: 9, shape: 'round' },
  { id: 'n-bar-counter', kind: 'bar-counter', label: 'Bar Counter', x: 86, y: 10, w: 4, h: 18 },
  { id: 'n-entrance', kind: 'entrance', label: 'Entrance', x: 88, y: 92, w: 10, h: 6 },
];

export const IBIS_FLOOR_FEATURES: FloorFeature[] = [
  { id: 'i-boh', kind: 'back-of-house', label: 'Back of House / Kitchen', x: 0, y: 30, w: 22, h: 55 },
  { id: 'i-bar-prep', kind: 'bar-counter', label: 'Bar & Prep Pass', x: 24, y: 5, w: 14, h: 20 },
  { id: 'i-buffet-1', kind: 'buffet', label: 'Buffet Counter', x: 30, y: 26, w: 14, h: 5 },
  { id: 'i-buffet-2', kind: 'buffet', label: 'Buffet Counter', x: 48, y: 26, w: 14, h: 5 },
  { id: 'i-buffet-3', kind: 'buffet', label: 'Buffet Counter', x: 64, y: 26, w: 12, h: 5 },
  { id: 'i-buffet-isl', kind: 'island', label: 'Buffet Island', x: 70, y: 52, w: 12, h: 10, shape: 'round' },
  { id: 'i-host-desk', kind: 'host-desk', label: 'Host Desk', x: 34, y: 44, w: 3, h: 8 },
  { id: 'i-entrance', kind: 'entrance', label: 'Entrance', x: 48, y: 92, w: 10, h: 6 },
];
