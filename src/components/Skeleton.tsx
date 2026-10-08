import React from 'react';

export const SkeletonBox: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`bg-[#EAE2D9]/80 animate-pulse rounded-lg ${className}`} />
);

export const SkeletonLine: React.FC<{ className?: string; width?: string }> = ({ 
  className = '', 
  width = 'w-full' 
}) => (
  <div className={`h-3 bg-[#EAE2D9]/80 animate-pulse rounded-md ${width} ${className}`} />
);

export const StatsCardSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    {[1, 2, 3].map((i) => (
      <div key={i} className="bg-white rounded-2xl p-5 border border-border shadow-luxury flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-[#EAE2D9]/80 animate-pulse shrink-0" />
        <div className="space-y-2 flex-1">
          <div className="h-3 w-20 bg-[#EAE2D9]/80 animate-pulse rounded" />
          <div className="h-6 w-14 bg-[#EAE2D9]/80 animate-pulse rounded" />
        </div>
      </div>
    ))}
  </div>
);

export const GuestCardSkeleton: React.FC = () => (
  <div className="bg-white rounded-2xl border border-border p-5 shadow-luxury flex flex-col justify-between space-y-4 animate-pulse">
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-6 w-20 bg-[#EAE2D9] rounded-lg" />
          <div className="h-5 w-14 bg-[#EAE2D9]/70 rounded-md" />
        </div>
        <div className="h-6 w-14 bg-[#EAE2D9]/60 rounded-md" />
      </div>

      <div className="mt-3.5 space-y-2">
        <div className="h-4 w-3/4 bg-[#EAE2D9] rounded" />
        <div className="h-3 w-1/2 bg-[#EAE2D9]/60 rounded" />
      </div>

      <div className="mt-4 pt-3 border-t border-border/60 space-y-2">
        <div className="flex items-center justify-between">
          <div className="h-3 w-16 bg-[#EAE2D9]/60 rounded" />
          <div className="h-3 w-24 bg-[#EAE2D9] rounded" />
        </div>
        <div className="flex items-center justify-between">
          <div className="h-3 w-20 bg-[#EAE2D9]/60 rounded" />
          <div className="h-3 w-16 bg-[#EAE2D9] rounded" />
        </div>
      </div>
    </div>

    <div className="pt-3 border-t border-border/60 flex items-center justify-between">
      <div className="h-3 w-16 bg-[#EAE2D9]/60 rounded" />
      <div className="h-8 w-28 bg-[#EAE2D9] rounded-xl" />
    </div>
  </div>
);

/**
 * Callers pass `cols` so the placeholder row matches the table it stands in for. The component
 * used to take no props and always draw seven cells, and callers passing `cols={8}` were never
 * typechecked: @types/react was not installed, so every prop in the UI layer was unchecked.
 */
const ROW_WIDTHS = ['w-16', 'w-36', 'w-24', 'w-20', 'w-12', 'w-20', 'w-16', 'w-14', 'w-10', 'w-16'];
export const TableRowSkeleton: React.FC<{ cols?: number }> = ({ cols = 7 }) => (
  <tr className="border-b border-border/60 animate-pulse">
    {Array.from({ length: cols }, (_, i) => (
      <td key={i} className="py-3.5 px-4">
        <div className={`h-4 ${ROW_WIDTHS[i % ROW_WIDTHS.length]} bg-[#EAE2D9] rounded`} />
      </td>
    ))}
  </tr>
);

export const TableCardSkeleton: React.FC = () => (
  <div className="bg-white rounded-2xl border border-border p-4 shadow-luxury flex flex-col justify-between h-36 animate-pulse">
    <div className="flex items-center justify-between">
      <div className="h-6 w-12 bg-[#EAE2D9] rounded-lg" />
      <div className="h-4 w-16 bg-[#EAE2D9]/70 rounded-md" />
    </div>
    <div className="space-y-1.5">
      <div className="h-3 w-20 bg-[#EAE2D9]/60 rounded" />
      <div className="h-3.5 w-28 bg-[#EAE2D9] rounded" />
    </div>
    <div className="flex items-center justify-between pt-2 border-t border-border/60">
      <div className="h-3 w-14 bg-[#EAE2D9]/60 rounded" />
      <div className="h-4 w-12 bg-[#EAE2D9] rounded-md" />
    </div>
  </div>
);

/** `height` is the Tailwind height class of the chart area it stands in for. */
export const ChartSkeleton: React.FC<{ height?: string }> = ({ height = 'h-64' }) => (
  <div className="bg-white rounded-2xl p-6 border border-border shadow-luxury space-y-4 animate-pulse">
    <div className="flex items-center justify-between">
      <div className="space-y-1.5">
        <div className="h-3 w-28 bg-[#EAE2D9] rounded" />
        <div className="h-5 w-44 bg-[#EAE2D9] rounded" />
      </div>
      <div className="h-8 w-24 bg-[#EAE2D9]/70 rounded-xl" />
    </div>
    <div className={`${height} bg-[#F2EBE4]/50 rounded-xl flex items-end justify-between p-6 gap-3`}>
      {[40, 75, 55, 90, 65, 80, 45, 85].map((height, idx) => (
        <div key={idx} className="flex-1 flex flex-col items-center gap-2">
          <div 
            className="w-full max-w-[40px] bg-[#EAE2D9] rounded-t-lg transition-all" 
            style={{ height: `${height}%` }}
          />
          <div className="h-2.5 w-8 bg-[#EAE2D9]/60 rounded" />
        </div>
      ))}
    </div>
  </div>
);
