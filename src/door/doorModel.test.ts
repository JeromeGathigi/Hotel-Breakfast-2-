import { describe, it, expect } from 'vitest';
import { buildDoorRooms, doorStats, reconcile, searchRooms, type DoorData } from './doorModel';
import { checkinDocId } from '../lib/checkins';
import type { CheckIn, Guest, MealForecastItem } from '../types';

const TODAY = '2026-09-02';

const guest = (room: string, rate: string, over: Partial<Guest> = {}): Guest => ({
  roomNumber: room,
  guestName: `GUEST ${room}`,
  arrivalDate: '2026-09-01',
  departureDate: '2026-09-04',
  mealPlan: rate,
  rateCode: rate,
  adults: 2,
  children: 0,
  resvNameId: `R${room}`,
  hotelId: 'novotel',
  ...over,
});

const checkin = (room: string, service: CheckIn['mealService'] = 'breakfast', adults = 2): CheckIn => ({
  roomNumber: room, guestName: 'G', hotelId: 'novotel', date: TODAY, timestamp: null, mealService: service,
  adultsAte: adults, childrenAte: 0, infantsAte: 0, recordedBy: 'h@accor.com',
});

function data(over: Partial<DoorData> = {}): DoorData {
  return {
    hotelId: 'novotel', today: TODAY, guests: [], checkins: [], overrides: [], tables: [],
    metadata: null, packages: null, forecastToday: null, loading: false, errors: {}, ...over,
  };
}

describe('check-ins are per meal service', () => {
  it('keeps breakfast ids unchanged and gives lunch and dinner their own', () => {
    expect(checkinDocId('301', 'breakfast')).toBe('301');
    expect(checkinDocId('301', 'dinner')).toBe('301~dinner');
  });

  it('a breakfast check-in does not mark the room as checked in for dinner', () => {
    const d = data({ guests: [guest('301', 'RB1')], checkins: [checkin('301', 'breakfast')] });
    expect(buildDoorRooms(d, 'breakfast')[0].checkIn).not.toBeNull();
    expect(buildDoorRooms(d, 'dinner')[0].checkIn).toBeNull();
  });

  it('reads legacy check-ins without a service as breakfast', () => {
    const legacy = { ...checkin('301'), mealService: undefined as unknown as CheckIn['mealService'] };
    expect(buildDoorRooms(data({ guests: [guest('301', 'RB1')], checkins: [legacy] }), 'breakfast')[0].checkIn).not.toBeNull();
  });
});

describe('doorStats', () => {
  const rooms = buildDoorRooms(
    data({
      guests: [
        guest('101', 'RB1'), // breakfast
        guest('102', 'RA1', { adults: 1 }), // room only
        guest('103', 'C01MRO', { adults: 3 }), // needs checking
        guest('104', 'RB1', { arrivalDate: TODAY }), // arrives today
        guest('105', 'RA1', { adults: 0, issueType: 'no-adults' }), // data issue
      ],
      checkins: [checkin('101')],
    }),
    'breakfast'
  );
  const s = doorStats(rooms, 'breakfast');

  it('splits the house the way the spec stats bar does, with the unverified bucket kept apart', () => {
    expect(s).toMatchObject({ totalRooms: 5, roomOnlyRooms: 2 });
    expect(s.breakfast).toEqual({ rooms: 2, pax: 4 });
    expect(s.needsChecking).toMatchObject({ rooms: 1, pax: 3, codes: ['C01MRO'] });
    expect(s.dataIssues).toEqual({ noAdults: 1, noDetails: 0 });
  });

  it("expects this morning's covers only, and counts what is still to come", () => {
    // 101 (2) + 103 (3, unverified, served at the door) - 104 arrived today.
    expect(s.expectedToday).toBe(5);
    expect(s.checkedIn).toEqual({ rooms: 1, pax: 2 });
    expect(s.remaining).toEqual({ rooms: 1, pax: 3 });
  });
});

describe('reconcile', () => {
  const forecast = (n: number): MealForecastItem => ({
    source: 'package-forecast', date: TODAY, dayOfWeek: 'Wed', hotelId: 'novotel', packages: {},
    totalBreakfast: n, totalLunch: 0, totalDinner: 0, totalBreaks: 0, totalCovers: n,
  });
  const rooms = buildDoorRooms(data({ guests: Array.from({ length: 20 }, (_, i) => guest(String(101 + i), 'RB1')) }), 'breakfast');

  it('is quiet when Opera and the list agree within the threshold', () => {
    expect(reconcile(rooms, forecast(38)).level).toBe('ok');
  });

  it('alerts when Opera expects far more than the list can account for', () => {
    const r = reconcile(rooms, forecast(60));
    expect(r.level).toBe('alert');
    expect(r.message).toMatch(/Opera expects 60 .* only 40/);
  });

  it('alerts when the list confirms far more than Opera expects', () => {
    expect(reconcile(rooms, forecast(20)).message).toMatch(/confirms 40 .* only 20/);
  });

  it('says so when there is nothing to compare against - including a legacy forecast', () => {
    expect(reconcile(rooms, null).level).toBe('unavailable');
    expect(reconcile(rooms, { ...forecast(40), source: undefined }).level).toBe('unavailable');
  });
});

describe('searchRooms', () => {
  const rooms = buildDoorRooms(
    data({ guests: [guest('110', 'RB1'), guest('101', 'RB1'), guest('210', 'RB1', { companyName: 'ACME 10' }), guest('10', 'RB1')] }),
    'breakfast'
  );

  it('puts the exact room first, then rooms that start with the query', () => {
    expect(searchRooms(rooms, '10').map((r) => r.guest.roomNumber)).toEqual(['10', '101', '110', '210']);
  });

  it('matches names and companies too', () => {
    expect(searchRooms(rooms, 'acme').map((r) => r.guest.roomNumber)).toEqual(['210']);
  });
});
