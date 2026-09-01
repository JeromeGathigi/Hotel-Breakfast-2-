/**
 * Table Turnover & Occupancy Duration Service
 * Computes elapsed dining duration, turnover stages, color coding, and visual styling
 * for restaurant host stands to manage dining turnover times.
 */

export type TurnoverStage = 'fresh' | 'dining' | 'warning' | 'critical' | 'none';

export interface TurnoverConfig {
  freshMaxMinutes: number;    // e.g. 20m (< 20 mins)
  diningMaxMinutes: number;   // e.g. 45m (20 - 45 mins)
  warningMaxMinutes: number;  // e.g. 60m (45 - 60 mins)
}

export const DEFAULT_TURNOVER_CONFIG: TurnoverConfig = {
  freshMaxMinutes: 20,
  diningMaxMinutes: 45,
  warningMaxMinutes: 60,
};

/**
 * Parses any occupiedSince representation (ISO timestamp, HH:MM, HH:MM:SS, or 12h AM/PM)
 * and returns the elapsed duration in whole minutes.
 */
export function getOccupiedDurationMinutes(
  occupiedSince: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!occupiedSince || typeof occupiedSince !== 'string') {
    return null;
  }

  const trimmed = occupiedSince.trim();
  if (!trimmed || trimmed.toLowerCase() === 'active') {
    return null;
  }

  // 1. Try parsing full ISO / standard date string
  const directDate = new Date(trimmed);
  if (!isNaN(directDate.getTime()) && trimmed.includes('-')) {
    const diffMs = now.getTime() - directDate.getTime();
    return Math.max(0, Math.floor(diffMs / (60 * 1000)));
  }

  // 2. Try parsing 24-hour or 12-hour time formats like "08:15", "08:15:30", "8:15 AM", "8:15 PM"
  const timeRegex = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i;
  const match = trimmed.match(timeRegex);

  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const meridian = match[4]?.toUpperCase();

    if (meridian === 'PM' && hours < 12) {
      hours += 12;
    } else if (meridian === 'AM' && hours === 12) {
      hours = 0;
    }

    const seatedTime = new Date(now);
    seatedTime.setHours(hours, minutes, 0, 0);

    let diffMs = now.getTime() - seatedTime.getTime();

    // If negative (e.g. seated before midnight and current time is right after midnight)
    if (diffMs < 0) {
      diffMs += 24 * 60 * 60 * 1000;
    }

    const diffMinutes = Math.floor(diffMs / (60 * 1000));
    // Sanity check: if calculated duration is > 18 hours (likely timezone offset mismatch), clamp
    if (diffMinutes > 18 * 60) {
      return null;
    }
    return Math.max(0, diffMinutes);
  }

  return null;
}

/**
 * Categorizes elapsed duration into turnover stages.
 */
export function getTurnoverStage(
  durationMinutes: number | null,
  config: TurnoverConfig = DEFAULT_TURNOVER_CONFIG
): TurnoverStage {
  if (durationMinutes === null || durationMinutes === undefined || durationMinutes < 0) {
    return 'none';
  }

  if (durationMinutes < config.freshMaxMinutes) {
    return 'fresh';
  }
  if (durationMinutes < config.diningMaxMinutes) {
    return 'dining';
  }
  if (durationMinutes < config.warningMaxMinutes) {
    return 'warning';
  }
  return 'critical';
}

/**
 * Formats duration for visual badges (e.g. "14m", "42m", "1h 15m")
 */
export function formatOccupiedDuration(durationMinutes: number | null): string {
  if (durationMinutes === null || durationMinutes === undefined) {
    return 'Active';
  }
  if (durationMinutes < 1) {
    return '< 1m';
  }
  if (durationMinutes < 60) {
    return `${durationMinutes}m`;
  }
  const hrs = Math.floor(durationMinutes / 60);
  const mins = durationMinutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

/**
 * Turnover Visual Styling Palette for SVG Floor Plan and UI Cards
 */
export interface TurnoverStyle {
  stage: TurnoverStage;
  label: string;
  borderColor: string;
  strokeWidth: number;
  fillColor: string;
  fillOpacity: number;
  textColor: string;
  badgeBg: string;
  badgeText: string;
  glowColor?: string;
  isAlert: boolean;
  pulseAnimation?: boolean;
}

export function getTurnoverStyle(
  stage: TurnoverStage,
  isIbis: boolean = false
): TurnoverStyle {
  switch (stage) {
    case 'fresh':
      return {
        stage: 'fresh',
        label: 'Freshly Seated (< 20m)',
        borderColor: '#10B981', // Emerald 500
        strokeWidth: 2.5,
        fillColor: isIbis ? '#DC2626' : '#1D4ED8',
        fillOpacity: 0.98,
        textColor: '#FFFFFF',
        badgeBg: 'bg-emerald-100 border border-emerald-300 text-emerald-800',
        badgeText: 'text-emerald-700',
        glowColor: '#10B981',
        isAlert: false,
        pulseAnimation: false,
      };

    case 'dining':
      return {
        stage: 'dining',
        label: 'Mid Dining (20-45m)',
        borderColor: '#F59E0B', // Amber 500
        strokeWidth: 3,
        fillColor: isIbis ? '#B91C1C' : '#1E40AF',
        fillOpacity: 0.92,
        textColor: '#FFFFFF',
        badgeBg: 'bg-amber-100 border border-amber-300 text-amber-900',
        badgeText: 'text-amber-700',
        glowColor: '#F59E0B',
        isAlert: false,
        pulseAnimation: false,
      };

    case 'warning':
      return {
        stage: 'warning',
        label: 'Turnover Warning (45-60m)',
        borderColor: '#EF4444', // Red 500
        strokeWidth: 3.5,
        fillColor: isIbis ? '#991B1B' : '#1E3A8A',
        fillOpacity: 0.88,
        textColor: '#FFFFFF',
        badgeBg: 'bg-red-100 border border-red-300 text-red-900',
        badgeText: 'text-red-700 font-bold',
        glowColor: '#EF4444',
        isAlert: true,
        pulseAnimation: true,
      };

    case 'critical':
      return {
        stage: 'critical',
        label: 'Overdue Turnover (60m+)',
        borderColor: '#DC2626', // Red 600
        strokeWidth: 4,
        fillColor: '#7F1D1D',
        fillOpacity: 0.82,
        textColor: '#FFFFFF',
        badgeBg: 'bg-rose-600 text-white border border-rose-700 font-bold animate-pulse',
        badgeText: 'text-rose-700 font-extrabold',
        glowColor: '#DC2626',
        isAlert: true,
        pulseAnimation: true,
      };

    case 'none':
    default:
      return {
        stage: 'none',
        label: 'Standard',
        borderColor: isIbis ? '#991B1B' : '#1E40AF',
        strokeWidth: 1.5,
        fillColor: isIbis ? '#DC2626' : '#1D4ED8',
        fillOpacity: 1,
        textColor: '#FFFFFF',
        badgeBg: 'bg-slate-100 text-slate-700',
        badgeText: 'text-slate-600',
        isAlert: false,
        pulseAnimation: false,
      };
  }
}
