import React, { useMemo, useState } from 'react';
import { AlertTriangle, Search, Info } from 'lucide-react';
import {
  MENU_ITEMS,
  MENU_SECTIONS,
  MENU_SOURCE,
  GRILL_ACCOMPANIMENTS,
  PRICE_BASIS_NOTE,
  ALLERGEN_NOTE,
  grossPriceThb,
  MenuItem,
} from '../data/foodExchangeMenu';

/**
 * Food Exchange à la carte menu — reference for staff answering "what is this and what does it
 * cost". Read-only; there is nothing to edit and nothing to submit.
 *
 * Two things drive the design rather than decorating it:
 *
 *  1. The allergen banner is not dismissible and sits above the menu, not under it. The source
 *     PDF marks 14 allergens per dish with icons that carry no text, so this dataset has none.
 *     A server who half-remembers seeing allergen info in the app is worse off than one who
 *     knows to fetch the printed menu, so the gap is stated where it cannot be scrolled past.
 *
 *  2. Menu prices are NET of 7% VAT and 10% service charge. Showing only the net price invites
 *     quoting the wrong number to a guest, so gross is available on a toggle and the basis is
 *     labelled either way. Service charge applies first, then VAT — see grossPriceThb.
 *
 * This is Novotel only. Food Exchange is a Novotel outlet, so the caller gates on hotel.
 */
export const MenuView: React.FC = () => {
  const [query, setQuery] = useState('');
  const [showGross, setShowGross] = useState(false);

  const trimmed = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!trimmed) return MENU_ITEMS;
    return MENU_ITEMS.filter((item) =>
      `${item.name} ${item.description ?? ''}`.toLowerCase().includes(trimmed)
    );
  }, [trimmed]);

  const visibleSections = useMemo(
    () => MENU_SECTIONS.filter((s) => matches.some((i) => i.section === s.id)),
    [matches]
  );

  const priceLabel = (net: number) =>
    showGross ? `THB ${grossPriceThb(net).toFixed(2)}` : `THB ${net}`;

  const renderPrice = (item: MenuItem) => {
    if (item.priceThb !== null) {
      return (
        <span className="font-mono-custom font-bold text-sm text-foreground tabular-nums">
          {priceLabel(item.priceThb)}
        </span>
      );
    }
    return (
      <span className="flex flex-col items-end gap-0.5">
        {(item.variants ?? []).map((v) => (
          <span key={v.label} className="font-mono-custom text-xs text-foreground tabular-nums">
            <span className="text-muted-foreground mr-1.5">{v.label}</span>
            <span className="font-bold">{priceLabel(v.priceThb)}</span>
          </span>
        ))}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <span className="label-mono text-accent">{MENU_SOURCE.outlet}</span>
          <h2 className="text-2xl font-bold font-display text-foreground tracking-tight">
            À la carte menu
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {MENU_SOURCE.hotelName} · lunch and dinner · {MENU_ITEMS.length} dishes ·{' '}
            April 2025 edition
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-mono-custom text-muted-foreground">
            {showGross ? 'Guest pays' : 'Menu price'}
          </span>
          <button
            onClick={() => setShowGross((v) => !v)}
            role="switch"
            aria-checked={showGross}
            aria-label="Show prices including tax and service charge"
            className="px-3 py-2 rounded-xl border border-border bg-white hover:bg-[#F2EBE4]/60 text-xs font-mono-custom font-bold text-foreground shadow-xs transition-all cursor-pointer min-h-[44px]"
          >
            {showGross ? '+ tax & service' : 'net'}
          </button>
        </div>
      </div>

      {/* Allergens. Deliberately not dismissible, and above the menu. */}
      <div
        role="alert"
        className="rounded-2xl border border-amber-300 bg-amber-50 p-4 flex items-start gap-3"
      >
        <AlertTriangle size={18} className="text-amber-700 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-bold text-amber-900">
            This screen has no allergen information. Use the printed menu.
          </p>
          <p className="text-xs text-amber-800 leading-relaxed">
            The printed menu marks 14 major allergens on every dish, and those markings are
            images that could not be read into the app. Nothing here tells you whether a dish
            contains an allergen — an unmarked dish is <strong>not</strong> a safe dish.
          </p>
          <p className="text-xs text-amber-800 leading-relaxed">{ALLERGEN_NOTE}</p>
        </div>
      </div>

      {/* Price basis */}
      <div className="rounded-xl border border-border bg-[#F2EBE4]/40 px-4 py-2.5 flex items-start gap-2">
        <Info size={14} className="text-accent shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          {PRICE_BASIS_NOTE}{' '}
          {showGross
            ? 'Showing what the guest pays, with service charge applied first and VAT on the total.'
            : 'Showing menu prices as printed — the guest pays more than this.'}
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a dish, or an ingredient in its description"
          aria-label="Search the menu"
          className="w-full pl-10 pr-4 py-3 min-h-[44px] rounded-xl border border-border bg-white text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      {trimmed && (
        <p className="text-xs font-mono-custom text-muted-foreground" role="status">
          {matches.length} of {MENU_ITEMS.length} dishes match “{query.trim()}”
        </p>
      )}

      {matches.length === 0 && (
        <div className="rounded-2xl border border-border bg-white p-8 text-center">
          <p className="text-sm text-foreground font-semibold">No dish matches that.</p>
          <p className="text-xs text-muted-foreground mt-1">
            The search covers dish names and their descriptions. Bear in mind this is the à la
            carte menu only — it does not include the breakfast buffet or banquet packages.
          </p>
        </div>
      )}

      {/* Sections */}
      {visibleSections.map((section) => {
        const items = matches
          .filter((i) => i.section === section.id)
          .sort((a, b) => a.itemNumber - b.itemNumber);

        return (
          <section key={section.id} className="space-y-2">
            <div className="flex items-baseline gap-3 border-b border-border pb-1.5">
              <h3 className="text-base font-bold font-display text-foreground">{section.title}</h3>
              <span className="text-[11px] font-mono-custom text-muted-foreground">
                {items.length} {items.length === 1 ? 'dish' : 'dishes'}
              </span>
            </div>

            {section.note && (
              <p className="text-xs text-muted-foreground italic">{section.note}</p>
            )}

            <ul className="divide-y divide-border/70">
              {items.map((item) => (
                <li
                  key={`${item.section}-${item.itemNumber}`}
                  className="py-3 flex items-start justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{item.name}</span>
                      {item.dietary?.map((flag) => (
                        <span
                          key={flag}
                          className="px-1.5 py-0.5 rounded text-[10px] font-mono-custom font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"
                        >
                          {flag === 'plant-based' ? 'PLANT-BASED' : 'VEGETARIAN'}
                        </span>
                      ))}
                      {item.kcal && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono-custom text-muted-foreground border border-border">
                          {item.kcal}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                    {item.verify && (
                      // Shown, not hidden. A transcription we are unsure of must not look as
                      // authoritative as one we checked.
                      <p className="text-[11px] text-amber-800 mt-1 flex items-start gap-1.5">
                        <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                        <span>Check against the printed menu — {item.verify}</span>
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">{renderPrice(item)}</div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {/* Grill selections, unpriced on purpose */}
      {!trimmed && (
        <section className="space-y-2">
          <div className="border-b border-border pb-1.5">
            <h3 className="text-base font-bold font-display text-foreground">
              From the Grill — selections
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="label-mono text-accent mb-1">Sauces</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {GRILL_ACCOMPANIMENTS.sauces.join(' · ')}
              </p>
            </div>
            <div>
              <p className="label-mono text-accent mb-1">Side dishes</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {GRILL_ACCOMPANIMENTS.sideDishes.join(' · ')}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-amber-800 flex items-start gap-1.5 pt-1">
            <AlertTriangle size={11} className="shrink-0 mt-0.5" />
            <span>{GRILL_ACCOMPANIMENTS.priceNote}</span>
          </p>
        </section>
      )}
    </div>
  );
};
