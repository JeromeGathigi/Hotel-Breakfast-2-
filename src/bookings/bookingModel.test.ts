import { describe, expect, it } from 'vitest';
import {
  BookingError,
  cancelBooking,
  changeBooking,
  createBooking,
  isLate,
  markLeft,
  markNoShow,
  restoreBooking,
  seatBooking,
  serviceForTime,
  summariseDay,
  tableClashes,
  waitingList,
  waitedMinutes,
  type Booking,
} from './bookingModel';

const host = (at = '2026-10-09T11:00:00.000Z') => ({ by: 'host@accor.com', at }); // 18:00 Bangkok
const day = '2026-10-09';

const reservation = (id: string, time: string, over: Partial<Parameters<typeof createBooking>[0]> = {}): Booking =>
  createBooking({ id, hotelId: 'novotel', kind: 'reservation', date: day, time, partySize: 4, name: 'PREVIEW FAMILY', ...over }, host());

const waiting = (id: string, at: string, party = 2): Booking =>
  createBooking({ id, hotelId: 'novotel', kind: 'waitlist', date: day, partySize: party, name: '', roomNumber: '512', quotedMinutes: 15 }, host(at));

describe('making a booking', () => {
  it('books a party for a time and service, recorded with who took it', () => {
    const b = reservation('a', '19:30', { notes: 'High chair', phone: ' 080 000 0000 ' });
    expect(b).toMatchObject({ status: 'booked', service: 'dinner', partySize: 4, time: '19:30', notes: 'High chair', phone: '080 000 0000', createdBy: 'host@accor.com' });
    expect(b.log).toEqual([{ at: host().at, by: 'host@accor.com', action: 'booked', details: '4 at 19:30 for dinner' }]);
  });

  it('guesses the service from the time, and lets the host say otherwise', () => {
    expect([serviceForTime('07:30'), serviceForTime('12:15'), serviceForTime('18:00')]).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(reservation('a', '11:30', { service: 'breakfast' }).service).toBe('breakfast');
  });

  it('refuses a booking with no time, no guests, or nobody to call it by', () => {
    expect(() => reservation('a', '')).toThrow(BookingError);
    expect(() => reservation('a', '25:00')).toThrow(/time/);
    expect(() => reservation('a', '19:00', { partySize: 0 })).toThrow(/at least one/);
    expect(() => reservation('a', '19:00', { name: ' ' })).toThrow(/name/);
    // An in-house room is enough on its own.
    expect(reservation('a', '19:00', { name: '', roomNumber: '305' }).name).toBe('Room 305');
  });

  it('puts walk-ins on the waiting list with the wait they were told', () => {
    const w = waiting('w', '2026-10-09T11:05:00.000Z');
    expect(w).toMatchObject({ kind: 'waitlist', status: 'waiting', time: null, quotedMinutes: 15, name: 'Room 512' });
    expect(w.log[0].details).toBe('2 waiting, told about 15 min');
  });
});

describe('the life of a booking', () => {
  it('seats a booking at a table, and puts it back if that was a mistake', () => {
    let b = seatBooking(reservation('a', '19:30'), { id: 't12', tableNumber: '12' }, host('2026-10-09T12:31:00.000Z'));
    expect(b).toMatchObject({ status: 'seated', tableId: 't12', tableNumber: '12', seatedAt: '2026-10-09T12:31:00.000Z' });
    expect(() => seatBooking(b, null, host())).toThrow(/Put it back/);
    b = restoreBooking(b, host());
    expect(b).toMatchObject({ status: 'booked', seatedAt: null });
    expect(b.log.map((e) => e.action)).toEqual(['booked', 'seated', 'restored']);
  });

  it('cancels only with a reason, and records a no-show', () => {
    const b = reservation('a', '19:30');
    expect(() => cancelBooking(b, ' ', host())).toThrow(/reason/);
    expect(cancelBooking(b, 'Guest cancelled', host())).toMatchObject({ status: 'cancelled', cancelReason: 'Guest cancelled' });
    expect(markNoShow(b, host()).status).toBe('no-show');
    expect(() => markNoShow(markNoShow(b, host()), host())).toThrow(/still to come/);
  });

  it('lets a waiting party leave, but not cancel; and a reservation cannot leave the queue', () => {
    const w = waiting('w', '2026-10-09T11:05:00.000Z');
    expect(markLeft(w, host()).status).toBe('left');
    expect(() => cancelBooking(w, 'Guest cancelled', host())).toThrow(/leaves it/);
    expect(() => markLeft(reservation('a', '19:00'), host())).toThrow(/waiting list/);
    expect(restoreBooking(markLeft(w, host()), host()).status).toBe('waiting');
  });

  it('records what changed, and nothing when nothing did', () => {
    const b = reservation('a', '19:30');
    expect(changeBooking(b, { time: '19:30', partySize: 4 }, host())).toBe(b);
    const c = changeBooking(b, { time: '20:00', partySize: 6, tableId: 't3', tableNumber: '3' }, host());
    expect(c).toMatchObject({ time: '20:00', partySize: 6, tableNumber: '3' });
    expect(c.log.at(-1)).toMatchObject({ action: 'changed', details: 'time 20:00, 6 guests, table 3' });
    expect(() => changeBooking(cancelBooking(b, 'Guest cancelled', host()), { partySize: 2 }, host())).toThrow(/Put it back/);
  });

  it('will not act for someone signed out', () => {
    expect(() => markNoShow(reservation('a', '19:00'), { by: '', at: host().at })).toThrow(/signed out/);
  });
});

describe('reading the day', () => {
  const now = new Date('2026-10-09T12:20:00.000Z'); // 19:20 in Bangkok

  it('flags a party more than 15 minutes late, in Bangkok time', () => {
    expect(isLate(reservation('a', '19:00'), now)).toBe(true);
    expect(isLate(reservation('a', '19:10'), now)).toBe(false);
    expect(isLate(seatBooking(reservation('a', '18:00'), null, host()), now)).toBe(false);
    expect(isLate(reservation('a', '09:00', { date: '2026-10-10' }), now)).toBe(false);
  });

  it('keeps the waiting list in the order parties joined, and times their wait', () => {
    const late = waiting('late', '2026-10-09T12:10:00.000Z');
    const early = waiting('early', '2026-10-09T11:55:00.000Z');
    expect(waitingList([late, early, markLeft(waiting('gone', '2026-10-09T11:00:00.000Z'), host())]).map((b) => b.id)).toEqual(['early', 'late']);
    expect(waitedMinutes(early, now)).toBe(25);
  });

  it('warns when one table is booked twice within a sitting', () => {
    const a = reservation('a', '19:00', { tableId: 't12', tableNumber: '12' });
    const b = reservation('b', '20:00', { tableId: 't12', tableNumber: '12' });
    const c = reservation('c', '20:30', { tableId: 't12', tableNumber: '12' });
    expect(tableClashes([a, b, c], b).map((x) => x.id)).toEqual(['a', 'c']);
    expect(tableClashes([a, b, c], { ...b, time: '21:00' }).map((x) => x.id)).toEqual(['c']);
    expect(tableClashes([cancelBooking(a, 'Guest cancelled', host()), b], b)).toEqual([]);
  });

  it('sums the day: covers by half hour, still to arrive, late, seated and waiting', () => {
    const s = summariseDay(
      [
        reservation('a', '19:00'),
        reservation('b', '19:15', { partySize: 2 }),
        seatBooking(reservation('c', '18:30', { partySize: 3 }), null, host()),
        markNoShow(reservation('d', '18:00'), host()),
        cancelBooking(reservation('e', '20:00'), 'Guest cancelled', host()),
        waiting('w', '2026-10-09T12:05:00.000Z', 3),
      ],
      now
    );
    expect(s).toMatchObject({ reservations: 3, covers: 9, toArrive: 2, late: 1, seated: 1, noShows: 1, cancelled: 1, waiting: 1, longestWaitMinutes: 15 });
    expect(s.coversBySlot).toEqual([
      { slot: '18:30', covers: 3 },
      { slot: '19:00', covers: 6 },
    ]);
  });
});
