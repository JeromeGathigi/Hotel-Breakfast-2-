import React, { useState, useMemo, useRef, useCallback } from 'react';
import { DiningTable, MealServiceType, FloorFeature } from '../types';
import { 
  NOVOTEL_PLATE, 
  IBIS_PLATE, 
  NOVOTEL_FLOOR_FEATURES, 
  IBIS_FLOOR_FEATURES 
} from '../constants';
import { 
  Users, 
  Cigarette, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw,
  Sliders,
  Save,
  X,
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
  isAdmin?: boolean;
  onSelectTable: (table: DiningTable) => void;
  onQuickSeat: (table: DiningTable) => void;
  onUpdateStatus: (table: DiningTable, status: DiningTable['status']) => void;
  onBatchUpdatePositions?: (updatedTables: DiningTable[]) => Promise<void>;
}

export const RestaurantFloorPlan2D: React.FC<RestaurantFloorPlan2DProps> = ({
  hotelId,
  tables,
  activeMealService,
  selectedZone,
  selectedTable,
  highlightQuery = '',
  isAdmin = false,
  onSelectTable,
  onQuickSeat,
  onUpdateStatus,
  onBatchUpdatePositions,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [hoveredTable, setHoveredTable] = useState<DiningTable | null>(null);

  // Edit layout mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [stagedTables, setStagedTables] = useState<DiningTable[]>(tables);
  const [isSavingPositions, setIsSavingPositions] = useState(false);
  const [draggingTableId, setDraggingTableId] = useState<string | null>(null);
  const dragOffsetRef = useRef<{ offsetX: number; offsetY: number }>({ offsetX: 0, offsetY: 0 });

  const isIbis = hotelId === 'ibis';
  const plate = isIbis ? IBIS_PLATE : NOVOTEL_PLATE;
  const features = isIbis ? IBIS_FLOOR_FEATURES : NOVOTEL_FLOOR_FEATURES;

  // Keep stagedTables synced when not actively editing
  React.useEffect(() => {
    if (!isEditMode) {
      setStagedTables(tables);
    }
  }, [tables, isEditMode]);

  // Tables to render (either live tables or staged when in edit mode)
  const currentTables = isEditMode ? stagedTables : tables;

  // Filtered tables based on zone selection (when not in edit mode)
  const visibleTables = useMemo(() => {
    if (isEditMode) return currentTables; // show all tables in edit mode
    return currentTables.filter((t) => {
      if (selectedZone === 'All') return true;
      return t.zone === selectedZone;
    });
  }, [currentTables, selectedZone, isEditMode]);

  const getStatusStyles = (status: DiningTable['status']) => {
    switch (status) {
      case 'occupied':
        return {
          fill: isIbis ? '#DC2626' : '#1D4ED8',
          stroke: isIbis ? '#991B1B' : '#1E40AF',
          textFill: '#FFFFFF',
          subTextFill: 'rgba(255, 255, 255, 0.9)',
          badgeBg: isIbis ? 'bg-red-600 text-white' : 'bg-blue-600 text-white',
          label: 'Occupied',
        };
      case 'available':
        return {
          fill: '#ECFDF5',
          stroke: '#059669',
          textFill: '#064E3B',
          subTextFill: '#047857',
          badgeBg: 'bg-emerald-600 text-white',
          label: 'Available',
        };
      case 'reserved':
        return {
          fill: '#FEF3C7',
          stroke: '#D97706',
          textFill: '#78350F',
          subTextFill: '#B45309',
          badgeBg: 'bg-amber-600 text-white',
          label: 'Reserved',
        };
      case 'cleaning':
        return {
          fill: '#F1F5F9',
          stroke: '#64748B',
          textFill: '#1E293B',
          subTextFill: '#475569',
          badgeBg: 'bg-slate-500 text-white',
          label: 'Cleaning',
        };
    }
  };

  /* --------------------------------------------------------------------------
     POINTER DRAG-TO-MOVE HANDLERS (STAGE 11)
     Uses svg.getScreenCTM()!.inverse() to guarantee exact viewBox translation
     -------------------------------------------------------------------------- */
  const handlePointerDown = (table: DiningTable, e: React.PointerEvent) => {
    if (!isEditMode || !isAdmin) return;
    e.stopPropagation();
    e.preventDefault();

    const svg = svgRef.current;
    if (!svg) return;

    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {}

    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const svgPoint = pt.matrixTransform(ctm.inverse());

    const curX = table.x ?? 100;
    const curY = table.y ?? 100;

    dragOffsetRef.current = {
      offsetX: svgPoint.x - curX,
      offsetY: svgPoint.y - curY,
    };

    setDraggingTableId(table.id);
  };

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isEditMode || !draggingTableId || !isAdmin) return;
      e.stopPropagation();
      e.preventDefault();

      const svg = svgRef.current;
      if (!svg) return;

      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const svgPoint = pt.matrixTransform(ctm.inverse());

      const rawX = svgPoint.x - dragOffsetRef.current.offsetX;
      const rawY = svgPoint.y - dragOffsetRef.current.offsetY;

      // 5-unit grid snap
      const snappedX = Math.round(rawX / 5) * 5;
      const snappedY = Math.round(rawY / 5) * 5;

      // Clamp within plate boundaries (radius = 11 units)
      const r = 11;
      const clampedX = Math.max(r, Math.min(plate.w - r, snappedX));
      const clampedY = Math.max(r, Math.min(plate.h - r, snappedY));

      setStagedTables((prev) =>
        prev.map((t) => (t.id === draggingTableId ? { ...t, x: clampedX, y: clampedY } : t))
      );
    },
    [isEditMode, draggingTableId, isAdmin, plate.w, plate.h]
  );

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isEditMode || !draggingTableId) return;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {}
    setDraggingTableId(null);
  };

  const handleSavePositions = async () => {
    if (!onBatchUpdatePositions) return;
    setIsSavingPositions(true);
    try {
      await onBatchUpdatePositions(stagedTables);
      setIsEditMode(false);
    } catch (err) {
      console.error('Failed to save table positions:', err);
    } finally {
      setIsSavingPositions(false);
    }
  };

  const handleCancelPositions = () => {
    setStagedTables(tables);
    setIsEditMode(false);
    setDraggingTableId(null);
  };

  /* --------------------------------------------------------------------------
     FEATURE RENDERING (STAGE 10 DEFECTS 1-4)
     -------------------------------------------------------------------------- */
  const renderFeatureShape = (f: FloorFeature) => {
    const isRound = f.shape === 'round';

    switch (f.kind) {
      case 'building-envelope':
        return (
          <rect
            key={f.id}
            x={f.x}
            y={f.y}
            width={f.w}
            height={f.h}
            rx={12}
            fill="none"
            stroke="#1E293B"
            strokeWidth={3}
            className="pointer-events-none select-none"
          />
        );

      case 'dining-hall':
        return (
          <g key={f.id} className="pointer-events-none select-none">
            <rect
              x={f.x}
              y={f.y}
              width={f.w}
              height={f.h}
              rx={6}
              fill="#FFFFFF"
              stroke="#94A3B8"
              strokeWidth={1.5}
            />
          </g>
        );

      case 'bar-room':
        return (
          <g key={f.id} className="pointer-events-none select-none">
            <rect
              x={f.x}
              y={f.y}
              width={f.w}
              height={f.h}
              rx={6}
              fill="#F8FAFC"
              stroke="#64748B"
              strokeWidth={1.5}
            />
          </g>
        );

      case 'prep-room':
        return (
          <g key={f.id} className="pointer-events-none select-none">
            <rect
              x={f.x}
              y={f.y}
              width={f.w}
              height={f.h}
              rx={4}
              fill="#F1F5F9"
              stroke="#94A3B8"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          </g>
        );

      case 'reception':
        return (
          <g key={f.id} className="pointer-events-none select-none">
            <rect
              x={f.x}
              y={f.y}
              width={f.w}
              height={f.h}
              rx={4}
              fill="#F8FAFC"
              stroke="#64748B"
              strokeWidth={1.5}
            />
          </g>
        );

      case 'back-of-house':
        return (
          <rect
            key={f.id}
            x={f.x}
            y={f.y}
            width={f.w}
            height={f.h}
            rx={4}
            fill="#F1F5F9"
            fillOpacity={0.8}
            stroke="#94A3B8"
            strokeWidth={1.5}
            className="pointer-events-none select-none"
          />
        );

      case 'hostess-desk':
      case 'front-desk':
        return (
          <g key={f.id} className="pointer-events-none select-none">
            <rect
              x={f.x}
              y={f.y}
              width={f.w}
              height={f.h}
              rx={4}
              fill="#F8FAFC"
              stroke="#1E293B"
              strokeWidth={1.5}
            />
            {f.label && (
              <text
                x={f.x + f.w / 2}
                y={f.y + f.h / 2 + 0.5}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#0F172A"
                fontSize={9}
                fontWeight="900"
                className="font-mono-custom tracking-wider"
              >
                {f.label}
              </text>
            )}
          </g>
        );

      case 'coffee-stand':
        return (
          <g key={f.id} className="pointer-events-none select-none">
            <rect
              x={f.x}
              y={f.y}
              width={f.w}
              height={f.h}
              rx={3}
              fill="#FEF3C7"
              stroke="#B45309"
              strokeWidth={1.5}
            />
            {f.label && f.verticalLabel ? (
              <text
                x={f.x + f.w / 2}
                y={f.y + f.h / 2}
                textAnchor="middle"
                dominantBaseline="central"
                transform={`rotate(-90, ${f.x + f.w / 2}, ${f.y + f.h / 2})`}
                fill="#78350F"
                fontSize={8.5}
                fontWeight="900"
                className="font-mono-custom tracking-wider"
              >
                {f.label}
              </text>
            ) : f.label ? (
              <text
                x={f.x + f.w / 2}
                y={f.y + f.h / 2 + 0.5}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#78350F"
                fontSize={8.5}
                fontWeight="900"
                className="font-mono-custom"
              >
                {f.label}
              </text>
            ) : null}
          </g>
        );

      case 'smoking-terrace':
        return (
          <g key={f.id} className="pointer-events-none select-none">
            {/* Shaded Smoking Terrace Region */}
            <rect
              x={f.x}
              y={f.y}
              width={f.w}
              height={f.h}
              rx={6}
              fill="#CFFAFE"
              fillOpacity={0.7}
              stroke="#0891B2"
              strokeWidth={1.5}
            />
            {/* Header label & Smoking symbol */}
            <g transform={`translate(${f.x + 12}, ${f.y + 16})`}>
              <path
                d="M0 0 L14 0 M17 0 L19 0 M17 4 L19 4 M0 4 L14 4 M0 0 L0 4 M14 0 L14 4"
                fill="none"
                stroke="#0E7490"
                strokeWidth={1.2}
              />
              <text
                x={24}
                y={3}
                fill="#0E7490"
                fontSize={8.5}
                fontWeight="900"
                dominantBaseline="central"
                className="font-mono-custom tracking-wider"
              >
                SMOKING AREA
              </text>
            </g>
          </g>
        );

      case 'terrace':
        return (
          <g key={f.id} className="pointer-events-none select-none">
            <rect
              x={f.x}
              y={f.y}
              width={f.w}
              height={f.h}
              rx={4}
              fill="#F8FAFC"
              fillOpacity={0.6}
              stroke="#94A3B8"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            {f.id === 'n-terrace-stairs' && (
              <>
                <line x1={f.x + 8} y1={f.y + 5} x2={f.x + f.w - 8} y2={f.y + 5} stroke="#CBD5E1" strokeWidth={1} />
                <line x1={f.x + 8} y1={f.y + 9} x2={f.x + f.w - 8} y2={f.y + 9} stroke="#CBD5E1" strokeWidth={1} />
                <line x1={f.x + 8} y1={f.y + 13} x2={f.x + f.w - 8} y2={f.y + 13} stroke="#CBD5E1" strokeWidth={1} />
              </>
            )}
          </g>
        );

      case 'buffet':
        return (
          <g key={f.id} className="pointer-events-none select-none">
            <rect
              x={f.x}
              y={f.y}
              width={f.w}
              height={f.h}
              rx={3}
              fill="#CFFAFE"
              fillOpacity={0.9}
              stroke="#0891B2"
              strokeWidth={1.5}
            />
            {/* Small station notches */}
            {f.w > 50 && (
              <>
                <rect x={f.x + 6} y={f.y + 4} width={10} height={f.h - 8} rx={1.5} fill="#A5F3FC" stroke="#06B6D4" strokeWidth={0.75} />
                <rect x={f.x + f.w - 16} y={f.y + 4} width={10} height={f.h - 8} rx={1.5} fill="#A5F3FC" stroke="#06B6D4" strokeWidth={0.75} />
              </>
            )}
          </g>
        );

      case 'island':
        if (isRound) {
          const cx = f.x + f.w / 2;
          const cy = f.y + f.h / 2;
          const r = f.w / 2;
          return (
            <circle
              key={f.id}
              cx={cx}
              cy={cy}
              r={r}
              fill={f.id.includes('smoking') ? '#FFFFFF' : f.id.includes('buffet') || f.id.includes('round-unit') ? '#CFFAFE' : '#E2E8F0'}
              fillOpacity={f.id.includes('smoking') ? 0.9 : 1}
              stroke={f.id.includes('smoking') ? '#0891B2' : f.id.includes('buffet') || f.id.includes('round-unit') ? '#0891B2' : '#94A3B8'}
              strokeWidth={1.2}
              className="pointer-events-none select-none"
            />
          );
        }
        return (
          <rect
            key={f.id}
            x={f.x}
            y={f.y}
            width={f.w}
            height={f.h}
            rx={3}
            fill="#CFFAFE"
            stroke="#0891B2"
            strokeWidth={1.5}
            className="pointer-events-none select-none"
          />
        );

      case 'bar-counter':
        return (
          <rect
            key={f.id}
            x={f.x}
            y={f.y}
            width={f.w}
            height={f.h}
            rx={2.5}
            fill="#BAE6FD"
            stroke="#0284C7"
            strokeWidth={1.5}
            className="pointer-events-none select-none"
          />
        );

      case 'banquette':
        return (
          <rect
            key={f.id}
            x={f.x}
            y={f.y}
            width={f.w}
            height={f.h}
            rx={2}
            fill="#E2E8F0"
            stroke="#94A3B8"
            strokeWidth={1.2}
            className="pointer-events-none select-none"
          />
        );

      default:
        return null;
    }
  };

  /* --------------------------------------------------------------------------
     TABLE GLYPH RENDERING
     -------------------------------------------------------------------------- */
  const renderTableGlyph = (table: DiningTable) => {
    const isSelected = selectedTable?.id === table.id;
    const isHovered = hoveredTable?.id === table.id;
    const isDragging = draggingTableId === table.id;
    const isSearchMatch =
      !isEditMode &&
      highlightQuery.trim() !== '' &&
      (table.tableNumber.toLowerCase().includes(highlightQuery.toLowerCase()) ||
        (table.occupiedByRoom &&
          table.occupiedByRoom.toLowerCase().includes(highlightQuery.toLowerCase())) ||
        (table.occupiedByGuest &&
          table.occupiedByGuest.toLowerCase().includes(highlightQuery.toLowerCase())));

    const styles = getStatusStyles(table.status);
    const tx = table.x ?? 100;
    const ty = table.y ?? 100;
    const radius = 11;
    const isDiamond = table.shape === 'diamond';
    const isRound = table.shape === 'round';

    return (
      <g
        key={table.id}
        id={`table-glyph-${table.id}`}
        onPointerDown={(e) => handlePointerDown(table, e)}
        onClick={(e) => {
          if (isEditMode) return;
          e.stopPropagation();
          onSelectTable(table);
        }}
        onMouseEnter={() => !isEditMode && setHoveredTable(table)}
        onMouseLeave={() => !isEditMode && setHoveredTable(null)}
        className={`${isEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
        style={{ cursor: isEditMode ? (isDragging ? 'grabbing' : 'grab') : 'pointer', touchAction: 'none' }}
      >
        {/* Large 44x44 CSS hit area for touch/drag targets */}
        <circle
          cx={tx}
          cy={ty}
          r={22}
          fill="transparent"
          pointerEvents="all"
          className="select-none"
        />

        {/* Dragging active halo */}
        {isDragging && (
          <circle
            cx={tx}
            cy={ty}
            r={radius + 8}
            fill="#3B82F6"
            fillOpacity={0.25}
            stroke="#2563EB"
            strokeWidth={2}
          />
        )}

        {/* Edit mode subtle reposition guide */}
        {isEditMode && !isDragging && (
          <circle
            cx={tx}
            cy={ty}
            r={radius + 4}
            fill="none"
            stroke="#6366F1"
            strokeWidth={1}
            strokeDasharray="2 2"
            opacity={0.6}
          />
        )}

        {/* Search match highlight ping */}
        {isSearchMatch && (
          <circle
            cx={tx}
            cy={ty}
            r={radius + 6}
            fill="#FDE047"
            fillOpacity={0.4}
            stroke="#EAB308"
            strokeWidth={2}
            className="animate-pulse"
          />
        )}

        {/* Selected table halo */}
        {isSelected && !isEditMode && (
          <circle
            cx={tx}
            cy={ty}
            r={radius + 5}
            fill="none"
            stroke="#0F172A"
            strokeWidth={2}
            strokeDasharray="3 2"
          />
        )}

        {/* Hover table halo */}
        {isHovered && !isSelected && !isEditMode && (
          <circle
            cx={tx}
            cy={ty}
            r={radius + 3}
            fill="none"
            stroke="#3B82F6"
            strokeWidth={1.5}
          />
        )}

        {/* Table Body */}
        {isDiamond ? (
          <g transform={`rotate(45, ${tx}, ${ty})`}>
            <rect
              x={tx - radius}
              y={ty - radius}
              width={radius * 2}
              height={radius * 2}
              rx={3}
              fill={styles.fill}
              stroke={styles.stroke}
              strokeWidth={1.5}
            />
          </g>
        ) : isRound ? (
          <circle
            cx={tx}
            cy={ty}
            r={radius}
            fill={styles.fill}
            stroke={styles.stroke}
            strokeWidth={1.5}
          />
        ) : (
          <rect
            x={tx - radius}
            y={ty - radius}
            width={radius * 2}
            height={radius * 2}
            rx={3}
            fill={styles.fill}
            stroke={styles.stroke}
            strokeWidth={1.5}
          />
        )}

        {/* Table Label (centered at font size ~10.5) */}
        <text
          x={tx}
          y={!isEditMode && table.status === 'occupied' && table.occupiedByRoom ? ty - 2 : ty}
          textAnchor="middle"
          dominantBaseline="central"
          fill={styles.textFill}
          fontSize={10.5}
          fontWeight="900"
          className="font-mono-custom select-none pointer-events-none"
        >
          {table.tableNumber}
        </text>

        {/* Sub-label: Room number if occupied, or capacity */}
        {!isEditMode && table.status === 'occupied' && table.occupiedByRoom ? (
          <text
            x={tx}
            y={ty + 6}
            textAnchor="middle"
            dominantBaseline="central"
            fill={styles.subTextFill}
            fontSize={6.5}
            fontWeight="800"
            className="font-mono-custom select-none pointer-events-none"
          >
            R{table.occupiedByRoom}
          </text>
        ) : (
          <text
            x={tx}
            y={ty + 6.5}
            textAnchor="middle"
            dominantBaseline="central"
            fill={styles.subTextFill}
            fontSize={6}
            fontWeight="700"
            className="font-mono-custom select-none pointer-events-none opacity-80"
          >
            {table.capacity}P
          </text>
        )}

        {/* Live Coordinate display while dragging (Stage 11 requirement) */}
        {isDragging && (
          <g transform={`translate(${tx}, ${ty - 22})`} className="pointer-events-none select-none">
            <rect
              x={-30}
              y={-10}
              width={60}
              height={16}
              rx={4}
              fill="#0F172A"
              stroke="#38BDF8"
              strokeWidth={1}
            />
            <text
              x={0}
              y={-1}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#38BDF8"
              fontSize={7.5}
              fontWeight="bold"
              className="font-mono-custom"
            >
              {`X:${tx} Y:${ty}`}
            </text>
          </g>
        )}
      </g>
    );
  };

  return (
    <div className="space-y-4">
      {/* Visual Blueprint Canvas Container */}
      <div className="relative bg-[#FAFAF8] rounded-3xl border-2 border-[#1E293B]/10 overflow-hidden shadow-2xl">
        {/* Top Blueprint Navigation & Controls Bar */}
        <div className="bg-[#0A162B] text-white px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 border-b border-[#0A162B]/80">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isEditMode ? 'bg-amber-400 animate-ping' : 'bg-emerald-400 animate-pulse'}`} />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono-custom font-bold tracking-widest text-emerald-400 uppercase">
                  {isIbis ? "Charlie's Corner & Delhi Street" : 'Food Exchange & Gourmet Bar'}
                </span>
                <span className="text-xs text-white/40">•</span>
                <span className="text-xs font-mono-custom text-white/80">
                  {isIbis ? 'Proportion 2.24:1' : 'Proportion 2.64:1'}
                </span>
                {isEditMode && (
                  <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-mono-custom font-bold">
                    Edit Layout Active (5-unit snap)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-white/60 font-sans mt-0.5">
                {isEditMode 
                  ? 'Drag tables to reposition. Positions snap to a 5-unit grid and stay inside the plate.' 
                  : 'Live architectural floor plan with uniform viewBox scaling.'}
              </p>
            </div>
          </div>

          {/* Action & Zoom Controls */}
          <div className="flex items-center gap-2.5">
            {/* Admin Edit Layout Mode Toggle */}
            {isAdmin && !isEditMode && (
              <button
                onClick={() => {
                  setStagedTables(tables);
                  setIsEditMode(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-mono-custom font-semibold text-xs flex items-center gap-1.5 border border-white/15 transition-all cursor-pointer"
                title="Reposition tables directly on the blueprint"
              >
                <Sliders size={13} className="text-amber-400" />
                <span>Edit Layout</span>
              </button>
            )}

            {/* Edit Mode Staged Save / Cancel Controls */}
            {isAdmin && isEditMode && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSavePositions}
                  disabled={isSavingPositions}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono-custom font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  <Save size={13} />
                  <span>{isSavingPositions ? 'Saving...' : 'Save positions'}</span>
                </button>
                <button
                  onClick={handleCancelPositions}
                  disabled={isSavingPositions}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 font-mono-custom font-medium text-xs flex items-center gap-1 border border-white/15 transition-all cursor-pointer"
                >
                  <X size={13} />
                  <span>Cancel</span>
                </button>
              </div>
            )}

            {/* Zoom Controls */}
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
        <div 
          className="relative w-full overflow-auto p-4 md:p-8 flex justify-center items-center bg-[#F7F5F0]"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'center center',
              transition: draggingTableId ? 'none' : 'transform 0.2s ease-out',
            }}
            className="w-full flex justify-center"
          >
            <svg
              ref={svgRef}
              viewBox={`0 0 ${plate.w} ${plate.h}`}
              preserveAspectRatio="xMidYMid meet"
              className={`w-full h-auto max-w-[1100px] bg-white rounded-2xl border-2 border-stone-400/80 shadow-xl select-none ${
                isEditMode ? 'ring-2 ring-amber-400/40' : ''
              }`}
              role="img"
              aria-label={`${isIbis ? "Charlie's Corner" : 'Food Exchange and Gourmet Bar'} floor plan`}
            >
              <defs>
                {/* Subtle grid pattern for architectural canvas */}
                <pattern id="blueprint-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="10" cy="10" r="0.75" fill="#0A162B" fillOpacity="0.1" />
                </pattern>
                {/* Snap guide grid for edit mode */}
                {isEditMode && (
                  <pattern id="snap-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#6366F1" strokeWidth="0.5" strokeOpacity="0.15" />
                  </pattern>
                )}
              </defs>

              {/* Canvas Background */}
              <rect x="0" y="0" width={plate.w} height={plate.h} rx="12" fill="#FFFFFF" />
              <rect x="0" y="0" width={plate.w} height={plate.h} rx="12" fill="url(#blueprint-grid)" />
              {isEditMode && (
                <rect x="0" y="0" width={plate.w} height={plate.h} rx="12" fill="url(#snap-grid)" />
              )}

              {/* 1. Render all non-table architectural features (rooms, walls, counters, etc.) behind tables */}
              {features.map((f) => renderFeatureShape(f))}

              {/* 2. Render all selectable / draggable dining tables */}
              {visibleTables.map((t) => renderTableGlyph(t))}
            </svg>
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
              <span className={`w-3.5 h-3.5 rounded-md ${isIbis ? 'bg-red-600' : 'bg-blue-600'} border ${isIbis ? 'border-red-700' : 'border-blue-700'}`} />
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
              Total Capacity:{' '}
              <strong className="text-foreground">
                {visibleTables.reduce((a, t) => a + t.capacity, 0)} Seats
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Selected Table Quick Info Card (hidden in edit mode) */}
      <AnimatePresence>
        {selectedTable && !isEditMode && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="bg-white rounded-2xl p-5 border-2 border-accent/40 shadow-luxury flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center border font-mono-custom font-extrabold text-lg shadow-sm ${
                  selectedTable.status === 'occupied'
                    ? `${isIbis ? 'bg-red-600 border-red-700' : 'bg-blue-600 border-blue-700'} text-white`
                    : selectedTable.status === 'available'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-400'
                    : 'bg-amber-50 text-amber-900 border-amber-400'
                }`}
              >
                <span>{selectedTable.tableNumber}</span>
                <span className="text-[9px] font-medium opacity-80">{selectedTable.capacity} Seats</span>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-lg font-bold font-display text-foreground">
                    Table {selectedTable.tableNumber} • {selectedTable.zone}
                  </h4>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono-custom font-bold uppercase ${
                      selectedTable.status === 'occupied'
                        ? `${isIbis ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`
                        : selectedTable.status === 'available'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-900'
                    }`}
                  >
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
                    <span>
                      Room: <strong className="text-foreground">{selectedTable.occupiedByRoom}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Guest: <strong className="text-foreground">{selectedTable.occupiedByGuest || 'In-House'}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Seated at: <strong className="text-foreground">{selectedTable.occupiedSince || 'Active'}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Pax: <strong className="text-foreground">{selectedTable.occupiedPax || selectedTable.capacity}</strong>
                    </span>
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
