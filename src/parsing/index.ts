import { Guest, MealForecastItem } from '../types';

export interface Anomaly {
  roomNumber: string;
  guestName: string;
  type: 'no-adults' | 'over-capacity' | 'unentitled' | 'missing-dates';
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
  };
}

export function parseInHouseReport(rawText: string, defaultHotelId: string = 'novotel'): ParseResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const roomsMap = new Map<string, Guest>();
  const forecastsMap = new Map<string, MealForecastItem>();
  const anomalies: Anomaly[] = [];

  let detectedHotel: 'novotel' | 'ibis' | 'both' = defaultHotelId === 'ibis' ? 'ibis' : 'novotel';
  let isForecastSection = false;
  let isGuestSection = false;
  let headers: string[] = [];

  // Detect report content
  for (const line of lines) {
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

  // Parse TSV rows
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cells = line.split('\t').map((c) => c.trim().replace(/^["']|["']$/g, ''));

    // Check for header rows
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

      const rawRoom = rowObj['ROOM'] || rowObj['ROOM1'] || '';
      const guestName = rowObj['GUEST_NAME'] || rowObj['FULL_NAME'] || rowObj['DISPLAY_NAME'] || '';
      if (!guestName || guestName.startsWith('LOGO') || guestName.startsWith('SUM_')) continue;

      // Extract details
      const roomNum = rawRoom.trim() || 'UNASSIGNED';
      const adults = parseInt(rowObj['ADULTS'] || rowObj['ADULTS1'] || '1', 10) || 1;
      const children = parseInt(rowObj['CHILDREN'] || rowObj['CHILDREN1'] || '0', 10) || 0;
      const arrival = formatOperaDateToIso(rowObj['ARRIVAL'] || rowObj['TRUNC_ARRIVAL'] || rowObj['STAY_DATE1'] || '');
      const departure = formatOperaDateToIso(rowObj['DEPARTURE'] || rowObj['TRUNC_DEPARTURE'] || '');
      const rateCode = rowObj['RATE_CODE'] || '';
      const products = rowObj['PRODUCTS'] || rowObj['PRODUCT_ID'] || '';
      const vip = rowObj['VIP'] || null;
      const company = rowObj['COMPANY_NAME'] || '';
      const resvNameId = rowObj['RESV_NAME_ID'] || rowObj['NUMBER1'] || `RES-${Math.random().toString(36).substring(2, 7)}`;
      const specialReq = rowObj['SPECIAL_REQUESTS'] || rowObj['SP_REQUEST'] || '';
      const preferences = rowObj['PREFERENCES'] || rowObj['PREFERENCE'] || '';
      const resortCode = rowObj['RESORT'] || '';
      const rowHotel = resortCode === 'HB9U9' ? 'ibis' : resortCode === 'HB4F8' ? 'novotel' : defaultHotelId;

      // Meal plan synthesis
      let mealPlan = rateCode;
      if (products) {
        mealPlan = `${rateCode ? rateCode + ' • ' : ''}${products}`;
      } else if (rowObj['PACKAGES']) {
        mealPlan = rowObj['PACKAGES'];
      }

      const isShare = rowObj['IS_SHARED_YN'] === 'Y';
      const accompanying = (rowObj['ACCOMPANYING_NAMES'] || rowObj['SHARE_NAMES'] || '')
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean);

      // Check anomalies
      let issueType: Guest['issueType'] = null;
      if (adults === 0) {
        issueType = 'no-adults';
        anomalies.push({
          roomNumber: roomNum,
          guestName,
          type: 'no-adults',
          message: `Room ${roomNum} has 0 adults registered.`,
        });
      }

      const existingGuest = roomsMap.get(roomNum);
      if (existingGuest && !isShare) {
        // If already exists and has extra occupant
        existingGuest.accompanyingGuests = Array.from(
          new Set([...(existingGuest.accompanyingGuests || []), guestName])
        );
      } else {
        roomsMap.set(roomNum, {
          roomNumber: roomNum,
          guestName,
          arrivalDate: arrival || '2026-08-28',
          departureDate: departure || '2026-08-30',
          mealPlan: mealPlan || 'Room & Breakfast (RB)',
          adults,
          children,
          resvNameId,
          accompanyingGuests: accompanying,
          vipStatus: vip,
          vipLevel: vip,
          issueType,
          hotelId: rowHotel,
          companyName: company,
          rateCode,
          specialRequests: specialReq,
          preferences,
          lastUpdated: new Date().toISOString(),
        });
      }
    }
  }

  const roomsList = Array.from(roomsMap.values());
  const forecastList = Array.from(forecastsMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  let totalBreakfast = 0;
  let totalDinner = 0;
  roomsList.forEach((r) => {
    totalBreakfast += (r.adults || 1) + (r.children || 0);
    if (r.mealPlan.toUpperCase().includes('DINN')) {
      totalDinner += (r.adults || 1) + (r.children || 0);
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
    },
  };
}

function formatOperaDateToIso(dateStr: string): string {
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
