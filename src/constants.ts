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

export const DEFAULT_NOVOTEL_TABLES: DiningTable[] = [
  // 1. Zone Main Dining - Row C (Upper, 5 tables, y: 42)
  // Gap between C3 and C4 where unlabelled service counter sits
  { id: 'n-c1', tableNumber: 'C1', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 24, y: 42, shape: 'square' },
  { id: 'n-c2', tableNumber: 'C2', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 30, y: 42, shape: 'square' },
  { id: 'n-c3', tableNumber: 'C3', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 35, y: 42, shape: 'square' },
  { id: 'n-c4', tableNumber: 'C4', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 47, y: 42, shape: 'square' },
  { id: 'n-c5', tableNumber: 'C5', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 52, y: 42, shape: 'square' },

  // 2. Zone Main Dining - Row B (Middle, 5 tables, y: 67)
  { id: 'n-b1', tableNumber: 'B1', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 30, y: 67, shape: 'square' },
  { id: 'n-b2', tableNumber: 'B2', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 35, y: 67, shape: 'square' },
  { id: 'n-b3', tableNumber: 'B3', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 40, y: 67, shape: 'square' },
  { id: 'n-b4', tableNumber: 'B4', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 45, y: 67, shape: 'square' },
  { id: 'n-b5', tableNumber: 'B5', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 50, y: 67, shape: 'square' },

  // 3. Zone Main Dining - Row A (Lower, 6 tables, y: 94)
  { id: 'n-a1', tableNumber: 'A1', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 27, y: 94, shape: 'square' },
  { id: 'n-a2', tableNumber: 'A2', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 32, y: 94, shape: 'square' },
  { id: 'n-a3', tableNumber: 'A3', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 37, y: 94, shape: 'square' },
  { id: 'n-a4', tableNumber: 'A4', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 43, y: 94, shape: 'square' },
  { id: 'n-a5', tableNumber: 'A5', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 48, y: 94, shape: 'square' },
  { id: 'n-a6', tableNumber: 'A6', capacity: PROVISIONAL_CAPACITIES.novotelMainDining, zone: 'Main Dining', status: 'available', x: 54, y: 94, shape: 'square' },

  // 4. Zone Gourmet Bar - 6 tables in enclosed room top-right (square set on diagonal: diamond)
  // Numbering snakes: Top row reads BAR4, BAR5, BAR6 left to right; bottom row reads BAR3, BAR2, BAR1 left to right (BAR1 is bottom-right)
  { id: 'n-bar4', tableNumber: 'BAR4', capacity: PROVISIONAL_CAPACITIES.novotelGourmetBar, zone: 'Gourmet Bar', status: 'available', x: 53, y: 11, shape: 'diamond' },
  { id: 'n-bar5', tableNumber: 'BAR5', capacity: PROVISIONAL_CAPACITIES.novotelGourmetBar, zone: 'Gourmet Bar', status: 'available', x: 62, y: 11, shape: 'diamond' },
  { id: 'n-bar6', tableNumber: 'BAR6', capacity: PROVISIONAL_CAPACITIES.novotelGourmetBar, zone: 'Gourmet Bar', status: 'available', x: 71, y: 11, shape: 'diamond' },
  { id: 'n-bar3', tableNumber: 'BAR3', capacity: PROVISIONAL_CAPACITIES.novotelGourmetBar, zone: 'Gourmet Bar', status: 'available', x: 53, y: 23, shape: 'diamond' },
  { id: 'n-bar2', tableNumber: 'BAR2', capacity: PROVISIONAL_CAPACITIES.novotelGourmetBar, zone: 'Gourmet Bar', status: 'available', x: 62, y: 23, shape: 'diamond' },
  { id: 'n-bar1', tableNumber: 'BAR1', capacity: PROVISIONAL_CAPACITIES.novotelGourmetBar, zone: 'Gourmet Bar', status: 'available', x: 71, y: 23, shape: 'diamond' },
];

export const DEFAULT_IBIS_TABLES: DiningTable[] = [
  // All three rows are numbered right to left
  // 1. Zone Main Dining - Row C (Upper block, 4 tables, y: 48)
  { id: 'i-c4', tableNumber: 'C4', capacity: PROVISIONAL_CAPACITIES.ibisRowsCB, zone: 'Main Dining', status: 'available', x: 52, y: 48, shape: 'square' },
  { id: 'i-c3', tableNumber: 'C3', capacity: PROVISIONAL_CAPACITIES.ibisRowsCB, zone: 'Main Dining', status: 'available', x: 56, y: 48, shape: 'square' },
  { id: 'i-c2', tableNumber: 'C2', capacity: PROVISIONAL_CAPACITIES.ibisRowsCB, zone: 'Main Dining', status: 'available', x: 60, y: 48, shape: 'square' },
  { id: 'i-c1', tableNumber: 'C1', capacity: PROVISIONAL_CAPACITIES.ibisRowsCB, zone: 'Main Dining', status: 'available', x: 64, y: 48, shape: 'square' },

  // 2. Zone Main Dining - Row B (Lower block, 4 tables, y: 60)
  { id: 'i-b4', tableNumber: 'B4', capacity: PROVISIONAL_CAPACITIES.ibisRowsCB, zone: 'Main Dining', status: 'available', x: 52, y: 60, shape: 'square' },
  { id: 'i-b3', tableNumber: 'B3', capacity: PROVISIONAL_CAPACITIES.ibisRowsCB, zone: 'Main Dining', status: 'available', x: 56, y: 60, shape: 'square' },
  { id: 'i-b2', tableNumber: 'B2', capacity: PROVISIONAL_CAPACITIES.ibisRowsCB, zone: 'Main Dining', status: 'available', x: 60, y: 60, shape: 'square' },
  { id: 'i-b1', tableNumber: 'B1', capacity: PROVISIONAL_CAPACITIES.ibisRowsCB, zone: 'Main Dining', status: 'available', x: 64, y: 60, shape: 'square' },

  // 3. Zone Main Dining - Row A (6 tables in two groups of three, y: 75)
  // Gap between A4 and A3 is a doorway
  { id: 'i-a6', tableNumber: 'A6', capacity: PROVISIONAL_CAPACITIES.ibisRowA, zone: 'Main Dining', status: 'available', x: 48, y: 75, shape: 'square' },
  { id: 'i-a5', tableNumber: 'A5', capacity: PROVISIONAL_CAPACITIES.ibisRowA, zone: 'Main Dining', status: 'available', x: 53, y: 75, shape: 'square' },
  { id: 'i-a4', tableNumber: 'A4', capacity: PROVISIONAL_CAPACITIES.ibisRowA, zone: 'Main Dining', status: 'available', x: 58, y: 75, shape: 'square' },
  { id: 'i-a3', tableNumber: 'A3', capacity: PROVISIONAL_CAPACITIES.ibisRowA, zone: 'Main Dining', status: 'available', x: 70, y: 75, shape: 'square' },
  { id: 'i-a2', tableNumber: 'A2', capacity: PROVISIONAL_CAPACITIES.ibisRowA, zone: 'Main Dining', status: 'available', x: 75, y: 75, shape: 'square' },
  { id: 'i-a1', tableNumber: 'A1', capacity: PROVISIONAL_CAPACITIES.ibisRowA, zone: 'Main Dining', status: 'available', x: 80, y: 75, shape: 'square' },
];

export const NOVOTEL_FLOOR_FEATURES: FloorFeature[] = [
  // Named features (labels printed on architectural plan)
  { id: 'n-hostess', kind: 'hostess-desk', label: 'HOSTESS DESK', x: 4, y: 58, w: 10, h: 6 },
  { id: 'n-coffee-stand', kind: 'coffee-stand', label: 'COFFEE STAND', x: 19, y: 62, w: 3, h: 17, verticalLabel: true },

  // Unlabelled features (drawn to match plan shape, label: '')
  { id: 'n-boh-left', kind: 'back-of-house', label: '', x: 4, y: 15, w: 10, h: 38 },
  { id: 'n-terrace-stairs', kind: 'terrace', label: '', x: 4, y: 4, w: 12, h: 10 },
  { id: 'n-gb-room', kind: 'back-of-house', label: '', x: 49, y: 4, w: 36, h: 26 },
  { id: 'n-bar-counter', kind: 'bar-counter', label: '', x: 79, y: 6, w: 4, h: 22 },
  { id: 'n-round-bar6', kind: 'island', label: '', x: 79, y: 17, w: 4, h: 6, shape: 'round' },
  { id: 'n-service-c3c4', kind: 'buffet', label: '', x: 40, y: 40, w: 4, h: 5 },
  { id: 'n-buffet-top', kind: 'buffet', label: '', x: 58, y: 34, w: 22, h: 5 },
  { id: 'n-buffet-island', kind: 'island', label: '', x: 62, y: 52, w: 16, h: 12, shape: 'round' },
  { id: 'n-buffet-bot', kind: 'buffet', label: '', x: 58, y: 72, w: 22, h: 5 },
  { id: 'n-banquette-right', kind: 'banquette', label: '', x: 92, y: 18, w: 3, h: 66 },
  { id: 'n-bench-left', kind: 'banquette', label: '', x: 19, y: 82, w: 3, h: 14 },
  { id: 'n-bench-bot-right', kind: 'banquette', label: '', x: 84, y: 88, w: 10, h: 3 },
];

export const IBIS_FLOOR_FEATURES: FloorFeature[] = [
  // Named features (labels printed on architectural plan)
  { id: 'i-hostess', kind: 'hostess-desk', label: 'HOSTESS DESK', x: 34, y: 26, w: 10, h: 5 },
  { id: 'i-front-desk', kind: 'front-desk', label: 'FRONT DESK', x: 72, y: 36, w: 9, h: 5 },

  // Unlabelled features (drawn to match plan shape, label: '')
  { id: 'i-boh-left', kind: 'back-of-house', label: '', x: 4, y: 32, w: 26, h: 48 },
  { id: 'i-bar-prep', kind: 'back-of-house', label: '', x: 18, y: 6, w: 14, h: 22 },
  { id: 'i-buffet-top', kind: 'buffet', label: '', x: 46, y: 24, w: 22, h: 6 },
  { id: 'i-buffet-island', kind: 'island', label: '', x: 38, y: 48, w: 6, h: 12, shape: 'round' },
  { id: 'i-div-left', kind: 'banquette', label: '', x: 44, y: 40, w: 1.2, h: 26 },
  { id: 'i-div-right', kind: 'banquette', label: '', x: 68, y: 40, w: 1.2, h: 26 },
  { id: 'i-banquette-right', kind: 'banquette', label: '', x: 88, y: 18, w: 2.5, h: 58 },
  { id: 'i-terrace-ext', kind: 'terrace', label: '', x: 93, y: 34, w: 5, h: 32 },
  { id: 'i-smoking-terrace', kind: 'smoking-terrace', label: '', x: 32, y: 78, w: 26, h: 18 },
  { id: 'i-bench-bottom', kind: 'banquette', label: '', x: 62, y: 92, w: 26, h: 3 },
];
