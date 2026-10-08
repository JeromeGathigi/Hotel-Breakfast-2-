import React, { useMemo, useState } from 'react';
import { Ban, Search } from 'lucide-react';
import { Banner, Modal, Stepper, btn } from '../components/ui';
import { ALLERGEN_NOTE, MENU_SECTIONS, grossPriceThb, type MenuSectionId } from '../data/foodExchangeMenu';
import { buildCatalog, searchCatalog, type CatalogEntry } from './menuCatalog';
import { formatThb } from './orderModel';

/**
 * Adding dishes to an order. Prices are the menu's net prices; the gross a guest pays is shown
 * beside them because that is the number they will question. A sold-out dish stays visible but
 * cannot be added - and whoever learns a dish has run out can mark it sold out or back from here.
 */

const CATALOG = buildCatalog();

export const MenuPicker: React.FC<{
  soldOut: string[];
  canMarkSoldOut: boolean;
  onAdd: (entry: CatalogEntry, qty: number, note: string) => Promise<void>;
  onToggleSoldOut: (baseId: string, soldOut: boolean) => Promise<void>;
  onClose: () => void;
}> = ({ soldOut, canMarkSoldOut, onAdd, onToggleSoldOut, onClose }) => {
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<MenuSectionId | 'all'>('all');
  const [picked, setPicked] = useState<CatalogEntry | null>(null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const out = useMemo(() => new Set(soldOut), [soldOut]);

  const entries = searchCatalog(CATALOG, query).filter((e) => section === 'all' || e.section === section);

  const pick = (e: CatalogEntry) => {
    setPicked(e);
    setQty(1);
    setNote('');
    setError(null);
  };

  const add = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(picked, qty, note);
      setAdded(`${qty} × ${picked.name}`);
      setPicked(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (e: CatalogEntry) => {
    setError(null);
    try {
      await onToggleSoldOut(e.baseId, !out.has(e.baseId));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Modal title="Add items" subtitle={ALLERGEN_NOTE} onClose={onClose} width="xl" footer={<button className={btn.primary} onClick={onClose}>Done</button>}>
      {error && (
        <Banner tone="critical" role="alert">
          {error}
        </Banner>
      )}
      {added && !picked && <Banner tone="ok">Added {added}. It goes to the kitchen when you press Send.</Banner>}

      <label className="relative block">
        <span className="sr-only">Search the menu</span>
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} autoFocus placeholder="Dish, ingredient, or section and number" className="w-full h-11 pl-10 pr-3 rounded-xl border border-border text-base" />
      </label>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {[{ id: 'all' as const, title: 'All' }, ...MENU_SECTIONS].map((s) => (
          <button key={s.id} onClick={() => setSection(s.id)} className={`h-9 px-3 rounded-full text-sm font-semibold whitespace-nowrap cursor-pointer ${section === s.id ? 'bg-accent text-white' : 'bg-[#F2EBE4]'}`}>
            {s.title}
          </button>
        ))}
      </div>

      {picked && (
        <div className="rounded-2xl border-2 border-accent p-4 space-y-3 bg-accent/5">
          <div className="flex justify-between gap-3">
            <div>
              <p className="font-bold text-lg">{picked.name}</p>
              {picked.description && <p className="text-sm text-muted-foreground">{picked.description}</p>}
            </div>
            <p className="text-right font-bold tabular-nums">{formatThb(picked.unitPriceThb)}</p>
          </div>
          {picked.verify && <Banner tone="warn">Check this against the printed menu: {picked.verify}</Banner>}
          <div className="grid sm:grid-cols-2 gap-3">
            <Stepper label="Quantity" value={qty} onChange={setQty} min={1} max={50} />
            <div>
              <label htmlFor="line-note" className="text-sm font-bold block mb-1">
                Note for the kitchen
              </label>
              <input id="line-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Allergy, no chili, well done…" className="w-full h-11 px-3 rounded-xl border border-border text-base" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button className={btn.secondary} onClick={() => setPicked(null)}>
              Back
            </button>
            <button className={btn.primary} onClick={add} disabled={busy}>
              {busy ? 'Adding…' : `Add ${qty} · ${formatThb(picked.unitPriceThb * qty)}`}
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-border rounded-xl border border-border">
        {entries.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nothing on the menu matches.</p>}
        {entries.map((e) => {
          const isOut = out.has(e.baseId);
          return (
            <div key={e.menuItemId} className={`flex items-center gap-2 p-2 ${isOut ? 'opacity-60' : ''}`}>
              <button onClick={() => pick(e)} disabled={isOut} className="flex-1 min-w-0 text-left p-2 rounded-lg hover:bg-[#F2EBE4]/60 disabled:cursor-not-allowed cursor-pointer">
                <span className="font-semibold">{e.name}</span>
                {isOut && <span className="ml-2 text-xs font-bold uppercase text-rose-700">Sold out</span>}
                {e.dietary?.length ? <span className="ml-2 text-xs text-emerald-800">{e.dietary.join(', ')}</span> : null}
                <span className="block text-xs text-muted-foreground truncate">
                  {e.sectionTitle} {e.itemNumber}
                  {e.description ? ` · ${e.description}` : ''}
                </span>
              </button>
              <span className="text-right text-sm tabular-nums w-24">
                <span className="font-bold block">{formatThb(e.unitPriceThb)}</span>
                <span className="text-xs text-muted-foreground">{formatThb(grossPriceThb(e.unitPriceThb))} +++</span>
              </span>
              {canMarkSoldOut && (
                <button onClick={() => toggle(e)} title={isOut ? 'Mark available again' : 'Mark sold out'} aria-label={isOut ? `Mark ${e.name} available` : `Mark ${e.name} sold out`} className={`h-11 w-11 rounded-xl border flex items-center justify-center cursor-pointer ${isOut ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-border text-muted-foreground'}`}>
                  <Ban size={18} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
};
