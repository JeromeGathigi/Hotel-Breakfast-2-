import React, { useState, useEffect } from 'react';
import { 
  db, 
  collection, 
  onSnapshot, 
  formatFirestoreDate
} from '../firebase';
import { Guest, AuditLogEntry } from '../types';
import { 
  X, 
  ShieldCheck, 
  Clock, 
  History
} from 'lucide-react';
import { motion } from 'motion/react';

interface OperaAuditModalProps {
  hotelId: string;
  guest?: Guest | null;
  onClose: () => void;
}

export const OperaAuditModal: React.FC<OperaAuditModalProps> = ({ hotelId, guest, onClose }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const logsRef = collection(db, 'hotels', hotelId, 'auditLogs');
    const unsub = onSnapshot(logsRef, (snap) => {
      const allLogs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLogEntry));
      // Sort newest first
      allLogs.sort((a, b) => {
        const timeA = new Date(a.timestamp?.toDate ? a.timestamp.toDate() : a.timestamp || 0).getTime();
        const timeB = new Date(b.timestamp?.toDate ? b.timestamp.toDate() : b.timestamp || 0).getTime();
        return timeB - timeA;
      });

      if (guest?.roomNumber) {
        setLogs(allLogs.filter((l) => l.roomNumber === guest.roomNumber));
      } else {
        setLogs(allLogs);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [hotelId, guest?.roomNumber]);

  return (
    <div className="fixed inset-0 z-50 bg-[#0A162B]/50 backdrop-blur-xs flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white border border-border rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-5 max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="label-mono text-accent">Opera PMS Audit</span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="font-mono-custom text-xs font-semibold text-muted-foreground">Activity Trail</span>
            </div>
            <h3 className="text-2xl font-bold font-display text-foreground mt-1 tracking-tight">
              {guest ? `Room ${guest.roomNumber} • ${guest.guestName}` : 'System-Wide Activity & Audit Log'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-[#F2EBE4]/60 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Guest Reservation Parameters (if single guest) */}
        {guest && (
          <div className="p-4 rounded-xl border border-border bg-[#F2EBE4]/40 space-y-3">
            <p className="label-mono text-accent">Opera Reservation Details</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="label-mono block text-[9px]">Resv Name ID</span>
                <span className="font-mono-custom font-bold text-foreground">{guest.resvNameId || '—'}</span>
              </div>
              <div>
                <span className="label-mono block text-[9px]">Stay Dates</span>
                <span className="font-mono-custom font-semibold text-foreground">{guest.arrivalDate} → {guest.departureDate}</span>
              </div>
              <div>
                <span className="label-mono block text-[9px]">Meal Package</span>
                <span className="font-mono-custom font-semibold text-accent">{guest.mealPlan}</span>
              </div>
              <div>
                <span className="label-mono block text-[9px]">Rate / Block Code</span>
                <span className="font-mono-custom font-semibold text-foreground">{guest.rateCode || guest.blockCode || 'Standard'}</span>
              </div>
              <div>
                <span className="label-mono block text-[9px]">Company / Group</span>
                <span className="font-sans font-medium text-foreground">{guest.companyName || 'Individual Guest'}</span>
              </div>
              <div>
                <span className="label-mono block text-[9px]">Entitlement</span>
                <span className="font-mono-custom font-semibold text-foreground">{guest.adults} Adults, {guest.children} Children</span>
              </div>
            </div>

            {guest.specialRequests && (
              <div className="pt-2 border-t border-border/80 text-xs">
                <span className="label-mono block text-[9px]">Special Requests / Preferences:</span>
                <p className="font-sans text-foreground italic mt-0.5">{guest.specialRequests}</p>
              </div>
            )}
          </div>
        )}

        {/* Audit Log Stream */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 min-h-[220px]">
          <div className="flex items-center justify-between">
            <span className="label-mono flex items-center gap-1.5 text-muted-foreground">
              <History size={13} className="text-accent" />
              Chronological Audit Trail ({logs.length})
            </span>
          </div>

          {logs.map((log) => (
            <div
              key={log.id}
              className="p-3 rounded-xl border border-border bg-white hover:border-accent/30 transition-all space-y-1"
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-mono-custom font-semibold uppercase ${
                    log.action.includes('CHECK_IN') 
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : log.action.includes('TABLE')
                      ? 'bg-accent/10 text-accent border border-accent/20'
                      : 'bg-slate-100 text-slate-700 border border-slate-300'
                  }`}>
                    {log.action.replace(/_/g, ' ')}
                  </span>
                  {log.roomNumber && (
                    <span className="font-mono-custom font-bold text-foreground">Room {log.roomNumber}</span>
                  )}
                </div>
                <span className="text-[10px] font-mono-custom text-muted-foreground flex items-center gap-1">
                  <Clock size={10} />
                  {formatFirestoreDate(log.timestamp)}
                </span>
              </div>

              <p className="text-xs font-sans text-foreground">{log.details}</p>

              <div className="flex items-center justify-between text-[10px] font-mono-custom text-muted-foreground pt-1 border-t border-border/40">
                <span>Staff: <strong className="text-foreground">{log.userName}</strong> ({log.userEmail})</span>
                <span className="font-mono-custom text-[9px]">ID: {log.id.slice(0, 8)}</span>
              </div>
            </div>
          ))}

          {logs.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-xs italic font-mono-custom">
              No audit logs recorded for this record yet.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 font-mono-custom text-[10px]">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>Opera Cloud Compliant Log</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-accent text-white font-mono-custom font-medium text-xs shadow-xs hover:bg-accent-hover transition-all"
          >
            Close Window
          </button>
        </div>
      </motion.div>
    </div>
  );
};
