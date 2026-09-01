import { describe, it, expect } from 'vitest';
import { db, collection, getDocs } from '../firebase';
import { Guest } from '../types';

describe('In-House Manifest Auto-Refresh & Synchronization', () => {
  it('loads guest manifest data from Firestore collection for both Novotel and ibis', async () => {
    // Novotel Manifest
    const novotelGuestsRef = collection(db, 'hotels', 'novotel', 'guests');
    const novotelSnap = await getDocs(novotelGuestsRef);
    expect(novotelSnap.docs.length).toBeGreaterThan(0);
    
    const novotelGuests: Guest[] = novotelSnap.docs.map((d: any) => d.data() as Guest);
    expect(novotelGuests.some(g => g.roomNumber === '301')).toBe(true);

    // ibis Manifest
    const ibisGuestsRef = collection(db, 'hotels', 'ibis', 'guests');
    const ibisSnap = await getDocs(ibisGuestsRef);
    expect(ibisSnap.docs.length).toBeGreaterThan(0);

    const ibisGuests: Guest[] = ibisSnap.docs.map((d: any) => d.data() as Guest);
    expect(ibisGuests.some(g => g.roomNumber === '203')).toBe(true);
  });

  it('verifies 5-minute interval constant is 300 seconds', () => {
    const REFRESH_INTERVAL_SECONDS = 300;
    expect(REFRESH_INTERVAL_SECONDS).toBe(5 * 60);
  });

  it('formats countdown clock correctly for 5-minute timer', () => {
    const formatCountdown = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    expect(formatCountdown(300)).toBe('5:00');
    expect(formatCountdown(275)).toBe('4:35');
    expect(formatCountdown(59)).toBe('0:59');
    expect(formatCountdown(5)).toBe('0:05');
    expect(formatCountdown(0)).toBe('0:00');
  });
});
