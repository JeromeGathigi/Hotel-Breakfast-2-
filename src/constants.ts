import { DiningTable } from './types';

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
  // Food Exchange Main Dining Hall
  { id: 'n-t01', tableNumber: 'FX-01', capacity: 2, zone: 'Main Dining', status: 'available', x: 12, y: 15 },
  { id: 'n-t02', tableNumber: 'FX-02', capacity: 2, zone: 'Main Dining', status: 'available', x: 25, y: 15 },
  { id: 'n-t03', tableNumber: 'FX-03', capacity: 4, zone: 'Main Dining', status: 'available', x: 40, y: 15 },
  { id: 'n-t04', tableNumber: 'FX-04', capacity: 4, zone: 'Main Dining', status: 'available', x: 55, y: 15 },
  { id: 'n-t05', tableNumber: 'FX-05', capacity: 6, zone: 'Main Dining', status: 'available', x: 72, y: 15 },
  { id: 'n-t06', tableNumber: 'FX-06', capacity: 2, zone: 'Main Dining', status: 'available', x: 12, y: 35 },
  { id: 'n-t07', tableNumber: 'FX-07', capacity: 4, zone: 'Main Dining', status: 'available', x: 28, y: 35 },
  { id: 'n-t08', tableNumber: 'FX-08', capacity: 4, zone: 'Main Dining', status: 'available', x: 44, y: 35 },
  { id: 'n-t09', tableNumber: 'FX-09', capacity: 6, zone: 'Main Dining', status: 'available', x: 62, y: 35 },
  { id: 'n-t10', tableNumber: 'FX-10', capacity: 8, zone: 'Main Dining', status: 'available', x: 80, y: 35 },

  // Window Booths
  { id: 'n-w01', tableNumber: 'WB-01', capacity: 4, zone: 'Window Booths', status: 'available', x: 12, y: 60 },
  { id: 'n-w02', tableNumber: 'WB-02', capacity: 4, zone: 'Window Booths', status: 'available', x: 28, y: 60 },
  { id: 'n-w03', tableNumber: 'WB-03', capacity: 4, zone: 'Window Booths', status: 'available', x: 44, y: 60 },
  { id: 'n-w04', tableNumber: 'WB-04', capacity: 4, zone: 'Window Booths', status: 'available', x: 60, y: 60 },

  // Terrace / Outdoor Garden
  { id: 'n-tr01', tableNumber: 'TR-01', capacity: 2, zone: 'Terrace', status: 'available', x: 12, y: 82 },
  { id: 'n-tr02', tableNumber: 'TR-02', capacity: 2, zone: 'Terrace', status: 'available', x: 25, y: 82 },
  { id: 'n-tr03', tableNumber: 'TR-03', capacity: 4, zone: 'Terrace', status: 'available', x: 40, y: 82 },
  { id: 'n-tr04', tableNumber: 'TR-04', capacity: 4, zone: 'Terrace', status: 'available', x: 55, y: 82 },
  { id: 'n-tr05', tableNumber: 'TR-05', capacity: 6, zone: 'Terrace', status: 'available', x: 70, y: 82 },

  // VIP Alcove
  { id: 'n-vip1', tableNumber: 'VIP-1', capacity: 6, zone: 'VIP Alcove', status: 'available', x: 86, y: 60 },
  { id: 'n-vip2', tableNumber: 'VIP-2', capacity: 8, zone: 'VIP Alcove', status: 'available', x: 86, y: 82 },
];

export const DEFAULT_IBIS_TABLES: DiningTable[] = [
  // Delhi Street Main Dining Hall
  { id: 'i-t01', tableNumber: 'DS-01', capacity: 2, zone: 'Delhi Street', status: 'available', x: 12, y: 18 },
  { id: 'i-t02', tableNumber: 'DS-02', capacity: 2, zone: 'Delhi Street', status: 'available', x: 25, y: 18 },
  { id: 'i-t03', tableNumber: 'DS-03', capacity: 4, zone: 'Delhi Street', status: 'available', x: 40, y: 18 },
  { id: 'i-t04', tableNumber: 'DS-04', capacity: 4, zone: 'Delhi Street', status: 'available', x: 55, y: 18 },
  { id: 'i-t05', tableNumber: 'DS-05', capacity: 6, zone: 'Delhi Street', status: 'available', x: 72, y: 18 },
  { id: 'i-t06', tableNumber: 'DS-06', capacity: 2, zone: 'Delhi Street', status: 'available', x: 12, y: 40 },
  { id: 'i-t07', tableNumber: 'DS-07', capacity: 4, zone: 'Delhi Street', status: 'available', x: 28, y: 40 },
  { id: 'i-t08', tableNumber: 'DS-08', capacity: 4, zone: 'Delhi Street', status: 'available', x: 44, y: 40 },
  { id: 'i-t09', tableNumber: 'DS-09', capacity: 6, zone: 'Delhi Street', status: 'available', x: 62, y: 40 },
  { id: 'i-t10', tableNumber: 'DS-10', capacity: 8, zone: 'Delhi Street', status: 'available', x: 80, y: 40 },

  // Charlie's Bar Counter / Quick Seating
  { id: 'i-c01', tableNumber: 'CB-01', capacity: 1, zone: "Charlie's Bar", status: 'available', x: 15, y: 65 },
  { id: 'i-c02', tableNumber: 'CB-02', capacity: 1, zone: "Charlie's Bar", status: 'available', x: 25, y: 65 },
  { id: 'i-c03', tableNumber: 'CB-03', capacity: 1, zone: "Charlie's Bar", status: 'available', x: 35, y: 65 },
  { id: 'i-c04', tableNumber: 'CB-04', capacity: 1, zone: "Charlie's Bar", status: 'available', x: 45, y: 65 },

  // Alfresco Terrace
  { id: 'i-tr01', tableNumber: 'TR-01', capacity: 2, zone: 'Terrace', status: 'available', x: 15, y: 84 },
  { id: 'i-tr02', tableNumber: 'TR-02', capacity: 2, zone: 'Terrace', status: 'available', x: 32, y: 84 },
  { id: 'i-tr03', tableNumber: 'TR-03', capacity: 4, zone: 'Terrace', status: 'available', x: 50, y: 84 },
  { id: 'i-tr04', tableNumber: 'TR-04', capacity: 4, zone: 'Terrace', status: 'available', x: 70, y: 84 },
];
