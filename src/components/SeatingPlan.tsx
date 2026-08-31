import React, { useState, useEffect, useMemo } from 'react';
import { 
  db, 
  collection, 
  getDocs,
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  logOperaAuditTrail 
} from '../firebase';
import { DiningTable, MealServiceType, Guest } from '../types';
import { DEFAULT_NOVOTEL_TABLES, DEFAULT_IBIS_TABLES } from '../constants';
import { TableCardSkeleton } from './Skeleton';
import { RestaurantFloorPlan2D } from './RestaurantFloorPlan2D';
import { 
  Users, 
  Plus, 
  Edit2, 
  Trash2, 
  Clock, 
  RotateCcw, 
  Search, 
  X, 
  SlidersHorizontal,
  ChevronRight,
  Check,
  LayoutGrid,
  Map as MapIcon,
  Cigarette
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SeatingPlanProps {
  hotelId: string;
  isAdmin: boolean;
  activeMealService: MealServiceType;
}

export const SeatingPlan: React.FC<SeatingPlanProps> = ({ hotelId, isAdmin, activeMealService }) => {
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'blueprint' | 'grid'>('blueprint');
  const [selectedZone, setSelectedZone] = useState<string>('All');
  const [selectedTable, setSelectedTable] = useState<DiningTable | null>(null);
  const [isEditLayoutOpen, setIsEditLayoutOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<Partial<DiningTable> | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [searchGuestRoom, setSearchGuestRoom] = useState('');
  const [inHouseGuests, setInHouseGuests] = useState<Guest[]>([]);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignPax, setAssignPax] = useState<number>(2);

  // Subscribe to real-time dining tables
  useEffect(() => {
    setLoading(true);
    const tablesRef = collection(db, 'hotels', hotelId, 'tables');
    const unsub = onSnapshot(
      tablesRef,
      (snapshot) => {
        if (snapshot.empty) {
          // Initialize with default tables
          const defaults = hotelId === 'ibis' ? DEFAULT_IBIS_TABLES : DEFAULT_NOVOTEL_TABLES;
          defaults.forEach((t) => {
            setDoc(doc(db, 'hotels', hotelId, 'tables', t.id), t);
          });
          setTables(defaults);
        } else {
          const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as DiningTable));
          list.sort((a, b) => a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true }));
          setTables(list);
        }
        setLoading(false);
      },
      (err) => {
        console.warn('Seating plan listener notice:', err);
        setLoading(false);
      }
    );

    // Subscribe to in-house guests for table assignment lookup
    const guestsRef = collection(db, 'hotels', hotelId, 'guests');
    const unsubGuests = onSnapshot(guestsRef, (snap) => {
      const gList = snap.docs.map((d) => d.data() as Guest);
      setInHouseGuests(gList);
    });

    return () => {
      unsub();
      unsubGuests();
    };
  }, [hotelId]);

  // Dynamic zones derived from loaded tables with 'All' first
  const zones = useMemo(() => {
    const distinct = Array.from(new Set(tables.map((t) => t.zone).filter(Boolean)));
    return ['All', ...distinct];
  }, [tables]);

  const filteredTables = tables.filter((t) => {
    if (selectedZone !== 'All' && t.zone !== selectedZone) return false;
    if (searchFilter.trim() !== '') {
      const q = searchFilter.toLowerCase();
      const matchNum = t.tableNumber.toLowerCase().includes(q);
      const matchRoom = t.occupiedByRoom?.toLowerCase().includes(q);
      const matchGuest = t.occupiedByGuest?.toLowerCase().includes(q);
      const matchZone = t.zone.toLowerCase().includes(q);
      return matchNum || matchRoom || matchGuest || matchZone;
    }
    return true;
  });

  const occupiedCount = tables.filter((t) => t.status === 'occupied').length;
  const availableCount = tables.filter((t) => t.status === 'available').length;
  const reservedCount = tables.filter((t) => t.status === 'reserved').length;
  const cleaningCount = tables.filter((t) => t.status === 'cleaning').length;
  const totalCapacity = tables.reduce((acc, t) => acc + t.capacity, 0);
  const occupiedCovers = tables.filter((t) => t.status === 'occupied').reduce((acc, t) => acc + (t.occupiedPax || t.capacity), 0);

  const handleUpdateStatus = async (table: DiningTable, newStatus: DiningTable['status']) => {
    try {
      const tableRef = doc(db, 'hotels', hotelId, 'tables', table.id);
      const updates: Partial<DiningTable> = { status: newStatus };
      if (newStatus === 'available') {
        updates.occupiedByRoom = null;
        updates.occupiedByGuest = null;
        updates.occupiedPax = undefined;
        updates.occupiedSince = null;
      }

      await updateDoc(tableRef, updates);

      await logOperaAuditTrail(
        hotelId,
        newStatus === 'available' ? 'TABLE_CLEAR' : 'TABLE_SEAT',
        `Table ${table.tableNumber} status updated to ${newStatus.toUpperCase()}${table.occupiedByRoom ? ` (Room ${table.occupiedByRoom})` : ''}`,
        table.occupiedByRoom || undefined,
        table.occupiedByGuest || undefined
      );

      if (selectedTable?.id === table.id) {
        setSelectedTable((prev) => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (err) {
      console.error('Failed to update table status:', err);
    }
  };

  const handleQuickSeat = (table: DiningTable) => {
    setSelectedTable(table);
    setAssignPax(table.capacity);
    setAssignModalOpen(true);
  };

  const handleAssignGuest = async (guest: Guest) => {
    if (!selectedTable) return;

    // Prompt confirmation if seating guest in smoking area
    if (selectedTable.zone === 'Smoking Terrace' || selectedTable.isSmoking) {
      const confirmedSmoking = window.confirm(
        `${selectedTable.tableNumber} is on the outdoor smoking terrace. Seat this party there?`
      );
      if (!confirmedSmoking) return;
    }

    try {
      const tableRef = doc(db, 'hotels', hotelId, 'tables', selectedTable.id);
      const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      await updateDoc(tableRef, {
        status: 'occupied',
        occupiedByRoom: guest.roomNumber,
        occupiedByGuest: guest.guestName,
        occupiedPax: assignPax || guest.adults || 2,
        occupiedSince: nowTime,
        mealService: activeMealService,
      });

      await logOperaAuditTrail(
        hotelId,
        'TABLE_SEAT',
        `Seated Room ${guest.roomNumber} (${guest.guestName}) at Table ${selectedTable.tableNumber} (${assignPax} pax for ${activeMealService})`,
        guest.roomNumber,
        guest.guestName,
        { tableId: selectedTable.id, tableNumber: selectedTable.tableNumber, pax: assignPax, mealService: activeMealService }
      );

      setAssignModalOpen(false);
      setSelectedTable(null);
      setSearchGuestRoom('');
    } catch (err) {
      console.error('Failed to seat guest:', err);
    }
  };

  const handleSaveTableLayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTable?.tableNumber || !editingTable.capacity) return;

    try {
      const tableId = editingTable.id || `table-${Date.now()}`;
      const newTable: DiningTable = {
        id: tableId,
        tableNumber: editingTable.tableNumber.trim().toUpperCase(),
        capacity: Number(editingTable.capacity) || 2,
        zone: (editingTable.zone as any) || (hotelId === 'ibis' ? 'Delhi Street' : 'Main Dining'),
        status: (editingTable.status as any) || 'available',
        x: editingTable.x || 40,
        y: editingTable.y || 40,
        shape: (editingTable.shape as any) || 'square',
        isSmoking: Boolean(editingTable.isSmoking),
      };

      await setDoc(doc(db, 'hotels', hotelId, 'tables', tableId), newTable);

      await logOperaAuditTrail(
        hotelId,
        'TABLE_LAYOUT_UPDATE',
        `Configured Table ${newTable.tableNumber} in ${newTable.zone} (${newTable.capacity} seats)`
      );

      setEditingTable(null);
    } catch (err) {
      console.error('Failed to save table:', err);
    }
  };

  const handleDeleteTable = async (tableId: string, tableNum: string) => {
    if (!confirm(`Delete table ${tableNum}?`)) return;
    try {
      await deleteDoc(doc(db, 'hotels', hotelId, 'tables', tableId));
      await logOperaAuditTrail(hotelId, 'TABLE_LAYOUT_UPDATE', `Removed Table ${tableNum} from seating plan`);
      if (selectedTable?.id === tableId) setSelectedTable(null);
    } catch (err) {
      console.error('Failed to delete table:', err);
    }
  };

  const handleResetDefaultLayout = async () => {
    const occupiedTables = tables.filter((t) => t.status === 'occupied');
    if (occupiedTables.length > 0) {
      alert(
        `Cannot reset layout while tables are occupied: ${occupiedTables.map((t) => t.tableNumber).join(', ')}. Please clear or complete service for all seated guests first.`
      );
      return;
    }

    const input = window.prompt(
      `Type "${hotelId}" to confirm resetting the floor plan to the exact architectural defaults:`
    );
    if (!input || input.trim().toLowerCase() !== hotelId.toLowerCase()) {
      return;
    }

    try {
      const snap = await getDocs(collection(db, 'hotels', hotelId, 'tables'));
      if (snap && snap.docs) {
        for (const d of snap.docs) {
          await deleteDoc(doc(db, 'hotels', hotelId, 'tables', d.id));
        }
      }
      const defaults = hotelId === 'ibis' ? DEFAULT_IBIS_TABLES : DEFAULT_NOVOTEL_TABLES;
      for (const t of defaults) {
        await setDoc(doc(db, 'hotels', hotelId, 'tables', t.id), t);
      }
      await logOperaAuditTrail(
        hotelId,
        'TABLE_LAYOUT_UPDATE',
        `Reset floor plan to default blueprint layout (${hotelId})`
      );
      setIsEditLayoutOpen(false);
    } catch (err) {
      console.error('Failed to reset layout:', err);
    }
  };

  const filteredGuests = inHouseGuests.filter(
    (g) =>
      g.roomNumber.toLowerCase().includes(searchGuestRoom.toLowerCase()) ||
      g.guestName.toLowerCase().includes(searchGuestRoom.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header & Host Stand Controls */}
      <div className="bg-white rounded-2xl p-6 border border-border shadow-luxury">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="label-mono text-accent">Restaurant Host Stand</span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="font-mono-custom text-xs font-semibold text-muted-foreground capitalize">
                {activeMealService} Service Plan
              </span>
            </div>
            <h2 className="text-2xl font-bold font-display text-foreground mt-1 tracking-tight">
              {hotelId === 'ibis' ? "Charlie's Corner & Delhi Street Floor Plan" : 'Food Exchange & Gourmet Bar Floor Plan'}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Interactive architectural seating blueprint, live guest table allocation, and host stand capacity.
            </p>
          </div>

          {/* View Mode & Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* View Mode Switcher */}
            <div className="flex items-center bg-[#F2EBE4]/60 p-1 rounded-xl border border-border">
              <button
                onClick={() => setViewMode('blueprint')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono-custom font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'blueprint'
                    ? 'bg-white text-black shadow-xs border border-black/10'
                    : 'text-muted-foreground hover:text-black'
                }`}
              >
                <MapIcon size={14} className={viewMode === 'blueprint' ? 'text-accent' : ''} />
                <span>2D Floor Plan</span>
              </button>

              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono-custom font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white text-black shadow-xs border border-black/10'
                    : 'text-muted-foreground hover:text-black'
                }`}
              >
                <LayoutGrid size={14} className={viewMode === 'grid' ? 'text-accent' : ''} />
                <span>Cards Grid</span>
              </button>
            </div>

            {/* Quick Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search table, room #, guest..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="pl-8 pr-3 py-2 rounded-xl border border-border bg-white text-foreground text-xs font-mono-custom placeholder:text-muted-foreground focus:outline-none focus:border-accent w-[200px] sm:w-[240px]"
              />
              {searchFilter && (
                <button
                  onClick={() => setSearchFilter('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {isAdmin && (
              <button
                onClick={() => setIsEditLayoutOpen(true)}
                className="px-4 py-2 rounded-xl border border-border bg-white hover:bg-[#F2EBE4]/50 text-foreground font-mono-custom font-medium text-xs flex items-center gap-2 transition-all shadow-xs cursor-pointer"
              >
                <SlidersHorizontal size={13} className="text-accent" />
                Floor Plan Editor
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="stat-card-luxury p-4">
          <p className="label-mono">Total Tables</p>
          <p className="text-2xl font-bold font-display text-foreground mt-1">{tables.length}</p>
          <p className="text-[10px] font-mono-custom text-muted-foreground mt-0.5">{totalCapacity} total seats</p>
        </div>

        <div className="stat-card-luxury p-4">
          <p className="label-mono text-emerald-700">Available</p>
          <p className="text-2xl font-bold font-display text-emerald-700 mt-1">{availableCount}</p>
          <p className="text-[10px] font-mono-custom text-muted-foreground mt-0.5">Ready for guests</p>
        </div>

        <div className="stat-card-luxury p-4">
          <p className="label-mono text-accent">Occupied</p>
          <p className="text-2xl font-bold font-display text-accent mt-1">{occupiedCount}</p>
          <p className="text-[10px] font-mono-custom text-muted-foreground mt-0.5">{occupiedCovers} seated covers</p>
        </div>

        <div className="stat-card-luxury p-4">
          <p className="label-mono text-amber-700">Reserved</p>
          <p className="text-2xl font-bold font-display text-amber-700 mt-1">{reservedCount}</p>
          <p className="text-[10px] font-mono-custom text-muted-foreground mt-0.5">VIP / Group holds</p>
        </div>

        <div className="stat-card-luxury p-4">
          <p className="label-mono text-slate-500">Cleaning</p>
          <p className="text-2xl font-bold font-display text-slate-500 mt-1">{cleaningCount}</p>
          <p className="text-[10px] font-mono-custom text-muted-foreground mt-0.5">Busser turnover</p>
        </div>

        <div className="stat-card-luxury p-4">
          <p className="label-mono">Utilization</p>
          <p className="text-2xl font-bold font-display text-foreground mt-1">
            {tables.length > 0 ? Math.round((occupiedCount / tables.length) * 100) : 0}%
          </p>
          <p className="text-[10px] font-mono-custom text-muted-foreground mt-0.5">Active table load</p>
        </div>
      </div>

      {/* Zone Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-border">
        {zones.map((zone) => {
          const zoneCount = zone === 'All' ? tables.length : tables.filter((t) => t.zone === zone).length;
          const isSelected = selectedZone === zone;
          return (
            <button
              key={zone}
              onClick={() => setSelectedZone(zone)}
              className={`px-4 py-2 rounded-xl text-xs font-mono-custom font-bold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
                isSelected
                  ? 'bg-white text-black shadow-xs border border-black/20 ring-1 ring-black/10'
                  : 'text-black hover:text-black hover:bg-[#F2EBE4]/80 border border-transparent'
              }`}
            >
              <span className="text-black">{zone}</span>
              <span className={`px-2 py-0.5 text-[10px] rounded-full font-bold font-mono-custom ${
                isSelected ? 'bg-black/10 text-black' : 'bg-[#0A162B]/10 text-black'
              }`}>
                {zoneCount}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main View: 2D Blueprint Floor Plan or Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((idx) => (
            <TableCardSkeleton key={idx} />
          ))}
        </div>
      ) : viewMode === 'blueprint' ? (
        <RestaurantFloorPlan2D
          hotelId={hotelId}
          tables={tables}
          activeMealService={activeMealService}
          selectedZone={selectedZone}
          selectedTable={selectedTable}
          highlightQuery={searchFilter}
          onSelectTable={(table) => setSelectedTable(table)}
          onQuickSeat={(table) => handleQuickSeat(table)}
          onUpdateStatus={(table, status) => handleUpdateStatus(table, status)}
        />
      ) : filteredTables.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-border text-center shadow-luxury">
          <p className="text-sm font-medium text-muted-foreground font-sans">
            No tables matching your current filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredTables.map((table) => {
            const isOccupied = table.status === 'occupied';
            const isAvailable = table.status === 'available';
            const isReserved = table.status === 'reserved';
            const isCleaning = table.status === 'cleaning';

            return (
              <motion.div
                key={table.id}
                layout
                onClick={() => setSelectedTable(table)}
                className={`relative rounded-2xl border p-4 cursor-pointer transition-all duration-200 hover:border-accent ${
                  isOccupied
                    ? 'bg-white border-accent/40 shadow-sm ring-1 ring-accent/10'
                    : isReserved
                    ? 'bg-amber-50/50 border-amber-300 shadow-sm'
                    : isCleaning
                    ? 'bg-slate-50 border-slate-300 shadow-sm'
                    : 'bg-white border-border shadow-luxury'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-lg font-bold font-display text-foreground">{table.tableNumber}</span>
                      <span className="room-badge-luxury text-[10px]">
                        {table.capacity} seats
                      </span>
                    </div>
                    <p className="label-mono mt-1">{table.zone}</p>
                  </div>

                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-mono-custom font-semibold uppercase ${
                      isOccupied
                        ? 'bg-accent text-white'
                        : isAvailable
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : isReserved
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-slate-200 text-slate-700 border border-slate-300'
                    }`}
                  >
                    {table.status}
                  </span>
                </div>

                {/* Occupancy Info */}
                {isOccupied && table.occupiedByRoom ? (
                  <div className="mt-3.5 pt-2.5 border-t border-accent/20 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold font-mono-custom text-accent">RM {table.occupiedByRoom}</span>
                      <span className="text-[10px] font-mono-custom text-muted-foreground flex items-center gap-1">
                        <Clock size={10} /> {table.occupiedSince || 'Active'}
                      </span>
                    </div>
                    <p className="text-xs font-bold font-sans text-foreground truncate">{table.occupiedByGuest || 'Seated Guest'}</p>
                    <p className="text-[10px] font-mono-custom text-muted-foreground">{table.occupiedPax || table.capacity} Pax seated</p>
                  </div>
                ) : (
                  <div className="mt-3.5 pt-2.5 border-t border-border/60 flex items-center justify-between text-[11px] font-mono-custom text-muted-foreground">
                    <span>{isAvailable ? 'Ready to seat' : isReserved ? 'Reserved' : 'Busser turnover'}</span>
                    <ChevronRight size={13} className="text-muted-foreground/60" />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Selected Table Action Modal */}
      <AnimatePresence>
        {selectedTable && (
          <div className="fixed inset-0 z-50 bg-[#0A162B]/50 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-start justify-between border-b border-border pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-2xl font-bold font-display text-foreground tracking-tight">
                      Table {selectedTable.tableNumber}
                    </h3>
                    <span className="room-badge-luxury">
                      {selectedTable.capacity} Seats
                    </span>
                    {selectedTable.isSmoking && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono-custom font-bold bg-cyan-100 text-cyan-800">
                        <Cigarette size={10} /> Smoking
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono-custom text-muted-foreground mt-0.5">{selectedTable.zone}</p>
                </div>
                <button
                  onClick={() => setSelectedTable(null)}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-[#F2EBE4]/60 transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Status Selector */}
              <div className="space-y-2">
                <p className="label-mono">Change Table Status</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleUpdateStatus(selectedTable, 'available')}
                    className={`p-2.5 rounded-xl text-xs font-mono-custom font-medium border transition-all flex items-center justify-between cursor-pointer ${
                      selectedTable.status === 'available'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                        : 'border-border text-muted-foreground hover:bg-[#F2EBE4]/40'
                    }`}
                  >
                    <span>Available (Clean)</span>
                    {selectedTable.status === 'available' && <Check size={13} />}
                  </button>

                  <button
                    onClick={() => handleUpdateStatus(selectedTable, 'occupied')}
                    className={`p-2.5 rounded-xl text-xs font-mono-custom font-medium border transition-all flex items-center justify-between cursor-pointer ${
                      selectedTable.status === 'occupied'
                        ? 'border-accent bg-accent/10 text-accent font-semibold'
                        : 'border-border text-muted-foreground hover:bg-[#F2EBE4]/40'
                    }`}
                  >
                    <span>Occupied</span>
                    {selectedTable.status === 'occupied' && <Check size={13} />}
                  </button>

                  <button
                    onClick={() => handleUpdateStatus(selectedTable, 'reserved')}
                    className={`p-2.5 rounded-xl text-xs font-mono-custom font-medium border transition-all flex items-center justify-between cursor-pointer ${
                      selectedTable.status === 'reserved'
                        ? 'border-amber-500 bg-amber-50 text-amber-800 font-semibold'
                        : 'border-border text-muted-foreground hover:bg-[#F2EBE4]/40'
                    }`}
                  >
                    <span>Reserved</span>
                    {selectedTable.status === 'reserved' && <Check size={13} />}
                  </button>

                  <button
                    onClick={() => handleUpdateStatus(selectedTable, 'cleaning')}
                    className={`p-2.5 rounded-xl text-xs font-mono-custom font-medium border transition-all flex items-center justify-between cursor-pointer ${
                      selectedTable.status === 'cleaning'
                        ? 'border-slate-400 bg-slate-100 text-slate-700'
                        : 'border-border text-muted-foreground hover:bg-[#F2EBE4]/40'
                    }`}
                  >
                    <span>Needs Cleaning</span>
                    {selectedTable.status === 'cleaning' && <Check size={13} />}
                  </button>
                </div>
              </div>

              {/* Occupied Details or Seat Guest Button */}
              {selectedTable.status === 'occupied' && selectedTable.occupiedByRoom ? (
                <div className="p-4 rounded-xl border border-border bg-[#F2EBE4]/40 space-y-2">
                  <p className="label-mono text-black font-bold">Currently Seated</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold font-mono-custom text-foreground">RM {selectedTable.occupiedByRoom}</span>
                    <span className="text-xs font-mono-custom text-muted-foreground">{selectedTable.occupiedPax} Pax</span>
                  </div>
                  <p className="text-xs font-bold font-sans text-foreground">{selectedTable.occupiedByGuest}</p>
                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={() => handleUpdateStatus(selectedTable, 'available')}
                      className="px-3 py-1.5 rounded-lg border border-black/20 text-xs font-mono-custom font-bold text-black hover:bg-white transition-all shadow-xs cursor-pointer"
                    >
                      Clear & Free Table
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setAssignPax(selectedTable.capacity);
                    setAssignModalOpen(true);
                  }}
                  className="w-full py-3 rounded-xl bg-white border border-black/20 text-black font-mono-custom font-bold text-xs flex items-center justify-center gap-2 shadow-sm hover:bg-[#F2EBE4] transition-all cursor-pointer"
                >
                  <Users size={15} className="text-black" />
                  Seat In-House Guest to Table {selectedTable.tableNumber}
                </button>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Seat Guest Lookup Modal */}
      <AnimatePresence>
        {assignModalOpen && selectedTable && (
          <div className="fixed inset-0 z-50 bg-[#0A162B]/50 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white border border-border rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col"
            >
              <div className="flex items-start justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-xl font-bold font-display text-foreground">Seat Guest at Table {selectedTable.tableNumber}</h3>
                  <p className="text-xs text-muted-foreground">Select an in-house room to seat</p>
                </div>
                <button
                  onClick={() => setAssignModalOpen(false)}
                  className="p-1.5 text-black hover:text-foreground rounded-lg hover:bg-[#F2EBE4]/60 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Pax Counter */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-[#F2EBE4]/40">
                <span className="label-mono text-black font-bold">Covers / Pax Seated</span>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setAssignPax(n)}
                      className={`w-7 h-7 rounded-lg text-xs font-mono-custom font-bold transition-all cursor-pointer ${
                        assignPax === n ? 'bg-white text-black border border-black/30 ring-1 ring-black/10 shadow-xs' : 'bg-[#F2EBE4]/60 text-black hover:bg-white border border-border'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search bar */}
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by Room Number or Guest Name..."
                  value={searchGuestRoom}
                  onChange={(e) => setSearchGuestRoom(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-white text-foreground text-xs font-medium focus:outline-none focus:border-accent"
                />
              </div>

              {/* In-House Guests List */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px]">
                {filteredGuests.slice(0, 25).map((guest) => (
                  <div
                    key={guest.roomNumber}
                    onClick={() => handleAssignGuest(guest)}
                    className="p-3 rounded-xl border border-border bg-white hover:border-black/30 hover:bg-[#F2EBE4]/30 cursor-pointer flex items-center justify-between transition-all"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="room-badge-luxury text-[10px]">RM {guest.roomNumber}</span>
                        <span className="text-xs font-bold font-sans text-foreground">{guest.guestName}</span>
                      </div>
                      <p className="text-[10px] font-mono-custom text-muted-foreground mt-0.5">{guest.mealPlan}</p>
                    </div>
                    <button className="px-3 py-1 rounded-lg bg-white border border-black/20 text-black text-[10px] font-mono-custom font-bold uppercase tracking-wider hover:bg-[#F2EBE4] cursor-pointer">
                      Seat
                    </button>
                  </div>
                ))}
                {filteredGuests.length === 0 && (
                  <p className="text-center py-8 text-xs text-muted-foreground italic font-mono-custom">No matching rooms found.</p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Layout Editor Modal */}
      <AnimatePresence>
        {isEditLayoutOpen && (
          <div className="fixed inset-0 z-50 bg-[#0A162B]/50 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white border border-border rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-6 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between border-b border-border pb-4">
                <div>
                  <h3 className="text-2xl font-bold font-display text-foreground">
                    {hotelId === 'ibis' ? "Charlie's Corner & Delhi Street" : 'Food Exchange & Gourmet Bar'} Floor Plan Setup
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Add tables, configure capacities, shapes, or modify restaurant dining zones.
                  </p>
                </div>
                <button
                  onClick={() => setIsEditLayoutOpen(false)}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-[#F2EBE4]/60 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Add / Edit Form */}
              <form onSubmit={handleSaveTableLayout} className="p-4 rounded-xl border border-border bg-[#F2EBE4]/40 space-y-4">
                <p className="label-mono text-accent">
                  {editingTable?.id ? `Edit Table ${editingTable.tableNumber}` : 'Add New Dining Table'}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="label-mono">Table Number</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. GB-01 / DS-06"
                      value={editingTable?.tableNumber || ''}
                      onChange={(e) => setEditingTable((prev) => ({ ...prev, tableNumber: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-white text-foreground text-xs font-mono-custom uppercase focus:outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <label className="label-mono">Capacity</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      required
                      value={editingTable?.capacity || 2}
                      onChange={(e) => setEditingTable((prev) => ({ ...prev, capacity: Number(e.target.value) }))}
                      className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-white text-foreground text-xs font-mono-custom focus:outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <label className="label-mono">Table Shape</label>
                    <select
                      value={editingTable?.shape || 'square'}
                      onChange={(e) => setEditingTable((prev) => ({ ...prev, shape: e.target.value as any }))}
                      className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-white text-foreground text-xs font-mono-custom focus:outline-none focus:border-accent"
                    >
                      <option value="square">Square 4-Top</option>
                      <option value="diamond">Diamond (Gourmet Bar)</option>
                      <option value="round">Round Table</option>
                      <option value="rectangle">Rectangle (Long)</option>
                      <option value="booth">Window Booth</option>
                      <option value="semi_circle">Semi-Circle Lounge</option>
                      <option value="bar_seat">Bar Stool</option>
                    </select>
                  </div>

                  <div>
                    <label className="label-mono">Dining Zone</label>
                    <select
                      value={editingTable?.zone || (hotelId === 'ibis' ? 'Delhi Street' : 'Main Dining')}
                      onChange={(e) => setEditingTable((prev) => ({ ...prev, zone: e.target.value as any }))}
                      className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-white text-foreground text-xs font-mono-custom focus:outline-none focus:border-accent"
                    >
                      {zones.filter((z) => z !== 'All').map((z) => (
                        <option key={z} value={z}>{z}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Smoking Toggle */}
                {hotelId === 'ibis' && (
                  <div className="flex items-center gap-2 pt-1">
                    <label className="flex items-center gap-2 text-xs font-mono-custom cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(editingTable?.isSmoking)}
                        onChange={(e) => setEditingTable((prev) => ({ ...prev, isSmoking: e.target.checked }))}
                        className="rounded border-border text-accent focus:ring-accent w-4 h-4 cursor-pointer"
                      />
                      <span>Designated Smoking Table (Terrace)</span>
                    </label>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  {editingTable && (
                    <button
                      type="button"
                      onClick={() => setEditingTable(null)}
                      className="px-3 py-1.5 rounded-xl border border-border text-xs font-mono-custom text-muted-foreground hover:bg-white cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-accent text-white font-mono-custom text-xs flex items-center gap-1.5 hover:bg-accent-hover shadow-xs cursor-pointer"
                  >
                    <Plus size={13} />
                    {editingTable?.id ? 'Update Table' : 'Save Table'}
                  </button>
                </div>
              </form>

              {/* Table List Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="label-mono">Configured Tables ({tables.length})</p>
                  <button
                    type="button"
                    onClick={handleResetDefaultLayout}
                    className="text-xs font-mono-custom text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw size={12} /> Reset to Blueprint Preset
                  </button>
                </div>

                <div className="border border-border rounded-xl overflow-hidden bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F2EBE4]/60 border-b border-border text-muted-foreground label-mono">
                      <tr>
                        <th className="p-3">Table #</th>
                        <th className="p-3">Zone</th>
                        <th className="p-3">Shape</th>
                        <th className="p-3">Capacity</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {tables.map((t) => (
                        <tr key={t.id} className="hover:bg-[#F2EBE4]/30">
                          <td className="p-3 font-mono-custom font-bold text-foreground flex items-center gap-1.5">
                            {t.tableNumber}
                            {t.isSmoking && <Cigarette size={12} className="text-cyan-700" title="Smoking" />}
                          </td>
                          <td className="p-3 text-muted-foreground">{t.zone}</td>
                          <td className="p-3 text-muted-foreground capitalize font-mono-custom text-[11px]">{t.shape || 'Standard'}</td>
                          <td className="p-3 font-mono-custom text-foreground">{t.capacity} Pax</td>
                          <td className="p-3">
                            <span className="room-badge-luxury text-[9px]">
                              {t.status}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setEditingTable(t)}
                                className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-white cursor-pointer"
                                title="Edit"
                              >
                                <Edit2 size={12} />
                              </button>
                              <button
                                onClick={() => handleDeleteTable(t.id, t.tableNumber)}
                                className="p-1.5 rounded-lg border border-border text-rose-600 hover:bg-rose-50 cursor-pointer"
                                title="Delete"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

