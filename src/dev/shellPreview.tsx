import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import { AppFrame } from '../components/AppFrame';
import { HOTELS } from '../constants';
import { ROLE_LABEL, type Role } from '../lib/access';
import { bangkokTime, businessDate } from '../lib/businessDate';
import { canSee, navItem, type View } from '../navigation';

/**
 * DEV-ONLY preview of the frame around every screen - property, navigation and account - for each
 * role, at any width. Served by the dev server at /dev/shell-preview.html, never part of the
 * production build, and connected to nothing: the screens themselves need a signed-in session
 * (the door has its own preview at /dev/door-preview.html).
 */

const ROLES: Exclude<Role, 'none'>[] = ['staff', 'manager', 'admin'];

function Preview() {
  const [role, setRole] = useState<Exclude<Role, 'none'>>('staff');
  const [hotel, setHotel] = useState(HOTELS[0]);
  const [view, setView] = useState<View>('door');
  const [clock, setClock] = useState(() => bangkokTime(new Date(), true));

  useEffect(() => {
    const id = setInterval(() => setClock(bangkokTime(new Date(), true)), 1000);
    return () => clearInterval(id);
  }, []);

  // As in the app: a screen the role or the property cannot see falls back to the door.
  useEffect(() => {
    if (!canSee(view, role, hotel.id)) setView('door');
  }, [view, role, hotel.id]);

  return (
    <AppFrame
      hotel={hotel}
      onHotelChange={setHotel}
      role={role}
      view={view}
      onNavigate={setView}
      clock={clock}
      today={businessDate()}
      account={
        <div className="text-sm">
          <p className="font-bold">PREVIEW ACCOUNT</p>
          <p className="text-muted-foreground">{ROLE_LABEL[role]}</p>
        </div>
      }
    >
      <div className="rounded-2xl border-2 border-dashed border-fuchsia-500 bg-fuchsia-50 p-3 text-sm text-fuchsia-950 space-y-2">
        <p>
          <strong>DEV PREVIEW</strong> - the frame only, not connected to Firebase. See it as:
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Preview role">
          {ROLES.map((r) => (
            <button
              key={r}
              aria-pressed={role === r}
              onClick={() => setRole(r)}
              className={`h-11 px-4 rounded-xl border font-bold cursor-pointer ${role === r ? 'bg-fuchsia-700 text-white border-fuchsia-700' : 'bg-white border-fuchsia-300'}`}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-2xl p-6 border border-border">
        <h2 className="text-2xl font-bold font-display">{navItem(view).label}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {navItem(view).group} · {hotel.shortName}. The screen itself needs a signed-in session.
        </p>
      </div>
    </AppFrame>
  );
}

// A hot reload re-runs this module: reuse the root rather than create a second one on the same node.
const container = document.getElementById('root') as HTMLElement & { __previewRoot?: ReactDOM.Root };
container.__previewRoot ??= ReactDOM.createRoot(container);
container.__previewRoot.render(<Preview />);
