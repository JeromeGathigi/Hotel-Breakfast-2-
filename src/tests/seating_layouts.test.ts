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

describe('Restaurant Floor Plan & Layout Architecture', () => {
  it('verifies exact baseline table counts and properties', () => {
    // Novotel Food Exchange: 22 tables
    expect(DEFAULT_NOVOTEL_TABLES.length).toBe(22);
    // ibis Charlie's Corner & Delhi Street: 14 dining tables (Rows A, B, C)
    expect(DEFAULT_IBIS_TABLES.length).toBe(14);

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
});
