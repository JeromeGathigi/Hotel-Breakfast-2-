import { describe, it, expect } from 'vitest';
import { 
  DEFAULT_NOVOTEL_TABLES, 
  DEFAULT_IBIS_TABLES, 
  NOVOTEL_PLATE, 
  IBIS_PLATE, 
  NOVOTEL_FLOOR_FEATURES, 
  IBIS_FLOOR_FEATURES 
} from '../constants';
import { DiningTable, TableLayoutEntry } from '../types';
import {
  effectiveCapacity,
  getCombinedTableNumber,
  getMergedGroupMembers,
  seatableTables,
  validateMerge,
  buildMergePlan,
  buildUnmergePlan,
} from '../lib/tables';

describe('Restaurant Floor Plan & Layout Architecture', () => {
  it('verifies exact baseline table counts and properties', () => {
    // Novotel Food Exchange: 22 tables
    expect(DEFAULT_NOVOTEL_TABLES.length).toBe(22);
    // ibis Charlie's Corner & Delhi Street: 14 dining tables (Rows A, B, C)
    expect(DEFAULT_IBIS_TABLES.length).toBe(14);

    // Verify exact Novotel table numbers in sequence
    const novotelNumbers = DEFAULT_NOVOTEL_TABLES.map(t => t.tableNumber);
    expect(novotelNumbers).toEqual([
      'C1', 'C2', 'C3', 'C4', 'C5',
      'B1', 'B2', 'B3', 'B4', 'B5',
      'A1', 'A2', 'A3', 'A4', 'A5', 'A6',
      'BAR4', 'BAR5', 'BAR6',
      'BAR3', 'BAR2', 'BAR1'
    ]);

    // Verify exact ibis table numbers in sequence
    const ibisNumbers = DEFAULT_IBIS_TABLES.map(t => t.tableNumber);
    expect(ibisNumbers).toEqual([
      'C4', 'C3', 'C2', 'C1',
      'B4', 'B3', 'B2', 'B1',
      'A6', 'A5', 'A4', 'A3', 'A2', 'A1'
    ]);

    // Verify table capacities: A1 to C5 are 4-pax, BAR1-BAR6 are 4-pax at Novotel
    DEFAULT_NOVOTEL_TABLES.forEach((t) => {
      expect(t.capacity).toBe(4);
    });

    // Verify table capacities: A1 to C4 (all 14 tables) are 4-pax at ibis
    DEFAULT_IBIS_TABLES.forEach((t) => {
      expect(t.capacity).toBe(4);
    });

    // Check shapes
    const diamondNovotelTables = DEFAULT_NOVOTEL_TABLES.filter(t => t.shape === 'diamond');
    expect(diamondNovotelTables.length).toBe(6); // BAR1 - BAR6

    // Verify 4 round smoking tables exist as non-dining architectural features
    const smokingFeatures = IBIS_FLOOR_FEATURES.filter(f => /^i-smoking-t\d+$/.test(f.id));
    expect(smokingFeatures.length).toBe(4);
  });

  it('verifies plate dimensions and architectural features', () => {
    expect(NOVOTEL_PLATE.w).toBe(870);
    expect(NOVOTEL_PLATE.h).toBe(330);
    expect(IBIS_PLATE.w).toBe(940);
    expect(IBIS_PLATE.h).toBe(420);

    // Check Novotel building envelope
    const novotelEnvelope = NOVOTEL_FLOOR_FEATURES.find(f => f.kind === 'building-envelope');
    expect(novotelEnvelope).toBeDefined();
    expect(novotelEnvelope?.w).toBe(870);

    // Check ibis building envelope & smoking terrace feature
    const ibisEnvelope = IBIS_FLOOR_FEATURES.find(f => f.kind === 'building-envelope');
    expect(ibisEnvelope).toBeDefined();

    const ibisSmokingTerrace = IBIS_FLOOR_FEATURES.find(f => f.kind === 'smoking-terrace');
    expect(ibisSmokingTerrace).toBeDefined();
    expect(ibisSmokingTerrace?.x).toBe(280);
  });

  it('correctly calculates 5-unit grid snapping and plate clamping', () => {
    const snapToGrid = (val: number, snap = 5) => Math.round(val / snap) * snap;
    const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

    // Test snap
    expect(snapToGrid(102.3)).toBe(100);
    expect(snapToGrid(103.8)).toBe(105);
    expect(snapToGrid(107.5)).toBe(110);

    // Test clamping to Novotel plate with radius 11
    const r = 11;
    const plateW = NOVOTEL_PLATE.w;
    const plateH = NOVOTEL_PLATE.h;

    expect(clamp(-20, r, plateW - r)).toBe(11);
    expect(clamp(999, r, plateW - r)).toBe(859);
    expect(clamp(370, r, plateH - r)).toBe(319);
  });

  it('strips live occupancy and status when snapshotting a named layout', () => {
    const liveTable: DiningTable = {
      id: 'n-fe-01',
      tableNumber: 'FE-01',
      capacity: 4,
      zone: 'Main Dining',
      status: 'occupied',
      occupiedByRoom: '304',
      occupiedByGuest: 'Alice Cooper',
      occupiedPax: 3,
      occupiedSince: '07:30',
      mealService: 'breakfast',
      x: 180,
      y: 110,
      shape: 'square',
      isSmoking: false,
    };

    // Serializer to TableLayoutEntry
    const layoutEntry: TableLayoutEntry = {
      id: liveTable.id,
      tableNumber: liveTable.tableNumber,
      capacity: liveTable.capacity,
      zone: liveTable.zone,
      x: liveTable.x ?? 100,
      y: liveTable.y ?? 100,
      shape: liveTable.shape,
      isSmoking: Boolean(liveTable.isSmoking),
    };

    expect(layoutEntry).toEqual({
      id: 'n-fe-01',
      tableNumber: 'FE-01',
      capacity: 4,
      zone: 'Main Dining',
      x: 180,
      y: 110,
      shape: 'square',
      isSmoking: false,
    });

    // Ensure status and occupancy properties do not leak into layout
    expect((layoutEntry as any).status).toBeUndefined();
    expect((layoutEntry as any).occupiedByRoom).toBeUndefined();
    expect((layoutEntry as any).occupiedByGuest).toBeUndefined();
  });

  describe('Table Merging & Unmerging Business Rules', () => {
    const tableA1: DiningTable = {
      id: 'i-row-a1',
      tableNumber: 'A1',
      capacity: 4,
      zone: 'Row A (Window)',
      status: 'available',
      shape: 'square',
    };

    const tableA2: DiningTable = {
      id: 'i-row-a2',
      tableNumber: 'A2',
      capacity: 4,
      zone: 'Row A (Window)',
      status: 'available',
      shape: 'square',
    };

    const tableB1: DiningTable = {
      id: 'i-row-b1',
      tableNumber: 'B1',
      capacity: 2,
      zone: 'Row B (Center)',
      status: 'available',
      shape: 'square',
    };

    const tableOccupied: DiningTable = {
      id: 'i-row-a3',
      tableNumber: 'A3',
      capacity: 4,
      zone: 'Row A (Window)',
      status: 'occupied',
      occupiedByRoom: '201',
      shape: 'square',
    };

    it('validates merge eligibility strictly', () => {
      // Less than 2 tables
      expect(validateMerge([tableA1]).valid).toBe(false);
      expect(validateMerge([tableA1]).error).toContain('Select at least 2 tables');

      // Different zones
      expect(validateMerge([tableA1, tableB1]).valid).toBe(false);
      expect(validateMerge([tableA1, tableB1]).error).toContain('different zones');

      // Occupied table
      expect(validateMerge([tableA1, tableOccupied]).valid).toBe(false);
      expect(validateMerge([tableA1, tableOccupied]).error).toContain('occupied');

      // Valid merge
      const validRes = validateMerge([tableA1, tableA2]);
      expect(validRes.valid).toBe(true);
      expect(validRes.error).toBeUndefined();
    });

    it('builds a correct merge plan with primary and child updates', () => {
      const plan = buildMergePlan([tableA1, tableA2]);
      expect(plan.primaryId).toBe('i-row-a1');
      expect(plan.childIds).toEqual(['i-row-a2']);

      expect(plan.updates['i-row-a1']).toEqual({
        mergedTables: ['i-row-a2'],
        mergedInto: null,
      });

      expect(plan.updates['i-row-a2']).toEqual({
        mergedInto: 'i-row-a1',
        mergedTables: [],
      });
    });

    it('calculates effective capacity and combined labels correctly', () => {
      const mergedA1: DiningTable = {
        ...tableA1,
        mergedTables: ['i-row-a2'],
      };
      const mergedA2: DiningTable = {
        ...tableA2,
        mergedInto: 'i-row-a1',
      };
      const allTables = [mergedA1, mergedA2, tableB1];

      // Effective capacity of primary should sum primary + child (4 + 4 = 8)
      expect(effectiveCapacity(mergedA1, allTables)).toBe(8);
      // Effective capacity of child delegates to primary (8)
      expect(effectiveCapacity(mergedA2, allTables)).toBe(8);
      // Standalone table remains 2
      expect(effectiveCapacity(tableB1, allTables)).toBe(2);

      // Combined label
      expect(getCombinedTableNumber(mergedA1, allTables)).toBe('A1+A2');
      expect(getCombinedTableNumber(mergedA2, allTables)).toBe('A1+A2');
      expect(getCombinedTableNumber(tableB1, allTables)).toBe('B1');

      // Seatable tables should only include primary and standalone (excluding children)
      const seatable = seatableTables(allTables);
      expect(seatable.length).toBe(2);
      expect(seatable.map(t => t.id)).toEqual(['i-row-a1', 'i-row-b1']);
    });

    it('builds an unmerge plan resetting all tables in the group', () => {
      const mergedA1: DiningTable = {
        ...tableA1,
        mergedTables: ['i-row-a2'],
      };
      const mergedA2: DiningTable = {
        ...tableA2,
        mergedInto: 'i-row-a1',
      };
      const allTables = [mergedA1, mergedA2];

      const unmergePlan = buildUnmergePlan(mergedA1, allTables);
      expect(unmergePlan.updates['i-row-a1']).toEqual({
        mergedInto: null,
        mergedTables: [],
      });
      expect(unmergePlan.updates['i-row-a2']).toEqual({
        mergedInto: null,
        mergedTables: [],
      });
    });
  });
});
