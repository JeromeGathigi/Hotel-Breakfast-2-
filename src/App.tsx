import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { db, doc, isFirebaseConfigured, onBackgroundWriteError, onSnapshot, purgeLegacyLocalData } from './firebase';
import { HOTELS, type HotelInfo } from './constants';
import type { MealServiceType, ReportMetadata } from './types';
import { assessFreshness } from './lib/freshness';
import { bangkokTime } from './lib/businessDate';
import { canEditFloorPlan, canImport, canManage, type Role } from './lib/access';
import { canSee, isView, navItem, type View } from './navigation';
import { useAccess } from './hooks/useAccess';
import { useBusinessDate } from './hooks/useBusinessDate';
import { NoAccessScreen, SignInScreen, UserBox } from './components/Auth';
import { AppFrame } from './components/AppFrame';
import { DoorScreen } from './door/DoorScreen';
import { Banner, btn } from './components/ui';

// The check-in screen is in the first download; every other screen is fetched when first opened.
// The bundle was 1.8 MB, most of it charts and the floor-plan editor a door tablet rarely needs at
// 06:00. The floor plan and the Food Exchange screens are prefetched once the app is up (see
// Shell), so they still open if the Wi-Fi drops later in the service.
const loadSeatingPlan = () => import('./components/SeatingPlan').then((m) => ({ default: m.SeatingPlan }));
const loadOrderScreens = () => import('./orders/screens');
const SeatingPlan = lazy(loadSeatingPlan);
const GuestList = lazy(() => import('./components/GuestList').then((m) => ({ default: m.GuestList })));
const ForecastView = lazy(() => import('./components/ForecastView').then((m) => ({ default: m.ForecastView })));
const Analytics = lazy(() => import('./components/Analytics').then((m) => ({ default: m.Analytics })));
const OperaImport = lazy(() => import('./components/OperaImport').then((m) => ({ default: m.OperaImport })));
const Settings = lazy(() => import('./components/Settings').then((m) => ({ default: m.Settings })));
const OrdersScreen = lazy(() => loadOrderScreens().then((m) => ({ default: m.OrdersScreen })));
const KitchenScreen = lazy(() => loadOrderScreens().then((m) => ({ default: m.KitchenScreen })));
const MenuScreen = lazy(() => loadOrderScreens().then((m) => ({ default: m.MenuScreen })));
const SalesScreen = lazy(() => loadOrderScreens().then((m) => ({ default: m.SalesScreen })));

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

const FRESHNESS_TONE = { critical: 'critical', warn: 'warn', pending: 'pending', ok: 'ok' } as const;
const FRESHNESS_HEADING: Record<string, string> = {
  critical: 'Do not rely on this guest list',
  warn: 'This guest list may not be today’s',
  pending: 'Checking the guest list',
  ok: '',
};

/**
 * Which property this device works for. A device at the ibis door used to open on Novotel after
 * every reload. Remembered on the device only; it holds a property id, never guest data.
 */
const PROPERTY_KEY = 'hb2.property';

function savedHotel(): HotelInfo {
  try {
    const id = window.localStorage.getItem(PROPERTY_KEY);
    return HOTELS.find((h) => h.id === id) ?? HOTELS[0];
  } catch {
    return HOTELS[0];
  }
}

/** The screen is in the address (#kitchen), so a kitchen display can be bookmarked and Back works. */
function viewFromAddress(): View | null {
  const id = window.location.hash.replace(/^#\/?/, '');
  return isView(id) ? id : null;
}

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
  const [hotel, setHotelState] = useState<HotelInfo>(savedHotel);
  const [view, setViewState] = useState<View>(() => viewFromAddress() ?? 'door');
  const [service, setService] = useState<MealServiceType>('breakfast');
  const today = useBusinessDate();
  const [clock, setClock] = useState(() => bangkokTime(new Date(), true));
  const [backgroundErrors, setBackgroundErrors] = useState<string[]>([]);

  const setHotel = (h: HotelInfo) => {
    setHotelState(h);
    try {
      window.localStorage.setItem(PROPERTY_KEY, h.id);
    } catch {
      // Storage blocked: the choice lasts until the page reloads.
    }
  };

  /** `replace` for corrections (a screen the role cannot see), so Back does not return to them. */
  const go = useCallback((next: View, replace = false) => {
    setViewState(next);
    if (viewFromAddress() === next) return;
    if (replace) window.history.replaceState(null, '', `#${next}`);
    else window.location.hash = next;
  }, []);

  useEffect(() => {
    const onAddress = () => setViewState(viewFromAddress() ?? 'door');
    window.addEventListener('hashchange', onAddress);
    return () => window.removeEventListener('hashchange', onAddress);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setClock(bangkokTime(new Date(), true)), 1000);
    return () => clearInterval(id);
  }, []);

  // Fetch the other service screens' code once the door is showing, so they still open if the
  // connection drops later. A failure here is not reported: opening the screen retries, and its
  // boundary says what went wrong.
  useEffect(() => {
    const id = setTimeout(() => {
      loadSeatingPlan().catch(() => undefined);
      loadOrderScreens().catch(() => undefined);
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

  // A screen the role (or the property) cannot see - an old bookmark, or ibis chosen while on
  // Orders - falls back to the door.
  useEffect(() => {
    if (!canSee(view, role, hotel.id)) go('door', true);
  }, [view, role, hotel.id, go]);

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

  const visible = canSee(view, role, hotel.id);
  const current = navItem(view);

  const screen = (): React.ReactNode => {
    switch (view) {
      case 'floor':
        return <SeatingPlan hotelId={hotel.id} isAdmin={canEditFloorPlan(role)} activeMealService={service} />;
      case 'orders':
        return <OrdersScreen hotelId={hotel.id} today={today} role={role} />;
      case 'kitchen':
        return <KitchenScreen hotelId={hotel.id} today={today} role={role} />;
      case 'menu':
        return <MenuScreen hotelId={hotel.id} />;
      case 'manifest':
        return <GuestList hotelId={hotel.id} today={today} />;
      case 'forecast':
        return <ForecastView hotelId={hotel.id} today={today} />;
      case 'analytics':
        return <Analytics hotelId={hotel.id} today={today} />;
      case 'sales':
        return <SalesScreen hotelId={hotel.id} today={today} />;
      case 'import':
        return <OperaImport hotelId={hotel.id} today={today} />;
      case 'settings':
        return <Settings hotelId={hotel.id} today={today} role={role} />;
      default:
        return null;
    }
  };

  return (
    <AppFrame hotel={hotel} onHotelChange={setHotel} role={role} view={view} onNavigate={go} clock={clock} today={today} account={<UserBox user={user} role={role} />}>
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

      {freshness.level !== 'ok' && current.usesGuestList && (
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
          onOpenImport={canImport(role) ? () => go('import') : undefined}
        />
      )}
      {view !== 'door' && visible && (
        <ScreenBoundary resetKey={`${view}:${hotel.id}`}>
          <Suspense fallback={<Banner tone="pending">Opening…</Banner>}>{screen()}</Suspense>
        </ScreenBoundary>
      )}
    </AppFrame>
  );
}

export default App;
