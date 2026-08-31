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

// Provisional capacities pending confirmation from restaurant management
// Novotel: Rows A, B, C = 2 seats, BAR1-BAR6 = 4 seats
// ibis: Rows C, B = 4 seats, Row A = 2 seats
const PROVISIONAL_CAPACITIES = {
  novotelMainDining: 2,
  novotelGourmetBar: 4,
  ibisRowsCB: 4,
  ibisRowA: 2,
};

export interface FloorPlate {
  w: number;
  h: number;
}

export const NOVOTEL_PLATE: FloorPlate = { w: 870, h: 330 }; // 2.64 : 1
export const IBIS_PLATE: FloorPlate = { w: 940, h: 420 }; // 2.24 : 1

export const DEFAULT_NOVOTEL_TABLES: DiningTable[] = [
  // 1. Zone Main Dining - Row C (y: 140, 5 tables, gap between C3 and C4)
  { id: 'n-c1', tableNumber: 'C1', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 210, y: 140, shape: 'square' },
  { id: 'n-c2', tableNumber: 'C2', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 258, y: 140, shape: 'square' },
  { id: 'n-c3', tableNumber: 'C3', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 306, y: 140, shape: 'square' },
  { id: 'n-c4', tableNumber: 'C4', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 405, y: 140, shape: 'square' },
  { id: 'n-c5', tableNumber: 'C5', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 453, y: 140, shape: 'square' },

  // 2. Zone Main Dining - Row B (y: 222, 5 tables)
  { id: 'n-b1', tableNumber: 'B1', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 265, y: 222, shape: 'square' },
  { id: 'n-b2', tableNumber: 'B2', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 308, y: 222, shape: 'square' },
  { id: 'n-b3', tableNumber: 'B3', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 350, y: 222, shape: 'square' },
  { id: 'n-b4', tableNumber: 'B4', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 395, y: 222, shape: 'square' },
  { id: 'n-b5', tableNumber: 'B5', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 438, y: 222, shape: 'square' },

  // 3. Zone Main Dining - Row A (y: 305, 6 tables)
  { id: 'n-a1', tableNumber: 'A1', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 232, y: 305, shape: 'square' },
  { id: 'n-a2', tableNumber: 'A2', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 278, y: 305, shape: 'square' },
  { id: 'n-a3', tableNumber: 'A3', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 325, y: 305, shape: 'square' },
  { id: 'n-a4', tableNumber: 'A4', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 372, y: 305, shape: 'square' },
  { id: 'n-a5', tableNumber: 'A5', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 420, y: 305, shape: 'square' },
  { id: 'n-a6', tableNumber: 'A6', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 466, y: 305, shape: 'square' },

  // 4. Zone Gourmet Bar - 6 tables (Diamond shape, numbering snakes: BAR4-6 top, BAR3-1 bottom)
  // BAR4, BAR5, BAR6 left to right at y: 35
  { id: 'n-bar4', tableNumber: 'BAR4', capacity: PROVISIONAL_CAPACITIES.novotelGourmetBar, zone: 'Gourmet Bar', status: 'available', x: 461, y: 35, shape: 'diamond' },
  { id: 'n-bar5', tableNumber: 'BAR5', capacity: PROVISIONAL_CAPACITIES.novotelGourmetBar, zone: 'Gourmet Bar', status: 'available', x: 539, y: 35, shape: 'diamond' },
  { id: 'n-bar6', tableNumber: 'BAR6', capacity: PROVISIONAL_CAPACITIES.novotelGourmetBar, zone: 'Gourmet Bar', status: 'available', x: 615, y: 35, shape: 'diamond' },
  // BAR3, BAR2, BAR1 left to right at y: 76 (BAR1 bottom-right)
  { id: 'n-bar3', tableNumber: 'BAR3', capacity: PROVISIONAL_CAPACITIES.novotelGourmetBar, zone: 'Gourmet Bar', status: 'available', x: 461, y: 76, shape: 'diamond' },
  { id: 'n-bar2', tableNumber: 'BAR2', capacity: PROVISIONAL_CAPACITIES.novotelGourmetBar, zone: 'Gourmet Bar', status: 'available', x: 539, y: 76, shape: 'diamond' },
  { id: 'n-bar1', tableNumber: 'BAR1', capacity: PROVISIONAL_CAPACITIES.novotelGourmetBar, zone: 'Gourmet Bar', status: 'available', x: 615, y: 76, shape: 'diamond' },
];

export const DEFAULT_IBIS_TABLES: DiningTable[] = [
  // All three rows are numbered right to left
  // 1. Zone Main Dining - Row C (y: 200, 4 tables: C4, C3, C2, C1)
  { id: 'i-c4', tableNumber: 'C4', capacity: PROVISIONAL_CAPACITIES.ibisRowsCB, zone: 'Main Dining', status: 'available', x: 492, y: 200, shape: 'square' },
  { id: 'i-c3', tableNumber: 'C3', capacity: PROVISIONAL_CAPACITIES.ibisRowsCB, zone: 'Main Dining', status: 'available', x: 528, y: 200, shape: 'square' },
  { id: 'i-c2', tableNumber: 'C2', capacity: PROVISIONAL_CAPACITIES.ibisRowsCB, zone: 'Main Dining', status: 'available', x: 565, y: 200, shape: 'square' },
  { id: 'i-c1', tableNumber: 'C1', capacity: PROVISIONAL_CAPACITIES.ibisRowsCB, zone: 'Main Dining', status: 'available', x: 601, y: 200, shape: 'square' },

  // 2. Zone Main Dining - Row B (y: 252, 4 tables: B4, B3, B2, B1)
  { id: 'i-b4', tableNumber: 'B4', capacity: PROVISIONAL_CAPACITIES.ibisRowsCB, zone: 'Main Dining', status: 'available', x: 492, y: 252, shape: 'square' },
  { id: 'i-b3', tableNumber: 'B3', capacity: PROVISIONAL_CAPACITIES.ibisRowsCB, zone: 'Main Dining', status: 'available', x: 528, y: 252, shape: 'square' },
  { id: 'i-b2', tableNumber: 'B2', capacity: PROVISIONAL_CAPACITIES.ibisRowsCB, zone: 'Main Dining', status: 'available', x: 565, y: 252, shape: 'square' },
  { id: 'i-b1', tableNumber: 'B1', capacity: PROVISIONAL_CAPACITIES.ibisRowsCB, zone: 'Main Dining', status: 'available', x: 601, y: 252, shape: 'square' },

  // 3. Zone Main Dining - Row A (y: 315, 6 tables: A6, A5, A4, doorway gap, A3, A2, A1)
  { id: 'i-a6', tableNumber: 'A6', capacity: PROVISIONAL_CAPACITIES.ibisRowA, zone: 'Main Dining', status: 'available', x: 455, y: 315, shape: 'square' },
  { id: 'i-a5', tableNumber: 'A5', capacity: PROVISIONAL_CAPACITIES.ibisRowA, zone: 'Main Dining', status: 'available', x: 498, y: 315, shape: 'square' },
  { id: 'i-a4', tableNumber: 'A4', capacity: PROVISIONAL_CAPACITIES.ibisRowA, zone: 'Main Dining', status: 'available', x: 542, y: 315, shape: 'square' },
  { id: 'i-a3', tableNumber: 'A3', capacity: PROVISIONAL_CAPACITIES.ibisRowA, zone: 'Main Dining', status: 'available', x: 655, y: 315, shape: 'square' },
  { id: 'i-a2', tableNumber: 'A2', capacity: PROVISIONAL_CAPACITIES.ibisRowA, zone: 'Main Dining', status: 'available', x: 700, y: 315, shape: 'square' },
  { id: 'i-a1', tableNumber: 'A1', capacity: PROVISIONAL_CAPACITIES.ibisRowA, zone: 'Main Dining', status: 'available', x: 748, y: 315, shape: 'square' },
];

export const NOVOTEL_FLOOR_FEATURES: FloorFeature[] = [
  // Structure & Architectural features (unlabelled unless stated)
  { id: 'n-boh-left', kind: 'back-of-house', label: '', x: 0, y: 120, w: 150, h: 205 },
  { id: 'n-terrace-stairs', kind: 'terrace', label: '', x: 45, y: 53, w: 80, h: 17 },
  { id: 'n-main-dining-hall', kind: 'back-of-house', label: '', x: 150, y: 120, w: 715, h: 205 },
  { id: 'n-gb-room', kind: 'back-of-house', label: '', x: 365, y: 20, w: 375, h: 75 },
  { id: 'n-bar-counter', kind: 'bar-counter', label: '', x: 715, y: 28, w: 20, h: 60 },
  { id: 'n-round-bar6', kind: 'island', label: '', x: 690, y: 55, w: 22, h: 22, shape: 'round' },
  { id: 'n-service-c3c4', kind: 'buffet', label: '', x: 340, y: 130, w: 25, h: 18 },
  { id: 'n-buffet-top', kind: 'buffet', label: '', x: 600, y: 125, w: 110, h: 20 },
  { id: 'n-buffet-bot', kind: 'buffet', label: '', x: 510, y: 305, w: 235, h: 20 },
  { id: 'n-buffet-island', kind: 'island', label: '', x: 630, y: 205, w: 100, h: 30, shape: 'round' },
  { id: 'n-banquette-right-up', kind: 'banquette', label: '', x: 855, y: 25, w: 15, h: 60 },
  { id: 'n-banquette-right-low', kind: 'banquette', label: '', x: 855, y: 120, w: 15, h: 100 },
  { id: 'n-bench-left', kind: 'banquette', label: '', x: 150, y: 270, w: 12, h: 45 },

  // Labelled features
  { id: 'n-hostess', kind: 'hostess-desk', label: 'HOSTESS DESK', x: 35, y: 192, w: 85, h: 22 },
  { id: 'n-coffee-stand', kind: 'coffee-stand', label: 'COFFEE STAND', x: 175, y: 205, w: 14, h: 55, verticalLabel: true },
];

export const IBIS_FLOOR_FEATURES: FloorFeature[] = [
  // Structure & Architectural features (unlabelled unless stated)
  { id: 'i-boh-left', kind: 'back-of-house', label: '', x: 0, y: 125, w: 280, h: 210 },
  { id: 'i-bar-prep', kind: 'back-of-house', label: '', x: 160, y: 0, w: 120, h: 120 },
  { id: 'i-main-dining-hall', kind: 'back-of-house', label: '', x: 280, y: 120, w: 595, h: 215 },
  { id: 'i-smoking-terrace', kind: 'smoking-terrace', label: '', x: 280, y: 335, w: 280, h: 85 },
  { id: 'i-terrace-ext', kind: 'terrace', label: '', x: 890, y: 130, w: 50, h: 290 },
  { id: 'i-buffet-top-left', kind: 'buffet', label: '', x: 310, y: 10, w: 90, h: 40 },
  { id: 'i-buffet-top-mid', kind: 'buffet', label: '', x: 470, y: 130, w: 125, h: 25 },
  { id: 'i-buffet-top-right', kind: 'buffet', label: '', x: 675, y: 130, w: 85, h: 25 },
  { id: 'i-buffet-island', kind: 'island', label: '', x: 700, y: 205, w: 90, h: 50, shape: 'round' },
  { id: 'i-tall-unit-left', kind: 'banquette', label: '', x: 405, y: 195, w: 14, h: 70 },
  { id: 'i-banquette-right-up', kind: 'banquette', label: '', x: 855, y: 140, w: 15, h: 60 },
  { id: 'i-banquette-right-low', kind: 'banquette', label: '', x: 855, y: 220, w: 15, h: 50 },
  { id: 'i-bench-bottom-left', kind: 'banquette', label: '', x: 560, y: 400, w: 100, h: 18 },
  { id: 'i-bench-bottom-mid', kind: 'banquette', label: '', x: 675, y: 400, w: 100, h: 18 },
  { id: 'i-bench-bottom-right', kind: 'banquette', label: '', x: 790, y: 400, w: 90, h: 18 },

  // Unlabelled round shapes
  { id: 'i-round-unit-left', kind: 'island', label: '', x: 350, y: 218, w: 36, h: 36, shape: 'round' },
  { id: 'i-round-right-1', kind: 'island', label: '', x: 850, y: 150, w: 24, h: 24, shape: 'round' },
  { id: 'i-round-right-2', kind: 'island', label: '', x: 850, y: 235, w: 24, h: 24, shape: 'round' },
  { id: 'i-terrace-t1', kind: 'island', label: '', x: 905, y: 175, w: 20, h: 20, shape: 'round' },
  { id: 'i-terrace-t2', kind: 'island', label: '', x: 905, y: 205, w: 20, h: 20, shape: 'round' },

  // Labelled features
  { id: 'i-hostess', kind: 'hostess-desk', label: 'HOSTESS DESK', x: 320, y: 118, w: 90, h: 20 },
  { id: 'i-front-desk', kind: 'front-desk', label: 'FRONT DESK', x: 683, y: 158, w: 74, h: 20 },
];
