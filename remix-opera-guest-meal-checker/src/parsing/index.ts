import { mapColumns } from './columns';
import { buildRooms } from './classify';
import { readRecords } from './records';
import { hasMealEntitlement } from '../lib/meals';
import type { ParseResult } from './types';

export * from './types';
export * from './records';
export * from './columns';
export * from './classify';

/**
 * Parse a Guests INH - By Room export into rooms ready for Firestore.
 *
 * Pure and synchronous: no Firebase, no React, no clock, no I/O. That is what makes
 * the golden-file tests in `__fixtures__` possible, and it is why the meal rules can
 * now be changed with evidence instead of hope.
 */
export function parseInHouseReport(text: string): ParseResult {
  const { header, records, anomalies: readAnomalies, physicalLines, rejectedRecords } =
    readRecords(text);

  const cols = mapColumns(header);
  const { rooms, anomalies: buildAnomalies } = buildRooms(records, cols);

  return {
    rooms,
    anomalies: [...readAnomalies, ...buildAnomalies],
    stats: {
      physicalLines,
      records: records.length,
      rejectedRecords,
      roomsWithMeal: rooms.filter((room) => hasMealEntitlement(room.mealPlan)).length,
    },
  };
}
