import React, { useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import { parseInHouseReport } from '../parsing';
import { planForecastImport, planGuestListImport, type ForecastImportPlan, type GuestImportPlan, type HotelId } from '../lib/guestImport';
import { readCurrentList, runForecastImport, runGuestImport, type CurrentList } from '../lib/firestoreImport';
import { Banner, btn } from './ui';

const NAME: Record<HotelId, string> = { novotel: 'Novotel', ibis: 'ibis' };

/**
 * Opera import, administrators only - the database lets nobody else write the guest list.
 *
 * Both Opera files are imported here, one property at a time, and each import is PLANNED and shown
 * before anything is written: which property the file says it is, whether it is today's, how many
 * rooms arrive and leave, what breakfast looks like. Problems that need a person's judgement must
 * be ticked off before the import button enables. See src/lib/guestImport.ts for the rules.
 *
 * The CSV exports that used to sit here only read data a manager may read, so they moved to the
 * screens holding that data: the manifest, the meal forecast, Settings > Rate codes and Analytics.
 */
export const OperaImport: React.FC<{ hotelId: string; today: string }> = ({ hotelId, today }) => {
  const hotel = hotelId as HotelId;
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-5 border border-border shadow-luxury">
        <h2 className="text-2xl font-bold font-display">Opera import · {NAME[hotel]}</h2>
        <p className="text-sm text-muted-foreground">
          Each morning: export the two Opera reports for {NAME[hotel]} as tab-delimited text and import them here. Switch property in the sidebar for the other hotel.
        </p>
      </div>
      <GuestListImport hotel={hotel} today={today} />
      <ForecastImport hotel={hotel} today={today} />
    </div>
  );
};

function useFileText() {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const pick = (f: File | undefined) => {
    setReadError(null);
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setFile({ name: f.name, text: String(reader.result ?? '') });
    reader.onerror = () => setReadError(`Could not read ${f.name}.`);
    reader.readAsText(f);
  };
  return { file, setFile, readError, pick };
}

const FilePicker: React.FC<{ label: string; onPick: (f: File | undefined) => void; disabled?: boolean }> = ({ label, onPick, disabled }) => (
  <label className={`${btn.secondary} ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
    <FileText size={16} /> {label}
    <input type="file" accept=".txt,.tsv,.csv" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} onClick={(e) => ((e.target as HTMLInputElement).value = '')} />
  </label>
);

const Confirmations: React.FC<{ items: string[]; accepted: Set<number>; onToggle: (i: number) => void }> = ({ items, accepted, onToggle }) =>
  items.length === 0 ? null : (
    <fieldset className="space-y-2">
      <legend className="text-sm font-bold text-amber-950">Confirm before importing</legend>
      {items.map((c, i) => (
        <label key={i} className="flex items-start gap-3 p-3 rounded-xl border-2 border-amber-300 bg-amber-50 cursor-pointer">
          <input type="checkbox" className="h-5 w-5 mt-0.5" checked={accepted.has(i)} onChange={() => onToggle(i)} />
          <span className="text-sm">{c}</span>
        </label>
      ))}
    </fieldset>
  );

function GuestListImport({ hotel, today }: { hotel: HotelId; today: string }) {
  const { file, setFile, readError, pick } = useFileText();
  const [plan, setPlan] = useState<GuestImportPlan | null>(null);
  const [current, setCurrent] = useState<CurrentList | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'ok' | 'critical'; text: string } | null>(null);

  const analyse = async (picked: File | undefined) => {
    setPlan(null);
    setResult(null);
    setAccepted(new Set());
    pick(picked);
  };

  React.useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const cur = await readCurrentList(hotel);
        const parsed = parseInHouseReport(file.text, hotel, { today });
        const p = planGuestListImport({
          parsed,
          filename: file.name,
          rawText: file.text,
          targetHotelId: hotel,
          today,
          current: { roomIds: cur.guests.map((g) => g.roomNumber), metadataDate: cur.metadataDate },
          packages: cur.packages,
        });
        if (!cancelled) {
          setCurrent(cur);
          setPlan(p);
        }
      } catch (e) {
        if (!cancelled) setResult({ tone: 'critical', text: `Could not prepare the import: ${(e as Error)?.message || 'unknown error'}` });
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, hotel, today]);

  const run = async () => {
    if (!plan || !current || !file) return;
    setBusy(true);
    setResult(null);
    try {
      const { archived } = await runGuestImport(plan, { filename: file.name, today, current });
      setResult({
        tone: 'ok',
        text: `Imported ${plan.rooms.length} rooms into ${NAME[hotel]}: ${plan.addedRoomIds.length} new, ${plan.removedRoomIds.length} removed${archived ? `, the ${plan.archiveDate} list archived` : ''}.`,
      });
      setPlan(null);
      setFile(null);
    } catch (e) {
      setResult({ tone: 'critical', text: `The import failed: ${(e as Error)?.message || 'unknown error'}. The door still shows the previous list.` });
    } finally {
      setBusy(false);
    }
  };

  const allAccepted = plan ? plan.confirmations.every((_, i) => accepted.has(i)) : false;

  return (
    <section className="bg-white rounded-2xl border border-border p-5 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold">Guest list</h3>
          <p className="text-sm text-muted-foreground">Opera report "Guests INH - By Room", Delimited Data → Tab.</p>
        </div>
        <FilePicker label={file ? 'Choose another file' : 'Choose file'} onPick={analyse} disabled={busy} />
      </div>
      {readError && <Banner tone="critical">{readError}</Banner>}
      {busy && !plan && <Banner tone="pending">Reading the file and the current list…</Banner>}
      {plan && !plan.ok && (
        <Banner tone="critical" title="This file was not imported" role="alert">
          <p>{plan.reason}</p>
          <p className="mt-1 text-xs">The current guest list has not been changed.</p>
        </Banner>
      )}
      {plan && plan.ok && (
        <>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <Fact label="Rooms" value={plan.rooms.length} />
            <Fact label="Arrived" value={plan.addedRoomIds.length} />
            <Fact label="Departed (removed)" value={plan.removedRoomIds.length} />
            <Fact label="Archived first" value={plan.archiveDate ?? '—'} />
            <Fact label="Breakfast confirmed" value={`${plan.stats.totalEntitledBreakfast} pax`} />
            <Fact label="Needs checking" value={`${plan.stats.totalUnverifiedBreakfast ?? 0} pax`} sub={(plan.stats.unverifiedRateCodes ?? []).join(', ')} />
            <Fact label="VIP rooms" value={plan.stats.vipCount} />
            <Fact label="Rows flagged" value={plan.stats.anomaliesCount} />
          </dl>
          {plan.warnings.map((w) => (
            <Banner key={w} tone="info">
              {w}
            </Banner>
          ))}
          <Confirmations items={plan.confirmations} accepted={accepted} onToggle={(i) => setAccepted((p) => new Set(p.has(i) ? [...p].filter((x) => x !== i) : [...p, i]))} />
          <button className={btn.primary} onClick={run} disabled={busy || !allAccepted}>
            <Upload size={18} /> {busy ? 'Importing…' : `Replace ${NAME[hotel]}'s guest list`}
          </button>
        </>
      )}
      {result && (
        <Banner tone={result.tone} role={result.tone === 'critical' ? 'alert' : 'status'}>
          {result.text}
        </Banner>
      )}
    </section>
  );
}

function ForecastImport({ hotel, today }: { hotel: HotelId; today: string }) {
  const { file, setFile, readError, pick } = useFileText();
  const [plan, setPlan] = useState<ForecastImportPlan | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'ok' | 'critical'; text: string } | null>(null);

  React.useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setResult(null);
      try {
        // The forecast names no property. Compare its reservations with BOTH hotels' lists.
        const [nov, ibi] = await Promise.all([readCurrentList('novotel'), readCurrentList('ibis')]);
        const p = planForecastImport({
          rawText: file.text,
          filename: file.name,
          targetHotelId: hotel,
          today,
          currentResvIds: { novotel: nov.guests.map((g) => g.resvNameId), ibis: ibi.guests.map((g) => g.resvNameId) },
        });
        if (!cancelled) setPlan(p);
      } catch (e) {
        if (!cancelled) setResult({ tone: 'critical', text: `Could not prepare the import: ${(e as Error)?.message || 'unknown error'}` });
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, hotel, today]);

  const run = async () => {
    if (!plan || !file) return;
    setBusy(true);
    try {
      await runForecastImport(plan, file.name);
      setResult({ tone: 'ok', text: `Imported ${plan.forecastDocs.length} days${plan.index ? ` and ${plan.index.reservations} reservations' packages` : ''} for ${NAME[hotel]}.` });
      setPlan(null);
      setFile(null);
    } catch (e) {
      setResult({ tone: 'critical', text: `The import failed: ${(e as Error)?.message || 'unknown error'}.` });
    } finally {
      setBusy(false);
    }
  };

  const allAccepted = plan ? plan.confirmations.every((_, i) => accepted.has(i)) : false;

  return (
    <section className="bg-white rounded-2xl border border-border p-5 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold">Package forecast</h3>
          <p className="text-sm text-muted-foreground">Opera's package forecast. It confirms breakfast reservation by reservation, and gives the kitchen its count.</p>
        </div>
        <FilePicker
          label={file ? 'Choose another file' : 'Choose file'}
          onPick={(f) => {
            setPlan(null);
            setAccepted(new Set());
            pick(f);
          }}
          disabled={busy}
        />
      </div>
      {readError && <Banner tone="critical">{readError}</Banner>}
      {busy && !plan && <Banner tone="pending">Reading the file…</Banner>}
      {plan && !plan.ok && (
        <Banner tone="critical" title="This file was not imported" role="alert">
          {plan.reason}
        </Banner>
      )}
      {plan && plan.ok && (
        <>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <Fact label="Days" value={plan.forecastDocs.length} />
            <Fact label="Breakfast today" value={plan.todayBreakfast ?? '—'} />
            <Fact label="Reservations" value={plan.index?.reservations ?? 0} />
            <Fact label="Produced by Opera" value={plan.index?.reportDate || '—'} />
            {plan.overlap && <Fact label={`Matches ${NAME[hotel]}'s guests`} value={plan.overlap[hotel]} />}
          </dl>
          {plan.warnings.map((w) => (
            <Banner key={w} tone="info">
              {w}
            </Banner>
          ))}
          <Confirmations items={plan.confirmations} accepted={accepted} onToggle={(i) => setAccepted((p) => new Set(p.has(i) ? [...p].filter((x) => x !== i) : [...p, i]))} />
          <button className={btn.primary} onClick={run} disabled={busy || !allAccepted}>
            <Upload size={18} /> {busy ? 'Importing…' : `Import ${NAME[hotel]}'s forecast`}
          </button>
        </>
      )}
      {result && (
        <Banner tone={result.tone} role={result.tone === 'critical' ? 'alert' : 'status'}>
          {result.text}
        </Banner>
      )}
    </section>
  );
}

const Fact: React.FC<{ label: string; value: React.ReactNode; sub?: string }> = ({ label, value, sub }) => (
  <div className="rounded-xl border border-border p-3">
    <dt className="label-mono">{label}</dt>
    <dd className="text-lg font-bold">{value}</dd>
    {sub && <dd className="text-xs text-muted-foreground break-words">{sub}</dd>}
  </div>
);
