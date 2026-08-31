import { Guest, MealForecastItem } from '../types';

export interface Anomaly {
  roomNumber: string;
  guestName: string;
  type: 'no-adults' | 'over-capacity' | 'unentitled' | 'missing-dates' | 'no-details' | 'corrupted-record';
  message: string;
}

export interface ParseResult {
  reportType: 'in-house' | 'forecast' | 'combined';
  hotelId: 'novotel' | 'ibis' | 'both';
  rooms: Guest[];
  forecasts: MealForecastItem[];
  anomalies: Anomaly[];
  stats: {
    totalRooms: number;
    totalGuests: number;
    totalBreakfastPax: number;
    totalDinnerPax: number;
    anomaliesCount: number;
    forecastDaysCount: number;
    discardedRecordsCount?: number;
  };
}

export function parseInHouseReport(rawText: string, defaultHotelId: string = 'novotel'): ParseResult {
  // Discard only lines that are completely empty once tabs and spaces are removed
  const rawLines = rawText
    .split(/\r?\n/)
    .filter((l) => l.replace(/\t/g, '').trim().length > 0);

  const roomsMap = new Map<string, Guest>();
  const forecastsMap = new Map<string, MealForecastItem>();
  const anomalies: Anomaly[] = [];

  let detectedHotel: 'novotel' | 'ibis' | 'both' = defaultHotelId === 'ibis' ? 'ibis' : 'novotel';
  let discardedRecordsCount = 0;

  // Detect report hotel property
  for (const line of rawLines) {
    if (line.includes('HB4F8') && line.includes('HB9U9')) {
      detectedHotel = 'both';
    } else if (line.includes('HB4F8') || line.includes('Novotel')) {
      if (detectedHotel === 'ibis') detectedHotel = 'both';
      else detectedHotel = 'novotel';
    } else if (line.includes('HB9U9') || line.includes('ibis')) {
      if (detectedHotel === 'novotel') detectedHotel = 'both';
      else detectedHotel = 'ibis';
    }
  }

  // Pre-pass: Join multi-line continuation records and handle trailing omitted columns
  const records: string[][] = [];
  let currentExpectedFields = 0;
  let buffer: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const cells = line.split('\t').map((c) => c.trim().replace(/^["']|["']$/g, ''));

    const isGuestHeader = cells.includes('ROOM') && (cells.includes('GUEST_NAME') || cells.includes('FULL_NAME'));
    const isForecastHeader = cells.includes('STAY_DATE') && cells.includes('PRODUCT_ID');
    const isAltGuestHeader = cells.includes('PRODUCT_ID1') && cells.includes('GUEST_NAME');

    if (isGuestHeader || isForecastHeader || isAltGuestHeader) {
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

  let isForecastSection = false;
  let isGuestSection = false;
  let headers: string[] = [];

  // Main processing pass over normalized records
  for (let i = 0; i < records.length; i++) {
    const cells = records[i];

    // Check for section headers
    if (cells.includes('ROOM') && (cells.includes('GUEST_NAME') || cells.includes('FULL_NAME'))) {
      headers = cells;
      isGuestSection = true;
      isForecastSection = false;
      continue;
    }

    if (cells.includes('STAY_DATE') && cells.includes('PRODUCT_ID')) {
      headers = cells;
      isForecastSection = true;
      isGuestSection = false;
      continue;
    }

    if (cells.includes('PRODUCT_ID1') && cells.includes('GUEST_NAME')) {
      headers = cells;
      isGuestSection = true;
      isForecastSection = false;
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

    // Process Forecast row
    if (isForecastSection && cells.length >= 4 && cells[0].match(/\d{2}-[A-Z]{3}-\d{2}/i)) {
      const stayDate = formatOperaDateToIso(cells[0]);
      const dayOfWeek = cells[2] || '';
      const productId = cells[3] || 'BF';
      const pkgsCount = parseInt(cells[8] || cells[4] || '1', 10) || 1;

      if (stayDate) {
        let item = forecastsMap.get(stayDate);
        if (!item) {
          item = {
            date: stayDate,
            dayOfWeek,
            hotelId: defaultHotelId,
            packages: {},
            totalBreakfast: 0,
            totalLunch: 0,
            totalDinner: 0,
            totalBreaks: 0,
            totalCovers: 0,
          };
          forecastsMap.set(stayDate, item);
        }

        item.packages[productId] = (item.packages[productId] || 0) + pkgsCount;
        item.totalCovers += pkgsCount;

        const prodUpper = productId.toUpperCase();
        if (prodUpper.includes('DINN') || prodUpper.includes('DIN')) {
          item.totalDinner += pkgsCount;
        } else if (prodUpper.includes('MBREAK') || prodUpper.includes('MBUFF')) {
          item.totalBreaks += pkgsCount;
        } else if (prodUpper.includes('LUNCH')) {
          item.totalLunch += pkgsCount;
        } else {
          item.totalBreakfast += pkgsCount;
        }
      }
      continue;
    }

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

      const roomNum = rawRoom;
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
      const resortCode = rowObj['RESORT'] || '';
      const rowHotel = resortCode === 'HB9U9' ? 'ibis' : resortCode === 'HB4F8' ? 'novotel' : defaultHotelId;
      const resvNameId = rowObj['RESV_NAME_ID'] || rowObj['NUMBER1'] || `${rowHotel}-${roomNum}`;
      const specialReq = rowObj['SPECIAL_REQUESTS'] || rowObj['SP_REQUEST'] || '';
      const preferences = rowObj['PREFERENCES'] || rowObj['PREFERENCE'] || '';

      // Meal plan synthesis
      let mealPlan = rateCode;
      if (products) {
        mealPlan = `${rateCode ? rateCode + ' • ' : ''}${products}`;
      } else if (rowObj['PACKAGES']) {
        mealPlan = rowObj['PACKAGES'];
      }
      if (isBlankDetails && !mealPlan) {
        mealPlan = 'Room Only (No Details)';
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

      const existingGuest = roomsMap.get(roomNum);

      if (!existingGuest) {
        // Room not yet in map -> insert
        const guestObj: Guest = {
          roomNumber: roomNum,
          guestName,
          arrivalDate: arrival,
          departureDate: departure,
          mealPlan: mealPlan || 'Room & Breakfast (RB)',
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
          specialRequests: specialReq,
          preferences,
          lastUpdated: new Date().toISOString(),
        };
        roomsMap.set(roomNum, guestObj);
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
  const forecastList = Array.from(forecastsMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  let totalBreakfast = 0;
  let totalDinner = 0;
  roomsList.forEach((r) => {
    totalBreakfast += (r.adults || 0) + (r.children || 0);
    if (r.mealPlan && r.mealPlan.toUpperCase().includes('DINN')) {
      totalDinner += (r.adults || 0) + (r.children || 0);
    }
  });

  return {
    reportType: forecastList.length > 0 && roomsList.length > 0 ? 'combined' : forecastList.length > 0 ? 'forecast' : 'in-house',
    hotelId: detectedHotel,
    rooms: roomsList,
    forecasts: forecastList,
    anomalies,
    stats: {
      totalRooms: roomsList.length,
      totalGuests: roomsList.reduce((acc, r) => acc + (r.adults || 0) + (r.children || 0), 0),
      totalBreakfastPax: totalBreakfast,
      totalDinnerPax: totalDinner,
      anomaliesCount: anomalies.length,
      forecastDaysCount: forecastList.length,
      discardedRecordsCount,
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
    const month = months[monthStr] || '08';
    return `${year}-${month}-${day}`;
  }

  // Handle DD-MM-YY (e.g. 28-08-26)
  const numMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (numMatch) {
    const day = numMatch[1].padStart(2, '0');
    const month = numMatch[2].padStart(2, '0');
    let year = numMatch[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  return dateStr;
}
