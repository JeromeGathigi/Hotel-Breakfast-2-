import React, { useState } from 'react';
import { 
  db, 
  auth, 
  doc, 
  setDoc, 
  updateDoc, 
  serverTimestamp, 
  logOperaAuditTrail 
} from '../firebase';
import { Guest, CheckIn, MealServiceType, DiningTable } from '../types';
import { businessDate } from '../lib/businessDate';
import { 
  canonicalPlan, 
  hasMealEntitlement, 
  availableOverCapacityReasons 
} from '../lib/meals';
import {
  effectiveCapacity,
  getCombinedTableNumber,
  seatableTables,
} from '../lib/tables';
import { 
  X, 
  Users, 
  AlertTriangle, 
  Check,
  UserCheck
} from 'lucide-react';
import { motion } from 'motion/react';

interface CheckInModalProps {
  hotelId: string;
  guest: Guest;
  activeMealService: MealServiceType;
  availableTables: DiningTable[];
  existingCheckIn?: CheckIn | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export const CheckInModal: React.FC<CheckInModalProps> = ({
  hotelId,
  guest,
  activeMealService,
  availableTables,
  existingCheckIn,
  onClose,
  onSuccess,
}) => {
  // Entitlements
  const maxAdults = guest.adults ?? 0;
  const maxChildren = guest.children || 0;
  const totalOccupants = maxAdults + maxChildren;

  // Existing checkin numbers
  const initialAdultsAte = existingCheckIn ? existingCheckIn.adultsAte : (guest.adults > 0 ? guest.adults : 0);
  const initialChildrenAte = existingCheckIn ? existingCheckIn.childrenAte : (guest.children || 0);
  const initialInfantsAte = existingCheckIn ? existingCheckIn.infantsAte : 0;

  const [mealService, setMealService] = useState<MealServiceType>(activeMealService);
  const [adultsAte, setAdultsAte] = useState<number>(initialAdultsAte);
  const [childrenAte, setChildrenAte] = useState<number>(initialChildrenAte);
  const [infantsAte, setInfantsAte] = useState<number>(initialInfantsAte);
  const [selectedTable, setSelectedTable] = useState<string>(existingCheckIn?.tableNumber || '');
  
  // Specific occupants attending
  const allOccupantNames = [guest.guestName, ...(guest.accompanyingGuests || [])];
  const [checkedOccupants, setCheckedOccupants] = useState<Set<string>>(
    new Set(existingCheckIn?.checkedGuestNames || [guest.guestName])
  );

  const [overCapacityReasons, setOverCapacityReasons] = useState<string[]>(
    existingCheckIn?.overCapacityReasons || []
  );
  const [overCapacityOther, setOverCapacityOther] = useState<string>(
    existingCheckIn?.overCapacityOtherReason || ''
  );
  const [authorizingStaff, setAuthorizingStaff] = useState<string>(
    existingCheckIn?.authorizingStaff || ''
  );

  const [submitting, setSubmitting] = useState(false);

  const totalHeadcount = adultsAte + childrenAte + infantsAte;
  const isOverCapacity = adultsAte > maxAdults || childrenAte > maxChildren;
  const isUnentitled = !hasMealEntitlement(guest.mealPlan, mealService);

  const toggleOccupant = (name: string) => {
    const next = new Set(checkedOccupants);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setCheckedOccupants(next);
    setAdultsAte(Math.min(maxAdults, Math.max(1, next.size)));
  };

  const toggleReason = (code: string) => {
    if (overCapacityReasons.includes(code)) {
      setOverCapacityReasons(overCapacityReasons.filter((r) => r !== code));
    } else {
      setOverCapacityReasons([...overCapacityReasons, code]);
    }
  };

  const handleSaveCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const today = businessDate();
    const currentUser = auth.currentUser;
    const recordedBy = currentUser?.email || 'staff@novotel-chiangmai.com';

    try {
      const seatable = seatableTables(availableTables);
      const tableObj = selectedTable ? seatable.find((t) => t.tableNumber === selectedTable || getCombinedTableNumber(t, availableTables) === selectedTable) : null;
      const checkInDoc: CheckIn = {
        roomNumber: guest.roomNumber,
        guestName: guest.guestName,
        hotelId,
        date: today,
        timestamp: serverTimestamp(),
        mealService,
        adultsAte,
        childrenAte,
        infantsAte,
        recordedBy,
        tableNumber: tableObj ? getCombinedTableNumber(tableObj, availableTables) : (selectedTable || null),
        tableId: tableObj?.id || null,
        overCapacityReasons: isOverCapacity || isUnentitled ? overCapacityReasons : [],
        overCapacityOtherReason: overCapacityOther,
        authorizingStaff,
        checkedGuestNames: Array.from(checkedOccupants),
      };

      const docRef = doc(db, 'hotels', hotelId, 'checkins', today, 'rooms', guest.roomNumber);
      await setDoc(docRef, checkInDoc);

      // If table assigned, mark primary table and any child tables as occupied
      if (tableObj) {
        const occPayload = {
          status: 'occupied',
          occupiedByRoom: guest.roomNumber,
          occupiedByGuest: guest.guestName,
          occupiedPax: totalHeadcount,
          occupiedSince: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          mealService,
        };

        const tRef = doc(db, 'hotels', hotelId, 'tables', tableObj.id);
        await updateDoc(tRef, occPayload);

        if (tableObj.mergedTables && tableObj.mergedTables.length > 0) {
          for (const childId of tableObj.mergedTables) {
            const cRef = doc(db, 'hotels', hotelId, 'tables', childId);
            await updateDoc(cRef, occPayload);
          }
        }
      }

      // Log Opera Audit Trail
      const isPartial = totalOccupants > 1 && totalHeadcount < totalOccupants;
      await logOperaAuditTrail(
        hotelId,
        isPartial ? 'CHECK_IN_PARTIAL' : 'CHECK_IN',
        `Checked-in Room ${guest.roomNumber} (${guest.guestName}) for ${mealService.toUpperCase()} (${adultsAte} Adult, ${childrenAte} Child${selectedTable ? ` at Table ${selectedTable}` : ''})`,
        guest.roomNumber,
        guest.guestName,
        {
          adultsAte,
          childrenAte,
          tableNumber: selectedTable,
          mealService,
          checkedGuests: Array.from(checkedOccupants),
        }
      );

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to save check-in:', err);
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
        className="bg-white border border-border rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="label-mono text-accent">Host Stand Check-In</span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="room-badge-luxury">RM {guest.roomNumber}</span>
            </div>
            <h3 className="text-2xl font-bold font-display text-foreground mt-1 tracking-tight">
              {guest.guestName}
            </h3>
            <p className="text-xs font-mono-custom text-muted-foreground mt-0.5">
              Plan: {canonicalPlan(guest.mealPlan)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-[#F2EBE4]/60 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSaveCheckIn} className="space-y-5">
          {/* Meal Service Selector */}
          <div className="space-y-1.5">
            <label className="label-mono text-black font-bold">Meal Service Period</label>
            <div className="grid grid-cols-3 gap-2">
              {(['breakfast', 'lunch', 'dinner'] as MealServiceType[]).map((service) => (
                <button
                  key={service}
                  type="button"
                  onClick={() => setMealService(service)}
                  className={`py-2 px-3 rounded-xl border text-xs font-mono-custom font-bold capitalize transition-all cursor-pointer ${
                    mealService === service
                      ? 'border-black/20 bg-white text-black shadow-xs ring-1 ring-black/10'
                      : 'border-border bg-[#F2EBE4]/60 text-black hover:text-black hover:bg-white'
                  }`}
                >
                  {service}
                </button>
              ))}
            </div>
          </div>

          {/* Occupants Individual Selection (Partial Check-In) */}
          {allOccupantNames.length > 1 && (
            <div className="p-4 rounded-xl border border-accent/20 bg-accent/5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="label-mono text-accent">
                  Select Attending Guests ({checkedOccupants.size} of {allOccupantNames.length})
                </span>
                <span className="text-[10px] font-mono-custom text-muted-foreground">Individual Check-in</span>
              </div>
              <div className="space-y-1.5">
                {allOccupantNames.map((name) => {
                  const isAttending = checkedOccupants.has(name);
                  return (
                    <div
                      key={name}
                      onClick={() => toggleOccupant(name)}
                      className={`p-2.5 rounded-lg border cursor-pointer flex items-center justify-between transition-all ${
                        isAttending ? 'bg-white border-accent text-foreground shadow-xs' : 'bg-[#F2EBE4]/30 border-border text-muted-foreground'
                      }`}
                    >
                      <span className="text-xs font-medium font-sans">{name}</span>
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center ${
                          isAttending ? 'bg-accent border-accent text-white' : 'border-border'
                        }`}
                      >
                        {isAttending && <Check size={11} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Headcount Adjusters */}
          <div className="grid grid-cols-3 gap-3 p-4 rounded-xl border border-border bg-[#F2EBE4]/40">
            <div>
              <div className="flex items-center justify-between">
                <span className="label-mono">Adults</span>
                <span className="text-[10px] font-mono-custom text-accent font-semibold">Max: {maxAdults}</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setAdultsAte(Math.max(0, adultsAte - 1))}
                  className="w-8 h-8 rounded-lg bg-white border border-border font-bold text-xs text-foreground hover:bg-slate-100 shadow-xs"
                >
                  -
                </button>
                <span className="text-base font-bold font-mono-custom text-foreground flex-1 text-center">{adultsAte}</span>
                <button
                  type="button"
                  onClick={() => setAdultsAte(adultsAte + 1)}
                  className="w-8 h-8 rounded-lg bg-white border border-border font-bold text-xs text-foreground hover:bg-slate-100 shadow-xs"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="label-mono">Children</span>
                <span className="text-[10px] font-mono-custom text-accent font-semibold">Max: {maxChildren}</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setChildrenAte(Math.max(0, childrenAte - 1))}
                  className="w-8 h-8 rounded-lg bg-white border border-border font-bold text-xs text-foreground hover:bg-slate-100 shadow-xs"
                >
                  -
                </button>
                <span className="text-base font-bold font-mono-custom text-foreground flex-1 text-center">{childrenAte}</span>
                <button
                  type="button"
                  onClick={() => setChildrenAte(childrenAte + 1)}
                  className="w-8 h-8 rounded-lg bg-white border border-border font-bold text-xs text-foreground hover:bg-slate-100 shadow-xs"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="label-mono">Infants (&lt;4)</span>
                <span className="text-[10px] font-mono-custom text-emerald-600 font-semibold">Free</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setInfantsAte(Math.max(0, infantsAte - 1))}
                  className="w-8 h-8 rounded-lg bg-white border border-border font-bold text-xs text-foreground hover:bg-slate-100 shadow-xs"
                >
                  -
                </button>
                <span className="text-base font-bold font-mono-custom text-foreground flex-1 text-center">{infantsAte}</span>
                <button
                  type="button"
                  onClick={() => setInfantsAte(infantsAte + 1)}
                  className="w-8 h-8 rounded-lg bg-white border border-border font-bold text-xs text-foreground hover:bg-slate-100 shadow-xs"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Table Assignment (Optional) */}
          <div className="space-y-1.5">
            <label className="label-mono">Dining Table Assignment (Optional)</label>
            <select
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-foreground text-xs font-mono-custom focus:outline-none focus:border-accent shadow-xs"
            >
              <option value="">No table assigned yet (Walk-in / Host Stand Queue)</option>
              {seatableTables(availableTables).map((t) => {
                const combinedNum = getCombinedTableNumber(t, availableTables);
                const cap = effectiveCapacity(t, availableTables);
                return (
                  <option key={t.id} value={combinedNum}>
                    Table {combinedNum} • {t.zone} ({cap} Seats) {t.status === 'occupied' ? '• (Occupied)' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Over-capacity Reason Codes */}
          {(isOverCapacity || isUnentitled) && (
            <div className="p-4 rounded-xl border border-amber-300 bg-amber-50/70 space-y-3">
              <div className="flex items-center gap-2 text-amber-900 text-xs font-bold">
                <AlertTriangle size={15} className="text-amber-600" />
                <span>Over-Capacity / Non-Package Check-In Authorization</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableOverCapacityReasons(hotelId).map((r) => (
                  <button
                    key={r.code}
                    type="button"
                    onClick={() => toggleReason(r.code)}
                    className={`p-2 rounded-lg border text-left text-xs font-mono-custom transition-all ${
                      overCapacityReasons.includes(r.code)
                        ? 'border-amber-500 bg-amber-100 text-amber-900 font-semibold'
                        : 'border-border bg-white text-muted-foreground'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder="Authorizing Manager / Staff Name..."
                value={authorizingStaff}
                onChange={(e) => setAuthorizingStaff(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg border border-border bg-white text-foreground text-xs font-sans focus:outline-none focus:border-accent"
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-3 border-t border-border flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-border text-xs font-mono-custom font-bold text-black hover:bg-[#F2EBE4]/80 transition-all cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting || (adultsAte === 0 && childrenAte === 0 && infantsAte === 0)}
              className="px-6 py-2.5 rounded-xl bg-white border border-black/20 text-black font-mono-custom font-bold text-xs shadow-sm flex items-center gap-2 hover:bg-[#F2EBE4] disabled:opacity-50 transition-all cursor-pointer"
            >
              <UserCheck size={15} className="text-black" />
              {submitting ? 'Confirming...' : `Confirm Check-In (${totalHeadcount} Pax)`}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
