import { useEffect, useState } from 'react';
import { businessDate } from '../lib/businessDate';

/**
 * The current business date, re-evaluated every 30 seconds.
 *
 * Screens used to compute `businessDate()` once, inside a mount effect. A door tablet left open
 * overnight therefore kept listening to YESTERDAY's check-ins after the 04:00 rollover: new
 * check-ins were written under today's key (computed at write time) but never appeared on screen,
 * so the stats froze and checked-in rooms showed as pending. Put this value in the dependency
 * list of any subscription keyed by day and it re-subscribes at the rollover.
 */
export function useBusinessDate(intervalMs = 30_000): string {
  const [today, setToday] = useState(() => businessDate());
  useEffect(() => {
    const id = setInterval(() => {
      const next = businessDate();
      setToday((prev) => (prev === next ? prev : next));
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return today;
}
