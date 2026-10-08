export type MealServiceType = 'breakfast' | 'lunch' | 'dinner';

export interface AccorUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'manager' | 'staff';
  hotelAccess: ('novotel' | 'ibis')[];
}

/**
 * A comment left on the reservation by the front office or the F&B team.
 *
 * These arrive as separate rows of the Opera export sharing one RESV_NAME_ID, so a single
 * reservation can carry several. They are also the source of the unquoted embedded newlines
 * that `parseInHouseReport` reconstructs records around - which is why capturing them touches
 * the most delicate part of the parser and has its own test.
 */
export interface GuestNote {
  /** RES_COMMENT - the free text itself. */
  text: string;
  /** RES_COMMENT_TYPE, e.g. 'Reservation'. */
  type?: string;
  /** RES_COMMENT_DESCRIPTION, when the export carries one. */
  description?: string;
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
  /**
   * Front-office and F&B comments on the reservation. Free text about a named guest, so it is
   * shown at the door but deliberately kept out of the analytics model - see analytics/README.
   */
  notes?: GuestNote[];
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
  /** Set when a door correction for today has been applied - see src/lib/overrides.ts. */
  correction?: {
    kind: 'no-adults' | 'no-details' | 'rate';
    by: string;
    at: string;
    note: string;
  };
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
  /** Breakfast covers the room was booked for when it was checked in, for no-show and over-capacity analytics. */
  bookedPax?: number;
  /** How entitlement was decided at check-in - 'opera-package', 'note', 'correction', ... */
  entitlementBasis?: string;
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
  action: 'CHECK_IN' | 'CHECK_IN_PARTIAL' | 'CHECK_IN_BATCH' | 'CHECK_OUT_RESET' | 'TABLE_SEAT' | 'TABLE_CLEAR' | 'TABLE_LAYOUT_UPDATE' | 'REPORT_UPLOAD' | 'GUEST_OVERRIDE' | 'GUEST_MANUAL_ADD' | 'DATA_MAINTENANCE' | 'ORDER';
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
  /** Id of the table this one has been merged into. Null/absent when standalone. */
  mergedInto?: string | null;
  /** Ids merged into this table. Only ever set on the primary of a group. */
  mergedTables?: string[];
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
  mergedInto?: string | null;
  mergedTables?: string[];
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
  /** 'package-forecast' for imports through src/parsing/forecastExport.ts. Documents without it
   *  were written by the previous parser, which summed per-unit rows and over-counted. */
  source?: string;
  filename?: string;
  reportDate?: string;
  importedAt?: any;
  /** Meeting products (MBREAK, MBUFF) - shown separately, never counted as restaurant breakfast. */
  meetingPackages?: number;
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
  /** Business date the guest list belongs to. */
  date: string;
  hotelId: string;
  lastUploaded: any;
  filename: string | null;
  uploadedBy?: string;
  /** Resort code read from the file itself (HB4F8 Novotel, HB9U9 ibis). */
  resortCode?: string;
  stats?: {
    totalRooms: number;
    totalGuests: number;
    /** Guests whose breakfast is confirmed. Never includes the unverified bucket. */
    totalEntitledBreakfast: number;
    totalUnverifiedBreakfast?: number;
    unverifiedRateCodes?: string[];
    totalEntitledDinner?: number;
    vipCount: number;
    anomaliesCount: number;
    departedRooms?: number;
    arrivedRooms?: number;
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
