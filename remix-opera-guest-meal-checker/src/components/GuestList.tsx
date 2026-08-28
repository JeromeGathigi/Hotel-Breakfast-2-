import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, deleteDoc } from 'firebase/firestore';
import { auth, db, formatFirestoreTime } from '../firebase';
import { Guest, CheckIn } from '../types';
import { Search, Utensils, User, Hash, Calendar, Loader2, ChevronRight, ChevronLeft, Info, ChevronDown, ChevronUp, CheckCircle2, UserCheck, XCircle, AlertTriangle, AlertCircle, UserMinus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { VIP_LEVELS } from '../constants';
import { CheckInModal } from './CheckInModal';
import { DataQualityModal } from './DataQualityModal';
import { businessDate } from '../lib/businessDate';
import { canonicalPlan } from '../lib/meals';
import { computeHouseStats } from '../lib/stats';

export const VIPBadge: React.FC<{ status?: string; size?: 'sm' | 'lg' }> = ({ status, size = 'sm' }) => {
  if (!status) return null;
  const level = VIP_LEVELS.find(v => v.level === status);
  if (!level) return null;
  
  const isPremium = ['2', '3'].includes(status);
  const isHigh = ['6', '7'].includes(status);
  
  return (
    <span className={`inline-flex items-center rounded-lg font-black uppercase tracking-wider ml-2 shadow-lg
      ${size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-4 py-2 text-sm'}
      ${isPremium ? 'vip-shimmer text-background' : isHigh ? 'bg-red-800 text-white border border-red-500/50' : level.color}
    `}>
      {level.label}
    </span>
  );
};

export const GuestList: React.FC<{ hotelId: string }> = ({ hotelId }) => {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showLegend, setShowLegend] = useState(false);
  const [checkIns, setCheckIns] = useState<Record<string, CheckIn>>({});
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState(false);
  const [selectedIssueGuest, setSelectedIssueGuest] = useState<Guest | null>(null);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [today, setToday] = useState(() => businessDate());
  const itemsPerPage = 50;

  useEffect(() => {
    const updateToday = () => setToday(businessDate());
    updateToday();
    const timer = window.setInterval(updateToday, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const checkInsRef = collection(db, 'hotels', hotelId, 'checkins', today, 'rooms');
    const unsubscribe = onSnapshot(
      checkInsRef,
      (snapshot) => {
        const data: Record<string, CheckIn> = {};
        snapshot.docs.forEach(doc => {
          data[doc.id] = doc.data() as CheckIn;
        });
        setCheckIns(data);
      },
      (error) => {
        console.warn('Checkins snapshot notice:', error);
      }
    );
    return () => unsubscribe();
  }, [hotelId, today]);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'hotels', hotelId, 'guests'), orderBy('roomNumber', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const guestData = snapshot.docs.map(docSnap => docSnap.data() as Guest);
        setGuests(guestData);
        setLoading(false);
      },
      (error) => {
        console.warn('Guests snapshot notice:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [hotelId]);

  // Alert categories
  const noAdultsRooms = guests.filter(g => g.issueType === 'no-adults');
  const noDetailsRooms = guests.filter(g => g.issueType === 'no-details');

  const handleCancelCheckIn = async (roomNumber: string) => {
    if (window.confirm(`Are you sure you want to cancel the check-in for room ${roomNumber}?`)) {
      if (!auth.currentUser) {
        window.alert('You must be signed in to cancel a check-in.');
        return;
      }
      try {
        const checkInRef = doc(db, 'hotels', hotelId, 'checkins', today, 'rooms', roomNumber);
        await deleteDoc(checkInRef);
      } catch (error) {
        console.error('Cancel check-in error:', error);
      }
    }
  };

  const filteredGuests = guests.filter(guest => 
    guest.roomNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    guest.guestName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    guest.mealPlan.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (guest.accompanyingGuests && guest.accompanyingGuests.some(name => name.toLowerCase().includes(searchTerm.toLowerCase())))
  );

  const totalPages = Math.ceil(filteredGuests.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedGuests = filteredGuests.slice(startIndex, startIndex + itemsPerPage);

  const stats = computeHouseStats(guests, checkIns);
  const remainingPax = stats.remainingPax;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="animate-spin text-accent" size={48} />
        <p className="text-muted-foreground font-medium">Loading guest database...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Data Quality Alerts */}
      <AnimatePresence>
        {(noAdultsRooms.length > 0 || noDetailsRooms.length > 0) && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="space-y-4"
          >
            {noAdultsRooms.length > 0 && (
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => {
                  setSelectedIssueGuest(noAdultsRooms[0]);
                  setIsIssueModalOpen(true);
                }}
                className="w-full bg-card p-6 border border-amber-500/40 rounded-xl flex items-center justify-between group"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-amber-500/20 text-amber-500 rounded-2xl">
                    <AlertTriangle size={24} />
                  </div>
                  <div className="text-left">
                    <h4 className="text-lg font-black text-amber-500 uppercase tracking-tight">Attention: Adult Count Issues</h4>
                    <p className="text-sm font-medium text-amber-500/80 italic">{noAdultsRooms.length} rooms found with no adult count — please review & correct</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-amber-500 font-bold uppercase tracking-widest text-xs">
                  Review Now
                  <ChevronRight size={16} />
                </div>
              </motion.button>
            )}

            {noDetailsRooms.length > 0 && (
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => {
                  setSelectedIssueGuest(noDetailsRooms[0]);
                  setIsIssueModalOpen(true);
                }}
                className="w-full bg-card p-6 border border-amber-600/40 bg-amber-600/10 flex items-center justify-between group"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-amber-600/20 text-amber-600 rounded-2xl">
                    <UserMinus size={24} />
                  </div>
                  <div className="text-left">
                    <h4 className="text-lg font-black text-amber-600 uppercase tracking-tight">Attention: Missing Guest Details</h4>
                    <p className="text-sm font-medium text-amber-600/80 italic">{noDetailsRooms.length} rooms found with no guest details — please verify occupancy</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-amber-600 font-bold uppercase tracking-widest text-xs">
                  Verify Now
                  <ChevronRight size={16} />
                </div>
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live Status Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card p-6 border border-border rounded-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
            <Utensils size={64} />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">Total Breakfast Pax (Booked)</p>
          <p className="text-4xl font-black text-accent">{stats.entitledPax}</p>
        </div>
        <div className="bg-card p-6 border border-green-500/20 bg-green-500/5 rounded-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform text-green-500">
            <CheckCircle2 size={64} />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-green-500/70 mb-2">Total Checked In (Pax)</p>
          <p className="text-4xl font-black text-green-500">{stats.attendedPax}</p>
        </div>
        <div className="bg-card p-6 border border-border rounded-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform text-muted-foreground">
            <User size={64} />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">Remaining To Check In (Pax)</p>
          <p className="text-4xl font-black text-foreground">{remainingPax}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card p-4 rounded-xl border border-border">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Total Rooms</p>
          <p className="text-2xl font-black text-accent">{stats.totalRooms}</p>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Half Board (HB)</p>
          <p className="text-2xl font-black text-accent">{stats.halfBoard.pax} <span className="text-xs font-bold opacity-40">pax</span></p>
          <p className="text-xs font-bold text-muted-foreground mt-1">{stats.halfBoard.rooms} rooms</p>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Full Board (FB)</p>
          <p className="text-2xl font-black text-accent">{stats.fullBoard.pax} <span className="text-xs font-bold opacity-40">pax</span></p>
          <p className="text-xs font-bold text-muted-foreground mt-1">{stats.fullBoard.rooms} rooms</p>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Room Only</p>
          <p className="text-2xl font-black text-foreground">{stats.roomOnly.pax} <span className="text-xs font-bold opacity-40">pax</span></p>
          <p className="text-xs font-bold text-muted-foreground mt-1">{stats.roomOnly.rooms} rooms</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Guest Database</h2>
          <p className="text-muted-foreground text-sm font-medium">Viewing all {filteredGuests.length} guests currently in-house</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-accent" size={18} />
          <input
            type="text"
            placeholder="Search room, name, or plan..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-12 pr-4 py-3 border border-border bg-card text-foreground placeholder:text-muted-foreground rounded-xl"
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-background border-b border-border">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground w-12">#</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Room</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Guest Name(s)</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Meal Plan</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Booked</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <AnimatePresence mode="popLayout">
                {paginatedGuests.map((guest, index) => {
                  const plan = canonicalPlan(guest.mealPlan);
                  return (
                  <motion.tr
                    key={guest.roomNumber}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={`${index % 2 === 0 ? 'bg-background' : 'bg-card'} hover:bg-accent/5 transition-colors group`}
                  >
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-muted-foreground">
                        {startIndex + index + 1}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`w-12 h-12 bg-background border rounded-xl flex items-center justify-center font-black transition-colors ${
                        guest.issueType ? 'border-amber-500 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'border-border text-accent group-hover:border-accent'
                      }`}>
                        {guest.roomNumber}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center">
                          <p className={`font-bold ${guest.issueType === 'no-details' ? 'text-muted-foreground italic' : 'text-foreground'}`}>
                            {guest.guestName}
                            {Number(guest.adults) > 0 && <span className="text-xs font-medium ml-2 text-muted-foreground opacity-70">— {guest.adults} Adults</span>}
                          </p>
                          <VIPBadge status={guest.vipStatus} />
                          {guest.issueType && (
                            <button 
                              onClick={() => {
                                setSelectedIssueGuest(guest);
                                setIsIssueModalOpen(true);
                              }}
                              className="ml-2 text-amber-500 hover:scale-110 transition-transform"
                            >
                              <AlertCircle size={18} />
                            </button>
                          )}
                        </div>
                        {guest.accompanyingGuests && guest.accompanyingGuests.length > 0 && (
                          <div className="flex flex-col gap-0.5">
                            {guest.accompanyingGuests.map((name, i) => (
                              <p key={i} className="text-[11px] font-medium text-muted-foreground leading-tight">
                                {name}
                              </p>
                            ))}
                          </div>
                        )}
                        {guest.isCorrected && (
                          <div className="flex items-center gap-1 text-[9px] font-black uppercase text-green-500 tracking-tighter">
                            <CheckCircle2 size={10} />
                            Manually Verified
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${
                          plan === 'Breakfast'
                            ? 'bg-accent/10 text-accent' 
                            : plan === 'Half Board'
                            ? 'bg-secondary/10 text-secondary'
                            : 'bg-background text-muted-foreground'
                        }`}>
                          <Utensils size={14} />
                        </div>
                        <span className="text-sm font-bold text-foreground">{guest.mealPlan}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className={`text-sm font-black ${guest.issueType === 'no-adults' ? 'text-amber-500 underline decoration-dotted' : 'text-accent'}`}>
                          {guest.adults} Adults
                        </span>
                        <span className="text-[10px] font-bold text-muted-foreground">{guest.children} Children</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {checkIns[guest.roomNumber] ? (
                          <>
                            <button
                              onClick={() => {
                                setSelectedGuest(guest);
                                setIsCheckInModalOpen(true);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-full text-xs font-bold hover:bg-green-500/30 transition-all"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Checked In • {formatFirestoreTime(checkIns[guest.roomNumber].timestamp, 'Today')}
                            </button>
                            <button
                              onClick={() => handleCancelCheckIn(guest.roomNumber)}
                              className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                              title="Cancel Check-In"
                            >
                              <XCircle size={18} />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              if (guest.issueType) {
                                setSelectedIssueGuest(guest);
                                setIsIssueModalOpen(true);
                              } else {
                                setSelectedGuest(guest);
                                setIsCheckInModalOpen(true);
                              }
                            }}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg ${
                              guest.issueType 
                                ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30 hover:bg-amber-500/30' 
                                : 'bg-accent/10 text-accent border border-accent/30 hover:bg-accent hover:text-background shadow-accent/20'
                            }`}
                          >
                            {guest.issueType ? <AlertTriangle className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                            {guest.issueType ? 'Review Issue' : 'Check In'}
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {filteredGuests.length === 0 && (
          <div className="py-20 text-center space-y-4">
            <div className="w-16 h-16 bg-background rounded-full flex items-center justify-center mx-auto text-accent-muted/30">
              <Search size={32} />
            </div>
            <p className="text-muted-foreground font-medium">No guests found matching your search.</p>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-6 py-4 bg-background border-t border-border flex items-center justify-between">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-2 bg-card border border-border rounded-lg hover:bg-background disabled:opacity-50 transition-colors text-accent"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="p-2 bg-card border border-border rounded-lg hover:bg-background disabled:opacity-50 transition-colors text-accent"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedGuest && (
        <CheckInModal
          isOpen={isCheckInModalOpen}
          onClose={() => setIsCheckInModalOpen(false)}
          guest={selectedGuest}
          hotelId={hotelId}
          date={today}
        />
      )}

      {selectedIssueGuest && (
        <DataQualityModal
          isOpen={isIssueModalOpen}
          onClose={() => {
            setIsIssueModalOpen(false);
            // Optionally move to next issue
            const nextIssue = guests.find(g => g.issueType && g.roomNumber !== selectedIssueGuest.roomNumber);
            if (nextIssue) {
              setSelectedIssueGuest(nextIssue);
              setTimeout(() => setIsIssueModalOpen(true), 300);
            }
          }}
          guest={selectedIssueGuest}
          hotelId={hotelId}
        />
      )}

      {/* VIP Legend Section */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button 
          onClick={() => setShowLegend(!showLegend)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-background transition-colors"
        >
          <div className="flex items-center gap-2">
            <Info size={18} className="text-accent" />
            <span className="font-black text-foreground uppercase tracking-widest text-xs">VIP Status Legend</span>
          </div>
          {showLegend ? <ChevronUp size={18} className="text-accent" /> : <ChevronDown size={18} className="text-accent" />}
        </button>
        
        <AnimatePresence>
          {showLegend && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-border"
            >
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {VIP_LEVELS.map((v) => (
                  <div key={v.level} className="flex gap-4 p-4 rounded-2xl bg-background border border-border">
                    <div className={`shrink-0 w-12 h-6 rounded flex items-center justify-center text-[10px] font-black ${['2', '3'].includes(v.level) ? 'vip-shimmer text-background' : ['6', '7'].includes(v.level) ? 'bg-red-800 text-white border border-red-500/50' : v.color}`}>
                      {v.label}
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-muted-foreground leading-tight">
                        {v.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
