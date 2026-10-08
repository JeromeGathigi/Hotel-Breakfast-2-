import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Clock,
  ExternalLink,
  LayoutGrid,
  Settings as SettingsIcon,
  TrendingUp,
  Upload,
  UserCheck,
  Users,
  Utensils,
  ReceiptText,
  ChefHat,
  Wallet,
} from 'lucide-react';
import { db, doc, isFirebaseConfigured, onBackgroundWriteError, onSnapshot, purgeLegacyLocalData } from './firebase';
import { HOTELS } from './constants';
import type { MealServiceType, ReportMetadata } from './types';
import { assessFreshness } from './lib/freshness';
import { bangkokTime, formatBusinessDateDisplay } from './lib/businessDate';
import { canImport, canManage, type Role } from './lib/access';
import { useAccess } from './hooks/useAccess';
import { useBusinessDate } from './hooks/useBusinessDate';
import { NoAccessScreen, SignInScreen, UserBox } from './components/Auth';
import { DoorScreen } from './door/DoorScreen';
import { Banner, btn } from './components/ui';

// The check-in screen is in the first download; every other screen is fetched when first opened.
// The bundle was 1.8 MB, most of it charts and the floor-plan editor a door tablet rarely needs at
// 06:00. The two other door screens are prefetched once the app is up (see Shell), so they still
// open if the Wi-Fi drops later in the service.
const loadSeatingPlan = () => import('./components/SeatingPlan').then((m) => ({ default: m.SeatingPlan }));
const loadMenuView = () => import('./components/MenuView').then((m) => ({ default: m.MenuView }));
const SeatingPlan = lazy(loadSeatingPlan);
const MenuView = lazy(loadMenuView);
const GuestList = lazy(() => import('./components/GuestList').then((m) => ({ default: m.GuestList })));
const ForecastView = lazy(() => import('./components/ForecastView').then((m) => ({ default: m.ForecastView })));
const Analytics = lazy(() => import('./components/Analytics').then((m) => ({ default: m.Analytics })));
const ImportExport = lazy(() => import('./components/ImportExport').then((m) => ({ default: m.ImportExport })));
const Settings = lazy(() => import('./components/Settings').then((m) => ({ default: m.Settings })));
const OrdersScreen = lazy(() => import('./orders/screens').then((m) => ({ default: m.OrdersScreen })));
const KitchenScreen = lazy(() => import('./orders/screens').then((m) => ({ default: m.KitchenScreen })));
const SalesScreen = lazy(() => import('./orders/screens').then((m) => ({ default: m.SalesScreen })));

/**
 * Keeps one screen's failure on that screen. Without it, a screen that throws while rendering - or
 * whose code cannot be fetched because the connection dropped - blanks the whole app, door included.
 */
class ScreenBoundary extends React.Component<{ resetKey: string; children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return (
      <Banner tone="critical" title="This screen could not be opened" role="alert">
        <p>{offline ? 'The device is offline. Check-in still works; this screen needs the connection once to load.' : this.state.error.message}</p>
        <button className={`${btn.secondary} mt-3`} onClick={() => window.location.reload()}>
          Reload
        </button>
      </Banner>
    );
  }
}

type View = 'door' | 'floor' | 'menu' | 'orders' | 'kitchen' | 'manifest' | 'forecast' | 'analytics' | 'sales' | 'import' | 'settings';

interface NavItem {
  id: View;
  label: string;
  icon: React.ReactNode;
  /** Who sees it. The owner asked that not everything be visible to everyone. */
  visible: (role: Role, hotelId: string) => boolean;
  group: 'Door' | 'Management' | 'Administration';
}

const NAV: NavItem[] = [
  { id: 'door', label: 'Check-in', icon: <UserCheck size={18} />, visible: () => true, group: 'Door' },
  { id: 'floor', label: 'Floor plan', icon: <LayoutGrid size={18} />, visible: () => true, group: 'Door' },
  // The Food Exchange is a Novotel outlet: the item is absent for ibis, not disabled.
  { id: 'menu', label: 'Food Exchange menu', icon: <Utensils size={18} />, visible: (_r, h) => h === 'novotel', group: 'Door' },
  // A la carte ordering, kitchen and sales for the Food Exchange - likewise Novotel only.
  { id: 'orders', label: 'Orders', icon: <ReceiptText size={18} />, visible: (_r, h) => h === 'novotel', group: 'Door' },
  { id: 'kitchen', label: 'Kitchen', icon: <ChefHat size={18} />, visible: (_r, h) => h === 'novotel', group: 'Door' },
  { id: 'manifest', label: 'In-house manifest', icon: <Users size={18} />, visible: (r) => canManage(r), group: 'Management' },
  { id: 'forecast', label: 'Meal forecast', icon: <TrendingUp size={18} />, visible: (r) => canManage(r), group: 'Management' },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={18} />, visible: (r) => canManage(r), group: 'Management' },
  { id: 'sales', label: 'Sales', icon: <Wallet size={18} />, visible: (r, h) => canManage(r) && h === 'novotel', group: 'Management' },
  { id: 'import', label: 'Import & export', icon: <Upload size={18} />, visible: (r) => canImport(r), group: 'Administration' },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon size={18} />, visible: (r) => canManage(r), group: 'Administration' },
];

const FRESHNESS_TONE = { critical: 'critical', warn: 'warn', pending: 'pending', ok: 'ok' } as const;
const FRESHNESS_HEADING: Record<string, string> = {
  critical: 'Do not rely on this guest list',
  warn: 'This guest list may not be today’s',
  pending: 'Checking the guest list',
  ok: '',
};

export function App() {
  if (!isFirebaseConfigured) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <Banner tone="critical" title="This build has no Firebase configuration" role="alert">
          firebase-applet-config.json (or the VITE_FIREBASE_* variables) must name the project and its Firestore database. Nothing can be shown without it.
        </Banner>
      </main>
    );
  }
  return <ConfiguredApp />;
}

function ConfiguredApp() {
  const access = useAccess();
  useEffect(() => purgeLegacyLocalData(), []);

  if (!access.ready) {
    return <main className="min-h-screen flex items-center justify-center text-muted-foreground">Starting…</main>;
  }
  if (!access.user) return <SignInScreen />;
  if (access.role === 'none') return <NoAccessScreen user={access.user} onRetry={access.refresh} />;
  return <Shell role={access.role} user={access.user} />;
}

function Shell({ role, user }: { role: Role; user: NonNullable<ReturnType<typeof useAccess>['user']> }) {
  const [hotel, setHotel] = useState(HOTELS[0]);
  const [view, setView] = useState<View>('door');
  const [service, setService] = useState<MealServiceType>('breakfast');
  const today = useBusinessDate();
  const [clock, setClock] = useState(() => bangkokTime(new Date(), true));
  const [backgroundErrors, setBackgroundErrors] = useState<string[]>([]);

  useEffect(() => {
    const id = setInterval(() => setClock(bangkokTime(new Date(), true)), 1000);
    return () => clearInterval(id);
  }, []);

  // Fetch the other door screens' code once the door is showing, so they still open if the
  // connection drops later. A failure here is not reported: opening the screen retries, and its
  // boundary says what went wrong.
  useEffect(() => {
    const id = setTimeout(() => {
      loadSeatingPlan().catch(() => undefined);
      loadMenuView().catch(() => undefined);
    }, 3000);
    return () => clearTimeout(id);
  }, []);

  // A write queued offline that the server later refused must not vanish silently.
  useEffect(
    () =>
      onBackgroundWriteError(({ label, error }) =>
        setBackgroundErrors((prev) => [...prev, `${label}: ${(error as Error)?.message || 'refused by the server'}`])
      ),
    []
  );

  // A view the role (or the property) cannot see falls back to the door.
  useEffect(() => {
    const item = NAV.find((n) => n.id === view);
    if (item && !item.visible(role, hotel.id)) setView('door');
  }, [view, role, hotel.id]);

  // Freshness of the guest list - see src/lib/freshness.ts.
  const [metadata, setMetadata] = useState<ReportMetadata | null>(null);
  const [metaError, setMetaError] = useState<{ code?: string; message?: string } | null>(null);
  const [metaSettled, setMetaSettled] = useState(false);
  useEffect(() => {
    setMetaSettled(false);
    setMetaError(null);
    return onSnapshot(
      doc(db, 'hotels', hotel.id, 'metadata', 'reports'),
      (snap) => {
        setMetaSettled(true);
        setMetaError(null);
        setMetadata(snap.exists() ? (snap.data() as ReportMetadata) : null);
      },
      (err) => {
        setMetaSettled(true);
        setMetadata(null);
        setMetaError({ code: err?.code, message: err?.message });
      }
    );
  }, [hotel.id]);

  const freshness = useMemo(() => {
    const lu = (metadata as { lastUploaded?: { toDate?: () => Date } } | null)?.lastUploaded;
    return assessFreshness({
      metadataDate: metadata?.date ?? null,
      lastUploaded: lu && typeof lu.toDate === 'function' ? lu.toDate() : null,
      today,
      readError: metaError,
      metadataSettled: metaSettled,
    });
  }, [metadata, metaError, metaSettled, today]);

  const groups = (['Door', 'Management', 'Administration'] as const)
    .map((g) => ({ g, items: NAV.filter((n) => n.group === g && n.visible(role, hotel.id)) }))
    .filter((x) => x.items.length > 0);

  return (
    <div className={`min-h-screen bg-background text-foreground flex flex-col md:flex-row ${hotel.theme}`}>
      <aside className="w-full md:w-72 bg-card border-r border-border flex flex-col shrink-0">
        <div className="p-5 space-y-5 flex-1">
          <div>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white ${hotel.id === 'ibis' ? 'bg-[#E2001A]' : 'bg-[#1A3A6D]'}`}>
                {hotel.id === 'ibis' ? 'I' : 'N'}
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-bold font-display leading-tight">{hotel.name}</h1>
                <span className="label-mono">{hotel.resortCode} · Opera</span>
              </div>
            </div>
            <div className="mt-3 p-1 rounded-xl bg-[#F2EBE4]/70 border border-border grid grid-cols-2 gap-1" role="tablist" aria-label="Property">
              {HOTELS.map((h) => (
                <button
                  key={h.id}
                  role="tab"
                  aria-selected={hotel.id === h.id}
                  onClick={() => setHotel(h)}
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
            {groups.map(({ g, items }) => (
              <div key={g} className="space-y-1">
                <p className="px-3 label-mono">{g}</p>
                {items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setView(n.id)}
                    aria-current={view === n.id ? 'page' : undefined}
                    className={`w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm font-bold cursor-pointer ${
                      view === n.id ? 'bg-white shadow-sm border border-black/10 text-foreground' : 'text-foreground/80 hover:bg-[#F2EBE4]'
                    }`}
                  >
                    {n.icon}
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
        <div className="p-5 border-t border-border">
          <UserBox user={user} role={role} />
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-6 overflow-y-auto space-y-4 min-w-0">
        {backgroundErrors.length > 0 && (
          <Banner
            tone="critical"
            title="Some changes made offline were refused by the server"
            role="alert"
            action={
              <button className="h-11 px-3 rounded-xl border border-red-300 bg-white text-sm font-bold cursor-pointer" onClick={() => setBackgroundErrors([])}>
                Dismiss
              </button>
            }
          >
            <ul className="list-disc pl-5">
              {backgroundErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            <p className="mt-1">Re-enter them now - they were not saved.</p>
          </Banner>
        )}

        {freshness.level !== 'ok' && !['import', 'menu', 'kitchen', 'sales'].includes(view) && (
          <Banner tone={FRESHNESS_TONE[freshness.level]} title={FRESHNESS_HEADING[freshness.level]} role={freshness.level === 'critical' ? 'alert' : 'status'}>
            {freshness.message}
          </Banner>
        )}

        {view === 'door' && (
          <DoorScreen
            hotelId={hotel.id}
            today={today}
            service={service}
            onServiceChange={setService}
            canManage={canManage(role)}
            onOpenImport={canImport(role) ? () => setView('import') : undefined}
          />
        )}
        {view !== 'door' && (
          <ScreenBoundary resetKey={`${view}:${hotel.id}`}>
            <Suspense fallback={<Banner tone="pending">Opening…</Banner>}>
              {view === 'floor' && <SeatingPlan hotelId={hotel.id} isAdmin={role === 'admin'} activeMealService={service} />}
              {view === 'menu' && hotel.id === 'novotel' && <MenuView />}
              {view === 'manifest' && canManage(role) && <GuestList hotelId={hotel.id} today={today} />}
              {view === 'forecast' && canManage(role) && <ForecastView hotelId={hotel.id} today={today} />}
              {view === 'analytics' && canManage(role) && <Analytics hotelId={hotel.id} today={today} />}
              {view === 'import' && canImport(role) && <ImportExport hotelId={hotel.id} today={today} />}
              {view === 'settings' && canManage(role) && <Settings hotelId={hotel.id} today={today} role={role} />}
              {view === 'orders' && hotel.id === 'novotel' && <OrdersScreen hotelId={hotel.id} today={today} role={role} />}
              {view === 'kitchen' && hotel.id === 'novotel' && <KitchenScreen hotelId={hotel.id} today={today} />}
              {view === 'sales' && hotel.id === 'novotel' && canManage(role) && <SalesScreen hotelId={hotel.id} today={today} />}
            </Suspense>
          </ScreenBoundary>
        )}

      </main>
    </div>
  );
}

export default App;
