import React, { useState, useEffect } from 'react';
import { 
  db, 
  auth, 
  onSnapshot, 
  doc 
} from './firebase';
import { HOTELS } from './constants';
import { GuestSearch } from './components/GuestSearch';
import { SeatingPlan } from './components/SeatingPlan';
import { ForecastView } from './components/ForecastView';
import { GuestList } from './components/GuestList';
import { Analytics } from './components/Analytics';
import { ReportUploader } from './components/ReportUploader';
import { Auth, isAdminUser } from './components/Auth';
import { OperaAuditModal } from './components/OperaAuditModal';
import { ReportMetadata, MealServiceType } from './types';
import { businessDate, formatBusinessDateDisplay } from './lib/businessDate';
import { 
  Search, 
  Users, 
  BarChart3, 
  Upload, 
  History, 
  TrendingUp, 
  Table as TableIcon, 
  Clock,
  ExternalLink,
  Utensils
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';

export function App() {
  const [selectedHotel, setSelectedHotel] = useState(HOTELS[0]);
  const [activeTab, setActiveTab] = useState<'search' | 'seating' | 'forecast' | 'manifest' | 'analytics' | 'upload'>('search');
  const [activeMealService, setActiveMealService] = useState<MealServiceType>('breakfast');
  const [metadata, setMetadata] = useState<ReportMetadata | null>(null);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [user, setUser] = useState<any>(auth.currentUser);
  const [globalAuditModalOpen, setGlobalAuditModalOpen] = useState(false);

  // Bangkok clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const bkkTime = now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      setCurrentTime(bkkTime);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auth listener
  useEffect(() => {
    if (auth.onAuthStateChanged) {
      return auth.onAuthStateChanged((u: any) => {
        setUser(u);
      });
    }
  }, []);

  // Subscribe to property metadata
  useEffect(() => {
    const metaRef = doc(db, 'hotels', selectedHotel.id, 'metadata', 'reports');
    const unsub = onSnapshot(metaRef, (snap) => {
      if (snap.exists()) {
        setMetadata(snap.data() as ReportMetadata);
      } else {
        setMetadata(null);
      }
    });

    return () => unsub();
  }, [selectedHotel.id]);

  const isAdmin = user?.email ? isAdminUser(user.email) : false;

  return (
    <div className={`min-h-screen bg-background text-foreground flex flex-col md:flex-row ${selectedHotel.theme}`}>
      {/* Property & Navigation Sidebar */}
      <aside className="w-full md:w-72 bg-card border-r border-border flex flex-col justify-between shrink-0 shadow-sm">
        <div className="p-6 space-y-6">
          {/* Brand Logo & Switcher */}
          <div>
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold font-display text-sm text-white shadow-xs ${
                selectedHotel.id === 'ibis' ? 'bg-[#E2001A]' : 'bg-[#1A3A6D]'
              }`}>
                {selectedHotel.id === 'ibis' ? 'I' : 'N'}
              </div>
              <div>
                <h1 className="text-base font-bold font-display tracking-tight text-foreground leading-tight">{selectedHotel.name}</h1>
                <span className="label-mono text-accent text-[9px] mt-0.5 block">{selectedHotel.resortCode} • Opera PMS</span>
              </div>
            </div>

            {/* Seamless Property Switcher */}
            <div id="property-switcher-container" className="mt-4 p-1 rounded-xl bg-[#F2EBE4]/60 border border-border grid grid-cols-2 gap-1.5">
              {HOTELS.map((hotel) => {
                const isSelected = selectedHotel.id === hotel.id;
                const isNovotel = hotel.id === 'novotel';
                return (
                  <button
                    key={hotel.id}
                    id={`hotel-switcher-${hotel.id}`}
                    aria-label={`Switch to ${hotel.name}`}
                    title={`Switch to ${hotel.name}`}
                    onClick={() => setSelectedHotel(hotel)}
                    className={`py-2 px-3 rounded-lg text-xs font-mono-custom font-bold transition-all text-center flex items-center justify-center gap-2 cursor-pointer select-none ${
                      isSelected
                        ? isNovotel
                          ? 'bg-[#1A3A6D] text-white shadow-sm ring-1 ring-[#1A3A6D]'
                          : 'bg-[#E2001A] text-white shadow-sm ring-1 ring-[#E2001A]'
                        : 'text-black bg-transparent hover:text-black hover:bg-[#F2EBE4]/80'
                    }`}
                  >
                    <span 
                      className={`w-4 h-4 rounded-md flex items-center justify-center text-[10px] font-bold font-display leading-none transition-colors ${
                        isSelected 
                          ? 'bg-white/20 text-white' 
                          : isNovotel 
                            ? 'bg-[#1A3A6D]/15 text-[#1A3A6D]' 
                            : 'bg-[#E2001A]/15 text-[#E2001A]'
                      }`}
                    >
                      {isNovotel ? 'N' : 'I'}
                    </span>
                    <span className="leading-none">{isNovotel ? 'Novotel' : 'ibis'}</span>
                  </button>
                );
              })}
            </div>

            {/* Official Restaurant Outlet Info */}
            <div className="mt-3 p-2.5 rounded-xl bg-[#F2EBE4]/40 border border-border/80 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono-custom font-bold uppercase tracking-wider text-black flex items-center gap-1">
                  <Utensils size={10} className="text-black" />
                  {selectedHotel.restaurantName}
                </span>
                <a
                  href={selectedHotel.restaurantUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-black hover:text-accent transition-colors"
                  title="Open restaurant website"
                >
                  <ExternalLink size={11} className="text-black" />
                </a>
              </div>
              <p className="text-[11px] text-black/80 font-medium leading-snug line-clamp-2">
                {selectedHotel.cuisine}
              </p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1 pt-1">
            <p className="px-3 label-mono mb-2 text-black font-bold">
              Host Stand Services
            </p>

            <button
              onClick={() => setActiveTab('search')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-mono-custom font-bold transition-all cursor-pointer ${
                activeTab === 'search'
                  ? 'bg-white text-black shadow-xs border border-black/20 ring-1 ring-black/10'
                  : 'text-black hover:bg-[#F2EBE4]/80 hover:text-black'
              }`}
            >
              <Search size={15} className="text-black shrink-0" />
              <span className="text-black">Guest Check-In</span>
            </button>

            <button
              onClick={() => setActiveTab('seating')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-mono-custom font-bold transition-all cursor-pointer ${
                activeTab === 'seating'
                  ? 'bg-white text-black shadow-xs border border-black/20 ring-1 ring-black/10'
                  : 'text-black hover:bg-[#F2EBE4]/80 hover:text-black'
              }`}
            >
              <TableIcon size={15} className="text-black shrink-0" />
              <span className="text-black">Seating Floor Plan</span>
            </button>

            <button
              onClick={() => setActiveTab('forecast')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-mono-custom font-bold transition-all cursor-pointer ${
                activeTab === 'forecast'
                  ? 'bg-white text-black shadow-xs border border-black/20 ring-1 ring-black/10'
                  : 'text-black hover:bg-[#F2EBE4]/80 hover:text-black'
              }`}
            >
              <TrendingUp size={15} className="text-black shrink-0" />
              <span className="text-black">Meal Forecast</span>
            </button>

            <button
              onClick={() => setActiveTab('manifest')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-mono-custom font-bold transition-all cursor-pointer ${
                activeTab === 'manifest'
                  ? 'bg-white text-black shadow-xs border border-black/20 ring-1 ring-black/10'
                  : 'text-black hover:bg-[#F2EBE4]/80 hover:text-black'
              }`}
            >
              <Users size={15} className="text-black shrink-0" />
              <span className="text-black">In-House Manifest</span>
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-mono-custom font-bold transition-all cursor-pointer ${
                activeTab === 'analytics'
                  ? 'bg-white text-black shadow-xs border border-black/20 ring-1 ring-black/10'
                  : 'text-black hover:bg-[#F2EBE4]/80 hover:text-black'
              }`}
            >
              <BarChart3 size={15} className="text-black shrink-0" />
              <span className="text-black">F&B Analytics</span>
            </button>

            {isAdmin && (
              <button
                onClick={() => setActiveTab('upload')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-mono-custom font-bold transition-all cursor-pointer ${
                  activeTab === 'upload'
                    ? 'bg-white text-black shadow-xs border border-black/20 ring-1 ring-black/10'
                    : 'text-black hover:bg-[#F2EBE4]/80 hover:text-black'
                }`}
              >
                <Upload size={15} className="text-black shrink-0" />
                <span className="text-black">Opera Report Sync</span>
              </button>
            )}

            <button
              onClick={() => setGlobalAuditModalOpen(true)}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-mono-custom font-bold text-black hover:bg-[#F2EBE4]/80 hover:text-black transition-all cursor-pointer"
            >
              <History size={15} className="text-black shrink-0" />
              <span className="text-black">Opera Audit History</span>
            </button>
          </nav>

          {/* Bangkok Clock Widget */}
          <div className="p-3.5 rounded-xl bg-[#F2EBE4]/40 border border-border space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="label-mono">Bangkok (UTC+7)</span>
              <Clock size={11} className="text-accent" />
            </div>
            <p className="text-lg font-bold font-mono-custom text-foreground tracking-tight">{currentTime || '--:--:--'}</p>
            <p className="text-[10px] text-muted-foreground font-mono-custom">{formatBusinessDateDisplay(businessDate())}</p>
          </div>
        </div>

        {/* Accor Colleague Profile / Role */}
        <div className="p-6 border-t border-border">
          <Auth />
        </div>
      </aside>

      {/* Main View Area */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto">
        {activeTab === 'search' && (
          <GuestSearch 
            hotelId={selectedHotel.id} 
            activeMealService={activeMealService}
            setActiveMealService={setActiveMealService}
          />
        )}

        {activeTab === 'seating' && (
          <SeatingPlan 
            hotelId={selectedHotel.id} 
            isAdmin={isAdmin}
            activeMealService={activeMealService}
          />
        )}

        {activeTab === 'forecast' && (
          <ForecastView 
            hotelId={selectedHotel.id} 
            isAdmin={isAdmin} 
          />
        )}

        {activeTab === 'manifest' && (
          <GuestList hotelId={selectedHotel.id} />
        )}

        {activeTab === 'analytics' && (
          <Analytics hotelId={selectedHotel.id} />
        )}

        {activeTab === 'upload' && isAdmin && (
          <ReportUploader hotelId={selectedHotel.id} />
        )}
      </main>

      {/* Global Audit Modal */}
      <AnimatePresence>
        {globalAuditModalOpen && (
          <OperaAuditModal
            hotelId={selectedHotel.id}
            onClose={() => setGlobalAuditModalOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
export default App;
