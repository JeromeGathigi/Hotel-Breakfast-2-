import React, { useState, useEffect } from 'react';
import { 
  db, 
  collection, 
  onSnapshot, 
  doc, 
  deleteDoc, 
  logOperaAuditTrail 
} from '../firebase';
import { Guest, CheckIn, MealServiceType, DiningTable } from '../types';
import { VIP_LEVELS, MEAL_SERVICES, HOTELS } from '../constants';
import { businessDate } from '../lib/businessDate';
import { entitledPax, hasMealEntitlement, canonicalPlan } from '../lib/meals';
import { CheckInModal } from './CheckInModal';
import { OperaAuditModal } from './OperaAuditModal';
import { BatchCheckInModal } from './BatchCheckInModal';
import { GuestCardSkeleton, StatsCardSkeleton } from './Skeleton';
import { 
  Search, 
  UserCheck, 
  Users, 
  Clock, 
  Coffee, 
  Moon, 
  Utensils, 
  AlertCircle, 
  Info, 
  RotateCcw, 
  Layers, 
  ShieldCheck, 
  CheckCheck,
  Building,
  Check,
  X,
  Sparkles,
  ExternalLink,
  Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface GuestSearchProps {
  hotelId: string;
  activeMealService: MealServiceType;
  setActiveMealService?: (service: MealServiceType) => void;
}

export const GuestSearch: React.FC<GuestSearchProps> = ({ 
  hotelId, 
  activeMealService,
  setActiveMealService 
}) => {
  const [queryText, setQueryText] = useState('');
  const [guests, setGuests] = useState<Guest[]>([]);
  const [checkIns, setCheckIns] = useState<Record<string, CheckIn>>({});
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [selectedGuestForCheckIn, setSelectedGuestForCheckIn] = useState<Guest | null>(null);
  const [selectedGuestForAudit, setSelectedGuestForAudit] = useState<Guest | null>(null);
  const [batchModalOpen, setBatchModalOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    const today = businessDate();

    // Subscribe to in-house guests
    const guestsRef = collection(db, 'hotels', hotelId, 'guests');
    const unsubGuests = onSnapshot(guestsRef, (snap) => {
      const gList = snap.docs.map((d) => d.data() as Guest);
      gList.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
      setGuests(gList);
      setLoading(false);
    });

    // Subscribe to today's checkins
    const checkinsRef = collection(db, 'hotels', hotelId, 'checkins', today, 'rooms');
    const unsubCheckins = onSnapshot(checkinsRef, (snap) => {
      const cMap: Record<string, CheckIn> = {};
      snap.docs.forEach((d) => {
        cMap[d.id] = d.data() as CheckIn;
      });
      setCheckIns(cMap);
    });

    // Subscribe to tables
    const tablesRef = collection(db, 'hotels', hotelId, 'tables');
    const unsubTables = onSnapshot(tablesRef, (snap) => {
      const tList = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DiningTable));
      setTables(tList);
    });

    return () => {
      unsubGuests();
      unsubCheckins();
      unsubTables();
    };
  }, [hotelId]);

  // Handle Quick Check-In (1 Click)
  const handleQuickCheckIn = async (guest: Guest) => {
    setSelectedGuestForCheckIn(guest);
  };

  // Handle Undo Check-In
  const handleUndoCheckIn = async (roomNumber: string, guestName: string) => {
    if (!confirm(`Undo check-in for Room ${roomNumber}?`)) return;
    try {
      const today = businessDate();
      await deleteDoc(doc(db, 'hotels', hotelId, 'checkins', today, 'rooms', roomNumber));
      await logOperaAuditTrail(
        hotelId,
        'CHECK_OUT_RESET',
        `Reversed check-in for Room ${roomNumber} (${guestName})`,
        roomNumber,
        guestName
      );
    } catch (err) {
      console.error('Failed to undo check-in:', err);
    }
  };

  // Filtered list
  const filteredGuests = guests.filter((g) => {
    const q = queryText.toLowerCase().trim();
    if (!q) return true;
    return (
      g.roomNumber.toLowerCase().includes(q) ||
      g.guestName.toLowerCase().includes(q) ||
      (g.companyName && g.companyName.toLowerCase().includes(q)) ||
      (g.blockCode && g.blockCode.toLowerCase().includes(q)) ||
      (g.accompanyingGuests && g.accompanyingGuests.some((ag) => ag.toLowerCase().includes(q)))
    );
  });

  const totalInHousePax = guests.reduce((acc, g) => acc + (Number(g.adults) || 0) + (Number(g.children) || 0), 0);
  const checkedInList = Object.keys(checkIns).map((k) => checkIns[k]);
  const checkedInPax = checkedInList.reduce(
    (acc, c) => acc + (Number(c?.adultsAte) || 0) + (Number(c?.childrenAte) || 0) + (Number(c?.infantsAte) || 0),
    0
  );
  const checkedInRoomsCount = checkedInList.length;

  const currentHotel = HOTELS.find((h) => h.id === hotelId) || HOTELS[0];

  return (
    <div className="space-y-6">
      {/* Service Header & Controls */}
      <div className="bg-white rounded-2xl p-6 border border-border shadow-luxury">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="label-mono text-accent">Active Meal Service</span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="font-mono-custom text-xs font-semibold text-muted-foreground">
                {MEAL_SERVICES.find((m) => m.id === activeMealService)?.time}
              </span>
              <span className="text-xs text-muted-foreground">•</span>
              <a 
                href={currentHotel.restaurantUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-mono-custom font-semibold text-accent hover:underline bg-[#F2EBE4]/60 px-2 py-0.5 rounded-md border border-border"
                title={`Visit official ${currentHotel.restaurantName} website`}
              >
                <span>{currentHotel.restaurantName}</span>
                <ExternalLink size={10} className="shrink-0" />
              </a>
            </div>
            <h2 className="text-2xl font-bold font-display text-foreground mt-1 tracking-tight">
              {MEAL_SERVICES.find((m) => m.id === activeMealService)?.name}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {MEAL_SERVICES.find((m) => m.id === activeMealService)?.description}
            </p>

            {/* Weekend Breakfast Operational Notice */}
            {activeMealService === 'breakfast' && (
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F2EBE4]/80 border border-border text-xs text-black font-medium">
                <Calendar size={13} className="text-black shrink-0" />
                <span>
                  <strong className="font-bold text-black">Weekend Schedule:</strong> Breakfast runs until <strong className="font-bold text-black">12:00 midday</strong> on Saturdays & Sundays for both Novotel and ibis.
                </span>
              </div>
            )}
          </div>

            {/* Service Selector & Batch Action */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="bg-[#F2EBE4]/80 border border-border rounded-xl p-1 flex items-center gap-1">
              {MEAL_SERVICES.map((service) => (
                <button
                  key={service.id}
                  id={`service-button-${service.id}`}
                  aria-label={`${service.name} (${service.time})`}
                  title={`${service.name} (${service.time})`}
                  onClick={() => setActiveMealService && setActiveMealService(service.id as MealServiceType)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-mono-custom font-bold capitalize transition-all cursor-pointer ${
                    activeMealService === service.id
                      ? 'bg-white text-black shadow-xs border border-black/20 ring-1 ring-black/10'
                      : 'text-black hover:text-black hover:bg-white/60'
                  }`}
                >
                  {service.id}
                </button>
              ))}
            </div>

            <button
              id="batch-checkin-button"
              aria-label="Batch Check-In"
              title="Batch Check-In"
              onClick={() => setBatchModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-white border border-black/20 text-black font-sans text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#F2EBE4] shadow-sm transition-all whitespace-nowrap cursor-pointer active:scale-95 shrink-0"
            >
              <CheckCheck size={16} className="shrink-0 text-black" />
              <span className="text-black tracking-wide font-bold leading-none">Batch Check-In</span>
            </button>
          </div>
        </div>
      </div>

      {/* Headcount Stat Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card-luxury">
          <p className="label-mono">Total In-House</p>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-3xl font-bold font-display text-foreground">{guests.length}</span>
            <span className="text-xs font-mono-custom text-muted-foreground">rooms</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 font-mono-custom">{totalInHousePax} total guests</p>
        </div>

        <div className="stat-card-luxury">
          <p className="label-mono text-accent">Attended / Seated</p>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-3xl font-bold font-display text-accent">{checkedInPax}</span>
            <span className="text-xs font-mono-custom text-muted-foreground">pax</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 font-mono-custom">{checkedInRoomsCount} rooms seated</p>
        </div>

        <div className="stat-card-luxury">
          <p className="label-mono text-emerald-700">Remaining Expected</p>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-3xl font-bold font-display text-emerald-700">
              {Math.max(0, totalInHousePax - checkedInPax)}
            </span>
            <span className="text-xs font-mono-custom text-muted-foreground">pax</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 font-mono-custom">
            {Math.max(0, guests.length - checkedInRoomsCount)} rooms pending
          </p>
        </div>

        <div className="stat-card-luxury">
          <p className="label-mono">Pace & Completion</p>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-3xl font-bold font-display text-foreground">
              {totalInHousePax > 0 ? Math.round((checkedInPax / totalInHousePax) * 100) : 0}%
            </span>
          </div>
          <div className="w-full bg-[#F2EBE4] h-1.5 rounded-full mt-2 overflow-hidden">
            <div 
              className="bg-accent h-full rounded-full transition-all duration-500" 
              style={{ width: `${totalInHousePax > 0 ? Math.min(100, Math.round((checkedInPax / totalInHousePax) * 100)) : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Instant Search Bar */}
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search room number (e.g. 101, 301), guest name, tour group, or company..."
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          className="w-full pl-12 pr-12 py-3.5 rounded-xl border border-border bg-white text-foreground text-sm font-medium focus:outline-none focus:border-accent shadow-sm"
        />
        {queryText && (
          <button
            onClick={() => setQueryText('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Guest Results Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <GuestCardSkeleton key={idx} />
          ))}
        </div>
      ) : filteredGuests.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-border text-center shadow-luxury space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#F2EBE4] text-black flex items-center justify-center mx-auto">
            <Search size={22} className="text-black" />
          </div>
          <h3 className="text-base font-bold font-display text-foreground">No Guests Found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto font-sans">
            {queryText 
              ? `No guest matches query "${queryText}". Try searching room number, guest name, or company.` 
              : 'No in-house guests currently synced for this property.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGuests.map((guest) => {
          const checkIn = checkIns[guest.roomNumber];
          const isCheckedIn = Boolean(checkIn);
          // `guest.adults || 1` used to sit here, showing one occupant for a room the export
          // says has none, and offering a stepper for a guest who is not on the reservation.
          const totalOccupants = (guest.adults ?? 0) + (guest.children ?? 0);
          const isPartial = Boolean(checkIn && (checkIn.adultsAte + checkIn.childrenAte) < totalOccupants);
          const isEntitled = hasMealEntitlement(guest.mealPlan, activeMealService);
          const vip = VIP_LEVELS.find((v) => v.level === guest.vipLevel || v.level === guest.vipStatus);

          return (
            <motion.div
              key={guest.roomNumber}
              layout
              className={`rounded-2xl border p-5 transition-all duration-200 flex flex-col justify-between ${
                isCheckedIn
                  ? isPartial
                    ? 'bg-amber-50/50 border-amber-300 shadow-sm'
                    : 'bg-white border-accent/40 shadow-sm ring-1 ring-accent/10'
                  : 'bg-white border-border hover:border-accent/40 shadow-luxury'
              }`}
            >
              <div>
                {/* Header: Room Number & VIP */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="room-badge-luxury">
                      RM {guest.roomNumber}
                    </span>
                    {vip && (
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono-custom font-semibold uppercase ${vip.color}`}>
                        {vip.label}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => setSelectedGuestForAudit(guest)}
                    className="px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-[#F2EBE4]/60 text-[10px] font-mono-custom font-medium flex items-center gap-1 transition-all"
                    title="Opera PMS History & Audit"
                  >
                    <Info size={12} />
                    <span>Audit</span>
                  </button>
                </div>

                {/* Guest Name & Companion */}
                <div className="mt-3">
                  <h4 className="text-base font-bold font-sans text-foreground leading-snug">
                    {guest.guestName}
                  </h4>
                  {guest.accompanyingGuests && guest.accompanyingGuests.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5 font-sans">
                      w/ {guest.accompanyingGuests.join(', ')}
                    </p>
                  )}
                </div>

                {/* Meal Entitlement & Group Info */}
                <div className="mt-3.5 pt-3 border-t border-border/60 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="label-mono">Package</span>
                    <span className={`font-mono-custom font-semibold text-xs ${isEntitled ? 'text-accent' : 'text-amber-600'}`}>
                      {canonicalPlan(guest.mealPlan)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="label-mono">Occupancy</span>
                    <span className="font-mono-custom text-xs font-medium text-foreground">
                      {guest.adults} Ad / {guest.children} Ch
                    </span>
                  </div>

                  {guest.companyName && (
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="label-mono">Group</span>
                      <span className="font-sans text-xs font-medium text-foreground truncate max-w-[170px]">
                        {guest.companyName}
                      </span>
                    </div>
                  )}

                  {guest.specialRequests && (
                    <p className="text-[11px] italic text-amber-700 bg-amber-50/80 p-1.5 rounded-lg mt-1 border border-amber-200/50">
                      Req: {guest.specialRequests}
                    </p>
                  )}
                </div>
              </div>

              {/* Action Controls */}
              <div className="mt-4 pt-3.5 border-t border-border/80">
                {isCheckedIn ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono-custom font-semibold uppercase ${
                        isPartial ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-accent/10 text-accent border border-accent/20'
                      }`}>
                        {isPartial ? `Partial: ${checkIn.adultsAte + checkIn.childrenAte}/${totalOccupants} Seated` : 'Checked In'}
                      </span>
                      {checkIn.tableNumber && (
                        <span className="font-mono-custom text-xs font-bold text-foreground">
                          T-{checkIn.tableNumber}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {isPartial && (
                        <button
                          onClick={() => handleQuickCheckIn(guest)}
                          className="px-2.5 py-1 rounded-lg bg-white border border-black/20 text-black font-mono-custom text-[10px] font-bold uppercase tracking-wider hover:bg-[#F2EBE4]"
                        >
                          Seat Extra
                        </button>
                      )}
                      <button
                        onClick={() => handleUndoCheckIn(guest.roomNumber, guest.guestName)}
                        className="p-1.5 rounded-lg border border-border text-black hover:text-rose-600 hover:bg-rose-50 transition-all"
                        title="Undo Check-In"
                      >
                        <RotateCcw size={13} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="label-mono text-black font-bold">Pending</span>
                    <button
                      onClick={() => handleQuickCheckIn(guest)}
                      className="px-3.5 py-2 rounded-xl bg-white border border-black/20 text-black font-mono-custom text-xs font-bold flex items-center gap-1.5 hover:bg-[#F2EBE4] transition-all shadow-xs cursor-pointer"
                    >
                      <UserCheck size={13} className="text-black" />
                      Check In ({totalOccupants})
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
        </div>
      )}

      {/* Check In Modal */}
      <AnimatePresence>
        {selectedGuestForCheckIn && (
          <CheckInModal
            hotelId={hotelId}
            guest={selectedGuestForCheckIn}
            activeMealService={activeMealService}
            availableTables={tables}
            existingCheckIn={checkIns[selectedGuestForCheckIn.roomNumber]}
            onClose={() => setSelectedGuestForCheckIn(null)}
          />
        )}
      </AnimatePresence>

      {/* Opera Audit & Info Modal */}
      <AnimatePresence>
        {selectedGuestForAudit && (
          <OperaAuditModal
            hotelId={hotelId}
            guest={selectedGuestForAudit}
            onClose={() => setSelectedGuestForAudit(null)}
          />
        )}
      </AnimatePresence>

      {/* Batch Check-In Modal */}
      <AnimatePresence>
        {batchModalOpen && (
          <BatchCheckInModal
            hotelId={hotelId}
            guests={guests}
            activeMealService={activeMealService}
            onClose={() => setBatchModalOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
