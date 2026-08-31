export type MealServiceType = 'breakfast' | 'lunch' | 'dinner';

export interface AccorUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'manager' | 'staff';
  hotelAccess: ('novotel' | 'ibis')[];
}

export interface Guest {
  roomNumber: string;
  guestName: string;
  arrivalDate: string;
  departureDate: string;
  mealPlan: string;
  adults: number;
  children: number;
  infants?: number;
  resvNameId: string;
  accompanyingGuests?: string[];
  vipStatus?: string | null;
  vipLevel?: string | null;
  issueType?: 'no-adults' | 'over-capacity' | 'unentitled' | 'no-details' | null;
  hotelId: string;
  companyName?: string;
  blockCode?: string;
  rateCode?: string;
  roomCategory?: string;
  roomCategoryLabel?: string;
  roomClass?: string;
  balance?: number;
  preferences?: string;
  specialRequests?: string;
  packages?: string[];
  totalPackages?: number;
  lastUpdated?: string;
  assignedTable?: string | null;
  assignedTableId?: string | null;
  checkedInPax?: number; // total pax checked in so far
  checkedInGuests?: Array<{
    name: string;
    timestamp: string;
    mealService: MealServiceType;
    recordedBy: string;
  }>;
}

export interface CheckIn {
  roomNumber: string;
  guestName: string;
  hotelId: string;
  date: string; // YYYY-MM-DD
  timestamp: any;
  mealService: MealServiceType;
  adultsAte: number;
  childrenAte: number;
  infantsAte: number;
  recordedBy: string;
  tableNumber?: string | null;
  tableId?: string | null;
  overCapacityReasonCodes?: string[];
  overCapacityReasons?: string[];
  overCapacityOtherReason?: string;
  authorizingStaff?: string;
  checkedGuestNames?: string[];
  isSynthetic?: boolean;
  syntheticSource?: string;
  history?: Array<{
    timestamp: string;
    adultsAte: number;
    childrenAte: number;
    infantsAte: number;
    recordedBy: string;
    guestName?: string;
    action: 'initial_checkin' | 'additional_guest' | 'update' | 'table_assigned' | 'table_cleared';
  }>;
}

export interface AuditLogEntry {
  id: string;
  hotelId: string;
  timestamp: any;
  userEmail: string;
  userName: string;
  action: 'CHECK_IN' | 'CHECK_IN_PARTIAL' | 'CHECK_IN_BATCH' | 'CHECK_OUT_RESET' | 'TABLE_SEAT' | 'TABLE_CLEAR' | 'TABLE_LAYOUT_UPDATE' | 'REPORT_UPLOAD' | 'GUEST_OVERRIDE' | 'GUEST_MANUAL_ADD';
  roomNumber?: string;
  guestName?: string;
  details: string;
  metadata?: Record<string, any>;
}

export interface DiningTable {
  id: string;
  tableNumber: string;
  capacity: number;
  zone: 'Main Dining' | 'Gourmet Bar' | 'Window Booths' | 'Wall Banquette' | 'Terrace' | 'Smoking Terrace' | 'VIP Alcove' | 'Bar Counter' | 'Delhi Street' | "Charlie's Bar" | string;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning';
  occupiedByRoom?: string | null;
  occupiedByGuest?: string | null;
  occupiedPax?: number;
  occupiedSince?: string | null;
  mealService?: MealServiceType;
  x?: number; // viewBox coordinate X (drawing units)
  y?: number; // viewBox coordinate Y (drawing units)
  shape?: 'rectangle' | 'square' | 'round' | 'booth' | 'diamond' | 'bar_seat' | 'lounge' | 'semi_circle';
  width?: number;
  height?: number;
  rotation?: number;
  isSmoking?: boolean;
}

export interface FloorFeature {
  id: string;
  kind: 'building-envelope' | 'dining-hall' | 'bar-room' | 'prep-room' | 'reception'
      | 'hostess-desk' | 'front-desk' | 'coffee-stand' | 'buffet' | 'island'
      | 'bar-counter' | 'banquette' | 'terrace' | 'smoking-terrace' | 'back-of-house';
  /** Empty string for anything the floor plan does not label. */
  label: string;
  /** Coordinates and dimensions in viewBox drawing units (not percentages) */
  x: number; y: number; w: number; h: number;
  shape?: 'rect' | 'round';
  /** Rotate the label 90 degrees, for tall narrow units like the coffee stand. */
  verticalLabel?: boolean;
}

export interface TableLayoutEntry {
  id: string;                   // matches DiningTable.id
  tableNumber: string;
  capacity: number;
  zone: string;
  x: number;                    // viewBox units
  y: number;
  shape?: 'rectangle' | 'square' | 'round' | 'booth' | 'diamond' | 'bar_seat' | 'lounge' | 'semi_circle';
  isSmoking?: boolean;
}

export interface TableLayout {
  id: string;
  name: string;                 // "Standard", "Friday Buffet", "Christmas"
  tables: TableLayoutEntry[];   // geometry only — strip status, occupied* fields
  isActive: boolean;
  createdByUid: string;
  createdByEmail: string;
  createdAt: string;
  updatedAt: string;
}

export interface MealForecastItem {
  date: string; // YYYY-MM-DD
  dayOfWeek: string;
  hotelId: string;
  packages: Record<string, number>; // e.g. { BF: 43, BF350NET: 113, BFCOMP: 30, DINNER: 5, MBREAK: 3 }
  totalBreakfast: number;
  totalLunch: number;
  totalDinner: number;
  totalBreaks: number;
  totalCovers: number;
  roomsOccupied?: number;
  adultsInHouse?: number;
  childrenInHouse?: number;
  arrivalRooms?: number;
  departureRooms?: number;
  isSynthetic?: boolean;
  syntheticSource?: string;
}

export interface ReportMetadata {
  date: string;
  hotelId: string;
  lastUploaded: any;
  filename: string | null;
  uploadedBy?: string;
  stats?: {
    totalRooms: number;
    totalGuests: number;
    totalEntitledBreakfast: number;
    totalEntitledDinner?: number;
    vipCount: number;
    anomaliesCount: number;
  };
  anomaliesCount?: number;
}

export interface DailySummary {
  date: string; // YYYY-MM-DD
  hotelId: string;
  totalBreakfastPax: number;
  totalLunchPax: number;
  totalDinnerPax: number;
  totalCovers: number;
  roomsAttended: number;
  forecastCovers: number;
  captureRatePercent: number;
  vipPax: number;
  hourlyBreakdown: Record<string, number>;
  paxBreakdown: {
    adults: number;
    children: number;
    infants: number;
  };
  peakHour?: string;
  updatedAt?: string;
  isSynthetic?: boolean;
  syntheticSource?: string;
}
