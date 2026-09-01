import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  db, 
  collection, 
  onSnapshot,
  getDocs 
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
  Info,
  RefreshCw,
  Radio,
  Check
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface GuestListProps {
  hotelId: string;
}

const REFRESH_INTERVAL_SECONDS = 300; // 5 minutes

export const GuestList: React.FC<GuestListProps> = ({ hotelId }) => {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [checkIns, setCheckIns] = useState<Record<string, CheckIn>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'attended' | 'pending' | 'vip'>('all');
  const [selectedGuestForAudit, setSelectedGuestForAudit] = useState<Guest | null>(null);

  // Auto-refresh state (5 minutes interval)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('opera_manifest_auto_refresh');
      return stored !== null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [countdownSeconds, setCountdownSeconds] = useState<number>(REFRESH_INTERVAL_SECONDS);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Save auto-refresh toggle preference
  const toggleAutoRefresh = () => {
    const nextState = !autoRefreshEnabled;
    setAutoRefreshEnabled(nextState);
    try {
      localStorage.setItem('opera_manifest_auto_refresh', String(nextState));
    } catch {}
    if (nextState) {
      setCountdownSeconds(REFRESH_INTERVAL_SECONDS);
    }
  };

  // Reusable fetch function from Firestore
  const fetchManifestData = useCallback(async (isManual = false) => {
    setIsRefreshing(true);
    const today = businessDate();

    try {
      const guestsRef = collection(db, 'hotels', hotelId, 'guests');
      const checkinsRef = collection(db, 'hotels', hotelId, 'checkins', today, 'rooms');

      const [guestsSnap, checkinsSnap] = await Promise.all([
        getDocs(guestsRef),
        getDocs(checkinsRef)
      ]);

      if (guestsSnap && guestsSnap.docs) {
        const list = guestsSnap.docs.map((d: any) => d.data() as Guest);
        list.sort((a: Guest, b: Guest) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
        setGuests(list);
      }

      if (checkinsSnap && checkinsSnap.docs) {
        const map: Record<string, CheckIn> = {};
        checkinsSnap.docs.forEach((d: any) => {
          map[d.id] = d.data() as CheckIn;
        });
        setCheckIns(map);
      }

      const now = new Date();
      setLastRefreshedAt(now);
      setCountdownSeconds(REFRESH_INTERVAL_SECONDS);

      const timeStr = now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
      setSyncFeedback(`Manifest synced with Firestore at ${timeStr} (${guests.length} rooms)`);
      feedbackTimeoutRef.current = setTimeout(() => {
        setSyncFeedback(null);
      }, 4000);
    } catch (err) {
      console.warn('Error fetching manifest data:', err);
    } finally {
      // Smooth visual feedback
      setTimeout(() => {
        setIsRefreshing(false);
        setLoading(false);
      }, 350);
    }
  }, [hotelId, guests.length]);

  // Initial real-time Firestore listeners
  useEffect(() => {
    setLoading(true);
    const today = businessDate();

    const guestsRef = collection(db, 'hotels', hotelId, 'guests');
    const unsubGuests = onSnapshot(guestsRef, (snap) => {
      const list = snap.docs.map((d: any) => d.data() as Guest);
      list.sort((a: Guest, b: Guest) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
      setGuests(list);
      setLoading(false);
      setLastRefreshedAt(new Date());
    });

    const checkinsRef = collection(db, 'hotels', hotelId, 'checkins', today, 'rooms');
    const unsubCheckins = onSnapshot(checkinsRef, (snap) => {
      const map: Record<string, CheckIn> = {};
      snap.docs.forEach((d: any) => {
        map[d.id] = d.data() as CheckIn;
      });
      setCheckIns(map);
    });

    return () => {
      unsubGuests();
      unsubCheckins();
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, [hotelId]);

  // 5-minute Auto-refresh countdown & trigger loop
  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const interval = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          fetchManifestData(false);
          return REFRESH_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [autoRefreshEnabled, fetchManifestData]);

  // Format countdown mm:ss
  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
      {/* Header with Auto-Refresh Controls */}
      <div className="bg-white rounded-2xl p-6 border border-border shadow-luxury">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="label-mono text-accent">Opera In-House Roster</span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="font-mono-custom text-xs font-semibold text-muted-foreground">{guests.length} Rooms In-House</span>
            </div>
            <h2 className="text-2xl font-bold font-display text-foreground mt-1 tracking-tight">In-House Guest Manifest</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Complete guest roster, room status, meal package allocations, and live host stand synchronization.
            </p>
          </div>

          {/* Sync & Export Action Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Auto-Refresh Toggle Switch */}
            <div 
              id="manifest-auto-refresh-control"
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-border bg-[#F2EBE4]/40 shadow-xs"
            >
              <button
                type="button"
                role="switch"
                aria-checked={autoRefreshEnabled}
                onClick={toggleAutoRefresh}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  autoRefreshEnabled ? 'bg-emerald-600' : 'bg-stone-300'
                }`}
                title={autoRefreshEnabled ? 'Auto-refresh enabled (every 5 minutes)' : 'Auto-refresh disabled'}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    autoRefreshEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>

              <div className="flex flex-col">
                <span className="text-[11px] font-mono-custom font-bold text-foreground flex items-center gap-1.5">
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    autoRefreshEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-stone-400'
                  }`} />
                  Auto-Refresh (5m)
                </span>
                <span className="text-[9px] font-mono-custom text-muted-foreground">
                  {autoRefreshEnabled ? `Next sync: ${formatCountdown(countdownSeconds)}` : 'Sync paused'}
                </span>
              </div>
            </div>

            {/* Manual Refresh Button */}
            <button
              id="manifest-manual-refresh-btn"
              onClick={() => fetchManifestData(true)}
              disabled={isRefreshing}
              className="px-3 py-2 rounded-xl border border-border bg-white hover:bg-[#F2EBE4]/50 text-foreground font-mono-custom font-medium text-xs flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              title="Force immediate update from Firestore"
            >
              <RefreshCw 
                size={13} 
                className={`text-accent ${isRefreshing ? 'animate-spin' : ''}`} 
              />
              <span>{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
            </button>

            {/* Export CSV Button */}
            <button
              onClick={exportCsv}
              className="px-3.5 py-2 rounded-xl border border-border bg-white hover:bg-[#F2EBE4]/50 text-foreground font-mono-custom font-medium text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer"
              title="Export filtered manifest to CSV"
            >
              <Download size={13} className="text-accent" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Live Sync Status Banner */}
        <AnimatePresence>
          {syncFeedback && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-mono-custom flex items-center gap-1.5 shadow-xs overflow-hidden"
            >
              <Check size={12} className="text-emerald-600 shrink-0" />
              <span>{syncFeedback}</span>
            </motion.div>
          )}
        </AnimatePresence>
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
