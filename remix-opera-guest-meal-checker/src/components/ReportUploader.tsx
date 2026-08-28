import React, { useState, useRef } from 'react';
import { collection, writeBatch, doc, serverTimestamp, getDocs, getDocFromServer } from 'firebase/firestore';
import { db, auth, sanitizeData } from '../firebase';
import { businessDate } from '../lib/businessDate';
import { parseInHouseReport } from '../parsing';
import type { Anomaly, ParseResult } from '../parsing';
import { Guest } from '../types';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Trash2, Sparkles, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { hasMealEntitlement } from '../lib/meals';

export const ReportUploader: React.FC<{ hotelId: string; onUploadSuccess?: () => void }> = ({ hotelId, onUploadSuccess }) => {
  const [inHouseFile, setInHouseFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ 
    type: 'success' | 'error'; 
    message: string; 
    preview?: any[] 
  } | null>(null);
  const [progress, setProgress] = useState<string>('');
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [stats, setStats] = useState<ParseResult['stats'] | null>(null);
  const inHouseInputRef = useRef<HTMLInputElement>(null);

  // Test connection to Firestore
  React.useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'hotels', hotelId, 'metadata', 'reports'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
        }
      }
    };
    testConnection();
  }, [db, hotelId]);

  const handleFirestoreError = (error: unknown, operation: string, path: string | null) => {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        providerInfo: auth.currentUser?.providerData.map(p => ({
          providerId: p.providerId,
          displayName: p.displayName,
          email: p.email
        })) || []
      },
      operation,
      path
    };
    console.error('Firestore Error Details:', JSON.stringify(errInfo, null, 2));
    throw new Error(error instanceof Error ? error.message : 'Missing or insufficient permissions.');
  };

  const handleUpload = async () => {
    if (!inHouseFile) {
      setStatus({ type: 'error', message: 'Please select the Guest In-house report first.' });
      return;
    }

    setUploading(true);
    setStatus(null);
    setProgress('Parsing report...');

    try {
      const text = await inHouseFile.text();
      setProgress('Processing data...');

      // All parsing, grouping and meal-plan classification now lives in src/parsing,
      // as pure functions covered by golden-file tests against a real Opera export.
      const parsed = parseInHouseReport(text);
      const guests: Guest[] = parsed.rooms.map((room) => ({
        roomNumber: room.roomNumber,
        guestName: room.guestName,
        arrivalDate: room.arrivalDate,
        departureDate: room.departureDate,
        mealPlan: room.mealPlan,
        adults: room.adults,
        children: room.children,
        resvNameId: room.resvNameId,
        accompanyingGuests: room.accompanyingGuests,
        vipStatus: room.vipStatus,
        issueType: room.issueType,
        lastUpdated: serverTimestamp() as any,
      }));
      setAnomalies(parsed.anomalies);
      setStats(parsed.stats);

      if (guests.length === 0) {
        throw new Error("No valid guest data found. Check if the ROOM column contains numbers.");
      }

      setProgress(`Uploading ${guests.length} guest records...`);

      try {
        // 1. Get all existing guest documents to delete them (full refresh)
        const existingDocs = await getDocs(collection(db, 'hotels', hotelId, 'guests'));
        const batch = writeBatch(db);
        
        existingDocs.forEach((d) => {
          batch.delete(d.ref);
        });

        // 2. Add new guest records
        const guestsCollection = collection(db, 'hotels', hotelId, 'guests');
        guests.forEach(guest => {
          const docRef = doc(guestsCollection, guest.roomNumber);
          // Apply defaults and sanitize
          const sanitizedGuest = sanitizeData({
            ...guest,
            guestName: guest.guestName || '',
            adults: guest.adults || 0,
            children: guest.children || 0,
            mealPlan: guest.mealPlan || 'Room Only / No Package',
            vipStatus: guest.vipStatus || null,
            issueType: guest.issueType === undefined ? null : guest.issueType
          });
          batch.set(docRef, sanitizedGuest);
        });

        const metadataRef = doc(db, 'hotels', hotelId, 'metadata', 'reports');
        const sanitizedMetadata = sanitizeData({
          lastUploaded: serverTimestamp(),
          uploadedBy: auth.currentUser?.email || 'Unknown',
          date: businessDate()
        });
        batch.set(metadataRef, sanitizedMetadata);

        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, 'write_batch', `hotels/${hotelId}/guests`);
      }
      setStatus({ 
        type: 'success', 
        message:
          `${guests.length} rooms in house · ${parsed.stats.roomsWithMeal} with a meal plan.\n` +
          `Read ${parsed.stats.records} records from ${parsed.stats.physicalLines} lines` +
          (parsed.stats.rejectedRecords > 0
            ? ` · ${parsed.stats.rejectedRecords} unreadable record(s) skipped.`
            : '.'),
        preview: guests.slice(0, 10)
      });
      setInHouseFile(null);
    } catch (err: any) {
      console.error('Upload error:', err);
      setStatus({ type: 'error', message: err.message || 'Failed to process report.' });
    } finally {
      setUploading(false);
      setProgress('');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="text-center space-y-4">
        <h2 className="text-4xl font-black text-accent tracking-tight">Update Database</h2>
        <p className="text-muted-foreground font-medium max-w-lg mx-auto">
          Upload your Guest In-house report (Tab-separated) to refresh the database.
        </p>
      </div>

      <div className="flex justify-center">
        <div className="w-full max-w-md bg-card p-8 rounded-lg border-2 border-dashed border-border hover:border-accent transition-all group relative">
          <input
            type="file"
            ref={inHouseInputRef}
            onChange={(e) => setInHouseFile(e.target.files?.[0] || null)}
            className="hidden"
            accept=".txt,.csv"
          />
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-accent/10 rounded-xl flex items-center justify-center mx-auto text-accent group-hover:scale-110 transition-transform">
              <FileText size={32} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">Guest In-house Report</h3>
              <p className="text-sm text-muted-foreground">Upload the tab-separated .txt or .csv file</p>
            </div>
            {inHouseFile ? (
              <div className="flex items-center justify-center gap-2 text-accent font-medium">
                <CheckCircle2 size={16} />
                <span className="truncate max-w-[200px]">{inHouseFile.name}</span>
                <button onClick={() => setInHouseFile(null)} className="text-muted-foreground hover:text-red-500">
                  <Trash2 size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => inHouseInputRef.current?.click()}
                className="px-6 py-2 bg-card text-accent rounded-xl hover:bg-accent/10 border border-border transition-all font-bold"
              >
                Select File
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <button
          onClick={handleUpload}
          disabled={uploading || !inHouseFile}
          className="w-full max-w-md flex items-center justify-center gap-3 bg-accent text-on-primary rounded-xl py-3 font-bold shadow-md hover:opacity-95 disabled:opacity-50 transition-colors"
        >
          {uploading ? <Loader2 className="animate-spin" /> : <Upload size={24} />}
          {uploading ? 'Processing...' : 'Update Guest Database'}
        </button>
        
        {progress && (
          <div className="flex items-center gap-2 text-accent font-medium animate-pulse">
            <Sparkles size={16} />
            <p className="text-sm">{progress}</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {status && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`p-8 rounded-[2rem] border-2 flex flex-col gap-6 ${
              status.type === 'success' 
                ? 'bg-accent/5 border-accent/20 text-foreground' 
                : 'bg-red-900/10 border-red-900/20 text-red-400'
            }`}
          >
            <div className="flex items-start gap-4">
              {status.type === 'success' ? (
                <div className="p-3 bg-accent/20 rounded-2xl text-accent">
                  <CheckCircle2 size={24} />
                </div>
              ) : (
                <div className="p-3 bg-red-900/30 rounded-2xl text-red-400">
                  <AlertCircle size={24} />
                </div>
              )}
              <div className="flex-1">
                <p className="text-xl font-black tracking-tight text-accent">{status.type === 'success' ? 'Upload Successful' : 'Upload Failed'}</p>
                <p className="text-sm font-medium opacity-80 whitespace-pre-line mt-1">{status.message}</p>
              </div>
              <button 
                onClick={() => setStatus(null)} 
                className="p-2 hover:bg-white/5 rounded-xl transition-colors text-muted-foreground"
              >
                <Trash2 size={20} />
              </button>
            </div>

            {anomalies.length > 0 && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 overflow-hidden">
                <div className="px-4 py-3 flex items-center gap-2 border-b border-amber-500/20">
                  <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                    {anomalies.length} record{anomalies.length === 1 ? '' : 's'} needed attention
                  </span>
                </div>
                <ul className="divide-y divide-amber-500/10 max-h-48 overflow-y-auto">
                  {anomalies.map((anomaly, index) => (
                    <li key={index} className="px-4 py-2.5 text-xs text-muted-foreground leading-relaxed">
                      <span className="font-bold text-amber-500">
                        {anomaly.room ? `Room ${anomaly.room}` : `Line ${anomaly.line}`}
                      </span>
                      {' — '}
                      {anomaly.detail}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {status.type === 'success' && status.preview && (
              <div className="bg-card rounded-2xl overflow-hidden border border-border">
                <div className="px-4 py-3 bg-background border-b border-border flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-accent">Data Preview (First 10 Rooms)</span>
                  <button 
                    onClick={onUploadSuccess}
                    className="text-[10px] font-black text-accent hover:underline"
                  >
                    View Full Guest List →
                  </button>
                </div>
                <div className="divide-y divide-border max-h-60 overflow-y-auto">
                  {status.preview.map((g, i) => (
                    <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-4 hover:bg-accent/5 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="w-8 text-xs font-black text-accent">{g.roomNumber}</span>
                        <span className="text-xs font-bold text-foreground truncate max-w-[120px]">{g.guestName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          hasMealEntitlement(g.mealPlan)
                            ? 'bg-accent text-on-primary' 
                            : 'bg-background border border-border text-muted-foreground'
                        }`}>
                          {g.mealPlan}
                        </div>
                        <span className="text-[10px] font-black text-accent/50">A:{g.adults} C:{g.children}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-card p-6 rounded-xl border border-border">
        <h4 className="text-xs font-bold text-accent uppercase tracking-widest mb-4">Instructions</h4>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-accent font-bold">1.</span>
            Download the "Guest In-house" report from Opera Cloud (Export as Tab-separated Text).
          </li>
          <li className="flex gap-2">
            <span className="text-accent font-bold">2.</span>
            Upload the file above.
          </li>
          <li className="flex gap-2">
            <span className="text-accent font-bold">3.</span>
            The app will automatically classify meal plans based on the RATE_CODE.
          </li>
          <li className="flex gap-2">
            <span className="text-accent font-bold">4.</span>
            Click "Update Guest Database" to refresh the records.
          </li>
        </ul>
      </div>
    </div>
  );
};
