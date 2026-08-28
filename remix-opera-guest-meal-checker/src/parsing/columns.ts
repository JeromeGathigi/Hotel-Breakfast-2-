import type { ColumnMap } from './types';

/**
 * Aliases are matched **exactly** (case-insensitive, trimmed), never as substrings.
 * Substring matching would be actively dangerous on this export: `BLOCK_CODE` would
 * capture `CODE`, and the resort code on a Novotel export is literally `HB4F8` — a
 * loose match against `HB` would classify the entire house as Half Board.
 */
const ALIASES: Record<keyof ColumnMap, string[]> = {
  room: ['ROOM', 'RM', 'ROOM_NO'],
  guestName: ['GUEST_NAME', 'NAME', 'FULL_NAME'],
  arrival: ['ARRIVAL', 'ARR', 'ARRIVAL_DATE'],
  departure: ['DEPARTURE', 'DEP', 'DEPARTURE_DATE'],
  rateCode: ['RATE_CODE', 'RATE'],
  adults: ['ADULTS', 'ADL', 'ADULT'],
  children: ['CHILDREN', 'CHD', 'CHILD', 'CHLD'],
  resvNameId: ['RESV_NAME_ID', 'RESV_ID', 'RESERVATION_ID'],
  comment: ['RES_COMMENT', 'COMMENT', 'RESERVATION_COMMENT'],
  commentResvId: ['COMMENT_RESV_NAME_ID'],
  vip: ['VIP', 'VIP_STATUS', 'VIP_LEVEL'],
  shareNames: ['SHARE_NAMES'],
  accompanyingNames: ['ACCOMPANYING_NAMES'],
};

export function mapColumns(header: string[]): ColumnMap {
  const normalised = header.map((h) => h.trim().toUpperCase());

  const find = (aliases: string[]): number => {
    for (const alias of aliases) {
      const index = normalised.indexOf(alias.toUpperCase());
      if (index !== -1) return index;
    }
    return -1;
  };

  const map = Object.fromEntries(
    (Object.keys(ALIASES) as (keyof ColumnMap)[]).map((key) => [key, find(ALIASES[key])])
  ) as unknown as ColumnMap;

  if (map.room === -1) {
    throw new Error(`Missing required ROOM column. Columns found: ${header.join(', ')}`);
  }
  if (map.resvNameId === -1) {
    throw new Error(`Missing required RESV_NAME_ID column. Columns found: ${header.join(', ')}`);
  }

  return map;
}

/** Reads a field by index, returning '' for absent columns or short records. */
export function field(record: string[], index: number): string {
  if (index < 0 || index >= record.length) return '';
  return (record[index] ?? '').trim();
}

/**
 * Explicit numeric coercion.
 *
 * PapaParse's `dynamicTyping` used to do this implicitly and silently, which turned
 * room `0104` into the number `104` and stripped leading zeros from reservation ids.
 * Numbers are now converted only where a number is actually wanted.
 */
export function numeric(record: string[], index: number): number {
  const raw = field(record, index);
  if (!raw) return 0;
  const value = Number(raw.replace(/,/g, ''));
  return Number.isFinite(value) ? value : 0;
}
