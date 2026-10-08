import React, { useMemo, useState } from 'react';
import { Ban, Search, Undo2 } from 'lucide-react';
import { Banner, Modal, btn } from '../components/ui';
import { buildDishes } from './menuCatalog';

/**
 * Marking dishes sold out ("86") from the kitchen, where it is known first. Per dish, not per
 * price: when the basil runs out, every Phad Kra Pao goes. Hosts can do the same from an order's
 * menu; both write the one list every order and the menu read.
 */

const DISHES = buildDishes();

export const SoldOutDialog: React.FC<{
  soldOut: readonly string[];
  onToggle: (baseId: string, out: boolean) => Promise<void>;
  onClose: () => void;
}> = ({ soldOut, onToggle, onClose }) => {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const out = useMemo(() => new Set(soldOut), [soldOut]);

  const q = query.trim().toLowerCase();
  const shown = DISHES.filter((d) => !q || `${d.name} ${d.sectionTitle}`.toLowerCase().includes(q)).sort(
    (a, b) => Number(out.has(b.baseId)) - Number(out.has(a.baseId))
  );

  const toggle = async (baseId: string) => {
    setBusy(baseId);
    setError(null);
    try {
      await onToggle(baseId, !out.has(baseId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title="Sold out" subtitle={`${out.size} dish${out.size === 1 ? '' : 'es'} sold out. Orders cannot add them until they are back.`} onClose={onClose} width="lg">
      {error && (
        <Banner tone="critical" role="alert">
          {error}
        </Banner>
      )}
      <label className="relative block">
        <span className="sr-only">Find a dish</span>
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} autoFocus placeholder="Find a dish" className="w-full h-11 pl-10 pr-3 rounded-xl border border-border text-base" />
      </label>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {shown.map((d) => {
          const isOut = out.has(d.baseId);
          return (
            <li key={d.baseId} className="flex items-center justify-between gap-3 p-2 pl-3">
              <span className="min-w-0">
                <span className={`font-semibold ${isOut ? 'text-rose-800' : ''}`}>{d.name}</span>
                <span className="block text-xs text-muted-foreground">{d.sectionTitle}</span>
              </span>
              <button className={isOut ? btn.secondary : btn.quiet} onClick={() => toggle(d.baseId)} disabled={busy !== null} aria-label={isOut ? `${d.name}: available again` : `${d.name}: sold out`}>
                {isOut ? (
                  <>
                    <Undo2 size={16} /> Available again
                  </>
                ) : (
                  <>
                    <Ban size={16} /> Sold out
                  </>
                )}
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="p-4 text-sm text-muted-foreground">No dish matches that.</li>}
      </ul>
    </Modal>
  );
};
