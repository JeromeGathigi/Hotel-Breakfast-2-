import type { MealPlan } from '../lib/meals';

/** One reconstructed record from the Opera export, as raw trimmed strings. */
export type RawRecord = string[];

/** Resolved column indices. `-1` means the column is absent from this export. */
export interface ColumnMap {
  room: number;
  guestName: number;
  arrival: number;
  departure: number;
  rateCode: number;
  adults: number;
  children: number;
  resvNameId: number;
  comment: number;
  /** The join key for comments. Differs from `resvNameId` on some rows — see `collectComments`. */
  commentResvId: number;
  vip: number;
  shareNames: number;
  accompanyingNames: number;
}

export type AnomalyKind =
  | 'field-count-overflow'
  | 'unparsed-trailing-lines'
  | 'ambiguous-entitlement'
  | 'suspicious-value';

/**
 * Something the parser could not resolve confidently. Surfaced to the admin after
 * upload rather than swallowed — a silent parser is how the phantom "room 1" reached
 * the live guest list.
 */
export interface Anomaly {
  kind: AnomalyKind;
  /** 1-based physical line in the source file, where known. */
  line?: number;
  room?: string;
  detail: string;
}

/** A room as parsed, before Firestore-specific fields are attached. */
export interface ParsedRoom {
  roomNumber: string;
  guestName: string;
  arrivalDate: string;
  departureDate: string;
  mealPlan: MealPlan | string;
  adults: number;
  children: number;
  resvNameId: string;
  accompanyingGuests: string[];
  vipStatus: string;
  issueType: 'no-adults' | 'no-details' | null;
  /** Every distinct rate code seen on any row of this room, for audit and debugging. */
  rateCodes: string[];
  /** Why this room got its meal plan. Shown in the upload report, not persisted. */
  classificationReason: string;
}

export interface ParseResult {
  rooms: ParsedRoom[];
  anomalies: Anomaly[];
  stats: {
    physicalLines: number;
    records: number;
    rejectedRecords: number;
    roomsWithMeal: number;
  };
}
