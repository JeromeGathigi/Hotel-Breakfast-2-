import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { VIP_CODES } from '../lib/vip';
import { VipBadge } from './ui';

/** The spec's collapsible VIP legend (section 5), with the property's own descriptions. */
export const VipLegend: React.FC<{ defaultOpen?: boolean }> = ({ defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="bg-white rounded-2xl border border-border">
      <button
        className="w-full flex items-center justify-between h-12 px-4 text-sm font-bold cursor-pointer"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        VIP codes
        <ChevronDown size={18} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="divide-y divide-border border-t border-border">
          {VIP_CODES.map((v) => (
            <li key={v.code} className="flex items-start gap-3 px-4 py-2.5">
              <VipBadge vip={v} />
              <span className="text-sm">{v.description}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
