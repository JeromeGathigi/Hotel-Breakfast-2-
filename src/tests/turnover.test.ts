import { describe, it, expect } from 'vitest';
import { 
  getOccupiedDurationMinutes, 
  getTurnoverStage, 
  formatOccupiedDuration,
  getTurnoverStyle,
  DEFAULT_TURNOVER_CONFIG 
} from '../lib/turnover';

describe('Table Turnover & Occupancy Duration Service', () => {
  it('calculates duration from ISO timestamps', () => {
    const fixedNow = new Date('2026-09-01T08:30:00.000Z');
    
    // 15 mins ago
    const seated15m = '2026-09-01T08:15:00.000Z';
    expect(getOccupiedDurationMinutes(seated15m, fixedNow)).toBe(15);

    // 50 mins ago
    const seated50m = '2026-09-01T07:40:00.000Z';
    expect(getOccupiedDurationMinutes(seated50m, fixedNow)).toBe(50);
  });

  it('calculates duration from 24h and 12h time strings', () => {
    const fixedNow = new Date(2026, 8, 1, 9, 30, 0); // 09:30 AM
    
    // 09:10 -> 20 mins elapsed
    expect(getOccupiedDurationMinutes('09:10', fixedNow)).toBe(20);

    // 08:45 -> 45 mins elapsed
    expect(getOccupiedDurationMinutes('08:45', fixedNow)).toBe(45);

    // 08:15 -> 75 mins elapsed
    expect(getOccupiedDurationMinutes('08:15', fixedNow)).toBe(75);

    // 09:15 AM
    expect(getOccupiedDurationMinutes('9:15 AM', fixedNow)).toBe(15);
  });

  it('handles null, empty, or non-time strings gracefully', () => {
    expect(getOccupiedDurationMinutes(null)).toBeNull();
    expect(getOccupiedDurationMinutes(undefined)).toBeNull();
    expect(getOccupiedDurationMinutes('')).toBeNull();
    expect(getOccupiedDurationMinutes('Active')).toBeNull();
  });

  it('categorizes turnover stages correctly based on hospitality thresholds', () => {
    expect(getTurnoverStage(null)).toBe('none');
    expect(getTurnoverStage(0)).toBe('fresh');
    expect(getTurnoverStage(15)).toBe('fresh');
    expect(getTurnoverStage(19)).toBe('fresh');
    expect(getTurnoverStage(20)).toBe('dining');
    expect(getTurnoverStage(35)).toBe('dining');
    expect(getTurnoverStage(44)).toBe('dining');
    expect(getTurnoverStage(45)).toBe('warning');
    expect(getTurnoverStage(55)).toBe('warning');
    expect(getTurnoverStage(60)).toBe('critical');
    expect(getTurnoverStage(90)).toBe('critical');
  });

  it('formats occupied duration string cleanly', () => {
    expect(formatOccupiedDuration(null)).toBe('Active');
    expect(formatOccupiedDuration(0)).toBe('< 1m');
    expect(formatOccupiedDuration(18)).toBe('18m');
    expect(formatOccupiedDuration(60)).toBe('1h');
    expect(formatOccupiedDuration(75)).toBe('1h 15m');
  });

  it('generates distinct turnover visual styling for borders, opacities, and badges', () => {
    const freshStyle = getTurnoverStyle('fresh', false);
    expect(freshStyle.borderColor).toBe('#10B981'); // Emerald
    expect(freshStyle.fillOpacity).toBe(0.98);

    const diningStyle = getTurnoverStyle('dining', false);
    expect(diningStyle.borderColor).toBe('#F59E0B'); // Amber
    expect(diningStyle.fillOpacity).toBe(0.92);

    const warningStyle = getTurnoverStyle('warning', false);
    expect(warningStyle.borderColor).toBe('#EF4444'); // Red
    expect(warningStyle.isAlert).toBe(true);

    const criticalStyle = getTurnoverStyle('critical', false);
    expect(criticalStyle.borderColor).toBe('#DC2626'); // Red-600
    expect(criticalStyle.isAlert).toBe(true);
  });
});
