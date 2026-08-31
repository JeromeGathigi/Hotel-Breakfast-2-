import React, { useState } from 'react';
import { 
  db, 
  auth, 
  doc, 
  setDoc, 
  serverTimestamp, 
  logOperaAuditTrail 
} from '../firebase';
import { Guest, MealServiceType } from '../types';
import { businessDate } from '../lib/businessDate';
import { 
  X, 
  CheckCheck, 
  Search, 
  Check
} from 'lucide-react';
import { motion } from 'motion/react';

interface BatchCheckInModalProps {
  hotelId: string;
  guests: Guest[];
  activeMealService: MealServiceType;
  onClose: () => void;
  onSuccess?: () => void;
}

export const BatchCheckInModal: React.FC<BatchCheckInModalProps> = ({
  hotelId,
  guests,
  activeMealService,
  onClose,
  onSuccess,
}) => {
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set());
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Group by Tour / Company if available
  const tourGroups = Array.from(
    new Set(
      guests
        .map((g) => g.blockCode || g.companyName)
        .filter(Boolean) as string[]
    )
  );

  const filteredGuests = guests.filter((g) => {
    const matchesSearch =
      g.roomNumber.toLowerCase().includes(search.toLowerCase()) ||
      g.guestName.toLowerCase().includes(search.toLowerCase()) ||
      (g.companyName && g.companyName.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;
    if (filterGroup === 'all') return true;
    return g.blockCode === filterGroup || g.companyName === filterGroup;
  });

  const toggleSelectAll = () => {
    if (selectedRooms.size === filteredGuests.length) {
      setSelectedRooms(new Set());
    } else {
      setSelectedRooms(new Set(filteredGuests.map((g) => g.roomNumber)));
    }
  };

  const toggleRoom = (roomNumber: string) => {
    const next = new Set(selectedRooms);
    if (next.has(roomNumber)) {
      next.delete(roomNumber);
    } else {
      next.add(roomNumber);
    }
    setSelectedRooms(next);
  };

  const handleExecuteBatchCheckIn = async () => {
    if (selectedRooms.size === 0) return;
    setSubmitting(true);
    const today = businessDate();
    const currentUser = auth.currentUser;
    const recordedBy = currentUser?.email || 'staff@novotel-chiangmai.com';

    try {
      const selectedGuestList = guests.filter((g) => selectedRooms.has(g.roomNumber));
      let totalPax = 0;

      for (const guest of selectedGuestList) {
        const adults = guest.adults || 1;
        const children = guest.children || 0;
        totalPax += adults + children;

        const checkInDoc = {
          roomNumber: guest.roomNumber,
          guestName: guest.guestName,
          hotelId,
          date: today,
          mealService: activeMealService,
          timestamp: serverTimestamp(),
          adultsAte: adults,
          childrenAte: children,
          infantsAte: 0,
          recordedBy,
          checkedGuestNames: [guest.guestName, ...(guest.accompanyingGuests || [])],
        };

        await setDoc(doc(db, 'hotels', hotelId, 'checkins', today, 'rooms', guest.roomNumber), checkInDoc);
      }

      await logOperaAuditTrail(
        hotelId,
        'CHECK_IN_BATCH',
        `Batch checked-in ${selectedRooms.size} rooms (${totalPax} total pax) for ${activeMealService} service: [Rooms: ${Array.from(selectedRooms).join(', ')}]`,
        undefined,
        undefined,
        { roomCount: selectedRooms.size, totalPax, mealService: activeMealService }
      );

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Batch check in failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0A162B]/50 backdrop-blur-xs flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white border border-border rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-5 max-h-[85vh] flex flex-col"
      >
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <span className="label-mono text-accent">Fast Multi-Room Check-In</span>
            <h3 className="text-2xl font-bold font-display text-foreground mt-1 tracking-tight">
              Tour Group & Batch Check-In
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select multiple rooms or filter by tour block for instant check-in.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-[#F2EBE4]/60 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search rooms, guests, tour codes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-border bg-white text-foreground text-xs font-medium focus:outline-none focus:border-accent"
            />
          </div>

          {tourGroups.length > 0 && (
            <select
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="px-3 py-2 rounded-xl border border-border bg-white text-foreground text-xs font-mono-custom focus:outline-none focus:border-accent"
            >
              <option value="all">All Groups / Companies</option>
              {tourGroups.map((tg) => (
                <option key={tg} value={tg}>
                  {tg}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Selection Status Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-border bg-[#F2EBE4]/60 text-xs">
          <button
            type="button"
            onClick={toggleSelectAll}
            className="text-black hover:underline flex items-center gap-1.5 font-mono-custom font-bold text-xs cursor-pointer"
          >
            <CheckCheck size={14} className="text-black" />
            {selectedRooms.size === filteredGuests.length ? 'Deselect All' : 'Select All Filtered'}
          </button>
          <span className="font-mono-custom text-xs text-black">
            <strong>{selectedRooms.size}</strong> rooms selected
          </span>
        </div>

        {/* Guest Selection Grid */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px]">
          {filteredGuests.map((guest) => {
            const isSelected = selectedRooms.has(guest.roomNumber);
            return (
              <div
                key={guest.roomNumber}
                onClick={() => toggleRoom(guest.roomNumber)}
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                  isSelected
                    ? 'border-black/30 bg-white ring-1 ring-black/10 shadow-xs'
                    : 'border-border bg-white hover:bg-[#F2EBE4]/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                      isSelected ? 'bg-black border-black text-white' : 'border-border bg-white'
                    }`}
                  >
                    {isSelected && <Check size={11} className="text-white" />}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="room-badge-luxury text-[10px]">RM {guest.roomNumber}</span>
                      <span className="text-xs font-bold font-sans text-foreground">{guest.guestName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5 font-mono-custom">
                      <span>{guest.adults} Adults, {guest.children} Children</span>
                      <span>•</span>
                      <span>{guest.mealPlan}</span>
                      {guest.companyName && (
                        <>
                          <span>•</span>
                          <span className="font-semibold text-foreground">{guest.companyName}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredGuests.length === 0 && (
            <p className="text-center py-10 text-xs text-muted-foreground italic font-mono-custom">No rooms match filter.</p>
          )}
        </div>

        {/* Action Button */}
        <div className="pt-3 border-t border-border flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-border text-xs font-mono-custom font-bold text-black hover:bg-[#F2EBE4]/80 transition-all cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={selectedRooms.size === 0 || submitting}
            onClick={handleExecuteBatchCheckIn}
            className="px-6 py-2.5 rounded-xl bg-white border border-black/20 text-black font-mono-custom font-bold text-xs shadow-sm flex items-center gap-2 disabled:opacity-50 hover:bg-[#F2EBE4] transition-all cursor-pointer"
          >
            <CheckCheck size={15} className="text-black" />
            {submitting ? 'Checking in...' : `Check In ${selectedRooms.size} Rooms`}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
