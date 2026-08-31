import React, { useState } from 'react';
import { 
  db, 
  sanitizeData,
  doc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp 
} from '../firebase';
import { Guest } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { X, AlertTriangle, CheckCircle2, UserPlus, Info } from 'lucide-react';
import { hasMealEntitlement } from '../lib/meals';

interface DataQualityModalProps {
  isOpen: boolean;
  onClose: () => void;
  guest: Guest;
  hotelId: string;
}

export const DataQualityModal: React.FC<DataQualityModalProps> = ({ isOpen, onClose, guest, hotelId }) => {
  const [loading, setLoading] = useState(false);
  const [isOccupied, setIsOccupied] = useState<boolean | null>(null);
  
  // States for Type 1 (No Adults) and Type 2 (No Details)
  const [guestName, setGuestName] = useState(guest.guestName === 'RESERVED / NO DETAILS' ? '' : guest.guestName);
  const [adults, setAdults] = useState(guest.adults || 0);
  const [includesBreakfast, setIncludesBreakfast] = useState(hasMealEntitlement(guest.mealPlan));

  const handleUpdate = async () => {
    setLoading(true);
    try {
      const guestRef = doc(db, 'hotels', hotelId, 'guests', guest.roomNumber);
      
      if (guest.issueType === 'no-details' && isOccupied === false) {
        // If not occupied, remove the room
        await deleteDoc(guestRef);
      } else {
        // Update with corrected data
        const updateData = {
          guestName: guestName || guest.guestName,
          adults: Number(adults),
          mealPlan: includesBreakfast ? 'Breakfast (Manual)' : 'Room Only (Manual)',
          issueType: null, // Clear the issue
          isCorrected: true,
          manualAdults: Number(adults),
          manualBreakfast: includesBreakfast,
          manualName: guestName || null,
          manualOccupied: true,
          lastUpdated: serverTimestamp()
        };
        await updateDoc(guestRef, sanitizeData(updateData));
      }
      onClose();
    } catch (error) {
      console.error('Error updating data quality:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="w-full max-w-lg overflow-hidden shadow-2xl border border-border bg-card rounded-xl"
        >
          {/* Header */}
        <div className="p-6 border-b border-border flex justify-between items-center bg-amber-500/10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/20 text-amber-500 rounded-lg">
                <AlertTriangle size={24} />
              </div>
              <div>
              <h2 className="text-xl font-black text-foreground uppercase tracking-tight">Review Room {guest.roomNumber}</h2>
                <p className="text-xs font-bold text-amber-500 uppercase tracking-widest">
                  {guest.issueType === 'no-adults' ? 'No Adult Count Found' : 'Missing Guest Details'}
                </p>
              </div>
            </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-muted-foreground transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="p-8 space-y-6">
            {guest.issueType === 'no-details' && (
              <div className="space-y-4">
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Is this room occupied?</p>
                <div className="flex gap-4">
                  <button
                    onClick={() => setIsOccupied(true)}
                    className={`flex-1 py-4 rounded-xl font-black uppercase tracking-widest border transition-all ${
                    isOccupied === true ? 'bg-accent text-on-primary border-accent' : 'bg-background border-border text-muted-foreground hover:border-accent/50'
                    }`}
                  >
                    Yes, Occupied
                  </button>
                  <button
                    onClick={() => setIsOccupied(false)}
                    className={`flex-1 py-4 rounded-xl font-black uppercase tracking-widest border transition-all ${
                    isOccupied === false ? 'bg-red-500/20 text-red-500 border-red-500' : 'bg-background border-border text-muted-foreground hover:border-red-500/50'
                    }`}
                  >
                    No, Empty
                  </button>
                </div>
              </div>
            )}

            {(guest.issueType === 'no-adults' || isOccupied === true) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {guest.issueType === 'no-details' && (
                  <div className="space-y-2">
                  <label className="text-xs font-black text-accent uppercase tracking-widest">Guest Name</label>
                    <input
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Enter guest name..."
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                )}

                <div className="space-y-2">
                <label className="text-xs font-black text-accent uppercase tracking-widest">Total Adults for Breakfast</label>
                <div className="flex items-center gap-4 bg-background p-2 rounded-2xl border border-border">
                    <button 
                      onClick={() => setAdults(Math.max(0, adults - 1))}
                    className="w-12 h-12 flex items-center justify-center bg-card border border-border rounded-xl text-accent hover:bg-accent hover:text-on-primary transition-all"
                    >
                      <span className="text-2xl font-bold">-</span>
                    </button>
                  <div className="flex-1 text-center text-2xl font-black text-foreground">
                      {adults}
                    </div>
                    <button 
                      onClick={() => setAdults(adults + 1)}
                    className="w-12 h-12 flex items-center justify-center bg-accent text-on-primary rounded-xl hover:opacity-90 transition-all font-bold"
                    >
                      <span className="text-2xl">+</span>
                    </button>
                  </div>
                </div>

              <div className="flex items-center justify-between p-4 bg-accent/5 rounded-2xl border border-accent/20">
                  <div className="flex items-center gap-3">
                  <div className="p-2 bg-accent/10 text-accent rounded-lg">
                      <CheckCircle2 size={18} />
                    </div>
                    <div>
                    <p className="text-sm font-bold text-foreground">Includes Breakfast?</p>
                    <p className="text-[10px] font-medium text-muted-foreground italic">Does this room have a meal plan?</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIncludesBreakfast(!includesBreakfast)}
                  className={`w-14 h-8 rounded-full transition-all relative ${includesBreakfast ? 'bg-accent' : 'bg-background border border-border'}`}
                  >
                    <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all ${includesBreakfast ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
              </motion.div>
            )}

            {isOccupied === false && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex gap-3 text-red-500"
              >
                <AlertTriangle size={20} className="shrink-0" />
                <p className="text-sm font-medium">Removing this room from the list because it is marked as unoccupied.</p>
              </motion.div>
            )}
          </div>

          {/* Footer */}
        <div className="p-6 bg-background border-t border-border flex gap-4">
            <button
              onClick={onClose}
            className="flex-1 py-4 text-muted-foreground font-black uppercase tracking-widest hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdate}
              disabled={loading || (guest.issueType === 'no-details' && isOccupied === null)}
            className="flex-1 py-4 bg-accent text-on-primary rounded-2xl font-black uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
              <div className="w-5 h-5 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
              ) : (
                <CheckCircle2 size={20} />
              )}
              {isOccupied === false ? 'Remove Room' : 'Save Update'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
