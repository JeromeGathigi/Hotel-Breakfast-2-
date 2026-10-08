import React, { useState, useEffect, useMemo } from 'react';
import { 
  db, 
  auth,
  collection, 
  getDocs,
  onSnapshot, 
  doc, 
  setDoc,
  updateDoc, 
  deleteDoc, 
  writeBatch,
  logOperaAuditTrail 
} from '../firebase';
import { DiningTable, MealServiceType, Guest, TableLayout, TableLayoutEntry } from '../types';
import { DEFAULT_NOVOTEL_TABLES, DEFAULT_IBIS_TABLES } from '../constants';
import { TableCardSkeleton } from './Skeleton';
import { RestaurantFloorPlan2D } from './RestaurantFloorPlan2D';
import { Banner } from './ui';
import { buildMergePlan, buildStatusChange, buildUnmergePlan, getMergedGroupMembers } from '../lib/tables';
import { 
  getOccupiedDurationMinutes, 
  getTurnoverStage, 
  getTurnoverStyle, 
  formatOccupiedDuration,
  formatSeatedAt
} from '../lib/turnover';
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
  Cigarette, 
  Layers, 
  ChevronDown, 
  AlertTriangle, 
  Save, 
  BookmarkCheck,
  MoreVertical,
  Timer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SeatingPlanProps {
  hotelId: string;
  /** May edit tables and saved layouts (canEditFloorPlan). Seating and clearing are for everyone. */
  isAdmin: boolean;
  activeMealService: MealServiceType;
}

export const SeatingPlan: React.FC<SeatingPlanProps> = ({ hotelId, isAdmin, activeMealService }) => {
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [layouts, setLayouts] = useState<TableLayout[]>([]);
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
  const [assignPax, setAssignPax] = useState<number>(0);
  // Every action on this screen used to fail into console.error only. A host whose seating was
  // refused saw nothing happen and tapped again.
  const [actionError, setActionError] = useState<string | null>(null);
  const report = (what: string, err: unknown) => {
    console.error(what, err);
    setActionError(`${what}: ${(err as Error)?.message || 'unknown error'}`);
  };
  const [emptyPlan, setEmptyPlan] = useState(false);

  // Turnover Visualization Layer toggle
  const [showTurnoverLayer, setShowTurnoverLayer] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('opera_turnover_layer_enabled');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  // Live timer tick every 30 seconds
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const handleToggleTurnover = (enabled: boolean) => {
    setShowTurnoverLayer(enabled);
    try {
      localStorage.setItem('opera_turnover_layer_enabled', String(enabled));
    } catch {
      // ignore
    }
  };

  // Saved named layouts & reset modals state
  const [isLayoutDropdownOpen, setIsLayoutDropdownOpen] = useState(false);
  const [saveLayoutModalOpen, setSaveLayoutModalOpen] = useState(false);
  const [manageLayoutsModalOpen, setManageLayoutsModalOpen] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState('');
  const [isSavingLayout, setIsSavingLayout] = useState(false);

  // Reset confirmation in-app modal (Stage 10 Defect 5)
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetHotelInput, setResetHotelInput] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);

  // Occupied tables guard warning modal (Stage 11 Section 2)
  const [occupiedWarningModalOpen, setOccupiedWarningModalOpen] = useState(false);
  const [occupiedWarningMessage, setOccupiedWarningMessage] = useState('');

  const currentUser = auth.currentUser;

  // 1. Subscribe to real-time dining tables
  useEffect(() => {
    setLoading(true);
    const tablesRef = collection(db, 'hotels', hotelId, 'tables');
    const unsub = onSnapshot(
      tablesRef,
      (snapshot) => {
        // An empty plan used to be "fixed" by writing the default tables into Firestore from
        // whichever browser happened to open this screen - unawaited, unhandled, and for any
        // user. Creating the plan is now an explicit administrator action.
        setEmptyPlan(snapshot.empty);
        if (snapshot.empty) {
          setTables([]);
        } else {
          const list = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as DiningTable));
          list.sort((a: any, b: any) => a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true }));
          setTables(list);
        }
        setLoading(false);
      },
      (err: any) => {
        report('The floor plan could not be read', err);
        setLoading(false);
      }
    );

    // Subscribe to in-house guests for table assignment lookup
    const guestsRef = collection(db, 'hotels', hotelId, 'guests');
    const unsubGuests = onSnapshot(
      guestsRef,
      (snap: any) => {
        const gList = snap.docs.map((d: any) => d.data() as Guest);
        setInHouseGuests(gList);
      },
      (err: any) => report('The guest list could not be read', err)
    );

    return () => {
      unsub();
      unsubGuests();
    };
  }, [hotelId]);

  // 2. Subscribe to Saved Named Layouts (Stage 11) & Seed Baseline if empty
  useEffect(() => {
    const layoutsRef = collection(db, 'hotels', hotelId, 'layouts');
    const unsubLayouts = onSnapshot(
      layoutsRef,
      (snap: any) => {
        // Seeding an "Architect's plan" layout from the browser on first view is gone, for the same
        // reason as the tables above; "Create the default floor plan" writes both.
        const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as TableLayout));
        list.sort((a: TableLayout, b: TableLayout) => {
          if (a.isActive && !b.isActive) return -1;
          if (!a.isActive && b.isActive) return 1;
          return a.name.localeCompare(b.name);
        });
        setLayouts(list);
      },
      (err: any) => report('Saved layouts could not be read', err)
    );

    return () => unsubLayouts();
  }, [hotelId]);

  const activeLayout = useMemo(() => {
    return layouts.find((l) => l.isActive) || null;
  }, [layouts]);

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
  const occupiedCovers = tables.filter((t) => t.status === 'occupied').reduce((acc, t) => acc + (Number(t.occupiedPax) || 0), 0);

  const handleUpdateStatus = async (table: DiningTable, newStatus: DiningTable['status']) => {
    try {
      // The whole merged group, as at the door; see buildStatusChange.
      const updates = buildStatusChange(table, newStatus, tables, { now: new Date().toISOString(), service: activeMealService });
      const batch = writeBatch(db);
      for (const [id, update] of Object.entries(updates)) batch.update(doc(db, 'hotels', hotelId, 'tables', id), update);
      await batch.commit();

      await logOperaAuditTrail(
        hotelId,
        newStatus === 'available' ? 'TABLE_CLEAR' : 'TABLE_SEAT',
        `Table ${table.tableNumber} status updated to ${newStatus.toUpperCase()}${table.occupiedByRoom ? ` (Room ${table.occupiedByRoom})` : ''}`,
        table.occupiedByRoom || undefined,
        table.occupiedByGuest || undefined
      );

      if (selectedTable?.id === table.id) {
        setSelectedTable((prev) => (prev ? { ...prev, ...updates[table.id] } : null));
      }
    } catch (err) {
      report('Could not change the table status', err);
    }
  };

  const handleQuickSeat = (table: DiningTable) => {
    setSelectedTable(table);
    setAssignPax(table.capacity);
    setAssignModalOpen(true);
  };

  const handleAssignGuest = async (guest: Guest) => {
    if (!selectedTable) return;

    if (selectedTable.zone === 'Smoking Terrace' || selectedTable.isSmoking) {
      const confirmedSmoking = window.confirm(
        `${selectedTable.tableNumber} is on the outdoor smoking terrace. Seat this party there?`
      );
      if (!confirmedSmoking) return;
    }

    if (selectedTable.status === 'occupied' && selectedTable.occupiedByRoom && selectedTable.occupiedByRoom !== guest.roomNumber) {
      setActionError(`Table ${selectedTable.tableNumber} is occupied by room ${selectedTable.occupiedByRoom}. Clear it first.`);
      return;
    }
    if (assignPax < 1) {
      setActionError('Choose how many guests are being seated.');
      return;
    }

    try {
      // occupiedPax used to fall back to `guest.adults || 2` - two invented covers when nothing was
      // chosen. occupiedSince is an instant now, not "07:42" in the device's locale.
      const occupancy = {
        status: 'occupied',
        occupiedByRoom: guest.roomNumber,
        occupiedByGuest: guest.guestName,
        occupiedPax: assignPax,
        occupiedSince: new Date().toISOString(),
        mealService: activeMealService,
      };
      const batch = writeBatch(db);
      for (const member of getMergedGroupMembers(selectedTable, tables)) {
        batch.update(doc(db, 'hotels', hotelId, 'tables', member.id), occupancy);
      }
      await batch.commit();
      setActionError(null);

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
      report('Could not seat the guest', err);
    }
  };

  const handleSaveTableLayout = async (e: React.FormEvent) => {
    e.preventDefault();
    const capacity = Number(editingTable?.capacity);
    if (!editingTable?.tableNumber?.trim()) {
      setActionError('Give the table a number.');
      return;
    }
    if (!Number.isInteger(capacity) || capacity < 1) {
      setActionError('Seats must be a whole number of at least 1.');
      return;
    }

    try {
      const tableId = editingTable.id || `table-${Date.now()}`;
      const newTable: DiningTable = {
        id: tableId,
        tableNumber: editingTable.tableNumber.trim().toUpperCase(),
        capacity,
        zone: (editingTable.zone as any) || (hotelId === 'ibis' ? 'Delhi Street' : 'Main Dining'),
        status: (editingTable.status as any) || 'available',
        // 0 is a valid coordinate; `|| 40` used to move a table at the edge.
        x: editingTable.x ?? 40,
        y: editingTable.y ?? 40,
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
      report('Could not save the table', err);
    }
  };

  const handleDeleteTable = async (tableId: string, tableNum: string) => {
    if (!confirm(`Delete table ${tableNum}?`)) return;
    try {
      await deleteDoc(doc(db, 'hotels', hotelId, 'tables', tableId));
      await logOperaAuditTrail(hotelId, 'TABLE_LAYOUT_UPDATE', `Removed Table ${tableNum} from seating plan`);
      if (selectedTable?.id === tableId) setSelectedTable(null);
    } catch (err) {
      report('Could not delete the table', err);
    }
  };

  /* --------------------------------------------------------------------------
     STAGE 11: NAMED LAYOUTS APPLICATION & DIFFING
     -------------------------------------------------------------------------- */
  const handleApplyLayout = async (targetLayout: TableLayout) => {
    setIsLayoutDropdownOpen(false);

    // Guard: Refuse to apply while any table is occupied
    const occupiedTables = tables.filter((t) => t.status === 'occupied');
    if (occupiedTables.length > 0) {
      const occupiedNames = occupiedTables.map((t) => t.tableNumber).join(', ');
      setOccupiedWarningMessage(
        `Cannot switch layout while tables are occupied: ${occupiedNames}. Please clear or complete service for all seated guests first.`
      );
      setOccupiedWarningModalOpen(true);
      return;
    }

    try {
      const batch = writeBatch(db);
      const currentMap = new Map<string, DiningTable>();
      tables.forEach((t) => currentMap.set(t.id, t));

      const layoutMap = new Map<string, TableLayoutEntry>();
      targetLayout.tables.forEach((t) => layoutMap.set(t.id, t));

      // 1. Tables in both: update geometry & attributes, leave status & occupancy fields untouched
      // 2. Tables only in layout: create with status: 'available'
      for (const [id, entry] of layoutMap.entries()) {
        const tableRef = doc(db, 'hotels', hotelId, 'tables', id);
        if (currentMap.has(id)) {
          const live = currentMap.get(id)!;
          const updatedTable: DiningTable = {
            ...live,
            tableNumber: entry.tableNumber,
            capacity: entry.capacity,
            zone: entry.zone,
            x: entry.x,
            y: entry.y,
            shape: entry.shape,
            isSmoking: Boolean(entry.isSmoking),
          };
          batch.set(tableRef, updatedTable);
        } else {
          const newTable: DiningTable = {
            id: entry.id,
            tableNumber: entry.tableNumber,
            capacity: entry.capacity,
            zone: entry.zone,
            status: 'available',
            x: entry.x,
            y: entry.y,
            shape: entry.shape,
            isSmoking: Boolean(entry.isSmoking),
          };
          batch.set(tableRef, newTable);
        }
      }

      // 3. Tables only in Firestore (live tables): delete
      for (const [id] of currentMap.entries()) {
        if (!layoutMap.has(id)) {
          const tableRef = doc(db, 'hotels', hotelId, 'tables', id);
          batch.delete(tableRef);
        }
      }

      // 4. Update isActive on layouts in a single batch
      layouts.forEach((l) => {
        const layoutRef = doc(db, 'hotels', hotelId, 'layouts', l.id);
        batch.update(layoutRef, {
          isActive: l.id === targetLayout.id,
          updatedAt: new Date().toISOString(),
        });
      });

      await batch.commit();

      await logOperaAuditTrail(
        hotelId,
        'TABLE_LAYOUT_UPDATE',
        `Applied layout "${targetLayout.name}" (${targetLayout.tables.length} tables)`
      );
    } catch (err) {
      report('Could not apply the layout', err);
    }
  };

  /* --------------------------------------------------------------------------
     STAGE 11: SAVE CURRENT ARRANGEMENT AS NEW NAMED LAYOUT
     -------------------------------------------------------------------------- */
  const handleSaveCurrentAsLayout = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newLayoutName.trim();
    if (!name) return;

    setIsSavingLayout(true);
    try {
      // Geometry only — strip all status and occupancy fields
      const layoutEntries: TableLayoutEntry[] = tables.map((t) => ({
        id: t.id,
        tableNumber: t.tableNumber,
        capacity: t.capacity,
        zone: t.zone,
        x: t.x ?? 100,
        y: t.y ?? 100,
        shape: t.shape,
        isSmoking: Boolean(t.isSmoking),
      }));

      const newLayoutId = `layout-${Date.now()}`;
      const newLayout: TableLayout = {
        id: newLayoutId,
        name,
        tables: layoutEntries,
        isActive: true,
        createdByUid: currentUser?.uid ?? '',
        createdByEmail: currentUser?.email ?? '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const batch = writeBatch(db);
      // Mark all other layouts inactive
      layouts.forEach((l) => {
        const lRef = doc(db, 'hotels', hotelId, 'layouts', l.id);
        batch.update(lRef, { isActive: false });
      });
      // Set new layout
      batch.set(doc(db, 'hotels', hotelId, 'layouts', newLayoutId), newLayout);

      await batch.commit();

      await logOperaAuditTrail(
        hotelId,
        'TABLE_LAYOUT_UPDATE',
        `Created and activated new named layout "${name}" (${tables.length} tables)`
      );

      setNewLayoutName('');
      setSaveLayoutModalOpen(false);
    } catch (err) {
      report('Could not save the layout', err);
    } finally {
      setIsSavingLayout(false);
    }
  };

  /* --------------------------------------------------------------------------
     STAGE 11: OVERWRITE EXISTING LAYOUT WITH CURRENT ARRANGEMENT
     -------------------------------------------------------------------------- */
  const handleOverwriteLayout = async (layout: TableLayout) => {
    if (!confirm(`Overwrite layout "${layout.name}" with the current table positions?`)) return;

    try {
      const layoutEntries: TableLayoutEntry[] = tables.map((t) => ({
        id: t.id,
        tableNumber: t.tableNumber,
        capacity: t.capacity,
        zone: t.zone,
        x: t.x ?? 100,
        y: t.y ?? 100,
        shape: t.shape,
        isSmoking: Boolean(t.isSmoking),
      }));

      const layoutRef = doc(db, 'hotels', hotelId, 'layouts', layout.id);
      await updateDoc(layoutRef, {
        tables: layoutEntries,
        updatedAt: new Date().toISOString(),
      });

      await logOperaAuditTrail(
        hotelId,
        'TABLE_LAYOUT_UPDATE',
        `Updated layout "${layout.name}" with current ${tables.length} table positions`
      );
    } catch (err) {
      report('Could not update the layout', err);
    }
  };

  /* --------------------------------------------------------------------------
     STAGE 11: DELETE NAMED LAYOUT
     -------------------------------------------------------------------------- */
  const handleDeleteLayout = async (layout: TableLayout) => {
    if (!confirm(`Delete layout "${layout.name}"? (Live tables will remain untouched)`)) return;

    try {
      await deleteDoc(doc(db, 'hotels', hotelId, 'layouts', layout.id));
      await logOperaAuditTrail(
        hotelId,
        'TABLE_LAYOUT_UPDATE',
        `Deleted layout "${layout.name}"`
      );
    } catch (err) {
      report('Could not delete the layout', err);
    }
  };

  /* --------------------------------------------------------------------------
     STAGE 11: BATCH UPDATE POSITIONS (FROM 2D BLUEPRINT DRAG)
     -------------------------------------------------------------------------- */
  const handleBatchUpdatePositions = async (updatedTables: DiningTable[]) => {
    try {
      const batch = writeBatch(db);
      updatedTables.forEach((t) => {
        const tableRef = doc(db, 'hotels', hotelId, 'tables', t.id);
        batch.update(tableRef, {
          x: t.x,
          y: t.y,
        });
      });

      await batch.commit();

      await logOperaAuditTrail(
        hotelId,
        'TABLE_LAYOUT_UPDATE',
        `Repositioned tables on 2D blueprint (${updatedTables.length} tables updated)`
      );
    } catch (err) {
      report('Could not save the table positions', err);
      throw err;
    }
  };

  /* --------------------------------------------------------------------------
     STAGE 10 DEFECT 5: IN-APP MODAL RESET CONFIRMATION
     -------------------------------------------------------------------------- */
  const handleOpenResetModal = () => {
    const occupiedTables = tables.filter((t) => t.status === 'occupied');
    if (occupiedTables.length > 0) {
      setOccupiedWarningMessage(
        `Cannot reset layout while tables are occupied: ${occupiedTables.map((t) => t.tableNumber).join(', ')}. Please clear or complete service for all seated guests first.`
      );
      setOccupiedWarningModalOpen(true);
      return;
    }
    setResetHotelInput('');
    setResetError(null);
    setResetModalOpen(true);
  };

  const handleConfirmResetLayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetHotelInput.trim().toLowerCase() !== hotelId.toLowerCase()) {
      setResetError(`Please type "${hotelId}" exactly to confirm.`);
      return;
    }

    try {
      const defaults = hotelId === 'ibis' ? DEFAULT_IBIS_TABLES : DEFAULT_NOVOTEL_TABLES;
      const batch = writeBatch(db);

      // Clean current tables
      const snap = await getDocs(collection(db, 'hotels', hotelId, 'tables'));
      if (snap && snap.docs) {
        snap.docs.forEach((d: any) => {
          batch.delete(doc(db, 'hotels', hotelId, 'tables', d.id));
        });
      }

      // Re-populate exact defaults
      defaults.forEach((t) => {
        batch.set(doc(db, 'hotels', hotelId, 'tables', t.id), t);
      });

      // Also ensure "Architect's plan" layout exists and is active
      const baselineEntries: TableLayoutEntry[] = defaults.map((t) => ({
        id: t.id,
        tableNumber: t.tableNumber,
        capacity: t.capacity,
        zone: t.zone,
        x: t.x ?? 100,
        y: t.y ?? 100,
        shape: t.shape,
        isSmoking: t.isSmoking,
      }));

      const baselineLayout: TableLayout = {
        id: 'layout-architects-plan',
        name: "Architect's plan",
        tables: baselineEntries,
        isActive: true,
        createdByUid: currentUser?.uid ?? '',
        createdByEmail: currentUser?.email ?? '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      layouts.forEach((l) => {
        batch.update(doc(db, 'hotels', hotelId, 'layouts', l.id), { isActive: false });
      });
      batch.set(doc(db, 'hotels', hotelId, 'layouts', baselineLayout.id), baselineLayout);

      await batch.commit();

      await logOperaAuditTrail(
        hotelId,
        'TABLE_LAYOUT_UPDATE',
        `Reset floor plan to exact architectural default blueprint (${hotelId})`
      );

      setResetModalOpen(false);
      setIsEditLayoutOpen(false);
    } catch (err) {
      report('Could not reset the floor plan', err);
    }
  };

  /** Merging is a host action during service: it changes only mergedInto / mergedTables. */
  const handleMergeTables = async (tablesToMerge: DiningTable[]) => {
    const plan = buildMergePlan(tablesToMerge, tables);
    if (!plan.valid) throw new Error(plan.reason || 'These tables cannot be merged.');
    const batch = writeBatch(db);
    for (const [id, update] of Object.entries(plan.updates)) batch.update(doc(db, 'hotels', hotelId, 'tables', id), update);
    await batch.commit();
    await logOperaAuditTrail(hotelId, 'TABLE_LAYOUT_UPDATE', `Merged tables ${plan.updatedTables.map((t) => t.tableNumber).join('+')}`);
  };

  const handleUnmergeTable = async (table: DiningTable) => {
    const plan = buildUnmergePlan(table, tables);
    if (!plan.valid) {
      setActionError(plan.reason || 'This table is not merged.');
      return;
    }
    try {
      const batch = writeBatch(db);
      for (const [id, update] of Object.entries(plan.updates)) batch.update(doc(db, 'hotels', hotelId, 'tables', id), update);
      await batch.commit();
      setActionError(null);
      await logOperaAuditTrail(hotelId, 'TABLE_LAYOUT_UPDATE', `Separated merged tables ${plan.updatedTables.map((t) => t.tableNumber).join(', ')}`);
    } catch (err) {
      report('Could not separate the tables', err);
    }
  };

  /** Writes the architect's default plan for an empty property - an explicit administrator action. */
  const handleCreateDefaultPlan = async () => {
    const defaults = hotelId === 'ibis' ? DEFAULT_IBIS_TABLES : DEFAULT_NOVOTEL_TABLES;
    try {
      const batch = writeBatch(db);
      defaults.forEach((t) => batch.set(doc(db, 'hotels', hotelId, 'tables', t.id), t));
      const now = new Date().toISOString();
      batch.set(doc(db, 'hotels', hotelId, 'layouts', 'layout-architects-plan'), {
        id: 'layout-architects-plan',
        name: "Architect's plan",
        tables: defaults.map((t) => ({ id: t.id, tableNumber: t.tableNumber, capacity: t.capacity, zone: t.zone, x: t.x ?? 0, y: t.y ?? 0, shape: t.shape ?? null, isSmoking: Boolean(t.isSmoking) })),
        isActive: true,
        createdByUid: currentUser?.uid ?? '',
        createdByEmail: currentUser?.email ?? '',
        createdAt: now,
        updatedAt: now,
      });
      await batch.commit();
      setActionError(null);
      await logOperaAuditTrail(hotelId, 'TABLE_LAYOUT_UPDATE', `Created the default floor plan (${defaults.length} tables)`);
    } catch (err) {
      report('Could not create the floor plan', err);
    }
  };

  const filteredGuests = inHouseGuests.filter(
    (g) =>
      g.roomNumber.toLowerCase().includes(searchGuestRoom.toLowerCase()) ||
      g.guestName.toLowerCase().includes(searchGuestRoom.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {actionError && (
        <Banner
          tone="critical"
          role="alert"
          action={
            <button className="h-11 px-3 rounded-xl border border-red-300 bg-white text-sm font-bold cursor-pointer" onClick={() => setActionError(null)}>
              Dismiss
            </button>
          }
        >
          {actionError}
        </Banner>
      )}
      {!loading && emptyPlan && (
        <Banner
          tone="info"
          title="No floor plan for this property yet"
          action={
            isAdmin ? (
              <button className="h-11 px-4 rounded-xl bg-white border border-black/15 text-sm font-bold cursor-pointer" onClick={handleCreateDefaultPlan}>
                Create the default floor plan
              </button>
            ) : undefined
          }
        >
          {isAdmin
            ? "Creates the architect's table plan. Seats per table are provisional (4) until the restaurant confirms them."
            : 'Ask an administrator to create it.'}
        </Banner>
      )}
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

            {/* Turnover Heatmap Toggle */}
            <button
              onClick={() => handleToggleTurnover(!showTurnoverLayer)}
              className={`px-3 py-2 rounded-xl text-xs font-mono-custom font-bold flex items-center gap-1.5 border transition-all cursor-pointer shadow-xs ${
                showTurnoverLayer
                  ? 'bg-amber-50 text-amber-900 border-amber-300 ring-1 ring-amber-400/30'
                  : 'bg-white text-muted-foreground border-border hover:bg-[#F2EBE4]/40 hover:text-foreground'
              }`}
              title="Toggle table turnover duration highlights"
            >
              <Clock size={14} className={showTurnoverLayer ? 'text-amber-600' : ''} />
              <span>Turnover Heatmap</span>
            </button>

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

            {/* Admin Saved Layouts Selector (Stage 11) */}
            {isAdmin && (
              <div className="relative">
                <button
                  onClick={() => setIsLayoutDropdownOpen(!isLayoutDropdownOpen)}
                  className="px-3.5 py-2 rounded-xl border border-border bg-white hover:bg-[#F2EBE4]/50 text-foreground font-mono-custom font-medium text-xs flex items-center gap-2 transition-all shadow-xs cursor-pointer"
                >
                  <Layers size={13} className="text-accent" />
                  <span className="max-w-[130px] truncate">
                    {activeLayout ? activeLayout.name : 'Select Layout'}
                  </span>
                  <ChevronDown size={12} className="text-muted-foreground" />
                </button>

                {/* Dropdown Menu */}
                {isLayoutDropdownOpen && (
                  <div className="absolute right-0 mt-1.5 w-64 bg-white border border-border rounded-xl shadow-2xl z-40 py-1.5 overflow-hidden">
                    <div className="px-3 py-1.5 border-b border-border/60">
                      <p className="label-mono text-[10px] text-muted-foreground">Saved Arrangements</p>
                    </div>

                    <div className="max-h-48 overflow-y-auto divide-y divide-border/40">
                      {layouts.map((l) => (
                        <button
                          key={l.id}
                          onClick={() => handleApplyLayout(l)}
                          className={`w-full px-3 py-2 text-left text-xs font-mono-custom flex items-center justify-between hover:bg-[#F2EBE4]/60 transition-all cursor-pointer ${
                            l.isActive ? 'bg-accent/5 font-bold text-accent' : 'text-foreground'
                          }`}
                        >
                          <span className="truncate">{l.name}</span>
                          {l.isActive && <Check size={13} className="text-accent shrink-0 ml-2" />}
                        </button>
                      ))}
                    </div>

                    <div className="p-2 border-t border-border/60 bg-[#FAFAF8] space-y-1">
                      <button
                        onClick={() => {
                          setIsLayoutDropdownOpen(false);
                          setSaveLayoutModalOpen(true);
                        }}
                        className="w-full py-1.5 px-2 rounded-lg bg-white hover:bg-[#F2EBE4] border border-border text-foreground font-mono-custom font-bold text-[11px] flex items-center gap-1.5 justify-center cursor-pointer shadow-xs"
                      >
                        <Save size={12} className="text-accent" />
                        <span>Save Current as...</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsLayoutDropdownOpen(false);
                          setManageLayoutsModalOpen(true);
                        }}
                        className="w-full py-1 px-2 text-muted-foreground hover:text-foreground font-mono-custom text-[10px] text-center cursor-pointer"
                      >
                        Manage Layouts...
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Admin Table Form Editor Toggle */}
            {isAdmin && (
              <button
                onClick={() => setIsEditLayoutOpen(true)}
                className="px-4 py-2 rounded-xl border border-border bg-white hover:bg-[#F2EBE4]/50 text-foreground font-mono-custom font-medium text-xs flex items-center gap-2 transition-all shadow-xs cursor-pointer"
              >
                <SlidersHorizontal size={13} className="text-accent" />
                <span>Floor Plan Editor</span>
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
          isAdmin={isAdmin}
          activeLayout={activeLayout}
          showTurnoverLayer={showTurnoverLayer}
          onToggleTurnoverLayer={handleToggleTurnover}
          onSelectTable={(table) => setSelectedTable(table)}
          onQuickSeat={(table) => handleQuickSeat(table)}
          onUpdateStatus={(table, status) => handleUpdateStatus(table, status)}
          onBatchUpdatePositions={handleBatchUpdatePositions}
          onMergeTables={handleMergeTables}
          onUnmergeTable={handleUnmergeTable}
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

            const durMins = isOccupied ? getOccupiedDurationMinutes(table.occupiedSince, currentTime) : null;
            const turnoverStage = getTurnoverStage(durMins);
            const turnoverStyle = getTurnoverStyle(turnoverStage, hotelId === 'ibis');
            const showCardTurnover = showTurnoverLayer && isOccupied && turnoverStage !== 'none';

            return (
              <motion.div
                key={table.id}
                layout
                onClick={() => setSelectedTable(table)}
                style={
                  showCardTurnover
                    ? {
                        borderColor: turnoverStyle.borderColor,
                        backgroundColor: turnoverStyle.badgeBg,
                      }
                    : undefined
                }
                className={`relative rounded-2xl border p-4 cursor-pointer transition-all duration-200 hover:border-accent ${
                  isOccupied
                    ? showCardTurnover
                      ? 'shadow-sm ring-1 ring-black/5'
                      : 'bg-white border-accent/40 shadow-sm ring-1 ring-accent/10'
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

                  <div className="flex flex-col items-end gap-1">
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

                    {/* Live Turnover Pill */}
                    {showCardTurnover && durMins !== null && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-mono-custom font-bold border"
                        style={{
                          backgroundColor: turnoverStyle.borderColor,
                          color: '#FFFFFF',
                          borderColor: turnoverStyle.borderColor,
                        }}
                      >
                        <Clock size={9} />
                        <span>{formatOccupiedDuration(durMins)}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Occupancy Info */}
                {isOccupied && table.occupiedByRoom ? (
                  <div className="mt-3.5 pt-2.5 border-t border-accent/20 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold font-mono-custom text-accent">RM {table.occupiedByRoom}</span>
                      <span className="text-[10px] font-mono-custom text-muted-foreground flex items-center gap-1">
                        <Clock size={10} /> {formatSeatedAt(table.occupiedSince) || '—'}
                      </span>
                    </div>
                    <p className="text-xs font-bold font-sans text-foreground truncate">{table.occupiedByGuest || 'Seated Guest'}</p>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-mono-custom text-muted-foreground">{table.occupiedPax || table.capacity} Pax seated</p>
                      {showCardTurnover && (
                        <span
                          className="text-[10px] font-mono-custom font-bold"
                          style={{ color: turnoverStyle.borderColor }}
                        >
                          {turnoverStyle.label}
                        </span>
                      )}
                    </div>
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

              {(selectedTable.mergedInto || (selectedTable.mergedTables?.length ?? 0) > 0) && (
                <button
                  onClick={() => handleUnmergeTable(selectedTable)}
                  className="w-full h-11 rounded-xl border border-black/20 bg-white text-sm font-bold cursor-pointer"
                >
                  Separate merged tables
                </button>
              )}

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
              {selectedTable.status === 'occupied' ? (
                (() => {
                  const durMins = getOccupiedDurationMinutes(selectedTable.occupiedSince, currentTime);
                  const stage = getTurnoverStage(durMins);
                  const style = getTurnoverStyle(stage, hotelId === 'ibis');

                  return (
                    <div className="p-4 rounded-xl border border-border bg-[#F2EBE4]/40 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <p className="label-mono text-black font-bold">Currently Seated</p>
                        {durMins !== null && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono-custom font-bold border"
                            style={{
                              backgroundColor: style.badgeBg,
                              color: style.badgeText,
                              borderColor: style.borderColor,
                            }}
                          >
                            <Clock size={10} />
                            <span>{formatOccupiedDuration(durMins)} ({style.label})</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold font-mono-custom text-foreground">
                          {selectedTable.occupiedByRoom ? `RM ${selectedTable.occupiedByRoom}` : 'In-House Guest'}
                        </span>
                        <span className="text-xs font-mono-custom text-muted-foreground">{selectedTable.occupiedPax || selectedTable.capacity} Pax</span>
                      </div>

                      {selectedTable.occupiedByGuest && (
                        <p className="text-xs font-bold font-sans text-foreground">{selectedTable.occupiedByGuest}</p>
                      )}

                      {style.isAlert && (
                        <div className="text-[11px] font-mono-custom text-red-600 font-bold flex items-center gap-1.5 pt-1">
                          <AlertTriangle size={13} className="shrink-0" />
                          <span>
                            {stage === 'critical'
                              ? 'Turnover overdue (> 60m) — table should be cleared soon'
                              : 'Approaching target dining duration (45–60m)'}
                          </span>
                        </div>
                      )}

                      <div className="pt-2 flex justify-end">
                        <button
                          onClick={() => handleUpdateStatus(selectedTable, 'available')}
                          className="px-3 py-1.5 rounded-lg border border-black/20 text-xs font-mono-custom font-bold text-black hover:bg-white transition-all shadow-xs cursor-pointer"
                        >
                          Clear & Free Table
                        </button>
                      </div>
                    </div>
                  );
                })()
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
                  <p className="text-xs text-muted-foreground">
                    Select an in-house room to seat. Seating does not record breakfast attendance - use Check-in for that.
                  </p>
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
                      value={editingTable?.capacity || 4}
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
                    onClick={handleOpenResetModal}
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
                            {t.isSmoking && (
                              <span title="Smoking" aria-label="Smoking">
                                <Cigarette size={12} className="text-cyan-700" />
                              </span>
                            )}
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

      {/* Save Layout Modal (Stage 11) */}
      <AnimatePresence>
        {saveLayoutModalOpen && (
          <div className="fixed inset-0 z-50 bg-[#0A162B]/50 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-xl font-bold font-display text-foreground">Save Arrangement</h3>
                  <p className="text-xs text-muted-foreground">Snapshot current {tables.length} table coordinates & capacities</p>
                </div>
                <button
                  onClick={() => setSaveLayoutModalOpen(false)}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-[#F2EBE4]/60 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveCurrentAsLayout} className="space-y-4">
                <div>
                  <label className="label-mono">Layout Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Friday BBQ Buffet, Christmas, Banquet"
                    value={newLayoutName}
                    onChange={(e) => setNewLayoutName(e.target.value)}
                    className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-border bg-white text-foreground text-xs font-medium focus:outline-none focus:border-accent"
                  />
                  <p className="text-[10px] text-muted-foreground font-mono-custom mt-1">
                    Live guest occupancies will not be saved, preserving service integrity.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSaveLayoutModalOpen(false)}
                    className="px-3.5 py-2 rounded-xl border border-border text-xs font-mono-custom text-muted-foreground hover:bg-[#F2EBE4]/60 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingLayout || !newLayoutName.trim()}
                    className="px-4 py-2 rounded-xl bg-accent text-white font-mono-custom font-bold text-xs flex items-center gap-1.5 hover:bg-accent-hover shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    <Save size={13} />
                    <span>{isSavingLayout ? 'Saving...' : 'Save & Activate'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Manage Layouts Modal (Stage 11) */}
      <AnimatePresence>
        {manageLayoutsModalOpen && (
          <div className="fixed inset-0 z-50 bg-[#0A162B]/50 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white border border-border rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col"
            >
              <div className="flex items-start justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-xl font-bold font-display text-foreground">Manage Saved Layouts</h3>
                  <p className="text-xs text-muted-foreground">Switch, overwrite, or delete restaurant floor plan presets</p>
                </div>
                <button
                  onClick={() => setManageLayoutsModalOpen(false)}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-[#F2EBE4]/60 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {layouts.map((l) => (
                  <div
                    key={l.id}
                    className={`p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                      l.isActive
                        ? 'bg-accent/5 border-accent/40 shadow-xs'
                        : 'bg-white border-border hover:bg-[#F2EBE4]/30'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold font-display text-foreground">{l.name}</span>
                        {l.isActive && (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-mono-custom font-bold bg-accent text-white uppercase">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-mono-custom text-muted-foreground mt-0.5">
                        {l.tables.length} tables • Updated {new Date(l.updatedAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {!l.isActive ? (
                        <button
                          onClick={() => {
                            setManageLayoutsModalOpen(false);
                            handleApplyLayout(l);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white border border-border hover:border-accent text-xs font-mono-custom font-bold text-foreground cursor-pointer shadow-xs"
                        >
                          Apply
                        </button>
                      ) : (
                        <button
                          onClick={() => handleOverwriteLayout(l)}
                          className="px-2.5 py-1.5 rounded-lg border border-border text-[11px] font-mono-custom text-muted-foreground hover:text-foreground hover:bg-white cursor-pointer"
                          title="Overwrite with current positions"
                        >
                          Update
                        </button>
                      )}

                      {l.id !== 'layout-architects-plan' && (
                        <button
                          onClick={() => handleDeleteLayout(l)}
                          className="p-1.5 rounded-lg border border-border text-rose-600 hover:bg-rose-50 cursor-pointer"
                          title="Delete layout"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stage 10 Defect 5: In-App Modal for Reset Confirmation */}
      <AnimatePresence>
        {resetModalOpen && (
          <div className="fixed inset-0 z-50 bg-[#0A162B]/50 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2 text-rose-600">
                  <AlertTriangle size={20} />
                  <h3 className="text-xl font-bold font-display text-foreground">Reset Floor Plan</h3>
                </div>
                <button
                  onClick={() => setResetModalOpen(false)}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-[#F2EBE4]/60 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleConfirmResetLayout} className="space-y-4">
                <p className="text-xs text-foreground font-sans leading-relaxed">
                  This will reset all dining tables to the exact original architectural preset for <strong>{hotelId === 'ibis' ? 'ibis Chiang Mai' : 'Novotel Chiang Mai'}</strong>.
                </p>

                <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200 text-xs font-mono-custom text-rose-900">
                  Type <strong className="font-bold underline">{hotelId}</strong> to confirm resetting:
                </div>

                <div>
                  <input
                    type="text"
                    required
                    placeholder={`Type ${hotelId}`}
                    value={resetHotelInput}
                    onChange={(e) => {
                      setResetHotelInput(e.target.value);
                      if (resetError) setResetError(null);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-foreground text-xs font-mono-custom focus:outline-none focus:border-rose-500"
                  />
                  {resetError && (
                    <p className="text-xs text-rose-600 font-mono-custom mt-1 font-bold">{resetError}</p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setResetModalOpen(false)}
                    className="px-3.5 py-2 rounded-xl border border-border text-xs font-mono-custom text-muted-foreground hover:bg-[#F2EBE4]/60 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-rose-600 text-white font-mono-custom font-bold text-xs flex items-center gap-1.5 hover:bg-rose-700 shadow-xs cursor-pointer"
                  >
                    <RotateCcw size={13} />
                    <span>Confirm Reset</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stage 11: Occupied Tables Guard In-App Warning Modal */}
      <AnimatePresence>
        {occupiedWarningModalOpen && (
          <div className="fixed inset-0 z-50 bg-[#0A162B]/50 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white border border-rose-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold font-display text-foreground">Action Blocked: Seated Guests</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Tables are currently in active service</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-100 text-xs font-mono-custom text-rose-900 leading-relaxed">
                {occupiedWarningMessage}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setOccupiedWarningModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#0A162B] text-white font-mono-custom font-bold text-xs hover:bg-[#1E293B] cursor-pointer"
                >
                  Understood
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
