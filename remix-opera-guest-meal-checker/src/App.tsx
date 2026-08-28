import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db, sanitizeData } from './firebase';
import { doc, getDoc, onSnapshot, collection, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { Auth } from './components/Auth';
import { GuestSearch } from './components/GuestSearch';
import { ReportUploader } from './components/ReportUploader';
import { GuestList } from './components/GuestList';
import { Analytics } from './components/Analytics';
import { Search, Upload, List, BarChart3, Utensils, ShieldAlert, Clock3, AlertCircle } from 'lucide-react';
import { ReportMetadata } from './types';
import { businessDate } from './lib/businessDate';

const HOTELS = [
  { id: 'novotel', name: 'Novotel Chiangmai', theme: 'theme-novotel' },
  { id: 'ibis', name: 'ibis Chiangmai', theme: 'theme-ibis' },
];

export default function App() {
  const [user, loading] = useAuthState(auth);
  const [activeTab, setActiveTab] = useState<'search' | 'upload' | 'list' | 'analytics'>('search');
  const [selectedHotel, setSelectedHotel] = useState(HOTELS[0]);
  const [metadata, setMetadata] = useState<ReportMetadata | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [todayLabel, setTodayLabel] = useState(() => businessDate());

  const ADMIN_EMAIL = 'kannika.yuan@gmail.com';

  useEffect(() => {
    const syncBusinessDate = () => setTodayLabel(businessDate());
    syncBusinessDate();

    const timer = window.setInterval(syncBusinessDate, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const isAllowedAdmin = !!user && user.email === ADMIN_EMAIL;
    setIsAdmin(isAllowedAdmin);
    if (!isAllowedAdmin && activeTab === 'upload') {
      setActiveTab('search');
    }
  }, [user, activeTab]);

  useEffect(() => {
    if (!user || !isAdmin) return;

    const checkAndResetDay = async () => {
      try {
        const today = businessDate();
        const metaRef = doc(db, 'hotels', selectedHotel.id, 'metadata', 'reports');
        const metaSnap = await getDoc(metaRef);

        if (!metaSnap.exists()) return;

        const metaData = metaSnap.data() as ReportMetadata;
        const lastDate = metaData.date;

        if (lastDate && lastDate < today) {
          setIsResetting(true);
          try {
            const guestsRef = collection(db, 'hotels', selectedHotel.id, 'guests');
            const guestsSnap = await getDocs(guestsRef);

            if (!guestsSnap.empty) {
              const batch = writeBatch(db);
              guestsSnap.docs.forEach((guestDoc) => {
                const historyRef = doc(db, 'hotels', selectedHotel.id, 'history', lastDate, 'guests', guestDoc.id);
                batch.set(historyRef, sanitizeData(guestDoc.data()));
                batch.delete(guestDoc.ref);
              });

              const sanitizedMeta = sanitizeData({
                ...metaData,
                date: today,
                lastUploaded: serverTimestamp(),
              });
              batch.set(metaRef, sanitizedMeta);
              await batch.commit();
            }
          } finally {
            setIsResetting(false);
          }
        }
      } catch (err) {
        console.warn('Daily reset check notice:', err);
      }
    };

    checkAndResetDay();

    const unsub = onSnapshot(
      doc(db, 'hotels', selectedHotel.id, 'metadata', 'reports'),
      (docSnap) => {
        setMetadata(docSnap.exists() ? (docSnap.data() as ReportMetadata) : null);
      },
      (err) => {
        console.warn('Metadata listener notice:', err);
      }
    );

    return () => unsub();
  }, [selectedHotel.id, isAdmin, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-accent font-bold animate-pulse uppercase tracking-widest text-xs">Loading Opera Guest Checker...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
          <div className="mb-6 flex items-center justify-center gap-3">
            <div className="p-3 bg-accent rounded-2xl shadow-lg shadow-accent/20">
              <Utensils className="text-on-primary" size={22} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Breakfast Host</p>
              <h1 className="text-2xl font-black tracking-tight text-accent">Opera Guest Checker</h1>
            </div>
          </div>
          <Auth />
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${selectedHotel.theme} bg-background text-foreground font-sans selection:bg-accent/30 selection:text-accent flex`}>
      <aside className="w-72 bg-background border-r border-border flex flex-col sticky top-0 h-screen z-[60]">
        <div className="p-8 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-accent rounded-2xl shadow-lg shadow-accent/20">
              <Utensils className="text-on-primary" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-accent uppercase leading-none">Opera</h1>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mt-1">Guest Checker</p>
            </div>
          </div>
          <div className="mt-6 rounded-2xl border border-accent/20 bg-accent/5 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Breakfast day</p>
            <p className="mt-2 text-lg font-black text-accent">{todayLabel}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Reset at 04:00 • refresh at 05:00</p>
          </div>
        </div>

        <nav className="flex-1 p-6 space-y-4 overflow-y-auto">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-4">Hotels</p>
          <div className="space-y-4">
            {HOTELS.map((hotel) => (
              <div key={hotel.id} className="space-y-2">
                <button
                  onClick={() => setSelectedHotel(hotel)}
                  className={`w-full flex items-center justify-between px-4 py-4 rounded-2xl font-bold transition-all duration-300 group ${
                    selectedHotel.id === hotel.id
                      ? 'bg-accent text-on-primary shadow-lg shadow-accent/20'
                      : 'text-muted-foreground hover:bg-card hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${selectedHotel.id === hotel.id ? 'bg-on-primary' : 'bg-border group-hover:bg-accent'}`} />
                    {hotel.name}
                  </div>
                </button>

                {selectedHotel.id === hotel.id && (
                  <div className="pl-4 space-y-1">
                    <button
                      onClick={() => setActiveTab('search')}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all duration-300 ${
                        activeTab === 'search' ? 'text-accent bg-accent/10' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Search size={16} />
                      <span className="text-sm">Search Guest</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('list')}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all duration-300 ${
                        activeTab === 'list' ? 'text-accent bg-accent/10' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <List size={16} />
                      <span className="text-sm">Guest List</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('analytics')}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all duration-300 ${
                        activeTab === 'analytics' ? 'text-accent bg-accent/10' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <BarChart3 size={16} />
                      <span className="text-sm">Analytics</span>
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => setActiveTab('upload')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all duration-300 ${
                          activeTab === 'upload' ? 'text-accent bg-accent/10' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Upload size={16} />
                        <span className="text-sm">Upload Report</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2 text-accent font-black uppercase tracking-[0.2em] text-[10px]">
              <Clock3 size={14} />
              Business date
            </div>
            <p className="text-lg font-black text-foreground">{todayLabel}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.18em]">Local Bangkok time</p>
          </div>
        </nav>

        <div className="p-6 border-t border-border">
          <Auth />
        </div>
      </aside>

      <main className="flex-1 p-8">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Hotel breakfast service</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-foreground">{selectedHotel.name}</h2>
          </div>

          <div className="flex items-center gap-4">
            {metadata?.date && (
              <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                <span className="font-bold text-accent uppercase tracking-widest text-[10px]">Report date</span>
                <div className="mt-1 font-bold text-foreground">{metadata.date}</div>
              </div>
            )}
            {!isAdmin && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300 flex items-center gap-2">
                <ShieldAlert size={16} />
                Staff view only
              </div>
            )}
          </div>
        </header>

        {isResetting && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-300">
            <AlertCircle size={18} />
            Resetting business date and archiving prior guest list�
          </div>
        )}

        {activeTab === 'search' && <GuestSearch hotelId={selectedHotel.id} />}
        {activeTab === 'list' && <GuestList hotelId={selectedHotel.id} />}
        {activeTab === 'analytics' && <Analytics hotelId={selectedHotel.id} />}
        {activeTab === 'upload' && isAdmin && <ReportUploader hotelId={selectedHotel.id} />}
      </main>
    </div>
  );
}
