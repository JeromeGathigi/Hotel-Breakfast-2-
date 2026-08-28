import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { auth, db, formatFirestoreDate, formatFirestoreTime } from '../firebase';
import { Guest, CheckIn } from '../types';
import { Search, Loader2, User, Calendar, Utensils, Hash, Database, Star, CheckCircle2, UserCheck, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { VIPBadge } from './GuestList';
import { VIP_LEVELS } from '../constants';
import { CheckInModal } from './CheckInModal';
import { businessDate } from '../lib/businessDate';
import { entitledPax, hasMealEntitlement } from '../lib/meals';

export const GuestSearch: React.FC<{ hotelId: string }> = ({ hotelId }) => {
  const [roomNumber, setRoomNumber] = useState('');
  const [guest, setGuest] = useState<Guest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbStats, setDbStats] = useState<{ count: number; lastUpdate: string | null; bookedPax: number; checkedInPax: number }>({ count: 0, lastUpdate: null, bookedPax: 0, checkedInPax: 0 });
  const [checkIn, setCheckIn] = useState<CheckIn | null>(null);
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState(false);
  const [today, setToday] = useState(() => businessDate());

  useEffect(() => {
    const updateToday = () => setToday(businessDate());
    updateToday();
    const timer = window.setInterval(updateToday, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!guest) {
      setCheckIn(null);
      return;
    }

    const checkInRef = doc(db, 'hotels', hotelId, 'checkins', today, 'rooms', guest.roomNumber);
    const unsubscribe = onSnapshot(checkInRef, (docSnap) => {
      if (docSnap.exists()) {
        setCheckIn(docSnap.data() as CheckIn);
      } else {
        setCheckIn(null);
      }
    });

    return () => unsubscribe();
  }, [hotelId, today, guest]);

  useEffect(() => {
    // Listen for real-time updates to the guest database and check-ins
    const unsubGuests = onSnapshot(
      collection(db, 'hotels', hotelId, 'guests'),
      (guestsSnap) => {
        let booked = 0;
        guestsSnap.forEach(docSnap => {
          const d = docSnap.data() as Guest;
          if (hasMealEntitlement(d.mealPlan)) {
            booked += entitledPax(d);
          }
        });
        setDbStats(prev => ({ ...prev, count: guestsSnap.size, bookedPax: booked }));
      },
      (err) => {
        console.warn('Guests collection notice:', err);
      }
    );

    const unsubCheckIns = onSnapshot(
      collection(db, 'hotels', hotelId, 'checkins', today, 'rooms'),
      (checkSnap) => {
        let ate = 0;
        checkSnap.forEach(docSnap => {
          const d = docSnap.data() as CheckIn;
          ate += (d.adultsAte || 0) + (d.childrenAte || 0) + (d.infantsAte || 0);
        });
        setDbStats(prev => ({ ...prev, checkedInPax: ate }));
      },
      (err) => {
        console.warn('Checkins collection notice:', err);
      }
    );

    // Also get the last update metadata
    const metaUnsubscribe = onSnapshot(
      doc(db, 'hotels', hotelId, 'metadata', 'reports'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.lastUploaded) {
            setDbStats(prev => ({ ...prev, lastUpdate: formatFirestoreDate(data.lastUploaded, null) }));
          } else {
            setDbStats(prev => ({ ...prev, lastUpdate: null }));
          }
        } else {
          setDbStats(prev => ({ ...prev, lastUpdate: null }));
        }
      },
      (err) => {
        console.warn('Metadata notice:', err);
      }
    );

    return () => {
      unsubGuests();
      unsubCheckIns();
      metaUnsubscribe();
    };
  }, [hotelId, today]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomNumber.trim()) return;

    setLoading(true);
    setError(null);
    setGuest(null);

    let normalizedRoom = roomNumber.trim().toUpperCase();
    // Normalize: remove leading zeros (e.g. 0104 -> 104)
    if (/^\d+$/.test(normalizedRoom)) {
      normalizedRoom = parseInt(normalizedRoom, 10).toString();
    }

    try {
      const q = query(collection(db, 'hotels', hotelId, 'guests'), where('roomNumber', '==', normalizedRoom));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setError('Room number not found. Please check and try again.');
      } else {
        const data = querySnapshot.docs[0].data() as Guest;
        setGuest(data);
      }
    } catch (err) {
      console.error('Error searching guest:', err);
      setError('An error occurred while searching. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelCheckIn = async () => {
    if (!guest) return;
    if (window.confirm(`Are you sure you want to cancel the check-in for room ${guest.roomNumber}?`)) {
      if (!auth.currentUser) {
        window.alert('You must be signed in to cancel a check-in.');
        return;
      }
      try {
        const checkInRef = doc(db, 'hotels', hotelId, 'checkins', today, 'rooms', guest.roomNumber);
        await deleteDoc(checkInRef);
      } catch (error) {
        console.error('Cancel check-in error:', error);
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Live Status Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card p-4 border border-border rounded-xl flex gap-4 items-center">
          <div className="p-2 bg-accent/10 rounded-xl text-accent">
            <Utensils size={20} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Booked Pax</p>
            <p className="text-xl font-black text-accent">{dbStats.bookedPax}</p>
          </div>
        </div>
        <div className="bg-card p-4 border border-green-500/20 bg-green-500/5 rounded-xl flex gap-4 items-center">
          <div className="p-2 bg-green-500/10 rounded-xl text-green-500">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-green-500/70">Checked In</p>
            <p className="text-xl font-black text-green-500">{dbStats.checkedInPax}</p>
          </div>
        </div>
        <div className="bg-card p-4 border border-border rounded-xl flex gap-4 items-center">
          <div className="p-2 bg-muted rounded-xl text-muted-foreground">
            <User size={20} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Remaining</p>
            <p className="text-xl font-black text-foreground">{Math.max(0, dbStats.bookedPax - dbStats.checkedInPax)}</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto w-full">
        <form onSubmit={handleSearch} className="relative mb-8">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-accent/50" size={20} />
              <input
                type="text"
                id="search-room-input"
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                placeholder="Enter Room Number (e.g. 101)"
                className="w-full pl-12 pr-4 py-4 text-lg font-medium rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <button
              type="submit"
              id="search-room-btn"
              disabled={loading}
              className="flex items-center gap-2 bg-accent text-on-primary px-4 py-3 rounded-xl font-bold shadow-md hover:opacity-95 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Search size={20} />}
              Search
            </button>
          </div>
        </form>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-4 bg-red-900/20 border border-red-900/30 text-red-400 rounded-2xl text-center font-medium"
            >
              {error}
            </motion.div>
          )}

          {guest && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <div className="bg-card p-8 border-b border-border">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest mb-1">Room Number</p>
                      <h2 className="text-4xl font-black text-accent">{guest.roomNumber}</h2>
                    </div>
                    {guest.vipStatus && (
                      <div className="flex items-center gap-3 bg-background px-4 py-2 rounded-2xl border border-border">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg ${VIP_LEVELS.find(v => v.level === guest.vipStatus)?.color || 'bg-slate-500'}`}>
                          <Star size={24} fill="currentColor" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1">VIP Status</p>
                          <p className="text-xl font-black tracking-tight leading-none text-foreground">
                            {VIP_LEVELS.find(v => v.level === guest.vipStatus)?.label || `VIP ${guest.vipStatus}`}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-3 bg-accent/10 rounded-2xl text-accent">
                    <User size={32} />
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-8">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-card rounded-xl text-accent border border-border">
                    <User size={24} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-1">Guest Name</p>
                    <p className="text-xl font-bold text-foreground">{guest.guestName}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-card rounded-xl text-accent border border-border">
                      <Calendar size={24} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-1">Arrival</p>
                      <p className="text-lg font-bold text-foreground">{guest.arrivalDate}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-card rounded-xl text-accent border border-border">
                      <Calendar size={24} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-1">Departure</p>
                      <p className="text-lg font-bold text-foreground">{guest.departureDate}</p>
                    </div>
                  </div>
                </div>

                <div className="pt-8 border-t border-border space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-accent/10 rounded-xl text-accent">
                      <Utensils size={24} />
                    </div>
                    <div>
                      <p className="text-xs text-accent/70 font-bold uppercase tracking-widest mb-1">Meal Package</p>
                      <p className="text-2xl font-black text-accent uppercase tracking-tight">
                        {guest.mealPlan || 'No Package'}
                      </p>
                      <div className="flex gap-4 mt-2">
                        <div className="px-3 py-1 bg-card rounded-lg border border-border">
                          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Adults</span>
                          <span className="text-lg font-black text-accent">{guest.adults}</span>
                        </div>
                        <div className="px-3 py-1 bg-card rounded-lg border border-border">
                          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Children</span>
                          <span className="text-lg font-black text-accent">{guest.children}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    {checkIn ? (
                      <div className="space-y-3">
                        <button
                          onClick={() => setIsCheckInModalOpen(true)}
                          className="w-full py-4 bg-green-500/20 text-green-400 border border-green-500/30 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-green-500/30 transition-all"
                        >
                          <CheckCircle2 size={24} />
                          Checked In {checkIn.timestamp ? `at ${formatFirestoreTime(checkIn.timestamp)}` : 'Today'}
                        </button>
                        <button
                          onClick={handleCancelCheckIn}
                          className="w-full py-2 text-muted-foreground hover:text-red-500 font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                        >
                          <XCircle size={14} />
                          Cancel This Check-In
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setIsCheckInModalOpen(true)}
                        className="w-full py-4 bg-accent text-background rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-accent/90 transition-all"
                      >
                        <UserCheck size={24} />
                        Check In Now
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {guest && (
        <CheckInModal
          isOpen={isCheckInModalOpen}
          onClose={() => setIsCheckInModalOpen(false)}
          guest={guest}
          hotelId={hotelId}
          date={today}
        />
      )}

      <div className="mt-12 pt-8 border-t border-border">
        <div className="flex items-center justify-between text-muted-foreground">
          <div className="flex items-center gap-2">
            <Database size={16} className="text-accent" />
            <span className="text-sm font-medium">Database Status</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Active Rooms</p>
              <p className="text-lg font-black text-accent">{dbStats.count}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Last Update</p>
              <p className="text-sm font-medium text-foreground">{dbStats.lastUpdate || 'Never'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
