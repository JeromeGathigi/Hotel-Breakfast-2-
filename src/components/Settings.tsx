import React, { useEffect, useMemo, useState } from 'react';
import { Database, KeyRound, ListChecks, ScrollText, Search, Shield, Trash2 } from 'lucide-react';
import { collection, db, doc, limit, onSnapshot, orderBy, query } from '../firebase';
import type { AuditLogEntry, ReportMetadata } from '../types';
import type { PackageIndex } from '../parsing/packageDetail';
import { useDoorData } from '../door/useDoorData';
import { buildDoorRooms } from '../door/doorModel';
import { assessBreakfast, PROPERTY_BREAKFAST_CODES } from '../lib/meals';
import { lookupRate } from '../lib/rateReferential';
import { OWNER_ADMIN_EMAILS, ROLE_LABEL, STAFF_EMAIL_DOMAIN, type Role } from '../lib/access';
import { dateTimeInBangkok } from '../lib/dates';
import { purgeJunk, scanForJunk, type MaintenanceScan } from '../lib/maintenance';
import { Banner, Modal, btn } from './ui';
import { VipLegend } from './VipLegend';

type Tab = 'status' | 'rates' | 'audit' | 'access' | 'maintenance';

/**
 * Settings: the things nobody needs at the door during service. The owner asked for the general
 * view to carry less, and for these to live somewhere else - audit history, rate-code reference,
 * import status, roles, maintenance. Managers see Settings; maintenance is administrators only.
 */
export const Settings: React.FC<{ hotelId: string; today: string; role: Role }> = ({ hotelId, today, role }) => {
  const [tab, setTab] = useState<Tab>('status');
  const tabs: Array<[Tab, string, React.ReactNode]> = [
    ['status', 'Data status', <Database size={16} key="d" />],
    ['rates', 'Rate codes', <ListChecks size={16} key="r" />],
    ['audit', 'Audit log', <ScrollText size={16} key="a" />],
    ['access', 'Access', <KeyRound size={16} key="k" />],
    ...(role === 'admin' ? ([['maintenance', 'Data maintenance', <Trash2 size={16} key="m" />]] as Array<[Tab, string, React.ReactNode]>) : []),
  ];
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-5 border border-border shadow-luxury">
        <h2 className="text-2xl font-bold font-display">Settings</h2>
        <div className="flex flex-wrap gap-1.5 mt-3" role="tablist">
          {tabs.map(([id, label, icon]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`h-11 px-3 rounded-xl text-sm font-bold flex items-center gap-2 border cursor-pointer ${tab === id ? 'bg-foreground text-white border-foreground' : 'bg-white border-border'}`}>
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'status' && <DataStatus hotelId={hotelId} today={today} />}
      {tab === 'rates' && <RateCodes hotelId={hotelId} today={today} />}
      {tab === 'audit' && <AuditLog hotelId={hotelId} />}
      {tab === 'access' && <Access role={role} />}
      {tab === 'maintenance' && role === 'admin' && <Maintenance hotelId={hotelId} today={today} />}
    </div>
  );
};

function DataStatus({ hotelId, today }: { hotelId: string; today: string }) {
  const [meta, setMeta] = useState<ReportMetadata | null | undefined>(undefined);
  const [pkg, setPkg] = useState<PackageIndex | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const fail = (e: { message?: string }) => setError(e?.message || 'Could not be read.');
    const a = onSnapshot(doc(db, 'hotels', hotelId, 'metadata', 'reports'), (s) => setMeta(s.exists() ? (s.data() as ReportMetadata) : null), fail);
    const b = onSnapshot(doc(db, 'hotels', hotelId, 'metadata', 'packages'), (s) => setPkg(s.exists() ? (s.data() as PackageIndex) : null), fail);
    return () => {
      a();
      b();
    };
  }, [hotelId]);
  return (
    <section className="bg-white rounded-2xl border border-border p-5 space-y-3">
      {error && <Banner tone="critical">{error}</Banner>}
      <h3 className="font-bold">Guest list</h3>
      {meta === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : meta === null ? (
        <p className="text-sm">Never imported.</p>
      ) : (
        <p className="text-sm">
          List for <strong>{meta.date}</strong>
          {meta.date === today ? ' (today)' : ' - not today'} · {meta.filename} · imported {dateTimeInBangkok(meta.lastUploaded)} by {meta.uploadedBy || 'unknown'} · {meta.stats?.totalRooms ?? '?'} rooms
        </p>
      )}
      <h3 className="font-bold pt-2">Package forecast</h3>
      {pkg === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : pkg === null ? (
        <p className="text-sm">Never imported. Without it, breakfast is decided from rate codes and notes only.</p>
      ) : (
        <p className="text-sm">
          Produced by Opera on <strong>{pkg.reportDate}</strong>
          {pkg.reportDate === today ? ' (today)' : ''} · {pkg.filename} · {pkg.reservations} reservations · imported {dateTimeInBangkok(pkg.importedAt)}
        </p>
      )}
      <p className="text-xs text-muted-foreground pt-2">The business day changes at 04:00 Bangkok time. Imports archive the previous day's list automatically; no scheduled job is needed.</p>
    </section>
  );
}

function RateCodes({ hotelId, today }: { hotelId: string; today: string }) {
  const data = useDoorData(hotelId, today);
  const rooms = useMemo(() => buildDoorRooms(data, 'breakfast'), [data]);
  const flagged = rooms.filter((r) => r.breakfast.unverified || r.breakfast.conflict);
  const byCode = new Map<string, typeof flagged>();
  for (const r of flagged) {
    const code = (r.guest.rateCode || r.guest.mealPlan || '(none)').toUpperCase();
    byCode.set(code, [...(byCode.get(code) ?? []), r]);
  }
  const [lookup, setLookup] = useState('');
  const code = lookup.trim().toUpperCase();
  const info = code ? lookupRate(code) : null;
  const verdict = code ? assessBreakfast(code) : null;

  return (
    <section className="space-y-4">
      <div className="bg-white rounded-2xl border border-border p-5 space-y-2">
        <h3 className="font-bold">Look up a rate code</h3>
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full h-11 pl-9 pr-3 rounded-xl border border-border text-base uppercase" placeholder="e.g. RC3S" value={lookup} onChange={(e) => setLookup(e.target.value)} />
        </div>
        {code && (
          <p className="text-sm">
            {info ? (
              <>
                <strong>{info.name}</strong> · meal plan {info.plan} in Accor's referential.{' '}
              </>
            ) : PROPERTY_BREAKFAST_CODES.has(code) ? (
              <>On the property's fixed-breakfast list. </>
            ) : (
              <>Not in Accor's referential. </>
            )}
            {verdict?.reason}
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-border p-5 space-y-3">
        <h3 className="font-bold">Rooms the app cannot confirm today</h3>
        {data.loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : flagged.length === 0 ? (
          <p className="text-sm">None - every room's breakfast is confirmed.</p>
        ) : (
          [...byCode.entries()].map(([c, rs]) => (
            <div key={c} className="rounded-xl border border-border p-3">
              <p className="font-bold">
                {c} · {rs.length} room{rs.length === 1 ? '' : 's'}
              </p>
              <p className="text-sm text-muted-foreground">{rs[0].breakfast.reason}</p>
              <p className="text-xs text-muted-foreground mt-1">Rooms {rs.map((r) => r.guest.roomNumber).join(', ')}</p>
            </div>
          ))
        )}
        <p className="text-xs text-muted-foreground">
          Breakfast is decided from, in order: a correction made at the door, Opera's package list, the front-office note, the property's rate list, Accor's referential.
        </p>
      </div>
      <VipLegend defaultOpen />
    </section>
  );
}

function AuditLog({ hotelId }: { hotelId: string }) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState('');
  useEffect(() => {
    // Newest 200, ordered by the server. The old modal downloaded the WHOLE log on every open.
    return onSnapshot(
      query(collection(db, 'hotels', hotelId, 'auditLogs'), orderBy('timestamp', 'desc'), limit(200)),
      (s) => setEntries(s.docs.map((d) => ({ id: d.id, ...d.data() }) as AuditLogEntry)),
      (e) => setError(e?.message || 'The audit log could not be read.')
    );
  }, [hotelId]);
  const shown = room.trim() ? entries.filter((e) => e.roomNumber === room.trim()) : entries;
  return (
    <section className="bg-white rounded-2xl border border-border p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">Latest 200 entries</h3>
        <input className="h-11 px-3 rounded-xl border border-border" placeholder="Filter by room" value={room} onChange={(e) => setRoom(e.target.value)} />
      </div>
      {error && <Banner tone="critical">{error}</Banner>}
      <ul className="divide-y divide-border">
        {shown.map((e) => (
          <li key={e.id} className="py-2 text-sm">
            <p>
              <span className="font-mono-custom text-xs text-muted-foreground mr-2">{dateTimeInBangkok(e.timestamp)}</span>
              <strong>{e.action}</strong> · {e.details}
            </p>
            <p className="text-xs text-muted-foreground">{e.userEmail}</p>
          </li>
        ))}
        {shown.length === 0 && !error && <li className="py-6 text-center text-sm text-muted-foreground">No entries.</li>}
      </ul>
    </section>
  );
}

function Access({ role }: { role: Role }) {
  return (
    <section className="bg-white rounded-2xl border border-border p-5 space-y-3 text-sm">
      <p className="flex items-center gap-2 text-base">
        <Shield size={18} /> Your role: <strong>{ROLE_LABEL[role]}</strong>
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          <strong>Host stand</strong> - check-in, corrections, floor plan, menu. Every verified @{STAFF_EMAIL_DOMAIN} account has it.
        </li>
        <li>
          <strong>Manager</strong> - plus the manifest, forecast, analytics and these settings.
        </li>
        <li>
          <strong>Administrator</strong> - plus Opera imports, floor-plan editing and data maintenance. Owner accounts: {OWNER_ADMIN_EMAILS.join(', ')}.
        </li>
      </ul>
      <p>
        Roles other than the domain default are granted by an administrator with <code className="font-mono-custom">scripts/setClaims.ts</code> (needs a Firebase service account on the back-office PC). The person signs out and in again, or presses "Check again", to pick it up.
      </p>
      <p className="text-muted-foreground">The same rules are enforced by the database (firestore.rules); the app only hides what the database would refuse anyway.</p>
    </section>
  );
}

function Maintenance({ hotelId, today }: { hotelId: string; today: string }) {
  const [scan, setScan] = useState<MaintenanceScan | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'critical'; text: string } | null>(null);
  const total = scan ? scan.dailySummaries.length + scan.legacyForecasts.length + scan.checkins.length + scan.junkGuests.length : 0;

  const runScan = async () => {
    setBusy(true);
    setMessage(null);
    try {
      setScan(await scanForJunk(hotelId, today));
    } catch (e) {
      setMessage({ tone: 'critical', text: `Scan failed: ${(e as Error)?.message || 'unknown error'}` });
    } finally {
      setBusy(false);
    }
  };
  const purge = async () => {
    if (!scan) return;
    setConfirm(false);
    setBusy(true);
    try {
      const n = await purgeJunk(hotelId, scan);
      setMessage({ tone: 'ok', text: `Removed ${n} documents.` });
      setScan(null);
    } catch (e) {
      setMessage({ tone: 'critical', text: `Removal failed part-way: ${(e as Error)?.message || 'unknown error'}. Scan again to see what remains.` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-border p-5 space-y-3">
      <h3 className="font-bold">Records earlier versions wrote that are not real</h3>
      <p className="text-sm text-muted-foreground">
        Fabricated daily summaries, forecasts from the old over-counting parser, seeded or junk check-ins, and guest documents whose id is not a room number. Scanning reads only; nothing is removed until you confirm.
      </p>
      <button className={btn.secondary} onClick={runScan} disabled={busy}>
        {busy && !scan ? 'Scanning…' : 'Scan'}
      </button>
      {scan && (
        <div className="space-y-1 text-sm">
          <p>Scanned {scan.daysScanned} days of check-ins.</p>
          <p>Fabricated daily summaries: {scan.dailySummaries.length}</p>
          <p>Over-counted forecasts: {scan.legacyForecasts.length}{scan.legacyForecasts.length ? ` (${scan.legacyForecasts[0]} - ${scan.legacyForecasts[scan.legacyForecasts.length - 1]})` : ''}</p>
          <p>Synthetic or junk check-ins: {scan.checkins.length}</p>
          <p>Junk guest documents: {scan.junkGuests.length}{scan.junkGuests.length ? ` (${scan.junkGuests.join(', ')})` : ''}</p>
          {total > 0 && (
            <button className={btn.danger} onClick={() => setConfirm(true)} disabled={busy}>
              <Trash2 size={16} /> Remove {total} documents
            </button>
          )}
        </div>
      )}
      {message && <Banner tone={message.tone}>{message.text}</Banner>}
      {confirm && (
        <Modal
          title={`Remove ${total} documents?`}
          onClose={() => setConfirm(false)}
          width="md"
          footer={
            <>
              <button className={btn.secondary} onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button className={btn.danger} onClick={purge}>
                Remove permanently
              </button>
            </>
          }
        >
          <p>This cannot be undone. Firestore backups are not enabled on this project, so there is no copy to restore from.</p>
        </Modal>
      )}
    </section>
  );
}
