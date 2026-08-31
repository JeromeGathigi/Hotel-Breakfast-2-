import { DiningTable, TableLayoutEntry } from '../types';

/**
 * Natural sort comparison for table numbers (e.g., A1, A2, A10, BAR1, BAR2)
 */
export function compareTableNumbers(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Effective capacity of a table: its own, plus its children if it is a primary.
 * If called on a child, returns the group's effective capacity.
 */
export function effectiveCapacity(table: DiningTable, all: DiningTable[]): number {
  const tableMap = new Map(all.map((t) => [t.id, t]));
  let primary = table;
  if (table.mergedInto) {
    const p = tableMap.get(table.mergedInto);
    if (p) primary = p;
  }

  // If table is a primary with merged children, sum its capacity + children's capacities
  if (primary.mergedTables && primary.mergedTables.length > 0) {
    const childCapacity = primary.mergedTables.reduce((sum, childId) => {
      const child = tableMap.get(childId);
      return sum + (child ? child.capacity : 0);
    }, 0);
    return primary.capacity + childCapacity;
  }

  // Standalone table
  return primary.capacity;
}

/**
 * Tables to show and count: primaries and standalones.
 * Children are folded into their primary.
 */
export function seatableTables(all: DiningTable[]): DiningTable[] {
  return all.filter((t) => !t.mergedInto);
}

/**
 * Get all members of a merged group (primary + children)
 */
export function getMergedGroupMembers(table: DiningTable, all: DiningTable[] = [table]): DiningTable[] {
  const tableMap = new Map(all.map((t) => [t.id, t]));
  let primary = table;

  if (table.mergedInto) {
    const p = tableMap.get(table.mergedInto);
    if (p) primary = p;
  }

  const members: DiningTable[] = [primary];
  if (primary.mergedTables && primary.mergedTables.length > 0) {
    for (const childId of primary.mergedTables) {
      const child = tableMap.get(childId);
      if (child && child.id !== primary.id) {
        members.push(child);
      }
    }
  }

  // Sort naturally by tableNumber
  return members.sort((a, b) => compareTableNumbers(a.tableNumber, b.tableNumber));
}

/**
 * Get the combined display label for a table (e.g. "A1+A2" if primary, or tableNumber if standalone)
 */
export function getCombinedTableNumber(table: DiningTable, all: DiningTable[]): string {
  if (table.mergedInto) {
    const tableMap = new Map(all.map((t) => [t.id, t]));
    const primary = tableMap.get(table.mergedInto);
    if (primary) {
      return getCombinedTableNumber(primary, all);
    }
  }

  if (table.mergedTables && table.mergedTables.length > 0) {
    const members = getMergedGroupMembers(table, all);
    return members.map((m) => m.tableNumber).join('+');
  }

  return table.tableNumber;
}

/**
 * Validate whether a set of tables can be merged together
 */
export function validateMerge(
  tablesToMerge: DiningTable[],
  allTables: DiningTable[] = tablesToMerge
): { valid: boolean; reason?: string; error?: string; expandedPool?: DiningTable[] } {
  if (!tablesToMerge || tablesToMerge.length < 2) {
    const msg = 'Select at least 2 tables to merge.';
    return { valid: false, reason: msg, error: msg };
  }

  // Expand pool if any selected table is already part of a merged group
  const poolMap = new Map<string, DiningTable>();
  for (const t of tablesToMerge) {
    const group = getMergedGroupMembers(t, allTables);
    for (const m of group) {
      poolMap.set(m.id, m);
    }
  }

  const pool = Array.from(poolMap.values());

  if (pool.length < 2) {
    const msg = 'Select at least 2 distinct tables to merge.';
    return { valid: false, reason: msg, error: msg };
  }

  // Check 1: Refuse if any table is occupied
  const occupied = pool.filter((t) => t.status === 'occupied');
  if (occupied.length > 0) {
    const names = occupied.map((t) => t.tableNumber).join(', ');
    const msg = `Cannot merge occupied tables (${names}). Please clear or relocate seated guests first.`;
    return {
      valid: false,
      reason: msg,
      error: msg,
    };
  }

  // Check 2: All tables must be in the same zone
  const firstZone = pool[0].zone;
  const differentZone = pool.find((t) => t.zone !== firstZone);
  if (differentZone) {
    const msg = `Cannot merge tables across different zones ("${firstZone}" and "${differentZone.zone}"). All merged tables must be in the same room.`;
    return {
      valid: false,
      reason: msg,
      error: msg,
    };
  }

  return { valid: true, expandedPool: pool };
}

/**
 * Build the updated table objects for a merge operation (with no chains)
 */
export function buildMergePlan(
  tablesToMerge: DiningTable[],
  allTables: DiningTable[] = tablesToMerge
): {
  valid: boolean;
  reason?: string;
  error?: string;
  primaryId?: string;
  childIds?: string[];
  primary?: DiningTable;
  updatedTables: DiningTable[];
  updates: Record<string, Partial<DiningTable>>;
} {
  const validation = validateMerge(tablesToMerge, allTables);
  if (!validation.valid || !validation.expandedPool) {
    return {
      valid: false,
      reason: validation.reason,
      error: validation.error,
      updatedTables: [],
      updates: {},
    };
  }

  const pool = validation.expandedPool;
  // Lowest table number is the primary
  const sorted = [...pool].sort((a, b) => compareTableNumbers(a.tableNumber, b.tableNumber));
  const primary = sorted[0];
  const children = sorted.slice(1);
  const childIds = children.map((c) => c.id);

  const updatedPrimary: DiningTable = {
    ...primary,
    mergedInto: null,
    mergedTables: childIds,
  };

  const updatedChildren: DiningTable[] = children.map((c) => ({
    ...c,
    mergedInto: primary.id,
    mergedTables: [],
  }));

  const updates: Record<string, Partial<DiningTable>> = {
    [primary.id]: {
      mergedTables: childIds,
      mergedInto: null,
    },
  };

  for (const c of children) {
    updates[c.id] = {
      mergedInto: primary.id,
      mergedTables: [],
    };
  }

  return {
    valid: true,
    primaryId: primary.id,
    childIds,
    primary: updatedPrimary,
    updatedTables: [updatedPrimary, ...updatedChildren],
    updates,
  };
}

/**
 * Build the updated table objects for an un-merge operation
 */
export function buildUnmergePlan(
  table: DiningTable,
  allTables: DiningTable[] = [table]
): {
  valid: boolean;
  reason?: string;
  error?: string;
  updatedTables: DiningTable[];
  updates: Record<string, Partial<DiningTable>>;
} {
  const group = getMergedGroupMembers(table, allTables);
  if (group.length <= 1) {
    const msg = 'Table is not merged.';
    return { valid: false, reason: msg, error: msg, updatedTables: [], updates: {} };
  }

  // Refuse if any table in group is occupied
  const occupied = group.filter((t) => t.status === 'occupied');
  if (occupied.length > 0) {
    const msg = `Cannot un-merge table while it is occupied (${occupied.map((t) => t.tableNumber).join(', ')}). Clear the table first.`;
    return {
      valid: false,
      reason: msg,
      error: msg,
      updatedTables: [],
      updates: {},
    };
  }

  const updatedTables: DiningTable[] = group.map((t) => ({
    ...t,
    mergedInto: null,
    mergedTables: [],
  }));

  const updates: Record<string, Partial<DiningTable>> = {};
  for (const t of group) {
    updates[t.id] = {
      mergedInto: null,
      mergedTables: [],
    };
  }

  return {
    valid: true,
    updatedTables,
    updates,
  };
}

/**
 * Strip live occupancy fields when snapshotting tables into a layout entry,
 * preserving geometry, capacities, and layout merge definitions.
 */
export function tableToLayoutEntry(table: DiningTable): TableLayoutEntry {
  return {
    id: table.id,
    tableNumber: table.tableNumber,
    capacity: table.capacity,
    zone: table.zone,
    x: table.x ?? 100,
    y: table.y ?? 100,
    shape: table.shape,
    isSmoking: Boolean(table.isSmoking),
    mergedInto: table.mergedInto ?? null,
    mergedTables: table.mergedTables && table.mergedTables.length > 0 ? table.mergedTables : [],
  };
}
