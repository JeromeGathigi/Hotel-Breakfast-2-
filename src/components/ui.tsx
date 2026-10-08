import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Info, X, CheckCircle2, Clock } from 'lucide-react';
import { VIP_TONE_CLASSES, type VipInfo } from '../lib/vip';

/**
 * Small shared pieces for the door and the management screens.
 *
 * Door sizing: the plan called for 16px body text and 44px touch targets - the old check-in
 * steppers were 32px, and a mis-tap there changes the cover count. Everything a host taps during
 * service is at least `h-11` (44px).
 */

export const btn = {
  primary:
    'inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-accent text-white font-bold text-sm shadow-sm hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer',
  secondary:
    'inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-white border border-black/15 text-foreground font-bold text-sm hover:bg-[#F2EBE4] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer',
  quiet:
    'inline-flex items-center justify-center gap-1.5 h-11 px-3 rounded-xl text-sm font-semibold text-foreground hover:bg-[#F2EBE4] disabled:opacity-50 transition-colors cursor-pointer',
  danger:
    'inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-white border border-rose-300 text-rose-700 font-bold text-sm hover:bg-rose-50 disabled:opacity-50 transition-colors cursor-pointer',
};

export const VipBadge: React.FC<{ vip: VipInfo | null; size?: 'sm' | 'lg' }> = ({ vip, size = 'sm' }) => {
  if (!vip) return null;
  const effect =
    vip.emphasis === 'shimmer'
      ? 'vip-shimmer'
      : vip.emphasis === 'premium'
        ? 'shadow-[0_0_0_2px_rgba(127,29,29,0.25)]'
        : '';
  return (
    <span
      // The spec: short label only next to a name; the description lives in the legend and here.
      title={`${vip.label}: ${vip.description}`}
      className={`inline-flex items-center rounded-md font-bold font-mono-custom uppercase tracking-wide ${
        size === 'lg' ? 'px-2.5 py-1 text-sm' : 'px-1.5 py-0.5 text-[11px]'
      } ${VIP_TONE_CLASSES[vip.tone]} ${effect}`}
    >
      {vip.label}
    </span>
  );
};

type Tone = 'info' | 'warn' | 'critical' | 'ok' | 'pending';

const TONE: Record<Tone, { box: string; icon: React.ReactNode }> = {
  info: { box: 'bg-sky-50 border-sky-300 text-sky-950', icon: <Info size={18} className="shrink-0 mt-0.5 text-sky-700" /> },
  warn: { box: 'bg-amber-50 border-amber-300 text-amber-950', icon: <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-700" /> },
  critical: { box: 'bg-red-50 border-red-300 text-red-950', icon: <AlertTriangle size={18} className="shrink-0 mt-0.5 text-red-700" /> },
  ok: { box: 'bg-emerald-50 border-emerald-300 text-emerald-950', icon: <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-emerald-700" /> },
  pending: { box: 'bg-slate-50 border-slate-300 text-slate-900', icon: <Clock size={18} className="shrink-0 mt-0.5 text-slate-500" /> },
};

export const Banner: React.FC<{
  tone: Tone;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  role?: 'alert' | 'status';
}> = ({ tone, title, children, action, role = 'status' }) => (
  <div role={role} className={`rounded-2xl border-2 p-4 flex gap-3 ${TONE[tone].box}`}>
    {TONE[tone].icon}
    <div className="flex-1 min-w-0 space-y-1">
      {title && <p className="font-bold text-base leading-snug">{title}</p>}
      {children && <div className="text-sm leading-relaxed">{children}</div>}
    </div>
    {action && <div className="shrink-0 self-center">{action}</div>}
  </div>
);

/**
 * A modal dialog. Escape closes it, focus moves into it, and it is announced as a dialog.
 */
export const Modal: React.FC<{
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'md' | 'lg' | 'xl';
}> = ({ title, subtitle, onClose, children, footer, width = 'lg' }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const max = width === 'md' ? 'max-w-md' : width === 'xl' ? 'max-w-3xl' : 'max-w-xl';
  return (
    <div className="fixed inset-0 z-50 bg-[#0A162B]/55 flex items-center justify-center p-3 sm:p-4" onMouseDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className={`bg-white rounded-2xl w-full ${max} max-h-[92vh] flex flex-col shadow-2xl outline-none`}
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-border">
          <div className="min-w-0">
            <h3 className="text-xl font-bold font-display text-foreground leading-tight">{title}</h3>
            {subtitle && <div className="text-sm text-muted-foreground mt-1">{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="h-11 w-11 shrink-0 rounded-xl flex items-center justify-center hover:bg-[#F2EBE4] cursor-pointer">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4 flex-1">{children}</div>
        {footer && <div className="p-4 border-t border-border flex flex-wrap items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
};

export const Stepper: React.FC<{
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}> = ({ label, hint, value, onChange, min = 0, max = 30 }) => (
  <div className="rounded-xl border border-border bg-[#F2EBE4]/40 p-3">
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-sm font-bold text-foreground">{label}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
    <div className="flex items-center gap-2 mt-2">
      <button
        type="button"
        aria-label={`Fewer ${label.toLowerCase()}`}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="h-11 w-11 rounded-xl bg-white border border-black/15 text-xl font-bold disabled:opacity-40 cursor-pointer"
      >
        −
      </button>
      <span className="flex-1 text-center text-2xl font-bold font-mono-custom tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={`More ${label.toLowerCase()}`}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="h-11 w-11 rounded-xl bg-white border border-black/15 text-xl font-bold disabled:opacity-40 cursor-pointer"
      >
        +
      </button>
    </div>
  </div>
);

/** A labelled empty state: says what is missing and, when possible, what to do. */
export const Empty: React.FC<{ title: string; children?: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white rounded-2xl p-10 border border-border text-center space-y-2">
    <p className="text-base font-bold text-foreground">{title}</p>
    {children && <div className="text-sm text-muted-foreground max-w-md mx-auto">{children}</div>}
  </div>
);
