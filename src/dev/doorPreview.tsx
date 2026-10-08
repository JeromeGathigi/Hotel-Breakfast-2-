import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import { DoorView, type AckStore } from '../door/DoorView';
import type { DoorData } from '../door/doorModel';
import type { DoorActions } from '../door/actions';
import type { CheckIn, DiningTable, Guest, MealServiceType } from '../types';
import type { RoomOverride } from '../lib/overrides';
import { DEFAULT_NOVOTEL_TABLES } from '../constants';
import { businessDate, addDays } from '../lib/businessDate';
import type { PackageIndex } from '../parsing/packageDetail';

/**
 * DEV-ONLY preview of the door screen. Served by the dev server at /dev/door-preview.html and never
 * part of the production build (vite builds index.html only). It imports nothing from Firebase:
 * every guest below is invented, plainly labelled, and lives in this page's memory.
 *
 * It exists so the signed-in door can be seen and clicked without signing in to the real project.
 */

const today = businessDate();
const yesterday = addDays(today, -1);

const g = (room: string, rate: string, over: Partial<Guest> = {}): Guest => ({
  roomNumber: room,
  guestName: `PREVIEW GUEST ${room}`,
  arrivalDate: yesterday,
  departureDate: addDays(today, 2),
  mealPlan: rate,
  rateCode: rate,
  adults: 2,
  children: 0,
  resvNameId: `P${room}`,
  hotelId: 'novotel',
  notes: [],
  ...over,
});

const guests: Guest[] = [
  g('101', 'RB1', { vipStatus: '3', notes: [{ text: 'PM : 2 : RB', type: 'RES' }] }),
  g('102', 'RA3S', { notes: [{ text: 'GA COMP BF AT 1,710+++ ON 30-31/8', type: 'RES' }] }),
  g('103', 'C01MRO', { adults: 3, blockCode: 'PREVIEWBLOCK' }),
  g('104', 'DSO', { notes: [{ text: 'GA RO AT 1,105+++ ON 2-3/9 MBREAK AT 400+++', type: 'RES' }] }),
  g('105', 'TGLL', { adults: 2, children: 1, blockCode: 'PREVIEWBLOCK', companyName: 'Preview Tours' }),
  g('106', 'TGLL', { blockCode: 'PREVIEWBLOCK', companyName: 'Preview Tours' }),
  g('107', 'RA1', { vipStatus: '0' }),
  g('108', '', { guestName: 'RESERVED / NO DETAILS', adults: 0, issueType: 'no-details' }),
  g('109', 'RA1', { adults: 0, issueType: 'no-adults', accompanyingGuests: ['PREVIEW SHARER 109'] }),
  g('110', 'RB1', { arrivalDate: today, vipStatus: '4' }),
  g('111', 'RB1', { vipStatus: '7', accompanyingGuests: ['PREVIEW COMPANION 111'], notes: [{ text: 'Late check-out requested', type: 'GEN' }] }),
  g('112', 'CREWESR', { adults: 1 }),
];

const packages: PackageIndex = {
  hotelId: 'novotel',
  reportDate: today,
  reservations: 7,
  byResv: {
    P101: { p: 'BF350NET', n: 2 },
    P102: { p: 'BFCOMP', n: 2 },
    P104: { p: 'MBREAK', n: 2 },
    P105: { p: 'BF', n: 3 },
    P106: { p: 'BF', n: 2 },
    P110: { p: 'BF350NET', n: 2 },
    P111: { p: 'BF350NET,DINNER', n: 2 },
    P112: { p: 'BF', n: 1 },
  },
};

const memoryAcks: AckStore = (() => {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
})();

function Preview() {
  const alertMode = new URLSearchParams(window.location.search).get('alerts') === '1';
  const [service, setService] = useState<MealServiceType>('breakfast');
  const [checkins, setCheckins] = useState<CheckIn[]>([
    { roomNumber: '111', guestName: 'PREVIEW GUEST 111', hotelId: 'novotel', date: today, timestamp: new Date(), mealService: 'breakfast', adultsAte: 1, childrenAte: 0, infantsAte: 0, recordedBy: 'preview@accor.com' },
  ]);
  const [overrides, setOverrides] = useState<RoomOverride[]>([]);
  const [tables, setTables] = useState<DiningTable[]>(DEFAULT_NOVOTEL_TABLES);

  const data: DoorData = useMemo(
    () => ({
      hotelId: 'novotel',
      today,
      guests,
      checkins,
      overrides,
      tables,
      metadata: null,
      packages,
      forecastToday: {
        source: 'package-forecast',
        date: today,
        dayOfWeek: '',
        hotelId: 'novotel',
        packages: {},
        // 12 confirms the list; 40 makes the discrepancy alert fire.
        totalBreakfast: alertMode ? 40 : 12,
        totalLunch: 0,
        totalDinner: 0,
        totalBreaks: 0,
        totalCovers: 0,
      },
      loading: false,
      errors: {},
    }),
    [checkins, overrides, tables, alertMode]
  );

  const actions: DoorActions = {
    async checkIn(input) {
      setCheckins((prev) => [
        ...prev.filter((c) => !(c.roomNumber === input.guest.roomNumber && (c.mealService ?? 'breakfast') === input.service)),
        {
          roomNumber: input.guest.roomNumber,
          guestName: input.guest.guestName,
          hotelId: 'novotel',
          date: today,
          timestamp: new Date(),
          mealService: input.service,
          adultsAte: input.adults,
          childrenAte: input.children,
          infantsAte: input.infants,
          recordedBy: 'preview@accor.com',
          tableNumber: input.table?.tableNumber ?? null,
          tableId: input.table?.id ?? null,
        },
      ]);
      if (input.table) {
        setTables((prev) => prev.map((t) => (t.id === input.table!.id ? { ...t, status: 'occupied', occupiedByRoom: input.guest.roomNumber, occupiedPax: input.adults + input.children + input.infants, occupiedSince: new Date().toISOString() } : t)));
      }
      return 'saved';
    },
    async undoCheckIn(guest, service) {
      setCheckins((prev) => prev.filter((c) => !(c.roomNumber === guest.roomNumber && (c.mealService ?? 'breakfast') === service)));
      return 'saved';
    },
    async saveCorrection(input) {
      setOverrides((prev) => [...prev.filter((o) => o.roomNumber !== input.roomNumber), { ...input, date: today, recordedBy: 'preview@accor.com', recordedAt: new Date().toISOString() }]);
      return 'saved';
    },
    async clearCorrection(guest) {
      setOverrides((prev) => prev.filter((o) => o.roomNumber !== guest.roomNumber));
      return 'saved';
    },
  };

  return (
    <div className="theme-novotel min-h-screen bg-background p-4 md:p-6 space-y-4">
      <div className="rounded-2xl border-2 border-dashed border-fuchsia-500 bg-fuchsia-50 p-3 text-sm text-fuchsia-950">
        <strong>DEV PREVIEW</strong> - invented guests, not connected to Firebase. {alertMode ? 'Alert mode: the forecast disagrees with the list.' : <a className="underline" href="?alerts=1">Show the discrepancy alert</a>}
      </div>
      <DoorView data={data} service={service} onServiceChange={setService} actions={actions} canManage onOpenImport={() => alert('Opens Opera import in the app.')} ackStore={memoryAcks} />
    </div>
  );
}

// A hot reload re-runs this module: reuse the root rather than create a second one on the same node.
const container = document.getElementById('root') as HTMLElement & { __previewRoot?: ReactDOM.Root };
container.__previewRoot ??= ReactDOM.createRoot(container);
container.__previewRoot.render(<Preview />);
