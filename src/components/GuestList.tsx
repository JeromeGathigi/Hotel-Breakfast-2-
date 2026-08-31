import React, { useState, useEffect } from 'react';
import { 
  db, 
  collection, 
  onSnapshot 
} from '../firebase';
import { Guest, CheckIn } from '../types';
import { VIP_LEVELS } from '../constants';
import { businessDate } from '../lib/businessDate';
import { canonicalPlan } from '../lib/meals';
import { OperaAuditModal } from './OperaAuditModal';
import { TableRowSkeleton } from './Skeleton';
import { 
  Search, 
  Download, 
  CheckCircle, 
  Clock, 
  Info 
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';

interface GuestListProps {
  hotelId: string;
}

export const GuestList: React.FC<GuestListProps> = ({ hotelId }) => {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [checkIns, setCheckIns] = useState<Record<string, CheckIn>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'attended' | 'pending' | 'vip'>('all');
  const [selectedGuestForAudit, setSelectedGuestForAudit] = useState<Guest | null>(null);

  useEffect(() => {
    setLoading(true);
    const today = businessDate();

    const guestsRef = collection(db, 'hotels', hotelId, 'guests');
    const unsubGuests = onSnapshot(guestsRef, (snap) => {
      const list = snap.docs.map((d) => d.data() as Guest);
      list.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
      setGuests(list);
      setLoading(false);
    });

    const checkinsRef = collection(db, 'hotels', hotelId, 'checkins', today, 'rooms');
    const unsubCheckins = onSnapshot(checkinsRef, (snap) => {
      const map: Record<string, CheckIn> = {};
      snap.docs.forEach((d) => {
        map[d.id] = d.data() as CheckIn;
      });
      setCheckIns(map);
    });

    return () => {
      unsubGuests();
      unsubCheckins();
    };
  }, [hotelId]);

  const filteredGuests = guests.filter((g) => {
    const isChecked = Boolean(checkIns[g.roomNumber]);
    const isVip = Boolean(g.vipLevel || g.vipStatus);

    if (statusFilter === 'attended' && !isChecked) return false;
    if (statusFilter === 'pending' && isChecked) return false;
    if (statusFilter === 'vip' && !isVip) return false;

    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      g.roomNumber.toLowerCase().includes(q) ||
      g.guestName.toLowerCase().includes(q) ||
      (g.companyName && g.companyName.toLowerCase().includes(q)) ||
      (g.rateCode && g.rateCode.toLowerCase().includes(q))
    );
  });

  const exportCsv = () => {
    const escapeCsvField = (val: unknown): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = ['Room', 'Guest Name', 'Accompanying', 'Arrival', 'Departure', 'Meal Plan', 'Adults', 'Children', 'Status', 'Table', 'VIP', 'Company'];
    const rows = filteredGuests.map((g) => {
      const c = checkIns[g.roomNumber];
      return [
        escapeCsvField(g.roomNumber),
        escapeCsvField(g.guestName),
        escapeCsvField((g.accompanyingGuests || []).join(', ')),
        escapeCsvField(g.arrivalDate),
        escapeCsvField(g.departureDate),
        escapeCsvField(g.mealPlan),
        escapeCsvField(g.adults),
        escapeCsvField(g.children),
        escapeCsvField(c ? `Checked-In (${c.adultsAte + c.childrenAte} Pax)` : 'Pending'),
        escapeCsvField(c?.tableNumber || ''),
        escapeCsvField(g.vipLevel || g.vipStatus || ''),
        escapeCsvField(g.companyName || ''),
      ];
    });

    const csvContent = '\uFEFF' + [headers.map(escapeCsvField).join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${hotelId}-guest-manifest-${businessDate()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-border shadow-luxury">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="label-mono text-accent">Opera In-House Roster</span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="font-mono-custom text-xs font-semibold text-muted-foreground">{guests.length} Rooms In-House</span>
            </div>
            <h2 className="text-2xl font-bold font-display text-foreground mt-1 tracking-tight">In-House Guest Manifest</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Complete guest roster, room status, meal package allocations, and audit details.
            </p>
          </div>

          <button
            onClick={exportCsv}
            className="px-4 py-2 rounded-xl border border-border bg-white hover:bg-[#F2EBE4]/50 text-foreground font-mono-custom font-medium text-xs flex items-center gap-2 shadow-xs transition-all"
          >
            <Download size={13} className="text-accent" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by Room #, Guest Name, Rate Code, or Company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-white text-foreground text-xs font-sans focus:outline-none focus:border-accent shadow-xs"
          />
        </div>

        <div className="bg-[#F2EBE4]/80 border border-border rounded-xl p-1 flex items-center gap-1">
          {[
            { id: 'all', label: 'All Rooms' },
            { id: 'attended', label: 'Attended' },
            { id: 'pending', label: 'Pending' },
            { id: 'vip', label: 'VIP Guests' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-mono-custom font-bold transition-all cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-white text-black shadow-xs border border-black/20 ring-1 ring-black/10'
                  : 'text-black hover:text-black hover:bg-white/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Manifest Table */}
      <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-luxury">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F2EBE4]/60 border-b border-border label-mono">
              <tr>
                <th className="p-3.5">Room</th>
                <th className="p-3.5">Guest Name & Companion</th>
                <th className="p-3.5">Stay Dates</th>
                <th className="p-3.5">Meal Plan</th>
                <th className="p-3.5">Occupancy</th>
                <th className="p-3.5">Service Status</th>
                <th className="p-3.5">Group / Rate</th>
                <th className="p-3.5 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((idx) => (
                    <TableRowSkeleton key={idx} cols={8} />
                  ))}
                </>
              ) : filteredGuests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground font-sans">
                    No in-house guests matching your search filter.
                  </td>
                </tr>
              ) : (
                filteredGuests.map((guest) => {
                const checkIn = checkIns[guest.roomNumber];
                const isCheckedIn = Boolean(checkIn);
                const vip = VIP_LEVELS.find((v) => v.level === guest.vipLevel || v.level === guest.vipStatus);

                return (
                  <tr key={guest.roomNumber} className="hover:bg-[#F2EBE4]/30 transition-all">
                    <td className="p-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="room-badge-luxury">RM {guest.roomNumber}</span>
                        {vip && (
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-mono-custom font-semibold uppercase ${vip.color}`}>
                            VIP
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="p-3.5">
                      <p className="font-bold font-sans text-foreground">{guest.guestName}</p>
                      {guest.accompanyingGuests && guest.accompanyingGuests.length > 0 && (
                        <p className="text-[10px] font-sans text-muted-foreground">
                          + {guest.accompanyingGuests.join(', ')}
                        </p>
                      )}
                    </td>

                    <td className="p-3.5 font-mono-custom text-muted-foreground text-[11px] whitespace-nowrap">
                      {guest.arrivalDate} → {guest.departureDate}
                    </td>

                    <td className="p-3.5 font-mono-custom font-medium text-accent">
                      {canonicalPlan(guest.mealPlan)}
                    </td>

                    <td className="p-3.5 font-mono-custom font-medium text-foreground">
                      {guest.adults}A {guest.children > 0 ? `+ ${guest.children}C` : ''}
                    </td>

                    <td className="p-3.5">
                      {isCheckedIn ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono-custom font-semibold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <CheckCircle size={10} />
                          {checkIn.adultsAte + checkIn.childrenAte} Seated {checkIn.tableNumber ? `• T-${checkIn.tableNumber}` : ''}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono-custom text-muted-foreground bg-[#F2EBE4]/50 border border-border">
                          <Clock size={10} />
                          Pending
                        </span>
                      )}
                    </td>

                    <td className="p-3.5 font-sans text-muted-foreground text-[11px]">
                      {guest.companyName || guest.rateCode || '—'}
                    </td>

                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => setSelectedGuestForAudit(guest)}
                        className="px-2.5 py-1 rounded-lg border border-border hover:bg-[#F2EBE4]/60 text-muted-foreground hover:text-foreground text-[10px] font-mono-custom inline-flex items-center gap-1 transition-all"
                      >
                        <Info size={11} />
                        Audit
                      </button>
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Opera Audit Modal */}
      <AnimatePresence>
        {selectedGuestForAudit && (
          <OperaAuditModal
            hotelId={hotelId}
            guest={selectedGuestForAudit}
            onClose={() => setSelectedGuestForAudit(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
