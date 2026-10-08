import { canImport, canManage, canUseDoor, type Role } from './lib/access';

/**
 * The app's screens: who sees each one, where it sits in the sidebar, and whether it acts on the
 * in-house guest list. Pure data, so a test can pin down exactly what each role sees.
 *
 * Groups go from the door outwards. Everyone with access sees the door; the Food Exchange screens
 * appear for Novotel, whose outlet it is; Management and Administration appear only for the roles
 * that can use them. The previous sidebar put orders and the kitchen under "Door", and exports a
 * manager is allowed under an administrator-only "Import & export" screen.
 */

export type View = 'door' | 'bookings' | 'floor' | 'orders' | 'kitchen' | 'menu' | 'manifest' | 'forecast' | 'analytics' | 'sales' | 'import' | 'settings';

export const NAV_GROUPS = ['Door', 'Food Exchange', 'Management', 'Administration'] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export interface NavItem {
  id: View;
  label: string;
  group: NavGroup;
  visible: (role: Role, hotelId: string) => boolean;
  /** The screen acts on the in-house list, so it carries the "is this today's list?" banner. */
  usesGuestList: boolean;
}

/** The Food Exchange is a Novotel outlet: its screens are absent for ibis, not disabled. */
const novotel = (hotelId: string) => hotelId === 'novotel';

export const NAV: readonly NavItem[] = [
  { id: 'door', label: 'Check-in', group: 'Door', visible: (r) => canUseDoor(r), usesGuestList: true },
  // Reservations and the waiting list, for both restaurants - see src/bookings/bookingModel.ts.
  { id: 'bookings', label: 'Bookings', group: 'Door', visible: (r) => canUseDoor(r), usesGuestList: true },
  { id: 'floor', label: 'Floor plan', group: 'Door', visible: (r) => canUseDoor(r), usesGuestList: true },
  { id: 'orders', label: 'Orders', group: 'Food Exchange', visible: (r, h) => canUseDoor(r) && novotel(h), usesGuestList: true },
  { id: 'kitchen', label: 'Kitchen', group: 'Food Exchange', visible: (r, h) => canUseDoor(r) && novotel(h), usesGuestList: false },
  { id: 'menu', label: 'Menu', group: 'Food Exchange', visible: (r, h) => canUseDoor(r) && novotel(h), usesGuestList: false },
  { id: 'manifest', label: 'In-house manifest', group: 'Management', visible: (r) => canManage(r), usesGuestList: true },
  { id: 'forecast', label: 'Meal forecast', group: 'Management', visible: (r) => canManage(r), usesGuestList: false },
  { id: 'analytics', label: 'Breakfast analytics', group: 'Management', visible: (r) => canManage(r), usesGuestList: false },
  { id: 'sales', label: 'Food Exchange sales', group: 'Management', visible: (r, h) => canManage(r) && novotel(h), usesGuestList: false },
  { id: 'import', label: 'Opera import', group: 'Administration', visible: (r) => canImport(r), usesGuestList: false },
  { id: 'settings', label: 'Settings', group: 'Administration', visible: (r) => canManage(r), usesGuestList: true },
];

export function isView(value: string): value is View {
  return NAV.some((n) => n.id === value);
}

export function navItem(view: View): NavItem {
  return NAV.find((n) => n.id === view)!;
}

export function canSee(view: View, role: Role, hotelId: string): boolean {
  return navItem(view).visible(role, hotelId);
}

/** The sidebar for a role at a property: non-empty groups, in order. */
export function navGroups(role: Role, hotelId: string): Array<{ group: NavGroup; items: NavItem[] }> {
  return NAV_GROUPS.map((group) => ({ group, items: NAV.filter((n) => n.group === group && n.visible(role, hotelId)) })).filter((g) => g.items.length > 0);
}
