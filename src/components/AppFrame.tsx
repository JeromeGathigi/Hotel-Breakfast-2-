import React, { useState } from 'react';
import {
  BarChart3,
  ChefHat,
  Clock,
  ExternalLink,
  LayoutGrid,
  Menu as MenuIcon,
  ReceiptText,
  Settings as SettingsIcon,
  TrendingUp,
  Upload,
  UserCheck,
  Users,
  Utensils,
  Wallet,
  X,
} from 'lucide-react';
import { HOTELS, type HotelInfo } from '../constants';
import type { Role } from '../lib/access';
import { formatBusinessDateDisplay } from '../lib/businessDate';
import { navGroups, navItem, type View } from '../navigation';

/**
 * The frame around every screen: property, navigation, Bangkok clock, the signed-in account.
 * Presentational - it imports nothing from Firebase, so the dev preview can show it for any role.
 *
 * Landscape tablets and wider get the sidebar. Phones and tablets held upright get a bar with the
 * screen and the property, and the menu behind a button: on a phone the sidebar used to stack
 * above every screen, so the door's search box sat below a full page of navigation, and on an
 * upright tablet it took 288px of a 768-834px screen from the guest cards.
 */

const ICON: Record<View, React.ReactNode> = {
  door: <UserCheck size={18} />,
  floor: <LayoutGrid size={18} />,
  orders: <ReceiptText size={18} />,
  kitchen: <ChefHat size={18} />,
  menu: <Utensils size={18} />,
  manifest: <Users size={18} />,
  forecast: <TrendingUp size={18} />,
  analytics: <BarChart3 size={18} />,
  sales: <Wallet size={18} />,
  import: <Upload size={18} />,
  settings: <SettingsIcon size={18} />,
};

const HotelMark: React.FC<{ hotel: HotelInfo }> = ({ hotel }) => (
  <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center font-bold text-white ${hotel.id === 'ibis' ? 'bg-[#E2001A]' : 'bg-[#1A3A6D]'}`}>
    {hotel.id === 'ibis' ? 'I' : 'N'}
  </div>
);

export interface AppFrameProps {
  hotel: HotelInfo;
  onHotelChange: (hotel: HotelInfo) => void;
  role: Role;
  view: View;
  onNavigate: (view: View) => void;
  /** Bangkok time, "07:42:13". */
  clock: string;
  /** The business date. */
  today: string;
  /** Who is signed in, and signing out. */
  account: React.ReactNode;
  children: React.ReactNode;
}

export const AppFrame: React.FC<AppFrameProps> = ({ hotel, onHotelChange, role, view, onNavigate, clock, today, account, children }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const groups = navGroups(role, hotel.id);
  const current = navItem(view);

  const go = (next: View) => {
    setMenuOpen(false);
    onNavigate(next);
  };

  return (
    <div className={`min-h-screen bg-background text-foreground flex flex-col lg:flex-row ${hotel.theme}`}>
      <header className="lg:hidden sticky top-0 z-30 bg-card border-b border-border px-4 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <HotelMark hotel={hotel} />
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight truncate">{current.label}</p>
            <p className="text-xs text-muted-foreground truncate">
              {hotel.shortName} · {clock}
            </p>
          </div>
        </div>
        <button
          className="h-11 w-11 shrink-0 rounded-xl border border-border bg-white flex items-center justify-center cursor-pointer"
          aria-label={menuOpen ? 'Close the menu' : 'Open the menu'}
          aria-expanded={menuOpen}
          aria-controls="app-sidebar"
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? <X size={20} /> : <MenuIcon size={20} />}
        </button>
      </header>

      <aside id="app-sidebar" className={`${menuOpen ? 'flex' : 'hidden'} lg:flex w-full lg:w-72 bg-card border-b lg:border-b-0 lg:border-r border-border flex-col shrink-0`}>
        <div className="p-5 space-y-5 flex-1">
          <div>
            <div className="hidden lg:flex items-center gap-3">
              <HotelMark hotel={hotel} />
              <div className="min-w-0">
                <h1 className="text-base font-bold font-display leading-tight">{hotel.name}</h1>
                <span className="label-mono">{hotel.resortCode} · Opera</span>
              </div>
            </div>
            <div className="lg:mt-3 p-1 rounded-xl bg-[#F2EBE4]/70 border border-border grid grid-cols-2 gap-1" role="tablist" aria-label="Property">
              {HOTELS.map((h) => (
                <button
                  key={h.id}
                  role="tab"
                  aria-selected={hotel.id === h.id}
                  onClick={() => onHotelChange(h)}
                  className={`h-10 rounded-lg text-sm font-bold cursor-pointer ${
                    hotel.id === h.id ? (h.id === 'ibis' ? 'bg-[#E2001A] text-white' : 'bg-[#1A3A6D] text-white') : 'text-foreground'
                  }`}
                >
                  {h.shortName}
                </button>
              ))}
            </div>
            <a href={hotel.restaurantUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-accent">
              {hotel.restaurantName} <ExternalLink size={11} />
            </a>
          </div>

          <nav className="space-y-4" aria-label="Main">
            {groups.map(({ group, items }) => (
              <div key={group} className="space-y-1">
                <p className="px-3 label-mono">{group}</p>
                {items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => go(n.id)}
                    aria-current={view === n.id ? 'page' : undefined}
                    className={`w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm font-bold cursor-pointer ${
                      view === n.id ? 'bg-white shadow-sm border border-black/10 text-foreground' : 'text-foreground/80 hover:bg-[#F2EBE4]'
                    }`}
                  >
                    {ICON[n.id]}
                    {n.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="p-3 rounded-xl bg-[#F2EBE4]/50 border border-border">
            <div className="flex items-center justify-between label-mono">
              <span>Bangkok</span>
              <Clock size={12} />
            </div>
            <p className="text-xl font-bold font-mono-custom">{clock}</p>
            <p className="text-xs text-muted-foreground">Business day {formatBusinessDateDisplay(today)} · changes at 04:00</p>
          </div>
        </div>
        <div className="p-5 border-t border-border">{account}</div>
      </aside>

      <main className="flex-1 p-4 md:p-6 overflow-y-auto space-y-4 min-w-0">{children}</main>
    </div>
  );
};
