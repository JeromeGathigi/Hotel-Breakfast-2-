import { Guest, GuestNote } from '../types';
import { hasMealEntitlement } from '../lib/meals';
import { assessGuestBreakfast, summariseBreakfast } from '../lib/entitlement';
import { businessDate, isIsoDate } from '../lib/businessDate';

export interface Anomaly {
  roomNumber: string;
  guestName: string;
  type: 'no-adults' | 'over-capacity' | 'unentitled' | 'missing-dates' | 'no-details' | 'corrupted-record';
  message: string;
}

/**
 * Domain rule 8.1: a valid room number is digits, optionally followed by one letter.
 *
 * Without this check, ANY string in the ROOM column becomes a room. That is not
 * theoretical: on 31 Aug 2026 someone uploaded `pkgforecast_84272763.txt` — the Package
 * Forecast, which the spec explicitly excludes because it carries no room numbers — and
 * the live guest list became eight documents keyed by Opera room-CATEGORY codes
 * (KGAGS, KGB, KGBBC, SDDMV, SKC, TWB) with anomaliesCount: 0. The door had nonsense
 * and nothing complained.
 */
export function isValidRoomNumber(raw: string): boolean {
  return /^\d+[A-Za-z]?$/.test(String(raw ?? '').trim());
}

/** Strips leading zeros and uppercases a letter suffix, so 0104 -> 104 and 336a -> 336A. */
export function normalizeRoomNumber(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  const m = trimmed.match(/^0*(\d+)([A-Za-z]?)$/);
  return m ? m[1] + (m[2] || '').toUpperCase() : trimmed.toUpperCase();
}

/** Opera resort codes. The in-house export carries one per row; it is the ONLY property signal. */
export const RESORT_CODES: Record<string, 'novotel' | 'ibis'> = { HB4F8: 'novotel', HB9U9: 'ibis' };

export interface ParseResult {
  /**
   * The property the rows belong to, from their RESORT column. 'both' only when rows of both
   * resorts are present. When the export has no RESORT column at all it is the caller's
   * `defaultHotelId` and `resortCodes` is empty - the caller must then treat it as unconfirmed.
   */
  hotelId: 'novotel' | 'ibis' | 'both';
  /** Distinct resort codes actually found in the rows, e.g. ['HB4F8']. */
  resortCodes: string[];
  rooms: Guest[];
  anomalies: Anomaly[];
  /**
   * The day range the export can belong to, from its own stay dates. A list pulled before service
   * on day D has every arrival <= D and every departure >= D, so D must lie within
   * [latestArrival, earliestDeparture]. A day outside it means the file is from another day.
   */
  dateWindow: { latestArrival: string; earliestDeparture: string } | null;
  stats: {
    totalRooms: number;
    totalGuests: number;
    /** Rooms whose rate CONFIRMS breakfast. Excludes the unverified bucket - see below. */
    breakfastIncludedPax: number;
    /** Rooms whose rate confirms Room Only. */
    breakfastExcludedPax: number;
    /**
     * Rooms whose rate cannot answer: contract- or package-dependent, or a property-local code
     * absent from Accor's referential. Reported separately ON PURPOSE. On the 2 Sep exports
     * this was 93 pax at Novotel and 95 at ibis, so collapsing it into either neighbour moves
     * the covers figure by more than half the house.
     */
    breakfastUnverifiedPax: number;
    /** Rate codes behind breakfastUnverifiedPax, for the unknown-rate-code report. */
    breakfastUnverifiedCodes: string[];
    totalDinnerPax: number;
    anomaliesCount: number;
    discardedRecordsCount?: number;
    /** Rows whose ROOM value was not a valid room number, so were not imported. */
    invalidRoomRows?: number;
  };
}

export function parseInHouseReport(
  rawText: string,
  defaultHotelId: string = 'novotel',
  options: { today?: string } = {}
): ParseResult {
  const today = options.today ?? businessDate();
  // Discard only lines that are completely empty once tabs and spaces are removed
  const rawLines = rawText
    .split(/\r?\n/)
    .filter((l) => l.replace(/\t/g, '').trim().length > 0);

  // Keyed by property AND room: Novotel 201 and ibis 201 are different rooms.
  const roomsMap = new Map<string, Guest>();
  const anomalies: Anomaly[] = [];
  const resortCodesSeen = new Set<string>();

  let discardedRecordsCount = 0;
  let invalidRoomRows = 0;

  // The property used to be "detected" by scanning every line for the substrings 'Novotel' and
  // 'ibis' - guest notes and company names included. A Novotel export whose note mentioned ibis
  // therefore came back as 'both', and the importer then wrote BOTH properties' metadata: on
  // 31 Aug the ibis metadata/reports document was stamped with the Novotel package-forecast
  // filename that way. The RESORT column of each row is now the only signal.

  // Pre-pass: Join multi-line continuation records and handle trailing omitted columns
  const records: string[][] = [];
  let currentExpectedFields = 0;
  let buffer: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const cells = line.split('\t').map((c) => c.trim().replace(/^["']|["']$/g, ''));

    const isGuestHeader = cells.includes('ROOM') && (cells.includes('GUEST_NAME') || cells.includes('FULL_NAME'));
    const isAltGuestHeader = cells.includes('PRODUCT_ID1') && cells.includes('GUEST_NAME');

    // The export ends with a narrow summary block:
    //
    //     LOGO  SUM_ADULTS  SUM_CHILDREN  SUM_BALANCE  SUM_RATE_AMOUNT  CS_STAY_ROOMS
    //           135         0             467713.3     131329.33        112
    //
    // Six fields against a 44-field header, so the accumulator below treated it as a
    // continuation and GLUED IT ONTO THE LAST GUEST RECORD. On the ibis export that gave
    // room 435 a front-office note reading "SUM_RATE_AMOUNT" with type "SUM_BALANCE", and
    // silently overwrote whatever its real trailing columns held.
    //
    // The footer's totals are still useful - they are the ground truth this parser is checked
    // against - but they are not a guest row. Flush whatever is buffered and stop.
    const isSummaryBlock =
      cells[0] === 'LOGO' || cells.includes('SUM_ADULTS') || cells.includes('CS_STAY_ROOMS');

    if (isSummaryBlock) {
      if (buffer.length > 0) {
        while (buffer.length < currentExpectedFields) buffer.push('');
        records.push(buffer);
        buffer = [];
      }
      // Nothing after the summary header belongs to a guest record.
      currentExpectedFields = 0;
      break;
    }

    if (isGuestHeader || isAltGuestHeader) {
      if (buffer.length > 0) {
        if (currentExpectedFields > 0 && buffer.length <= currentExpectedFields) {
          while (buffer.length < currentExpectedFields) buffer.push('');
          records.push(buffer);
        } else {
          records.push(buffer);
        }
        buffer = [];
      }
      currentExpectedFields = cells.length;
      records.push(cells);
      continue;
    }

    if (currentExpectedFields === 0) {
      records.push(cells);
      continue;
    }

    if (buffer.length === 0) {
      buffer = [...cells];
    } else {
      // Lookahead: if adding this line exceeds expectedFields, buffer was already a complete record with omitted trailing columns
      if (buffer.length + cells.length - 1 > currentExpectedFields) {
        while (buffer.length < currentExpectedFields) buffer.push('');
        records.push(buffer);
        buffer = [...cells];
      } else {
        // Continuation line: restore newline in the split field
        buffer[buffer.length - 1] += '\n' + cells[0];
        for (let c = 1; c < cells.length; c++) {
          buffer.push(cells[c]);
        }
      }
    }

    if (buffer.length === currentExpectedFields) {
      records.push(buffer);
      buffer = [];
    }
  }

  if (buffer.length > 0) {
    if (currentExpectedFields > 0 && buffer.length <= currentExpectedFields) {
      while (buffer.length < currentExpectedFields) buffer.push('');
      records.push(buffer);
    } else {
      records.push(buffer);
    }
    buffer = [];
  }

  let isGuestSection = false;
  let headers: string[] = [];

  // Main processing pass over normalized records
  for (let i = 0; i < records.length; i++) {
    const cells = records[i];

    // Check for section headers
    if (cells.includes('ROOM') && (cells.includes('GUEST_NAME') || cells.includes('FULL_NAME'))) {
      headers = cells;
      isGuestSection = true;
      continue;
    }

    if (cells.includes('PRODUCT_ID1') && cells.includes('GUEST_NAME')) {
      headers = cells;
      isGuestSection = true;
      continue;
    }

    // Discard corrupted records with more fields than the active header
    if (headers.length > 0 && cells.length > headers.length) {
      discardedRecordsCount++;
      anomalies.push({
        roomNumber: 'CORRUPTED',
        guestName: 'Corrupted record',
        type: 'corrupted-record',
        message: `Record with ${cells.length} fields exceeded header field count of ${headers.length}. Discarded.`,
      });
      continue;
    }

    // The package forecast used to be parsed HERE as well, by a second forecast parser that
    // summed the per-unit rows (16 breakfasts became 256), counted any unknown product as
    // breakfast and defaulted a blank product to 'BF'. Production still holds 34 Novotel
    // forecast documents it wrote: 214 breakfasts for 2 Sep, where the file says 98. The only
    // forecast parser is src/parsing/forecastExport.ts.

    // Process In-House / Reservation row
    if (isGuestSection && headers.length > 0) {
      const rowObj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        if (cells[idx] !== undefined) {
          rowObj[h] = cells[idx];
        }
      });

      const rawRoom = (rowObj['ROOM'] || rowObj['ROOM1'] || '').trim();
      const rawGuestName = (rowObj['GUEST_NAME'] || rowObj['FULL_NAME'] || rowObj['DISPLAY_NAME'] || '').trim();

      // Skip layout artefacts
      if (rawGuestName.startsWith('LOGO') || rawGuestName.startsWith('SUM_')) {
        continue;
      }

      // If no room number is available, report missing-dates/missing-room anomaly if there's a guest name
      if (!rawRoom) {
        if (rawGuestName) {
          anomalies.push({
            roomNumber: 'MISSING',
            guestName: rawGuestName,
            type: 'missing-dates',
            message: `Guest "${rawGuestName}" has no assigned room number in Opera export.`,
          });
        }
        continue;
      }

      // Domain rule 8.1 — reject anything that is not a room number, loudly.
      if (!isValidRoomNumber(rawRoom)) {
        invalidRoomRows++;
        anomalies.push({
          roomNumber: rawRoom,
          guestName: rawGuestName || '(none)',
          type: 'corrupted-record',
          message:
            `ROOM value "${rawRoom}" is not a room number (expected digits with an optional ` +
            `letter). Row not imported. If many rows fail this, the wrong Opera report was ` +
            `uploaded — the Package Forecast has no room numbers and must not be used.`,
        });
        continue;
      }

      const roomNum = normalizeRoomNumber(rawRoom);
      const isBlankDetails = !rawGuestName;
      const guestName = isBlankDetails ? 'RESERVED / NO DETAILS' : rawGuestName;

      const adults = isBlankDetails ? 0 : parseInt(rowObj['ADULTS'] || rowObj['ADULTS1'] || '0', 10) || 0;
      const children = isBlankDetails ? 0 : parseInt(rowObj['CHILDREN'] || rowObj['CHILDREN1'] || '0', 10) || 0;
      const arrival = formatOperaDateToIso(rowObj['ARRIVAL'] || rowObj['TRUNC_ARRIVAL'] || rowObj['STAY_DATE1'] || '');
      const departure = formatOperaDateToIso(rowObj['DEPARTURE'] || rowObj['TRUNC_DEPARTURE'] || '');
      const rateCode = rowObj['RATE_CODE'] || '';
      const products = rowObj['PRODUCTS'] || rowObj['PRODUCT_ID'] || '';
      const vip = rowObj['VIP'] || null;
      const company = rowObj['COMPANY_NAME'] || '';
      const resortCode = (rowObj['RESORT'] || '').trim().toUpperCase();
      if (RESORT_CODES[resortCode]) resortCodesSeen.add(resortCode);
      const rowHotel = RESORT_CODES[resortCode] ?? (defaultHotelId === 'ibis' ? 'ibis' : 'novotel');
      const resvNameId = rowObj['RESV_NAME_ID'] || rowObj['NUMBER1'] || `${rowHotel}-${roomNum}`;
      const specialReq = rowObj['SPECIAL_REQUESTS'] || rowObj['SP_REQUEST'] || '';
      const preferences = rowObj['PREFERENCES'] || rowObj['PREFERENCE'] || '';
      const roomCategoryLabel = (rowObj['ROOM_CATEGORY_LABEL'] || '').trim();

      // BLOCK_CODE is the key to a group's contract. Three rate codes - BGCI, BGPG and BGRE -
      // say "according to the contract" in Accor's referential, so no rate table can decide
      // whether they include breakfast; only the block can. BGRE alone was 38 rooms on the
      // 2 September Novotel export, so without this the largest unresolved group is
      // unreachable. See src/lib/rateReferential.ts.
      const blockCode = rowObj['BLOCK_CODE'] || '';

      // Front-office and F&B comments. One reservation can span several export rows, each
      // carrying one comment, so these accumulate per room rather than overwrite.
      const noteText = (rowObj['RES_COMMENT'] || '').trim();
      const rowNote: GuestNote | null = noteText
        ? {
            text: noteText,
            type: (rowObj['RES_COMMENT_TYPE'] || '').trim() || undefined,
            description: (rowObj['RES_COMMENT_DESCRIPTION'] || '').trim() || undefined,
          }
        : null;

      /** Append a note if its text is not already present. Order of arrival is preserved. */
      const mergeNote = (target: Guest, note: GuestNote | null) => {
        if (!note) return;
        const existing = target.notes ?? [];
        if (existing.some((n) => n.text === note.text)) return;
        target.notes = [...existing, note];
      };

      // Meal plan synthesis. A blank stays blank: it is the "no rate code - check in Opera" case.
      // It used to be filled with 'Room Only (No Details)' (blank rooms), which the entitlement
      // logic read as a CONFIRMED room-only plan, and with 'Room & Breakfast (RB)' (everyone
      // else), which it read as a breakfast plan. Neither was in the file.
      let mealPlan = rateCode;
      if (products) {
        mealPlan = `${rateCode ? rateCode + ' • ' : ''}${products}`;
      } else if (rowObj['PACKAGES']) {
        mealPlan = rowObj['PACKAGES'];
      }

      // Read SHARE_NAMES first, then fall back to ACCOMPANYING_NAMES
      const rawAccompanying = rowObj['SHARE_NAMES'] || rowObj['ACCOMPANYING_NAMES'] || '';
      const accompanyingList = rawAccompanying
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean);

      const nameKey = (n: string) => n.trim().toLowerCase();

      // Helper to merge and deduplicate accompanying guests case-insensitively
      const buildDeduplicatedAccompanying = (primaryName: string, candidates: string[]): string[] => {
        const primaryK = nameKey(primaryName);
        const seen = new Set<string>();
        const result: string[] = [];
        for (const name of candidates) {
          const trimmed = name.trim();
          const k = nameKey(trimmed);
          if (k && k !== primaryK && !seen.has(k) && trimmed !== 'RESERVED / NO DETAILS') {
            seen.add(k);
            result.push(trimmed);
          }
        }
        return result;
      };

      const roomKey = `${rowHotel}|${roomNum}`;
      const existingGuest = roomsMap.get(roomKey);

      if (!existingGuest) {
        // Room not yet in map -> insert
        const guestObj: Guest = {
          roomNumber: roomNum,
          guestName,
          arrivalDate: arrival,
          departureDate: departure,
          mealPlan,
          adults,
          children,
          resvNameId,
          accompanyingGuests: buildDeduplicatedAccompanying(guestName, accompanyingList),
          vipStatus: vip,
          vipLevel: vip,
          issueType: isBlankDetails ? 'no-details' : null,
          hotelId: rowHotel,
          companyName: company,
          rateCode,
          blockCode,
          specialRequests: specialReq,
          preferences,
          roomCategoryLabel,
          notes: rowNote ? [rowNote] : [],
          lastUpdated: new Date().toISOString(),
        };
        roomsMap.set(roomKey, guestObj);
      } else {
        // Room already in map -> merge without depending on IS_SHARED_YN
        if (adults > existingGuest.adults) {
          // This record becomes primary!
          const oldPrimary = existingGuest.guestName;
          const combinedAccompanying = [
            ...(existingGuest.accompanyingGuests || []),
            oldPrimary,
            ...accompanyingList,
          ];

          existingGuest.guestName = guestName;
          existingGuest.adults = adults;
          existingGuest.children = children;
          existingGuest.rateCode = rateCode || existingGuest.rateCode;
          existingGuest.mealPlan = mealPlan || existingGuest.mealPlan;
          existingGuest.arrivalDate = arrival || existingGuest.arrivalDate;
          existingGuest.departureDate = departure || existingGuest.departureDate;
          existingGuest.vipStatus = vip || existingGuest.vipStatus;
          existingGuest.vipLevel = vip || existingGuest.vipLevel;
          existingGuest.resvNameId = resvNameId || existingGuest.resvNameId;
          existingGuest.companyName = company || existingGuest.companyName;
          existingGuest.specialRequests = specialReq || existingGuest.specialRequests;
          existingGuest.preferences = preferences || existingGuest.preferences;
          existingGuest.blockCode = blockCode || existingGuest.blockCode;
          mergeNote(existingGuest, rowNote);
          existingGuest.lastUpdated = new Date().toISOString();
          if (isBlankDetails) {
            existingGuest.issueType = 'no-details';
          } else {
            existingGuest.issueType = null;
          }
          existingGuest.accompanyingGuests = buildDeduplicatedAccompanying(guestName, combinedAccompanying);
        } else {
          // Keep stored primary, add this record's guestName and accompanying names
          const combinedAccompanying = [
            ...(existingGuest.accompanyingGuests || []),
            guestName,
            ...accompanyingList,
          ];
          existingGuest.accompanyingGuests = buildDeduplicatedAccompanying(existingGuest.guestName, combinedAccompanying);
          // A row that exists only to carry a comment still has a note to contribute, even
          // though it loses the primary-guest contest above.
          mergeNote(existingGuest, rowNote);
          existingGuest.blockCode = existingGuest.blockCode || blockCode;
          existingGuest.lastUpdated = new Date().toISOString();
        }
      }
    }
  }

  // POST-PASS: Raise anomalies per room once roomsMap is fully merged
  for (const room of roomsMap.values()) {
    if (room.guestName === 'RESERVED / NO DETAILS' || room.issueType === 'no-details') {
      room.issueType = 'no-details';
      anomalies.push({
        roomNumber: room.roomNumber,
        guestName: room.guestName,
        type: 'no-details',
        message: `Room ${room.roomNumber} has no guest profile details in Opera export.`,
      });
    } else if (room.adults === 0) {
      room.issueType = 'no-adults';
      anomalies.push({
        roomNumber: room.roomNumber,
        guestName: room.guestName,
        type: 'no-adults',
        message: `Room ${room.roomNumber} (${room.guestName}) has 0 adults registered.`,
      });
    } else if (!room.arrivalDate || !room.departureDate) {
      anomalies.push({
        roomNumber: room.roomNumber,
        guestName: room.guestName,
        type: 'missing-dates',
        message: `Room ${room.roomNumber} (${room.guestName}) has missing stay dates.`,
      });
    }
  }

  const roomsList = Array.from(roomsMap.values());
  const hotelsSeen = new Set(roomsList.map((r) => r.hotelId));
  const detectedHotel: ParseResult['hotelId'] =
    hotelsSeen.size > 1
      ? 'both'
      : hotelsSeen.has('ibis')
        ? 'ibis'
        : hotelsSeen.has('novotel')
          ? 'novotel'
          : defaultHotelId === 'ibis'
            ? 'ibis'
            : 'novotel';

  const arrivals = roomsList.map((r) => r.arrivalDate).filter(isIsoDate).sort();
  const departures = roomsList.map((r) => r.departureDate).filter(isIsoDate).sort();
  const dateWindow =
    arrivals.length && departures.length
      ? { latestArrival: arrivals[arrivals.length - 1], earliestDeparture: departures[0] }
      : null;

  // `totalBreakfast` used to be `(adults + children)` for EVERY room, with no entitlement
  // check at all - so a field named totalBreakfastPax measured occupancy. On the real Novotel
  // export it reported 163 where Opera's own package forecast for the same date was 98, and
  // ReportUploader wrote that number to metadata/reports as `totalEntitledBreakfast`, a name
  // asserting something never computed.
  //
  // It now uses the single entitlement source in src/lib/meals.ts, and reports the three
  // buckets separately. Folding `unverified` into either of the others is the defect that
  // module exists to prevent, so the parser does not do it either.
  // Rate code, property list and front-office notes. Opera's package attachments are not in this
  // file; importers that have them recompute with src/lib/entitlement.ts.
  const buckets = summariseBreakfast(roomsList, (g) => assessGuestBreakfast(g, { today }));
  let totalDinner = 0;
  roomsList.forEach((r) => {
    if (hasMealEntitlement(r.mealPlan, 'dinner')) {
      totalDinner += (r.adults || 0) + (r.children || 0);
    }
  });

  return {
    hotelId: detectedHotel,
    resortCodes: [...resortCodesSeen].sort(),
    rooms: roomsList,
    anomalies,
    dateWindow,
    stats: {
      totalRooms: roomsList.length,
      totalGuests: roomsList.reduce((acc, r) => acc + (r.adults || 0) + (r.children || 0), 0),
      breakfastIncludedPax: buckets.includedPax,
      breakfastExcludedPax: buckets.excludedPax,
      breakfastUnverifiedPax: buckets.unverifiedPax,
      breakfastUnverifiedCodes: buckets.unverifiedCodes,
      totalDinnerPax: totalDinner,
      anomaliesCount: anomalies.length,
      discardedRecordsCount,
      invalidRoomRows,
    },
  };
}

export function formatOperaDateToIso(dateStr: string): string {
  if (!dateStr) return '';
  // Handle DD-MMM-YY (e.g., 28-AUG-26)
  const dmyMatch = dateStr.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const monthStr = dmyMatch[2].toUpperCase();
    let year = dmyMatch[3];
    if (year.length === 2) year = `20${year}`;

    const months: Record<string, string> = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
    };
    // An unrecognised month used to become August ('08'). It is now an empty date, which the
    // post-pass reports as missing rather than presenting as a stay in August.
    const month = months[monthStr];
    if (!month) return '';
    return `${year}-${month}-${day}`;
  }

  // Handle DD-MM-YY (e.g. 28-08-26)
  const numMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (numMatch) {
    const day = numMatch[1].padStart(2, '0');
    const month = numMatch[2].padStart(2, '0');
    let year = numMatch[3];
    if (year.length === 2) year = `20${year}`;
    const iso = `${year}-${month}-${day}`;
    return isIsoDate(iso) ? iso : '';
  }

  // Already ISO is fine; anything else is not a date this file format produces.
  return isIsoDate(dateStr.trim()) ? dateStr.trim() : '';
}
