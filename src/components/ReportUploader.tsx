import React, { useState, useMemo } from 'react';
import { 
  db, 
  doc, 
  writeBatch, 
  serverTimestamp, 
  logOperaAuditTrail 
} from '../firebase';
import { parseInHouseReport, ParseResult } from '../parsing';
import { assessImport } from '../lib/importGuard';
import { businessDate } from '../lib/businessDate';
import { AlertTriangle, CheckCircle, Database, FileText, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ReportUploaderProps {
  hotelId: string;
}

export const ReportUploader: React.FC<ReportUploaderProps> = ({ hotelId }) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [parsedFilename, setParsedFilename] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      processFile(selected);
    }
  };

  const processFile = (f: File) => {
    setParsing(true);
    setSuccessMessage(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const result = parseInHouseReport(text, hotelId);
      setParseResult(result);
      setParsedFilename(f.name);
      setParsing(false);
    };
    reader.onerror = () => {
      setParsing(false);
      alert('Could not read file.');
    };
    reader.readAsText(f);
  };

  /** Refuses the wrong Opera report before anything is written. See src/lib/importGuard.ts. */
  const assessment = useMemo(
    () => (parseResult ? assessImport(parseResult, parsedFilename) : null),
    [parseResult, parsedFilename]
  );

  const handleSyncToDatabase = async () => {
    if (!parseResult) return;
    if (assessment && !assessment.ok) return;
    setUploading(true);
    const today = businessDate();

    try {
      const targetHotels: ('novotel' | 'ibis')[] = 
        parseResult.hotelId === 'both' ? ['novotel', 'ibis'] : [parseResult.hotelId as 'novotel' | 'ibis'];

      for (const hid of targetHotels) {
        const batch = writeBatch(db);

        // Upload guests
        const hotelRooms = parseResult.rooms.filter(r => parseResult.hotelId === 'both' ? r.hotelId === hid : true);
        hotelRooms.forEach((guest) => {
          const guestRef = doc(db, 'hotels', hid, 'guests', guest.roomNumber);
          batch.set(guestRef, {
            ...guest,
            hotelId: hid,
            lastUpdated: new Date().toISOString(),
          });
        });

        // Upload forecasts if available
        const hotelForecasts = parseResult.forecasts.filter(f => parseResult.hotelId === 'both' ? f.hotelId === hid : true);
        hotelForecasts.forEach((f) => {
          const fRef = doc(db, 'hotels', hid, 'forecasts', f.date);
          batch.set(fRef, {
            ...f,
            hotelId: hid,
          });
        });

        // Update metadata
        const metaRef = doc(db, 'hotels', hid, 'metadata', 'reports');
        batch.set(metaRef, {
          date: today,
          hotelId: hid,
          lastUploaded: serverTimestamp(),
          filename: file?.name || 'manual_sync.tsv',
          stats: {
            totalRooms: hotelRooms.length,
            totalGuests: hotelRooms.reduce((a, b) => a + (b.adults || 0) + (b.children || 0), 0),
            // `totalEntitledBreakfast: stats.totalBreakfastPax` used to sit here, and
            // totalBreakfastPax was occupancy with no entitlement check - the field name
            // asserted something never computed, and every consumer of metadata/reports
            // inherited it. These three are the real split.
            totalEntitledBreakfast: parseResult.stats.breakfastIncludedPax,
            totalUnverifiedBreakfast: parseResult.stats.breakfastUnverifiedPax,
            unverifiedRateCodes: parseResult.stats.breakfastUnverifiedCodes,
            totalEntitledDinner: parseResult.stats.totalDinnerPax,
            vipCount: hotelRooms.filter(g => g.vipStatus).length,
            anomaliesCount: parseResult.anomalies.length,
          },
        });

        await batch.commit();

        // Record Opera Audit Trail
        await logOperaAuditTrail(
          hid,
          'REPORT_UPLOAD',
          `Synchronized Opera report "${file?.name || 'Opera Sync'}" (${hotelRooms.length} rooms, ${hotelForecasts.length} forecast days imported)`
        );
      }

      setSuccessMessage(
        `Successfully synced ${parseResult.stats.totalRooms} rooms and ${parseResult.stats.forecastDaysCount} forecast records to ${targetHotels.join(' & ')}.`
      );
      setParseResult(null);
      setFile(null);
    } catch (err) {
      console.error('Database sync failed:', err);
      alert('Sync failed. Please check your connection.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-border shadow-luxury flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="label-mono text-accent">Opera PMS Integration</span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="font-mono-custom text-xs font-semibold text-muted-foreground">Manual import</span>
          </div>
          <h2 className="text-2xl font-bold font-display text-foreground mt-1 tracking-tight">
            Opera Data & Synchronization Hub
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Import the Opera "Guests INH - By Room" export for Novotel or ibis.
          </p>
        </div>

      </div>

      {/* Success Notification */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-50 text-emerald-800 flex items-center gap-3 text-xs font-mono-custom font-semibold"
          >
            <CheckCircle size={18} className="text-emerald-600" />
            <span>{successMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-6">
          {/* Drag and drop upload zone */}
          <div className="p-10 rounded-2xl border-2 border-dashed border-border bg-white hover:border-accent/40 transition-all text-center space-y-4 shadow-luxury">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent mx-auto flex items-center justify-center">
              <Upload size={22} />
            </div>

            <div>
              <h3 className="text-lg font-bold font-display text-foreground">Upload Opera TSV / CSV Export</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                Drop your Opera In-House Guest Manifest or Package Forecast report here. Multi-property resort codes (HB4F8 & HB9U9) will be detected automatically.
              </p>
            </div>

            <label className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white border border-black/20 text-black font-mono-custom font-bold text-xs cursor-pointer shadow-xs hover:bg-[#F2EBE4] transition-all">
              <FileText size={15} className="text-black" />
              Choose Opera Report File
              <input
                type="file"
                accept=".tsv,.csv,.txt"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>

          {/* Parse Preview */}
          {parseResult && assessment && !assessment.ok && (
            <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-5 flex gap-3">
              <AlertTriangle size={20} className="text-red-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold font-display text-red-900">
                  This file was not imported
                </h4>
                <p className="text-sm text-red-800 leading-relaxed">{assessment.reason}</p>
                <p className="text-xs text-red-700/80 pt-1">
                  The existing guest list has not been changed.
                </p>
              </div>
            </div>
          )}

          {parseResult && assessment && assessment.ok && assessment.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 flex gap-3">
              <AlertTriangle size={20} className="text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold font-display text-amber-900">
                  Check before syncing
                </h4>
                <ul className="text-sm text-amber-800 leading-relaxed list-disc pl-5 space-y-0.5">
                  {assessment.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {parseResult && (
            <div className="bg-white border border-border rounded-2xl p-6 shadow-luxury space-y-5">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <span className="label-mono text-black font-bold">File Analysis</span>
                  <h3 className="text-lg font-bold font-display text-foreground">{file?.name}</h3>
                  <p className="text-xs text-muted-foreground font-mono-custom mt-0.5">
                    Target: <strong className="text-foreground capitalize">{parseResult.hotelId}</strong> • Type: <strong className="text-foreground capitalize">{parseResult.reportType}</strong>
                  </p>
                </div>

                <button
                  onClick={handleSyncToDatabase}
                  disabled={uploading || (assessment ? !assessment.ok : false)}
                  className="px-5 py-2.5 rounded-xl bg-white border border-black/20 text-black font-mono-custom font-bold text-xs shadow-xs flex items-center gap-2 hover:bg-[#F2EBE4] transition-all cursor-pointer"
                >
                  <Database size={15} className="text-black" />
                  {uploading ? 'Synchronizing...' : 'Confirm & Sync to Database'}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="stat-card-luxury p-3.5">
                  <span className="label-mono">Rooms Found</span>
                  <p className="text-xl font-bold font-display text-foreground mt-0.5">{parseResult.stats.totalRooms}</p>
                </div>
                <div className="stat-card-luxury p-3.5">
                  <span className="label-mono text-accent">Breakfast Included</span>
                  <p className="text-xl font-bold font-display text-accent mt-0.5">{parseResult.stats.breakfastIncludedPax}</p>
                </div>
                <div className="stat-card-luxury p-3.5">
                  <span className="label-mono text-amber-700">Needs Checking</span>
                  <p className="text-xl font-bold font-display text-amber-800 mt-0.5">{parseResult.stats.breakfastUnverifiedPax}</p>
                  {parseResult.stats.breakfastUnverifiedCodes.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1 font-mono-custom break-words">
                      {parseResult.stats.breakfastUnverifiedCodes.join(', ')}
                    </p>
                  )}
                </div>
                <div className="stat-card-luxury p-3.5">
                  <span className="label-mono text-indigo-700">Dinner Pax</span>
                  <p className="text-xl font-bold font-display text-indigo-800 mt-0.5">{parseResult.stats.totalDinnerPax}</p>
                </div>
                <div className="stat-card-luxury p-3.5">
                  <span className="label-mono">Forecast Days</span>
                  <p className="text-xl font-bold font-display text-foreground mt-0.5">{parseResult.stats.forecastDaysCount}</p>
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
};

