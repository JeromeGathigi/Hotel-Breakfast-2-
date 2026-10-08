import { useEffect, useState } from 'react';
import { collection, db, doc, onSnapshot } from '../firebase';
import type { CheckIn, DiningTable, Guest, MealForecastItem, ReportMetadata } from '../types';
import type { RoomOverride } from '../lib/overrides';
import type { PackageIndex } from '../parsing/packageDetail';
import type { DoorData } from './doorModel';

type StreamKey = keyof DoorData['errors'];

/**
 * Live Firestore data for the door, for one hotel and one business date.
 *
 * Every subscription reports its own error. Before, none of them had an error handler: a refused
 * read left the skeletons spinning forever, which reads as "still loading" rather than "cannot load".
 * `today` is a dependency, so the check-in subscription moves to the new day at the 04:00 rollover
 * instead of watching yesterday's key all morning.
 */
export function useDoorData(hotelId: string, today: string): DoorData {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [overrides, setOverrides] = useState<RoomOverride[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [metadata, setMetadata] = useState<ReportMetadata | null>(null);
  const [packages, setPackages] = useState<PackageIndex | null>(null);
  const [forecastToday, setForecastToday] = useState<MealForecastItem | null>(null);
  const [guestsLoaded, setGuestsLoaded] = useState(false);
  const [errors, setErrors] = useState<DoorData['errors']>({});

  useEffect(() => {
    setGuestsLoaded(false);
    setErrors({});
    const fail = (key: StreamKey) => (err: { message?: string; code?: string }) => {
      console.error(`Door stream "${key}" failed:`, err);
      setErrors((prev) => ({
        ...prev,
        [key]: err?.code === 'permission-denied' ? 'you do not have permission to read this' : err?.message || 'could not be read',
      }));
      if (key === 'guests') setGuestsLoaded(true);
    };
    const ok = (key: StreamKey) => setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

    const unsubs = [
      onSnapshot(
        collection(db, 'hotels', hotelId, 'guests'),
        (snap) => {
          setGuests(snap.docs.map((d) => d.data() as Guest));
          setGuestsLoaded(true);
          ok('guests');
        },
        fail('guests')
      ),
      onSnapshot(
        collection(db, 'hotels', hotelId, 'checkins', today, 'rooms'),
        (snap) => {
          setCheckins(snap.docs.map((d) => d.data() as CheckIn));
          ok('checkins');
        },
        fail('checkins')
      ),
      onSnapshot(
        collection(db, 'hotels', hotelId, 'overrides'),
        (snap) => {
          setOverrides(snap.docs.map((d) => d.data() as RoomOverride));
          ok('overrides');
        },
        fail('overrides')
      ),
      onSnapshot(
        collection(db, 'hotels', hotelId, 'tables'),
        (snap) => {
          setTables(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DiningTable));
          ok('tables');
        },
        fail('tables')
      ),
      onSnapshot(
        doc(db, 'hotels', hotelId, 'metadata', 'reports'),
        (snap) => {
          setMetadata(snap.exists() ? (snap.data() as ReportMetadata) : null);
          ok('metadata');
        },
        fail('metadata')
      ),
      onSnapshot(
        doc(db, 'hotels', hotelId, 'metadata', 'packages'),
        (snap) => {
          setPackages(snap.exists() ? (snap.data() as PackageIndex) : null);
          ok('packages');
        },
        fail('packages')
      ),
      onSnapshot(
        doc(db, 'hotels', hotelId, 'forecasts', today),
        (snap) => {
          setForecastToday(snap.exists() ? (snap.data() as MealForecastItem) : null);
          ok('forecast');
        },
        fail('forecast')
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [hotelId, today]);

  return {
    hotelId,
    today,
    guests,
    checkins,
    overrides,
    tables,
    metadata,
    packages,
    forecastToday,
    loading: !guestsLoaded,
    errors,
  };
}
