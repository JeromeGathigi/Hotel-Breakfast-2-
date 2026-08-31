import React, { useState, useMemo } from 'react';
import { DiningTable, MealServiceType, FloorFeature } from '../types';
import { NOVOTEL_FLOOR_FEATURES, IBIS_FLOOR_FEATURES } from '../constants';
import { 
  Users, 
  Clock, 
  Cigarette, 
  Utensils, 
  Wine, 
  Sparkles, 
  Compass, 
  Maximize2, 
  Minimize2, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Coffee,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface RestaurantFloorPlan2DProps {
  hotelId: string;
  tables: DiningTable[];
  activeMealService: MealServiceType;
  selectedZone: string;
  selectedTable: DiningTable | null;
  highlightQuery?: string;
  onSelectTable: (table: DiningTable) => void;
  onQuickSeat: (table: DiningTable) => void;
  onUpdateStatus: (table: DiningTable, status: DiningTable['status']) => void;
}

export const RestaurantFloorPlan2D: React.FC<RestaurantFloorPlan2DProps> = ({
  hotelId,
  tables,
  activeMealService,
  selectedZone,
  selectedTable,
  highlightQuery = '',
  onSelectTable,
  onQuickSeat,
  onUpdateStatus,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [hoveredTable, setHoveredTable] = useState<DiningTable | null>(null);

  const isIbis = hotelId === 'ibis';

  // Filtered tables based on zone selection
  const visibleTables = useMemo(() => {
    return tables.filter((t) => {
      if (selectedZone === 'All') return true;
      return t.zone === selectedZone;
    });
  }, [tables, selectedZone]);

  const getStatusColor = (status: DiningTable['status']) => {
    switch (status) {
      case 'occupied':
        return {
          bg: 'bg-accent/90 hover:bg-accent text-white',
          border: 'border-accent shadow-md ring-2 ring-accent/30',
          badge: 'bg-white/20 text-white',
          chair: 'bg-accent/80',
          label: 'Occupied',
        };
      case 'available':
        return {
          bg: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900',
          border: 'border-emerald-500 shadow-xs ring-1 ring-emerald-300/40',
          badge: 'bg-emerald-600 text-white',
          chair: 'bg-emerald-300 border-emerald-400',
          label: 'Available',
        };
      case 'reserved':
        return {
          bg: 'bg-amber-50 hover:bg-amber-100 text-amber-950',
          border: 'border-amber-500 shadow-xs ring-1 ring-amber-300/40',
          badge: 'bg-amber-600 text-white',
          chair: 'bg-amber-300 border-amber-400',
          label: 'Reserved',
        };
      case 'cleaning':
        return {
          bg: 'bg-slate-100 hover:bg-slate-200 text-slate-800',
          border: 'border-slate-400 shadow-xs ring-1 ring-slate-300',
          badge: 'bg-slate-500 text-white',
          chair: 'bg-slate-300 border-slate-400',
          label: 'Cleaning',
        };
    }
  };

  const renderTableShape = (table: DiningTable) => {
    const isSelected = selectedTable?.id === table.id;
    const isHovered = hoveredTable?.id === table.id;
    const isSearchMatch = highlightQuery.trim() !== '' && (
      table.tableNumber.toLowerCase().includes(highlightQuery.toLowerCase()) ||
      (table.occupiedByRoom && table.occupiedByRoom.toLowerCase().includes(highlightQuery.toLowerCase())) ||
      (table.occupiedByGuest && table.occupiedByGuest.toLowerCase().includes(highlightQuery.toLowerCase()))
    );

    const colors = getStatusColor(table.status);
    const shape = table.shape || (table.capacity >= 6 ? 'rectangle' : table.capacity === 1 ? 'bar_seat' : 'square');

    return (
      <div
        key={table.id}
        id={`table-node-${table.id}`}
        style={{
          left: `${table.x ?? 50}%`,
          top: `${table.y ?? 50}%`,
          transform: 'translate(-50%, -50%)',
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelectTable(table);
        }}
        onMouseEnter={() => setHoveredTable(table)}
        onMouseLeave={() => setHoveredTable(null)}
        className={`absolute cursor-pointer transition-all duration-200 select-none z-20 group ${
          isSelected ? 'scale-110 z-30' : isHovered ? 'scale-105 z-25' : ''
        }`}
      >
        {/* Highlight Ring for Search Match */}
        {isSearchMatch && (
          <div className="absolute -inset-2 rounded-2xl bg-amber-400/40 animate-ping pointer-events-none" />
        )}

        {/* Outer Highlight for Selected Table */}
        {isSelected && (
          <div className="absolute -inset-2.5 rounded-2xl border-2 border-black bg-black/5 animate-pulse pointer-events-none" />
        )}

        {/* 1. Diamond Table (Gourmet Bar 4-tops) */}
        {shape === 'diamond' && (
          <div className="relative flex items-center justify-center p-1">
            {/* 4 Chairs rotated around diamond faces */}
            <div className={`absolute -top-1.5 w-2.5 h-2.5 rounded-full ${colors.chair} border shadow-2xs`} />
            <div className={`absolute -bottom-1.5 w-2.5 h-2.5 rounded-full ${colors.chair} border shadow-2xs`} />
            <div className={`absolute -left-1.5 w-2.5 h-2.5 rounded-full ${colors.chair} border shadow-2xs`} />
            <div className={`absolute -right-1.5 w-2.5 h-2.5 rounded-full ${colors.chair} border shadow-2xs`} />

            <div className={`w-9 h-9 rotate-45 rounded-lg border flex flex-col items-center justify-center transition-all ${colors.bg} ${colors.border}`}>
              <div className="-rotate-45 text-center px-0.5">
                <span className="font-mono-custom font-black text-[10px] leading-none tracking-tight block">
                  {table.tableNumber}
                </span>
                <span className="text-[7.5px] font-mono-custom opacity-85 block mt-0.5">
                  {table.status === 'occupied' ? `R${table.occupiedByRoom}` : `${table.capacity}P`}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 2. Round Table (VIP or High Tops) */}
        {shape === 'round' && (
          <div className="relative flex items-center justify-center p-1">
            {/* 4 Radial Chairs */}
            <div className={`absolute -top-1.5 w-2.5 h-2.5 rounded-full ${colors.chair} border shadow-2xs`} />
            <div className={`absolute -bottom-1.5 w-2.5 h-2.5 rounded-full ${colors.chair} border shadow-2xs`} />
            <div className={`absolute -left-1.5 w-2.5 h-2.5 rounded-full ${colors.chair} border shadow-2xs`} />
            <div className={`absolute -right-1.5 w-2.5 h-2.5 rounded-full ${colors.chair} border shadow-2xs`} />

            <div className={`w-10 h-10 rounded-full border flex flex-col items-center justify-center transition-all ${colors.bg} ${colors.border}`}>
              <span className="font-mono-custom font-black text-[10px] leading-tight">
                {table.tableNumber}
              </span>
              <span className="text-[7.5px] font-mono-custom opacity-85">
                {table.status === 'occupied' ? `R${table.occupiedByRoom}` : `${table.capacity}P`}
              </span>
            </div>
          </div>
        )}

        {/* 3. Semi-Circular Lounge / Curved Booth */}
        {shape === 'semi_circle' && (
          <div className="relative flex flex-col items-center justify-center p-1">
            {/* Curved Backrest Strip */}
            <div className="w-14 h-4 rounded-t-full border-t-2 border-x-2 border-stone-400 bg-stone-200 -mb-1.5" />
            <div className={`w-12 h-9 rounded-t-full rounded-b-md border flex flex-col items-center justify-center transition-all ${colors.bg} ${colors.border}`}>
              <span className="font-mono-custom font-black text-[9.5px] leading-tight mt-0.5">
                {table.tableNumber}
              </span>
              <span className="text-[7.5px] font-mono-custom opacity-85">
                {table.status === 'occupied' ? `R${table.occupiedByRoom}` : `${table.capacity}P`}
              </span>
            </div>
          </div>
        )}

        {/* 4. Booth / Window Banquette */}
        {shape === 'booth' && (
          <div className="relative flex flex-col items-center justify-center p-1">
            {/* Top & Bottom Booth Backrests */}
            <div className="w-11 h-1.5 rounded-t-sm bg-cyan-700/80 border border-cyan-800 mb-0.5" />
            <div className={`w-11 h-8 rounded-sm border flex flex-col items-center justify-center transition-all ${colors.bg} ${colors.border}`}>
              <span className="font-mono-custom font-black text-[9.5px] leading-none">
                {table.tableNumber}
              </span>
              <span className="text-[7.5px] font-mono-custom opacity-85 mt-0.5">
                {table.status === 'occupied' ? `R${table.occupiedByRoom}` : `${table.capacity}P`}
              </span>
            </div>
            <div className="w-11 h-1.5 rounded-b-sm bg-cyan-700/80 border border-cyan-800 mt-0.5" />
          </div>
        )}

        {/* 5. Bar Seat / Stool */}
        {shape === 'bar_seat' && (
          <div className="relative flex items-center justify-center p-0.5">
            <div className="w-8 h-8 rounded-full border flex flex-col items-center justify-center transition-all shadow-2xs bg-white border-amber-600/60 text-amber-950 hover:bg-amber-50">
              <span className="font-mono-custom font-bold text-[8.5px] leading-none">
                {table.tableNumber}
              </span>
              <span className="text-[7px] font-mono-custom text-muted-foreground mt-0.5">
                {table.status === 'occupied' ? `R${table.occupiedByRoom}` : `${table.capacity}P`}
              </span>
            </div>
          </div>
        )}

        {/* 6. Standard Square / 4-Top or 2-Top Dining Table */}
        {shape === 'square' && (
          <div className="relative flex items-center justify-center p-1">
            {/* Chairs: 4 chairs for 4-tops, 2 chairs for 2-tops */}
            <div className={`absolute -top-1.5 w-3.5 h-1.5 rounded-t-sm ${colors.chair} border shadow-2xs`} />
            <div className={`absolute -bottom-1.5 w-3.5 h-1.5 rounded-b-sm ${colors.chair} border shadow-2xs`} />
            {table.capacity > 2 && (
              <>
                <div className={`absolute -left-1.5 w-1.5 h-3.5 rounded-l-sm ${colors.chair} border shadow-2xs`} />
                <div className={`absolute -right-1.5 w-1.5 h-3.5 rounded-r-sm ${colors.chair} border shadow-2xs`} />
              </>
            )}

            <div className={`w-9.5 h-9.5 rounded-md border flex flex-col items-center justify-center transition-all ${colors.bg} ${colors.border}`}>
              <span className="font-mono-custom font-black text-[10px] leading-none">
                {table.tableNumber}
              </span>
              <span className="text-[7.5px] font-mono-custom opacity-85 mt-0.5">
                {table.status === 'occupied' ? `R${table.occupiedByRoom}` : `${table.capacity}P`}
              </span>
            </div>
          </div>
        )}

        {/* 7. Long Rectangle Table */}
        {shape === 'rectangle' && (
          <div className="relative flex items-center justify-center p-1">
            {/* Top & Bottom Chairs */}
            <div className="absolute -top-1 flex gap-1">
              <div className={`w-2.5 h-1.5 rounded-t-sm ${colors.chair} border shadow-2xs`} />
              <div className={`w-2.5 h-1.5 rounded-t-sm ${colors.chair} border shadow-2xs`} />
            </div>
            <div className="absolute -bottom-1 flex gap-1">
              <div className={`w-2.5 h-1.5 rounded-b-sm ${colors.chair} border shadow-2xs`} />
              <div className={`w-2.5 h-1.5 rounded-b-sm ${colors.chair} border shadow-2xs`} />
            </div>

            <div className={`w-13 h-8.5 rounded-md border flex flex-col items-center justify-center transition-all ${colors.bg} ${colors.border}`}>
              <span className="font-mono-custom font-black text-[10px] leading-none">
                {table.tableNumber}
              </span>
              <span className="text-[7.5px] font-mono-custom opacity-85 mt-0.5">
                {table.status === 'occupied' ? `R${table.occupiedByRoom}` : `${table.capacity}P`}
              </span>
            </div>
          </div>
        )}

        {/* Smoking Indicator Badge */}
        {table.isSmoking && (
          <span className="absolute -top-2 -right-2 bg-cyan-600 text-white rounded-full p-0.5 shadow-xs border border-white" title="Smoking Area Table">
            <Cigarette size={9} />
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Visual Blueprint Canvas Container */}
      <div className="relative bg-[#FAFAF8] rounded-3xl border-2 border-[#1E293B]/10 overflow-hidden shadow-2xl">
        {/* Top Blueprint Navigation & Controls Bar */}
        <div className="bg-[#0A162B] text-white px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 border-b border-[#0A162B]/80">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono-custom font-bold tracking-widest text-emerald-400 uppercase">
                  {isIbis ? "Charlie's Corner & Delhi Street" : 'Food Exchange & Gourmet Bar'}
                </span>
                <span className="text-xs text-white/40">•</span>
                <span className="text-xs font-mono-custom text-white/80">Architectural Floor Plan</span>
              </div>
              <p className="text-[11px] text-white/60 font-sans mt-0.5">
                Live seating allocation, host stand view, and zone occupancy.
              </p>
            </div>
          </div>

          {/* Map Controls */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white/10 rounded-xl p-1 border border-white/10 text-xs font-mono-custom">
              <button
                onClick={() => setZoomLevel((z) => Math.max(0.8, Number((z - 0.1).toFixed(1))))}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer transition-all"
                title="Zoom Out"
              >
                <ZoomOut size={14} />
              </button>
              <span className="px-2 text-[11px] font-bold text-white min-w-[45px] text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(1.4, Number((z + 0.1).toFixed(1))))}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer transition-all"
                title="Zoom In"
              >
                <ZoomIn size={14} />
              </button>
              <button
                onClick={() => setZoomLevel(1)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer ml-1 border-l border-white/10"
                title="Reset Zoom"
              >
                <RotateCcw size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Blueprint Map Surface */}
        <div className="relative w-full overflow-auto p-4 md:p-8 flex justify-center items-center min-h-[520px] bg-[#F7F5F0]">
          <div 
            style={{ 
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'center center',
              transition: 'transform 0.2s ease-out'
            }}
            className="relative w-[1100px] h-[460px] bg-white rounded-2xl border-2 border-stone-400/80 shadow-xl overflow-hidden shrink-0 select-none"
          >
            {/* Grid Pattern Background */}
            <div className="absolute inset-0 bg-[radial-gradient(#0A162B_0.75px,transparent_0.75px)] [background-size:20px_20px] opacity-10 pointer-events-none" />

            {/* ------------------------------------------------------------- */}
            {/* HOTEL 1: NOVOTEL FOOD EXCHANGE & GOURMET BAR ARCHITECTURE   */}
            {/* ------------------------------------------------------------- */}
            {!isIbis && (
              <>
                {/* 1. Left Back-of-House Wing & Top-Left Stairs / Terrace */}
                <div className="absolute top-[15%] left-[4%] w-[10%] h-[38%] rounded-xl border-2 border-stone-700 bg-stone-100/70 pointer-events-none z-10 shadow-xs" />
                
                <div className="absolute top-[4%] left-[4%] w-[12%] h-[10%] rounded-lg border border-dashed border-stone-400 bg-stone-50/60 p-1 pointer-events-none z-10 flex items-center justify-center">
                  <div className="flex flex-col gap-0.5 w-full">
                    <div className="h-0.5 bg-stone-300 rounded-full" />
                    <div className="h-0.5 bg-stone-300 rounded-full" />
                    <div className="h-0.5 bg-stone-300 rounded-full" />
                  </div>
                </div>

                {/* 2. Named Non-Table Feature: HOSTESS DESK (x:4, y:58, w:10, h:6) */}
                <div className="absolute top-[58%] left-[4%] w-[10%] h-[6%] rounded-md bg-stone-100 border-2 border-stone-800 flex items-center justify-center pointer-events-none z-15 shadow-xs">
                  <span className="text-[7px] font-mono-custom font-black tracking-wider text-stone-900 uppercase">
                    HOSTESS DESK
                  </span>
                </div>

                {/* 3. Named Non-Table Feature: COFFEE STAND (x:19, y:62, w:3, h:17, verticalLabel: true) */}
                <div className="absolute top-[62%] left-[19%] w-[3%] h-[17%] rounded-sm border-2 border-amber-700 bg-amber-100/90 flex flex-col items-center justify-center pointer-events-none z-15 shadow-xs py-0.5">
                  <span className="text-[6.5px] font-mono-custom font-black text-amber-950 uppercase tracking-widest [writing-mode:vertical-lr] rotate-180 text-center">
                    COFFEE STAND
                  </span>
                </div>

                {/* Bench seating on left wall (x:19, y:82, w:3, h:14) */}
                <div className="absolute top-[82%] left-[19%] w-[3%] h-[14%] rounded-sm bg-stone-200/90 border border-stone-400 pointer-events-none z-10" />

                {/* 4. Gourmet Bar Enclosed Room (x:49, y:4, w:36, h:26) */}
                <div className="absolute top-[4%] left-[49%] w-[36%] h-[26%] rounded-xl border-2 border-stone-800 bg-stone-50/50 pointer-events-none z-10">
                  {/* Bar Counter down right side (x:79, y:6, w:4, h:22 relative to room) */}
                  <div className="absolute top-[8%] right-[3%] w-[11%] h-[84%] rounded bg-cyan-200/90 border border-cyan-600" />
                  {/* Unlabelled round table beside BAR6 (drawn, left blank) */}
                  <div className="absolute top-[50%] right-[3%] w-[11%] h-[24%] rounded-full bg-stone-200 border border-stone-400" />
                </div>

                {/* 5. Main Dining Service Counter in C3-C4 gap (x:40, y:40, w:4, h:5) */}
                <div className="absolute top-[40%] left-[40%] w-[4%] h-[5%] rounded-sm bg-stone-200/90 border border-stone-500 pointer-events-none z-10" />

                {/* 6. Top Buffet Counter (x:58, y:34, w:22, h:5) */}
                <div className="absolute top-[34%] left-[58%] w-[22%] h-[5%] rounded bg-cyan-100/90 border-2 border-cyan-600 flex items-center justify-between px-1 pointer-events-none z-10">
                  <div className="w-3 h-3 rounded-xs bg-cyan-200 border border-cyan-400" />
                  <div className="w-3 h-3 rounded-xs bg-cyan-200 border border-cyan-400" />
                  <div className="w-3 h-3 rounded-xs bg-cyan-200 border border-cyan-400" />
                </div>

                {/* 7. Central Buffet Island (x:62, y:52, w:16, h:12) */}
                <div className="absolute top-[52%] left-[62%] w-[16%] h-[12%] rounded-full bg-cyan-100/90 border-2 border-cyan-600 flex items-center justify-around px-1 pointer-events-none z-10 shadow-xs">
                  <div className="w-4.5 h-4.5 rounded-full bg-cyan-300 border border-cyan-500" />
                  <div className="w-4.5 h-4.5 rounded-full bg-cyan-300 border border-cyan-500" />
                </div>

                {/* 8. Bottom Buffet Counter (x:58, y:72, w:22, h:5) */}
                <div className="absolute top-[72%] left-[58%] w-[22%] h-[5%] rounded bg-cyan-100/90 border-2 border-cyan-600 flex items-center justify-between px-1 pointer-events-none z-10">
                  <div className="w-3 h-3 rounded-xs bg-cyan-200 border border-cyan-400" />
                  <div className="w-3 h-3 rounded-xs bg-cyan-200 border border-cyan-400" />
                  <div className="w-3 h-3 rounded-xs bg-cyan-200 border border-cyan-400" />
                </div>

                {/* 9. Banquette down the right-hand wall (x:92, y:18, w:3, h:66) */}
                <div className="absolute top-[18%] left-[92%] w-[3%] h-[66%] rounded-lg bg-cyan-200/80 border-2 border-cyan-600 pointer-events-none z-10" />

                {/* 10. Bench seating along bottom right (x:84, y:88, w:10, h:3) */}
                <div className="absolute top-[88%] left-[84%] w-[10%] h-[3%] rounded-sm bg-stone-200/90 border border-stone-400 pointer-events-none z-10" />
              </>
            )}

            {/* ------------------------------------------------------------- */}
            {/* HOTEL 2: IBIS CHARLIE'S CORNER ARCHITECTURE                  */}
            {/* ------------------------------------------------------------- */}
            {isIbis && (
              <>
                {/* 1. Bar Prep / Kitchen Pass (Left Wing Top, x:18, y:6, w:14, h:22) */}
                <div className="absolute top-[6%] left-[18%] w-[14%] h-[22%] rounded-xl border-2 border-stone-800 bg-stone-100/70 p-1 pointer-events-none z-10 flex flex-col justify-between">
                  <div className="w-full h-3.5 rounded bg-cyan-200/90 border border-cyan-500" />
                </div>

                {/* Bottom-left Back-of-House / Entrance Foyer (x:4, y:32, w:26, h:48) */}
                <div className="absolute top-[32%] left-[4%] w-[26%] h-[48%] rounded-xl border border-dashed border-stone-400 bg-stone-50/40 pointer-events-none z-0" />

                {/* 2. Named Non-Table Feature: HOSTESS DESK (x:34, y:26, w:10, h:5) */}
                <div className="absolute top-[26%] left-[34%] w-[10%] h-[5%] rounded-md bg-stone-100 border-2 border-stone-800 flex items-center justify-center pointer-events-none z-15 shadow-xs">
                  <span className="text-[6.5px] font-mono-custom font-black text-stone-900 uppercase tracking-wider">
                    HOSTESS DESK
                  </span>
                </div>

                {/* 3. Named Non-Table Feature: FRONT DESK (x:72, y:36, w:9, h:5) */}
                <div className="absolute top-[36%] left-[72%] w-[9%] h-[5%] rounded-md bg-stone-100 border-2 border-stone-800 flex items-center justify-center pointer-events-none z-15 shadow-xs">
                  <span className="text-[6.5px] font-mono-custom font-black text-stone-900 uppercase tracking-wider">
                    FRONT DESK
                  </span>
                </div>

                {/* 4. Top Buffet Counter (x:46, y:24, w:22, h:6) */}
                <div className="absolute top-[24%] left-[46%] w-[22%] h-[6%] rounded bg-cyan-100/90 border-2 border-cyan-600 flex items-center justify-between px-1 pointer-events-none z-10">
                  <div className="w-3 h-3 rounded-xs bg-cyan-200 border border-cyan-400" />
                  <div className="w-3 h-3 rounded-xs bg-cyan-200 border border-cyan-400" />
                </div>

                {/* 5. Center Dining Dividers left & right of C/B block */}
                <div className="absolute top-[40%] left-[44%] w-[1.2%] h-[26%] rounded bg-cyan-200/90 border border-cyan-600 pointer-events-none z-10" />
                <div className="absolute top-[40%] left-[68%] w-[1.2%] h-[26%] rounded bg-cyan-200/90 border border-cyan-600 pointer-events-none z-10" />

                {/* 6. Buffet Island / Unit left of C/B (x:38, y:48, w:6, h:12) */}
                <div className="absolute top-[48%] left-[38%] w-[6%] h-[12%] rounded-full bg-cyan-100/90 border-2 border-cyan-600 flex items-center justify-center pointer-events-none z-10">
                  <div className="w-3.5 h-3.5 rounded-full bg-cyan-300 border border-cyan-500" />
                </div>

                {/* 7. Outdoor Smoking Terrace along bottom (x:32, y:78, w:26, h:18) with smoking symbol and 4 blank unlabelled tables */}
                <div className="absolute top-[78%] left-[32%] w-[26%] h-[18%] rounded-xl bg-cyan-100/90 border-2 border-cyan-600 p-1 pointer-events-none z-10 shadow-md flex flex-col justify-between">
                  <div className="flex items-center justify-between border-b border-cyan-300/80 pb-0.5">
                    <div className="flex items-center gap-1 text-cyan-900 px-1 py-0.2 rounded text-[7px] font-mono-custom font-extrabold uppercase">
                      <Cigarette size={10} />
                      <span>Smoking Area</span>
                    </div>
                  </div>
                  {/* 4 blank unlabelled tables (unselectable, non-seatable) */}
                  <div className="grid grid-cols-2 gap-1 px-2 py-0.5">
                    <div className="w-6 h-5 rounded-xs border border-cyan-500 bg-white/70 mx-auto" />
                    <div className="w-6 h-5 rounded-xs border border-cyan-500 bg-white/70 mx-auto" />
                    <div className="w-6 h-5 rounded-xs border border-cyan-500 bg-white/70 mx-auto" />
                    <div className="w-6 h-5 rounded-xs border border-cyan-500 bg-white/70 mx-auto" />
                  </div>
                </div>

                {/* 8. Banquettes down right wall (x:88, y:18, w:2.5, h:58) */}
                <div className="absolute top-[18%] left-[88%] w-[2.5%] h-[58%] rounded-lg bg-cyan-200/80 border-2 border-cyan-600 pointer-events-none z-10" />

                {/* 9. Outside Terrace with two small tables (x:93, y:34, w:5, h:32) */}
                <div className="absolute top-[34%] left-[93%] w-[5%] h-[32%] rounded-xl bg-stone-50/70 border-2 border-dashed border-stone-400 p-1 pointer-events-none z-10 flex flex-col items-center justify-around">
                  <div className="w-4 h-4 rounded-full border border-stone-400 bg-stone-200" />
                  <div className="w-4 h-4 rounded-full border border-stone-400 bg-stone-200" />
                </div>

                {/* 10. Bench seating along bottom (x:62, y:92, w:26, h:3) */}
                <div className="absolute top-[92%] left-[62%] w-[26%] h-[3%] rounded-sm bg-stone-200/90 border border-stone-400 pointer-events-none z-10" />
              </>
            )}

            {/* Render all tables positioned on the floor map */}
            {visibleTables.map((table) => renderTableShape(table))}
          </div>
        </div>

        {/* Bottom Real-Time Legend & Quick Status Summary Bar */}
        <div className="bg-white px-6 py-4 border-t border-border flex flex-wrap items-center justify-between gap-4">
          {/* Status Color Legend */}
          <div className="flex items-center gap-4 flex-wrap text-xs font-mono-custom">
            <span className="text-[11px] font-bold text-stone-700 label-mono">Table Status:</span>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-emerald-100 border border-emerald-500" />
              <span className="text-foreground">Available</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-accent border border-accent" />
              <span className="text-foreground font-semibold">Occupied</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-amber-100 border border-amber-500" />
              <span className="text-foreground">Reserved</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-slate-200 border border-slate-400" />
              <span className="text-foreground">Needs Cleaning</span>
            </div>
            {isIbis && (
              <div className="flex items-center gap-1.5 border-l border-border pl-3 text-cyan-800">
                <Cigarette size={13} />
                <span>Smoking Allowed Zone</span>
              </div>
            )}
          </div>

          {/* Table Count Summary */}
          <div className="flex items-center gap-3 text-xs font-mono-custom">
            <span className="text-muted-foreground">
              Showing <strong className="text-foreground">{visibleTables.length}</strong> tables
            </span>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground">
              Total Seats: <strong className="text-foreground">{visibleTables.reduce((a, t) => a + t.capacity, 0)}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Selected Table Quick Info Card (if table selected from 2D floor plan) */}
      <AnimatePresence>
        {selectedTable && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="bg-white rounded-2xl p-5 border-2 border-accent/40 shadow-luxury flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-4">
              <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center border font-mono-custom font-extrabold text-lg shadow-sm ${
                selectedTable.status === 'occupied'
                  ? 'bg-accent text-white border-accent'
                  : selectedTable.status === 'available'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-400'
                  : 'bg-amber-50 text-amber-900 border-amber-400'
              }`}>
                <span>{selectedTable.tableNumber}</span>
                <span className="text-[9px] font-medium opacity-80">{selectedTable.capacity} Seats</span>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-lg font-bold font-display text-foreground">
                    Table {selectedTable.tableNumber} • {selectedTable.zone}
                  </h4>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono-custom font-bold uppercase ${
                    selectedTable.status === 'occupied'
                      ? 'bg-accent/15 text-accent'
                      : selectedTable.status === 'available'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-900'
                  }`}>
                    {selectedTable.status}
                  </span>
                  {selectedTable.isSmoking && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono-custom font-bold bg-cyan-100 text-cyan-800">
                      <Cigarette size={10} /> Smoking Zone
                    </span>
                  )}
                </div>

                {selectedTable.status === 'occupied' && selectedTable.occupiedByRoom ? (
                  <div className="flex items-center gap-3 text-xs font-mono-custom text-muted-foreground mt-1">
                    <span>Room: <strong className="text-foreground">{selectedTable.occupiedByRoom}</strong></span>
                    <span>•</span>
                    <span>Guest: <strong className="text-foreground">{selectedTable.occupiedByGuest || 'In-House'}</strong></span>
                    <span>•</span>
                    <span>Seated at: <strong className="text-foreground">{selectedTable.occupiedSince || 'Active'}</strong></span>
                    <span>•</span>
                    <span>Pax: <strong className="text-foreground">{selectedTable.occupiedPax || selectedTable.capacity}</strong></span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground font-mono-custom mt-1">
                    Table is clean and ready to seat guests for {activeMealService}.
                  </p>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {selectedTable.status === 'available' ? (
                <button
                  onClick={() => onQuickSeat(selectedTable)}
                  className="px-5 py-2.5 rounded-xl bg-accent text-white font-mono-custom font-bold text-xs flex items-center gap-2 hover:bg-accent-hover shadow-xs cursor-pointer"
                >
                  <Users size={14} />
                  Seat Guest Here
                </button>
              ) : selectedTable.status === 'occupied' ? (
                <button
                  onClick={() => onUpdateStatus(selectedTable, 'available')}
                  className="px-4 py-2 rounded-xl border border-border text-foreground font-mono-custom font-bold text-xs hover:bg-[#F2EBE4] transition-all cursor-pointer"
                >
                  Clear & Set Available
                </button>
              ) : null}

              {/* Status Quick Changer */}
              <div className="flex items-center bg-[#F2EBE4]/60 p-1 rounded-xl border border-border">
                {(['available', 'occupied', 'reserved', 'cleaning'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => onUpdateStatus(selectedTable, st)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono-custom font-bold capitalize transition-all cursor-pointer ${
                      selectedTable.status === st
                        ? 'bg-white text-black shadow-xs border border-black/10'
                        : 'text-muted-foreground hover:text-black'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
