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
  // 1. Gourmet Bar (Top Enclosed Box) - 6x Diamond 4-tops + 1x Round Cocktail
  // Top Row: BAR4, BAR5, BAR6
  { id: 'n-bar4', tableNumber: 'BAR4', capacity: 4, zone: 'Gourmet Bar', status: 'available', x: 42, y: 13, shape: 'diamond' },
  { id: 'n-bar5', tableNumber: 'BAR5', capacity: 4, zone: 'Gourmet Bar', status: 'available', x: 49, y: 13, shape: 'diamond' },
  { id: 'n-bar6', tableNumber: 'BAR6', capacity: 4, zone: 'Gourmet Bar', status: 'available', x: 56, y: 13, shape: 'diamond' },
  // Bottom Row: BAR3, BAR2, BAR1
  { id: 'n-bar3', tableNumber: 'BAR3', capacity: 4, zone: 'Gourmet Bar', status: 'available', x: 42, y: 23, shape: 'diamond' },
  { id: 'n-bar2', tableNumber: 'BAR2', capacity: 4, zone: 'Gourmet Bar', status: 'available', x: 49, y: 23, shape: 'diamond' },
  { id: 'n-bar1', tableNumber: 'BAR1', capacity: 4, zone: 'Gourmet Bar', status: 'available', x: 56, y: 23, shape: 'diamond' },
  { id: 'n-bar-r', tableNumber: 'BAR-R', capacity: 4, zone: 'Gourmet Bar', status: 'available', x: 64, y: 18, shape: 'round' },

  // 2. Main Dining Room - Row C (Top Row: C1, C2, C3, gap, C4, C5)
  { id: 'n-c1', tableNumber: 'C1', capacity: 4, zone: 'Main Dining', status: 'available', x: 23, y: 36, shape: 'square' },
  { id: 'n-c2', tableNumber: 'C2', capacity: 4, zone: 'Main Dining', status: 'available', x: 28, y: 36, shape: 'square' },
  { id: 'n-c3', tableNumber: 'C3', capacity: 4, zone: 'Main Dining', status: 'available', x: 33, y: 36, shape: 'square' },
  { id: 'n-c4', tableNumber: 'C4', capacity: 4, zone: 'Main Dining', status: 'available', x: 43, y: 36, shape: 'square' },
  { id: 'n-c5', tableNumber: 'C5', capacity: 4, zone: 'Main Dining', status: 'available', x: 48, y: 36, shape: 'square' },

  // 3. Main Dining Room - Row B (Middle Row: B1, B2, B3, B4, B5)
  { id: 'n-b1', tableNumber: 'B1', capacity: 4, zone: 'Main Dining', status: 'available', x: 27, y: 54, shape: 'square' },
  { id: 'n-b2', tableNumber: 'B2', capacity: 4, zone: 'Main Dining', status: 'available', x: 32, y: 54, shape: 'square' },
  { id: 'n-b3', tableNumber: 'B3', capacity: 4, zone: 'Main Dining', status: 'available', x: 37, y: 54, shape: 'square' },
  { id: 'n-b4', tableNumber: 'B4', capacity: 4, zone: 'Main Dining', status: 'available', x: 42, y: 54, shape: 'square' },
  { id: 'n-b5', tableNumber: 'B5', capacity: 4, zone: 'Main Dining', status: 'available', x: 47, y: 54, shape: 'square' },

  // 4. Main Dining Room - Row A (Bottom Row: A1, A2, A3, A4, A5, A6)
  { id: 'n-a1', tableNumber: 'A1', capacity: 4, zone: 'Main Dining', status: 'available', x: 23, y: 74, shape: 'square' },
  { id: 'n-a2', tableNumber: 'A2', capacity: 4, zone: 'Main Dining', status: 'available', x: 28, y: 74, shape: 'square' },
  { id: 'n-a3', tableNumber: 'A3', capacity: 4, zone: 'Main Dining', status: 'available', x: 33, y: 74, shape: 'square' },
  { id: 'n-a4', tableNumber: 'A4', capacity: 4, zone: 'Main Dining', status: 'available', x: 38, y: 74, shape: 'square' },
  { id: 'n-a5', tableNumber: 'A5', capacity: 4, zone: 'Main Dining', status: 'available', x: 43, y: 74, shape: 'square' },
  { id: 'n-a6', tableNumber: 'A6', capacity: 4, zone: 'Main Dining', status: 'available', x: 48, y: 74, shape: 'square' },

  // 5. Window Booths / Right Wall Banquettes
  { id: 'n-wb-01', tableNumber: 'WB-01', capacity: 4, zone: 'Window Booths', status: 'available', x: 88, y: 32, shape: 'booth' },
  { id: 'n-wb-02', tableNumber: 'WB-02', capacity: 4, zone: 'Window Booths', status: 'available', x: 88, y: 54, shape: 'booth' },
  { id: 'n-wb-03', tableNumber: 'WB-03', capacity: 4, zone: 'Window Booths', status: 'available', x: 88, y: 74, shape: 'booth' },

  // 6. Outside Terrace (Top-Left Outdoor Garden)
  { id: 'n-tr-01', tableNumber: 'TR-01', capacity: 2, zone: 'Terrace', status: 'available', x: 8, y: 14, shape: 'square' },
  { id: 'n-tr-02', tableNumber: 'TR-02', capacity: 2, zone: 'Terrace', status: 'available', x: 13, y: 14, shape: 'square' },
];

export const DEFAULT_IBIS_TABLES: DiningTable[] = [
  // 1. Center Dining Block - Row C (Top: C4, C3, C2, C1)
  { id: 'i-c4', tableNumber: 'C4', capacity: 4, zone: 'Main Dining', status: 'available', x: 48, y: 44, shape: 'square' },
  { id: 'i-c3', tableNumber: 'C3', capacity: 4, zone: 'Main Dining', status: 'available', x: 53, y: 44, shape: 'square' },
  { id: 'i-c2', tableNumber: 'C2', capacity: 4, zone: 'Main Dining', status: 'available', x: 58, y: 44, shape: 'square' },
  { id: 'i-c1', tableNumber: 'C1', capacity: 4, zone: 'Main Dining', status: 'available', x: 63, y: 44, shape: 'square' },

  // 2. Center Dining Block - Row B (Bottom: B4, B3, B2, B1)
  { id: 'i-b4', tableNumber: 'B4', capacity: 4, zone: 'Main Dining', status: 'available', x: 48, y: 57, shape: 'square' },
  { id: 'i-b3', tableNumber: 'B3', capacity: 4, zone: 'Main Dining', status: 'available', x: 53, y: 57, shape: 'square' },
  { id: 'i-b2', tableNumber: 'B2', capacity: 4, zone: 'Main Dining', status: 'available', x: 58, y: 57, shape: 'square' },
  { id: 'i-b1', tableNumber: 'B1', capacity: 4, zone: 'Main Dining', status: 'available', x: 63, y: 57, shape: 'square' },

  // 3. Lower Row A (Left: A6, A5, A4 | Right: A3, A2, A1)
  { id: 'i-a6', tableNumber: 'A6', capacity: 2, zone: 'Main Dining', status: 'available', x: 46, y: 70, shape: 'square' },
  { id: 'i-a5', tableNumber: 'A5', capacity: 2, zone: 'Main Dining', status: 'available', x: 51, y: 70, shape: 'square' },
  { id: 'i-a4', tableNumber: 'A4', capacity: 2, zone: 'Main Dining', status: 'available', x: 56, y: 70, shape: 'square' },
  { id: 'i-a3', tableNumber: 'A3', capacity: 2, zone: 'Main Dining', status: 'available', x: 66, y: 70, shape: 'square' },
  { id: 'i-a2', tableNumber: 'A2', capacity: 2, zone: 'Main Dining', status: 'available', x: 71, y: 70, shape: 'square' },
  { id: 'i-a1', tableNumber: 'A1', capacity: 2, zone: 'Main Dining', status: 'available', x: 76, y: 70, shape: 'square' },

  // 4. Outdoor Smoking Terrace (Bottom cyan area with smoking icon - 4 tables)
  { id: 'i-smk-1', tableNumber: 'SMK-1', capacity: 4, zone: 'Smoking Terrace', status: 'available', x: 40, y: 83, shape: 'square', isSmoking: true },
  { id: 'i-smk-2', tableNumber: 'SMK-2', capacity: 4, zone: 'Smoking Terrace', status: 'available', x: 47, y: 83, shape: 'square', isSmoking: true },
  { id: 'i-smk-3', tableNumber: 'SMK-3', capacity: 4, zone: 'Smoking Terrace', status: 'available', x: 40, y: 92, shape: 'square', isSmoking: true },
  { id: 'i-smk-4', tableNumber: 'SMK-4', capacity: 4, zone: 'Smoking Terrace', status: 'available', x: 47, y: 92, shape: 'square', isSmoking: true },

  // 5. Right Feature & Round Tables
  { id: 'i-r1', tableNumber: 'R1', capacity: 4, zone: 'Main Dining', status: 'available', x: 81, y: 38, shape: 'round' },
  { id: 'i-r2', tableNumber: 'R2', capacity: 4, zone: 'Main Dining', status: 'available', x: 81, y: 50, shape: 'round' },
  { id: 'i-r3', tableNumber: 'R3', capacity: 4, zone: 'Main Dining', status: 'available', x: 81, y: 62, shape: 'round' },
  { id: 'i-f1', tableNumber: 'F-01', capacity: 4, zone: 'Main Dining', status: 'available', x: 72, y: 50, shape: 'round' },

  // 6. Outside Right Terrace
  { id: 'i-ter-1', tableNumber: 'TER-01', capacity: 2, zone: 'Terrace', status: 'available', x: 94, y: 42, shape: 'square' },
  { id: 'i-ter-2', tableNumber: 'TER-02', capacity: 2, zone: 'Terrace', status: 'available', x: 94, y: 52, shape: 'square' },
];

export const NOVOTEL_FLOOR_FEATURES: FloorFeature[] = [
  { id: 'n-hostess', kind: 'host-desk', label: 'HOSTESS DESK', x: 3, y: 26, w: 15, h: 52 },
  { id: 'n-coffee-stand', kind: 'bar-counter', label: 'COFFEE STAND', x: 18, y: 26, w: 2.5, h: 52 },
  { id: 'n-terrace-stairs', kind: 'back-of-house', label: 'Stairs & Terrace', x: 3, y: 6, w: 15, h: 18 },
  { id: 'n-gb-room', kind: 'bar-counter', label: 'Gourmet Bar Room', x: 36, y: 6, w: 40, h: 24 },
  { id: 'n-buffet-top', kind: 'buffet', label: 'Buffet Counter', x: 54, y: 34, w: 22, h: 5 },
  { id: 'n-buffet-island', kind: 'island', label: 'Buffet Island', x: 58, y: 48, w: 14, h: 12, shape: 'round' },
  { id: 'n-buffet-bot', kind: 'buffet', label: 'Buffet Counter', x: 54, y: 72, w: 22, h: 5 },
  { id: 'n-banquette-right', kind: 'buffet', label: 'Window Banquette', x: 93, y: 20, w: 3, h: 60 },
];

export const IBIS_FLOOR_FEATURES: FloorFeature[] = [
  { id: 'i-bar-prep', kind: 'back-of-house', label: 'Bar & Prep Pass', x: 20, y: 6, w: 12, h: 22 },
  { id: 'i-hostess', kind: 'host-desk', label: 'HOSTESS DESK', x: 38, y: 24, w: 8, h: 5 },
  { id: 'i-front-desk', kind: 'host-desk', label: 'FRONT DESK', x: 68, y: 24, w: 8, h: 5 },
  { id: 'i-buffet-top', kind: 'buffet', label: 'Buffet Counter', x: 48, y: 24, w: 16, h: 5 },
  { id: 'i-buffet-island', kind: 'island', label: 'Buffet Island', x: 38, y: 52, w: 5, h: 10, shape: 'round' },
  { id: 'i-div-left', kind: 'buffet', label: 'Divider', x: 44, y: 40, w: 1.2, h: 24 },
  { id: 'i-div-right', kind: 'buffet', label: 'Divider', x: 67, y: 40, w: 1.2, h: 24 },
  { id: 'i-smoking-box', kind: 'entrance', label: 'Smoking Terrace', x: 32, y: 78, w: 24, h: 18 },
  { id: 'i-terrace-right', kind: 'entrance', label: 'Terrace', x: 92, y: 34, w: 5, h: 32 },
];
