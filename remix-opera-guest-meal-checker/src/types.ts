import { Timestamp } from 'firebase/firestore';

export interface Guest {
  id?: string;
  roomNumber: string;
  guestName: string;
  arrivalDate: string;
  departureDate: string;
  mealPlan: string;
  paxCount?: number;
  adults: number;
  children: number;
  resvNameId: string;
  accompanyingGuests?: string[];
  vipStatus?: string;
  lastUpdated: Timestamp;
  // Data Quality Flags
  issueType?: 'no-adults' | 'no-details';
  isCorrected?: boolean;
  manualAdults?: number;
  manualBreakfast?: boolean;
  manualName?: string;
  manualOccupied?: boolean;
}

export interface CheckIn {
  id?: string;
  roomNumber: string;
  guestName: string;
  hotelId: string;
  date: string; // YYYY-MM-DD
  timestamp: Timestamp;
  adultsAte: number;
  childrenAte: number;
  infantsAte: number;
  isOverCapacity?: boolean;
  overCapacityReasons?: string[];
  overCapacityReasonCodes?: string[];
  overCapacityOtherReason?: string;
  authorizingStaff?: string;
  recordedByUid: string;
  recordedByEmail: string;
}

export interface ReportMetadata {
  lastUploaded: Timestamp;
  uploadedBy: string;
  date: string; // YYYY-MM-DD of the data
}
