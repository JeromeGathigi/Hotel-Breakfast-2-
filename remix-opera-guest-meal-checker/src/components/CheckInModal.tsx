import React, { useState, useEffect } from 'react';
import { doc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth, db, sanitizeData } from '../firebase';
import { Guest, CheckIn } from '../types';
import { X, UserPlus, UserMinus, Baby, CheckCircle2, Loader2, AlertCircle, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { availableOverCapacityReasons, entitledPax, hasMealEntitlement, overCapacityLabel, OVER_CAPACITY_REASONS } from '../lib/meals';

interface CheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  guest: Guest;
  hotelId: string;
  date: string; // YYYY-MM-DD
}

export const CheckInModal: React.FC<CheckInModalProps> = ({ isOpen, onClose, guest, hotelId, date }) => {
  const [adults, setAdults] = useState(guest.adults);
  const [children, setChildren] = useState(guest.children);
  const [infants, setInfants] = useState(0);
  const [loading, setLoading] = useState(false);
  const [existingCheckIn, setExistingCheckIn] = useState<CheckIn | null>(null);

  // Over-capacity workflow state
  const [showOverCapacityForm, setShowOverCapacityForm] = useState(false);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [otherReason, setOtherReason] = useState('');
  const [staffName, setStaffName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const allowance = entitledPax(guest);
  const attending = adults + children + infants;
  const isUnentitled = !hasMealEntitlement(guest.mealPlan);
  const isOverPax = attending > allowance;

  useEffect(() => {
    if (!isOpen) return;

    const checkInRef = doc(db, 'hotels', hotelId, 'checkins', date, 'rooms', guest.roomNumber);
    const unsubscribe = onSnapshot(checkInRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as CheckIn;
        setExistingCheckIn(data);
        setAdults(data.adultsAte);
        setChildren(data.childrenAte);
        setInfants(data.infantsAte);
        setSelectedReasons(data.overCapacityReasonCodes ?? data.overCapacityReasons ?? []);
        setOtherReason(data.overCapacityOtherReason || '');
        setStaffName(data.authorizingStaff || '');
      } else {
        setExistingCheckIn(null);
        setAdults(guest.adults);
        setChildren(guest.children);
        setInfants(0);
        setSelectedReasons([]);
        setOtherReason('');
        setStaffName('');
      }
    });

    return () => unsubscribe();
  }, [isOpen, hotelId, date, guest.roomNumber, guest.adults, guest.children]);

  const toggleReason = (reason: string) => {
    setSelectedReasons(prev => 
      prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev, reason]
    );
  };

  const handleCheckIn = async () => {
    if (isOverPax && !showOverCapacityForm) {
      setShowOverCapacityForm(true);
      return;
    }

    if (showOverCapacityForm) {
      if (selectedReasons.length === 0) return;
      if (selectedReasons.includes(OVER_CAPACITY_REASONS.OTHER) && !otherReason.trim()) return;
      if (!staffName.trim()) return;
    }

    const user = auth.currentUser;
    if (!user) {
      setError('You must be signed in to record a check-in.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const checkInRef = doc(db, 'hotels', hotelId, 'checkins', date, 'rooms', guest.roomNumber);
      const checkInData: CheckIn = {
        roomNumber: guest.roomNumber,
        guestName: guest.guestName,
        hotelId,
        date,
        timestamp: serverTimestamp() as any,
        adultsAte: adults,
        childrenAte: children,
        infantsAte: infants,
        isOverCapacity: isOverPax,
        overCapacityReasons: isOverPax ? selectedReasons.map((reason) => overCapacityLabel(reason as any, hotelId)) : [],
        overCapacityReasonCodes: isOverPax ? selectedReasons : [],
        overCapacityOtherReason: isOverPax ? otherReason : '',
        authorizingStaff: isOverPax ? staffName : '',
        recordedByUid: user.uid,
        recordedByEmail: user.email ?? '',
      };
      await setDoc(checkInRef, sanitizeData(checkInData));
      onClose();
      setShowOverCapacityForm(false);
    } catch (error) {
      console.error('Check-in error:', error);
      setError('Could not save the check-in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isAdultOnlyOver = !isUnentitled && adults > guest.adults && children <= guest.children && infants === 0;
  const reasonOptions = availableOverCapacityReasons({
    mealPlan: guest.mealPlan,
    bookedAdults: guest.adults,
    bookedChildren: guest.children,
    adults,
    children,
    infants,
  });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-md overflow-hidden bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        >
          <div className="p-6 border-b border-border flex justify-between items-center bg-accent/5 shrink-0">
            <div>
              <h2 className="text-xl font-semibold text-foreground">{showOverCapacityForm ? 'Authorization Required' : 'Meal Check-In'}</h2>
              <p className="text-sm text-accent/70">Room {guest.roomNumber} • {guest.guestName}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors font-bold text-accent">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-6 overflow-y-auto">
            {!showOverCapacityForm ? (
              <>
                {/* Adults */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-accent/10 rounded-lg">
                      <UserPlus className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Adults</p>
                      <p className="text-xs text-muted-foreground">Booked: {guest.adults}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setAdults(Math.max(0, adults - 1))}
                      className="w-8 h-8 flex items-center justify-center rounded-full border border-border text-accent hover:bg-accent/10"
                    >
                      -
                    </button>
                    <span className="w-8 text-center text-xl font-semibold text-foreground">{adults}</span>
                    <button 
                      onClick={() => setAdults(adults + 1)}
                      className="w-8 h-8 flex items-center justify-center rounded-full border border-border text-accent hover:bg-accent/10"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Children */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-accent/10 rounded-lg">
                      <UserMinus className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Children</p>
                      <p className="text-xs text-muted-foreground">Booked: {guest.children}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setChildren(Math.max(0, children - 1))}
                      className="w-8 h-8 flex items-center justify-center rounded-full border border-border text-accent hover:bg-accent/10"
                    >
                      -
                    </button>
                    <span className="w-8 text-center text-xl font-semibold text-foreground">{children}</span>
                    <button 
                      onClick={() => setChildren(children + 1)}
                      className="w-8 h-8 flex items-center justify-center rounded-full border border-border text-accent hover:bg-accent/10"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Infants */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-accent/10 rounded-lg">
                      <Baby className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Infants</p>
                      <p className="text-xs text-muted-foreground">Not in report</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setInfants(Math.max(0, infants - 1))}
                      className="w-8 h-8 flex items-center justify-center rounded-full border border-border text-accent hover:bg-accent/10"
                    >
                      -
                    </button>
                    <span className="w-8 text-center text-xl font-semibold text-foreground">{infants}</span>
                    <button 
                      onClick={() => setInfants(infants + 1)}
                      className="w-8 h-8 flex items-center justify-center rounded-full border border-border text-accent hover:bg-accent/10"
                    >
                      +
                    </button>
                  </div>
                </div>

                {isOverPax && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex gap-3"
                  >
                    <AlertCircle className="text-red-500 shrink-0" size={20} />
                    <p className="text-xs text-red-500 font-bold">
                      {isUnentitled
                        ? `This room has no breakfast package. Admitting ${attending} guest(s) requires authorisation.`
                        : `This room is booked for ${allowance} breakfast pax. You are checking in ${attending}.`}
                    </p>
                  </motion.div>
                )}
              </>
            ) : (
              <div className="space-y-6">
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Reason for Discrepancy (Select at least one)</p>
                  <div className="space-y-2">
                    {!isAdultOnlyOver && (
                      <>
                        {reasonOptions.includes(OVER_CAPACITY_REASONS.CHILD_FREE_AGE) && (
                          <button 
                            onClick={() => toggleReason(OVER_CAPACITY_REASONS.CHILD_FREE_AGE)}
                            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                              selectedReasons.includes(OVER_CAPACITY_REASONS.CHILD_FREE_AGE) 
                                ? 'bg-accent text-on-primary border-accent' 
                                : 'bg-muted border-border text-foreground hover:bg-muted/80'
                            }`}
                          >
                            <span className="text-xs font-bold text-left italic leading-tight">{overCapacityLabel(OVER_CAPACITY_REASONS.CHILD_FREE_AGE, hotelId)}</span>
                            {selectedReasons.includes(OVER_CAPACITY_REASONS.CHILD_FREE_AGE) && <Check size={16} />}
                          </button>
                        )}
                        {reasonOptions.includes(OVER_CAPACITY_REASONS.INFANT_FREE) && (
                          <button 
                            onClick={() => toggleReason(OVER_CAPACITY_REASONS.INFANT_FREE)}
                            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                              selectedReasons.includes(OVER_CAPACITY_REASONS.INFANT_FREE) 
                                ? 'bg-accent text-on-primary border-accent' 
                                : 'bg-muted border-border text-foreground hover:bg-muted/80'
                            }`}
                          >
                            <span className="text-xs font-bold text-left italic leading-tight">{overCapacityLabel(OVER_CAPACITY_REASONS.INFANT_FREE, hotelId)}</span>
                            {selectedReasons.includes(OVER_CAPACITY_REASONS.INFANT_FREE) && <Check size={16} />}
                          </button>
                        )}
                      </>
                    )}
                    {reasonOptions.includes(OVER_CAPACITY_REASONS.NO_PACKAGE) && (
                      <button 
                        onClick={() => toggleReason(OVER_CAPACITY_REASONS.NO_PACKAGE)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                          selectedReasons.includes(OVER_CAPACITY_REASONS.NO_PACKAGE) 
                            ? 'bg-accent text-on-primary border-accent' 
                            : 'bg-muted border-border text-foreground hover:bg-muted/80'
                        }`}
                      >
                        <span className="text-xs font-bold text-left italic leading-tight">{overCapacityLabel(OVER_CAPACITY_REASONS.NO_PACKAGE, hotelId)}</span>
                        {selectedReasons.includes(OVER_CAPACITY_REASONS.NO_PACKAGE) && <Check size={16} />}
                      </button>
                    )}
                    <button 
                      onClick={() => toggleReason(OVER_CAPACITY_REASONS.OTHER)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                        selectedReasons.includes(OVER_CAPACITY_REASONS.OTHER) 
                          ? 'bg-accent text-on-primary border-accent' 
                          : 'bg-muted border-border text-foreground hover:bg-muted/80'
                      }`}
                    >
                      <span className="text-xs font-bold text-left italic leading-tight">{overCapacityLabel(OVER_CAPACITY_REASONS.OTHER, hotelId)}</span>
                      {selectedReasons.includes(OVER_CAPACITY_REASONS.OTHER) && <Check size={16} />}
                    </button>
                     
                    {selectedReasons.includes(OVER_CAPACITY_REASONS.OTHER) && (
                      <textarea
                        value={otherReason}
                        onChange={(e) => setOtherReason(e.target.value)}
                        placeholder="Please specify the reason..."
                        className="w-full bg-muted border border-border rounded-xl p-3 text-sm text-foreground focus:border-accent outline-none min-h-[80px]"
                      />
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Authorizing Staff Name</p>
                  <input
                    type="text"
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    placeholder="Enter staff name..."
                    className="w-full bg-muted border border-border rounded-xl p-3 text-sm text-foreground focus:border-accent outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="p-6 bg-accent/5 border-t border-border flex gap-3 shrink-0">
            {showOverCapacityForm && (
              <button
                onClick={() => setShowOverCapacityForm(false)}
                className="flex-1 py-3 border border-border text-accent font-bold rounded-xl hover:bg-accent/5 transition-all"
              >
                Back
              </button>
            )}
            <button
              onClick={handleCheckIn}
              disabled={loading || (showOverCapacityForm && (selectedReasons.length === 0 || (selectedReasons.includes(OVER_CAPACITY_REASONS.OTHER) && !otherReason.trim()) || !staffName.trim()))}
              className="flex-[2] py-3 bg-accent text-on-primary font-bold rounded-xl hover:bg-accent/90 transition-all flex items-center justify-center gap-2 disabled:opacity-30"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  {showOverCapacityForm ? 'Authorize & Save' : existingCheckIn ? 'Update Check-In' : 'Confirm Check-In'}
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
