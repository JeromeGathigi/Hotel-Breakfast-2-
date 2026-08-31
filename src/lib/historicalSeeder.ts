import { db, doc, writeBatch, collection, getDocs, deleteDoc } from '../firebase';
import { businessDate } from './businessDate';
import { DailySummary, MealForecastItem, CheckIn } from '../types';

const SAMPLE_FIRST_NAMES = [
  'Liam', 'Emma', 'Oliver', 'Ava', 'William', 'Sophia', 'James', 'Isabella', 
  'Benjamin', 'Mia', 'Lucas', 'Charlotte', 'Henry', 'Amelia', 'Alexander', 'Harper',
  'Kenji', 'Yuki', 'Somchai', 'Ploy', 'Anong', 'Wee', 'Chen', 'Wei', 'Mei', 
  'Koon Mui', 'Siti', 'Ahmad', 'Hans', 'Greta', 'Pierre', 'Camille', 'Marco', 'Elena'
];

const SAMPLE_LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Tanaka', 'Sato', 'Watanabe', 'Prasert', 'Charoen',
  'Wong', 'Tan', 'Lim', 'Mueller', 'Dubois', 'Rossi', 'Silva', 'Taylor', 'Anderson'
];

const NOVOTEL_ROOMS = [
  '101', '102', '103', '104', '105', '106', '107', '108', '109', '110',
  '201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212', '215', '218',
  '301', '302', '303', '304', '305', '306', '307', '308', '309', '310', '312', '315', '320', '331',
  '401', '402', '403', '404', '405', '406', '407', '408', '409', '410', '412', '415', '420',
  '501', '502', '503', '504', '505', '506', '507', '508', '509', '510', '512', '515', '520'
];

const IBIS_ROOMS = [
  '101', '102', '103', '104', '105', '106', '107', '108', '109', '110',
  '201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212', '215',
  '301', '302', '303', '304', '305', '306', '307', '308', '309', '310', '312', '315',
  '401', '402', '403', '404', '405', '406', '407', '408', '409', '410', '412', '415'
];

const VIP_LEVELS = ['VIP1', 'VIP2', 'Diamond', 'Platinum', 'Gold', null, null, null, null, null];

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomName(): string {
  return `${randomChoice(SAMPLE_LAST_NAMES)}, ${randomChoice(SAMPLE_FIRST_NAMES)}`;
}

// Generate an ISO date string for N days ago
export function getDateNDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDayOfWeekName(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

export function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

export interface SeedHistoricalOptions {
  hotelIds?: ('novotel' | 'ibis')[];
  daysCount?: number; // default 30
  onProgress?: (progress: { current: number; total: number; date: string; hotelId: string }) => void;
}

export interface SeedHistoricalResult {
  daysGenerated: number;
  totalCheckins: number;
  totalCovers: number;
  hotels: string[];
  startDate: string;
  endDate: string;
}

/**
 * Generates high-fidelity historical data including daily forecasts,
 * room check-in transactions with realistic peak hours, and pre-computed daily summaries.
 * Flags all generated records with isSynthetic: true and syntheticSource: 'historicalSeeder'.
 */
export async function seedHistoricalData(options: SeedHistoricalOptions = {}): Promise<SeedHistoricalResult> {
  const hotelIds = options.hotelIds || ['novotel', 'ibis'];
  const daysCount = options.daysCount || 30;
  const onProgress = options.onProgress;

  const todayStr = businessDate();
  let totalCheckinsCount = 0;
  let totalCoversCount = 0;

  const datesToGenerate: string[] = [];
  for (let i = daysCount; i >= 1; i--) {
    const dStr = getDateNDaysAgo(i);
    if (dStr <= todayStr) {
      datesToGenerate.push(dStr);
    }
  }

  const totalSteps = datesToGenerate.length * hotelIds.length;
  let stepIndex = 0;

  for (const dateStr of datesToGenerate) {
    const weekend = isWeekend(dateStr);
    const dayOfWeek = getDayOfWeekName(dateStr);

    for (const hotelId of hotelIds) {
      stepIndex++;
      if (onProgress) {
        onProgress({
          current: stepIndex,
          total: totalSteps,
          date: dateStr,
          hotelId
        });
      }

      const isNovotel = hotelId === 'novotel';
      const availableRooms = isNovotel ? NOVOTEL_ROOMS : IBIS_ROOMS;

      // Base capacity & forecast
      const baseForecast = isNovotel 
        ? (weekend ? 140 + Math.floor(Math.random() * 40) : 85 + Math.floor(Math.random() * 35))
        : (weekend ? 85 + Math.floor(Math.random() * 25) : 55 + Math.floor(Math.random() * 20));

      const dinnerForecast = isNovotel
        ? (weekend ? 18 + Math.floor(Math.random() * 12) : 8 + Math.floor(Math.random() * 8))
        : (weekend ? 6 + Math.floor(Math.random() * 6) : 2 + Math.floor(Math.random() * 4));

      const forecastItem: MealForecastItem = {
        date: dateStr,
        dayOfWeek,
        hotelId,
        packages: {
          BF: Math.round(baseForecast * 0.6),
          BF350NET: Math.round(baseForecast * 0.3),
          BFCOMP: Math.round(baseForecast * 0.1),
          DINNER: dinnerForecast
        },
        totalBreakfast: baseForecast,
        totalLunch: Math.floor(baseForecast * 0.1),
        totalDinner: dinnerForecast,
        totalBreaks: Math.floor(Math.random() * 8),
        totalCovers: baseForecast + dinnerForecast,
        roomsOccupied: Math.round(baseForecast * 0.65),
        adultsInHouse: Math.round(baseForecast * 0.85),
        childrenInHouse: Math.round(baseForecast * 0.15),
        isSynthetic: true,
        syntheticSource: 'historicalSeeder',
      };

      // Generate checkins for this day
      // Attendance rate is typically 88% - 98% of forecast
      const captureRate = 0.88 + Math.random() * 0.10;
      const targetPax = Math.round(baseForecast * captureRate);
      
      const checkinBatch = writeBatch(db);
      const forecastRef = doc(db, 'hotels', hotelId, 'forecasts', dateStr);
      checkinBatch.set(forecastRef, forecastItem);

      let currentPax = 0;
      const shuffledRooms = [...availableRooms].sort(() => Math.random() - 0.5);
      const hourlyMap: Record<string, number> = {
        '06:00': 0, '07:00': 0, '08:00': 0, '09:00': 0, '10:00': 0, '11:00': 0, '12:00': 0
      };

      let adultsSum = 0;
      let childrenSum = 0;
      let infantsSum = 0;
      let vipPaxCount = 0;
      let roomCount = 0;

      for (const roomNum of shuffledRooms) {
        if (currentPax >= targetPax) break;

        const isFamily = Math.random() < 0.28;
        const isCouple = !isFamily && Math.random() < 0.60;
        const adults = isFamily ? 2 : isCouple ? 2 : 1;
        const children = isFamily ? (Math.random() < 0.5 ? 1 : 2) : 0;
        const infants = isFamily && Math.random() < 0.2 ? 1 : 0;
        const totalRoomPax = adults + children + infants;

        const vip = randomChoice(VIP_LEVELS);
        if (vip) vipPaxCount += totalRoomPax;

        // Peak hour distribution
        // Weekdays: 06:30 - 09:30 peak
        // Weekends: 08:00 - 11:00 peak
        let hour: number;
        let minute: number = Math.floor(Math.random() * 60);

        if (weekend) {
          const rand = Math.random();
          if (rand < 0.10) hour = 6;
          else if (rand < 0.25) hour = 7;
          else if (rand < 0.55) hour = 8;
          else if (rand < 0.80) hour = 9;
          else if (rand < 0.95) hour = 10;
          else hour = 11;
        } else {
          const rand = Math.random();
          if (rand < 0.15) hour = 6;
          else if (rand < 0.45) hour = 7;
          else if (rand < 0.75) hour = 8;
          else if (rand < 0.92) hour = 9;
          else hour = 10;
        }

        const hourSlot = `${hour.toString().padStart(2, '0')}:00`;
        if (hourlyMap[hourSlot] !== undefined) {
          hourlyMap[hourSlot] += totalRoomPax;
        }

        const checkinDateObj = new Date(`${dateStr}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+07:00`);
        const tableNum = isNovotel 
          ? `T-${(Math.floor(Math.random() * 25) + 1).toString().padStart(2, '0')}`
          : `IB-${(Math.floor(Math.random() * 18) + 1).toString().padStart(2, '0')}`;

        const checkinRecord: CheckIn = {
          roomNumber: roomNum,
          guestName: getRandomName(),
          hotelId,
          date: dateStr,
          timestamp: checkinDateObj.toISOString(),
          mealService: 'breakfast',
          adultsAte: adults,
          childrenAte: children,
          infantsAte: infants,
          recordedBy: 'system-historical-seeder',
          tableNumber: tableNum,
          isSynthetic: true,
          syntheticSource: 'historicalSeeder',
        };

        const checkinDocRef = doc(db, 'hotels', hotelId, 'checkins', dateStr, 'rooms', roomNum);
        checkinBatch.set(checkinDocRef, checkinRecord);

        currentPax += totalRoomPax;
        adultsSum += adults;
        childrenSum += children;
        infantsSum += infants;
        roomCount++;
      }

      // Pre-compute and write Daily Summary rollup
      let maxHour = '08:00';
      let maxPax = 0;
      for (const [h, count] of Object.entries(hourlyMap)) {
        if (count > maxPax) {
          maxPax = count;
          maxHour = h;
        }
      }

      const dailySummary: DailySummary = {
        date: dateStr,
        hotelId,
        totalBreakfastPax: currentPax,
        totalLunchPax: 0,
        totalDinnerPax: dinnerForecast,
        totalCovers: currentPax + dinnerForecast,
        roomsAttended: roomCount,
        forecastCovers: baseForecast + dinnerForecast,
        captureRatePercent: Math.round((currentPax / baseForecast) * 100),
        vipPax: vipPaxCount,
        hourlyBreakdown: hourlyMap,
        paxBreakdown: {
          adults: adultsSum,
          children: childrenSum,
          infants: infantsSum
        },
        peakHour: maxHour,
        updatedAt: new Date().toISOString(),
        isSynthetic: true,
        syntheticSource: 'historicalSeeder',
      };

      const summaryRef = doc(db, 'hotels', hotelId, 'daily_summaries', dateStr);
      checkinBatch.set(summaryRef, dailySummary);

      await checkinBatch.commit();

      totalCheckinsCount += roomCount;
      totalCoversCount += currentPax;
    }
  }

  return {
    daysGenerated: datesToGenerate.length,
    totalCheckins: totalCheckinsCount,
    totalCovers: totalCoversCount,
    hotels: hotelIds,
    startDate: datesToGenerate[0] || todayStr,
    endDate: datesToGenerate[datesToGenerate.length - 1] || todayStr
  };
}

/**
 * Safely purges only synthetic records generated by the seeder for a given hotelId.
 */
export async function deleteSyntheticHistoricalData(hotelId: string): Promise<{
  deletedSummaries: number;
  deletedForecasts: number;
}> {
  let deletedSummaries = 0;
  let deletedForecasts = 0;

  try {
    // 1. Delete synthetic daily summaries
    const summariesRef = collection(db, 'hotels', hotelId, 'daily_summaries');
    const sumSnap = await getDocs(summariesRef);
    const summaryDates: string[] = [];

    const sumBatch = writeBatch(db);
    sumSnap.docs.forEach((d) => {
      const data = d.data() as DailySummary;
      if (data.isSynthetic || data.syntheticSource === 'historicalSeeder') {
        sumBatch.delete(d.ref);
        summaryDates.push(d.id);
        deletedSummaries++;
      }
    });
    if (deletedSummaries > 0) {
      await sumBatch.commit();
    }

    // 2. Delete synthetic forecasts
    const forecastRef = collection(db, 'hotels', hotelId, 'forecasts');
    const forecastSnap = await getDocs(forecastRef);
    const forecastBatch = writeBatch(db);
    forecastSnap.docs.forEach((d) => {
      const data = d.data() as MealForecastItem;
      if (data.isSynthetic || data.syntheticSource === 'historicalSeeder') {
        forecastBatch.delete(d.ref);
        deletedForecasts++;
      }
    });
    if (deletedForecasts > 0) {
      await forecastBatch.commit();
    }
  } catch (err) {
    console.warn('Error purging synthetic historical data:', err);
    throw err;
  }

  return { deletedSummaries, deletedForecasts };
}
