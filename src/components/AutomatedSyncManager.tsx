import React, { useState, useEffect } from 'react';
import { db, collection, getDocs } from '../firebase';
import { seedHistoricalData, SeedHistoricalResult } from '../lib/historicalSeeder';
import { triggerDailyAutomatedSync, AutomatedSyncResult } from '../lib/operaSyncService';
import { DailySummary } from '../types';
import { BulkFolderUploader } from './BulkFolderUploader';
import { 
  Zap, 
  History, 
  Calendar, 
  CheckCircle, 
  Clock, 
  Database, 
  Server, 
  Copy, 
  Check, 
  ArrowRight,
  TrendingUp,
  Coffee,
  Moon,
  AlertCircle,
  FolderUp,
  FileSpreadsheet
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AutomatedSyncManagerProps {
  hotelId: string;
}

export const AutomatedSyncManager: React.FC<AutomatedSyncManagerProps> = ({ hotelId }) => {
  // Tabs: 'bulk_folder' | 'automated_sync' | 'historical_backfill' | 'summaries_explorer'
  const [activeSubTab, setActiveSubTab] = useState<'bulk_folder' | 'automated_sync' | 'historical_backfill' | 'summaries_explorer'>('bulk_folder');
  
  // Daily Sync State
  const [syncingDaily, setSyncingDaily] = useState(false);
  const [dailySyncResult, setDailySyncResult] = useState<AutomatedSyncResult | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Historical Seeder State
  const [selectedDaysCount, setSelectedDaysCount] = useState<number>(30);
  const [targetHotelOption, setTargetHotelOption] = useState<'both' | 'novotel' | 'ibis'>('both');
  const [seeding, setSeeding] = useState(false);
  const [seedingProgress, setSeedingProgress] = useState<{ current: number; total: number; date: string; hotelId: string } | null>(null);
  const [seedResult, setSeedResult] = useState<SeedHistoricalResult | null>(null);

  // Summaries Explorer State
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [loadingSummaries, setLoadingSummaries] = useState(false);

  useEffect(() => {
    if (activeSubTab === 'summaries_explorer') {
      fetchDailySummaries();
    }
  }, [activeSubTab, hotelId]);

  const fetchDailySummaries = async () => {
    setLoadingSummaries(true);
    try {
      const colRef = collection(db, 'hotels', hotelId, 'daily_summaries');
      const snap = await getDocs(colRef);
      const items: DailySummary[] = [];
      snap.docs.forEach((d) => {
        items.push(d.data() as DailySummary);
      });
      // Sort descending by date
      items.sort((a, b) => b.date.localeCompare(a.date));
      setSummaries(items);
    } catch (err) {
      console.warn('Error fetching daily summaries:', err);
    } finally {
      setLoadingSummaries(false);
    }
  };

  const handleRunDailySync = async () => {
    setSyncingDaily(true);
    setDailySyncResult(null);
    try {
      const res = await triggerDailyAutomatedSync();
      setDailySyncResult(res);
    } catch (err: any) {
      alert(`Daily sync simulation failed: ${err.message}`);
    } finally {
      setSyncingDaily(false);
    }
  };

  const handleStartHistoricalSeed = async () => {
    if (!confirm(`Generate ${selectedDaysCount} days of historical forecasts, check-ins, and daily summary rollups for ${targetHotelOption.toUpperCase()}?`)) {
      return;
    }

    setSeeding(true);
    setSeedResult(null);
    setSeedingProgress(null);

    try {
      const hotelsToSeed: ('novotel' | 'ibis')[] = 
        targetHotelOption === 'both' ? ['novotel', 'ibis'] : [targetHotelOption];

      const result = await seedHistoricalData({
        hotelIds: hotelsToSeed,
        daysCount: selectedDaysCount,
        onProgress: (p) => setSeedingProgress(p),
      });

      setSeedResult(result);
      if (activeSubTab === 'summaries_explorer') {
        fetchDailySummaries();
      }
    } catch (err: any) {
      alert(`Historical seeding encountered an issue: ${err.message}`);
    } finally {
      setSeeding(false);
      setSeedingProgress(null);
    }
  };

  const handleCopyWebhook = () => {
    const curlCommand = `curl -X POST "${window.location.origin}/api/ingest/opera?hotelId=both" \\\n  -H "Content-Type: text/plain" \\\n  -H "X-Opera-Api-Key: accor-night-audit-key-2026" \\\n  --data-binary @opera_daily_export.tsv`;
    navigator.clipboard.writeText(curlCommand);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Sub-Navigation */}
      <div className="flex items-center gap-2 border-b border-border pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('bulk_folder')}
          className={`px-4 py-2 rounded-xl text-xs font-mono-custom font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeSubTab === 'bulk_folder'
              ? 'bg-black text-white shadow-xs'
              : 'bg-white border border-border text-foreground hover:bg-[#F2EBE4]/60'
          }`}
        >
          <FolderUp size={14} className={activeSubTab === 'bulk_folder' ? 'text-amber-400' : 'text-accent'} />
          <span>4-Year Folder & Multi-Excel Hub</span>
        </button>

        <button
          onClick={() => setActiveSubTab('automated_sync')}
          className={`px-4 py-2 rounded-xl text-xs font-mono-custom font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeSubTab === 'automated_sync'
              ? 'bg-black text-white shadow-xs'
              : 'bg-white border border-border text-foreground hover:bg-[#F2EBE4]/60'
          }`}
        >
          <Zap size={14} className={activeSubTab === 'automated_sync' ? 'text-amber-400' : 'text-accent'} />
          <span>Automated Daily Ingestion</span>
        </button>

        <button
          onClick={() => setActiveSubTab('historical_backfill')}
          className={`px-4 py-2 rounded-xl text-xs font-mono-custom font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeSubTab === 'historical_backfill'
              ? 'bg-black text-white shadow-xs'
              : 'bg-white border border-border text-foreground hover:bg-[#F2EBE4]/60'
          }`}
        >
          <History size={14} className={activeSubTab === 'historical_backfill' ? 'text-emerald-400' : 'text-accent'} />
          <span>Historical Data Backfill</span>
        </button>

        <button
          onClick={() => setActiveSubTab('summaries_explorer')}
          className={`px-4 py-2 rounded-xl text-xs font-mono-custom font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeSubTab === 'summaries_explorer'
              ? 'bg-black text-white shadow-xs'
              : 'bg-white border border-border text-foreground hover:bg-[#F2EBE4]/60'
          }`}
        >
          <Calendar size={14} className={activeSubTab === 'summaries_explorer' ? 'text-indigo-400' : 'text-accent'} />
          <span>Historical Daily Rollups</span>
        </button>
      </div>

      {/* TAB 0: 4-Year Folder & Multi-Excel Archive Hub */}
      {activeSubTab === 'bulk_folder' && (
        <BulkFolderUploader 
          hotelId={hotelId} 
          onUploadSuccess={() => {
            fetchDailySummaries();
          }} 
        />
      )}

      {/* TAB 1: Automated Daily Sync */}
      {activeSubTab === 'automated_sync' && (
        <div className="space-y-6">
          {/* Status Banner */}
          <div className="bg-white rounded-2xl p-6 border border-border shadow-luxury">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono-custom font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                    Automated Sync Active
                  </span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="font-mono-custom text-xs font-semibold text-muted-foreground">CRON @ 05:00 AM (UTC+7)</span>
                </div>
                <h3 className="text-xl font-bold font-display text-foreground mt-2 tracking-tight">
                  Daily Night Audit Ingestion Gateway
                </h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                  Automates daily synchronization of In-House guest manifests, meal package codes (<code className="font-mono text-accent">BF</code>, <code className="font-mono text-accent">BB</code>, <code className="font-mono text-accent">HB</code>), and future meal forecast covers directly from Opera PMS.
                </p>
              </div>

              <button
                onClick={handleRunDailySync}
                disabled={syncingDaily}
                className="px-5 py-2.5 rounded-xl bg-black text-white font-mono-custom font-bold text-xs shadow-xs flex items-center gap-2 hover:bg-black/85 transition-all cursor-pointer shrink-0 disabled:opacity-50"
              >
                <Zap size={14} className="text-amber-400" />
                {syncingDaily ? 'Running Morning Sync...' : 'Trigger Daily Sync Now'}
              </button>
            </div>

            {/* Ingestion Channels */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-6 border-t border-border">
              <div className="p-3.5 rounded-xl bg-[#F2EBE4]/40 border border-border/80 space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold font-display text-foreground">
                  <Server size={14} className="text-accent" />
                  <span>Opera Cloud OHIP REST</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Connects to Oracle Hospitality Integration Platform for instantaneous reservation feeds.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F2EBE4]/40 border border-border/80 space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold font-display text-foreground">
                  <Clock size={14} className="text-accent" />
                  <span>Night Audit Scheduled Export</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Ingests daily TSV reports exported by Opera 5 end-of-day audit routine at 04:30 AM.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F2EBE4]/40 border border-border/80 space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold font-display text-foreground">
                  <Database size={14} className="text-accent" />
                  <span>Multi-Property Routing</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Automatically segments records between Novotel (HB4F8) and ibis (HB9U9).
                </p>
              </div>
            </div>
          </div>

          {/* Daily Sync Result Notice */}
          <AnimatePresence>
            {dailySyncResult && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-50 text-emerald-900 shadow-sm space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-mono-custom font-bold text-xs">
                    <CheckCircle size={16} className="text-emerald-600" />
                    <span>{dailySyncResult.message}</span>
                  </div>
                  <span className="text-[10px] font-mono-custom text-emerald-700">{new Date(dailySyncResult.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="flex gap-4 text-xs font-mono-custom text-emerald-800 pt-1">
                  <span>Rooms Synced: <strong>{dailySyncResult.roomsImported}</strong></span>
                  <span>Forecast Days: <strong>{dailySyncResult.forecastDaysImported}</strong></span>
                  <span>Source: <strong>{dailySyncResult.source}</strong></span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Webhook & SFTP Integration Guide */}
          <div className="bg-white rounded-2xl p-6 border border-border shadow-luxury space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-base font-bold font-display text-foreground">
                  Opera Automation Ingest Webhook (cURL & Scripting)
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure your hotel's Night Audit scheduler or SFTP script to POST exports directly to this endpoint.
                </p>
              </div>

              <button
                onClick={handleCopyWebhook}
                className="px-3.5 py-2 rounded-xl border border-border bg-white hover:bg-[#F2EBE4]/60 text-xs font-mono-custom font-medium flex items-center gap-2 shadow-xs transition-all cursor-pointer"
              >
                {copiedWebhook ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} className="text-accent" />}
                <span>{copiedWebhook ? 'Copied to Clipboard' : 'Copy cURL Command'}</span>
              </button>
            </div>

            <div className="bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-xs overflow-x-auto">
              <pre className="leading-relaxed">
{`# Automated Opera Night Audit Script (Cron / Webhook Ingestion)
curl -X POST "${window.location.origin}/api/ingest/opera?hotelId=both" \\
  -H "Content-Type: text/plain" \\
  -H "X-Opera-Api-Key: accor-night-audit-key-2026" \\
  --data-binary @opera_daily_export.tsv`}
              </pre>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertCircle size={14} className="text-accent shrink-0" />
              <span>Multi-property exports will be automatically parsed into Novotel Food Exchange and ibis Delhi Street schemas with real-time audit trail logs.</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Historical Data Backfill */}
      {activeSubTab === 'historical_backfill' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-border shadow-luxury space-y-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="label-mono text-accent">Analytics & Trends Engine</span>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="font-mono-custom text-xs font-semibold text-muted-foreground">Realistic Historical Generator</span>
              </div>
              <h3 className="text-xl font-bold font-display text-foreground mt-1 tracking-tight">
                Historical Data Seeder & Backfill Engine
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                Populate realistic historical dining data for past weeks and months. Generates daily forecasts, room check-in transactions across breakfast/dinner periods with authentic weekend peaks (up to 12:00 PM), and pre-computed daily summary rollups.
              </p>
            </div>

            {/* Backfill Config Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Preset Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold font-mono-custom text-foreground block">
                  Historical Time Horizon
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[30, 60, 90].map((days) => (
                    <button
                      key={days}
                      onClick={() => setSelectedDaysCount(days)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-mono-custom font-bold border transition-all text-center cursor-pointer ${
                        selectedDaysCount === days
                          ? 'bg-black text-white border-black shadow-xs'
                          : 'bg-white border-border text-foreground hover:bg-[#F2EBE4]/60'
                      }`}
                    >
                      {days} Days Past
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Hotel Option */}
              <div className="space-y-2">
                <label className="text-xs font-bold font-mono-custom text-foreground block">
                  Target Hotel Properties
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'both', label: 'Novotel & ibis' },
                    { id: 'novotel', label: 'Novotel Only' },
                    { id: 'ibis', label: 'ibis Only' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setTargetHotelOption(opt.id as any)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-mono-custom font-bold border transition-all text-center cursor-pointer ${
                        targetHotelOption === opt.id
                          ? 'bg-black text-white border-black shadow-xs'
                          : 'bg-white border-border text-foreground hover:bg-[#F2EBE4]/60'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Action Button & Progress */}
            <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-mono-custom text-muted-foreground">
                  Will generate ~{selectedDaysCount * (targetHotelOption === 'both' ? 2 : 1) * 35} check-in transactions and {selectedDaysCount} daily rollup summaries.
                </p>
              </div>

              <button
                onClick={handleStartHistoricalSeed}
                disabled={seeding}
                className="px-6 py-3 rounded-xl bg-black text-white font-mono-custom font-bold text-xs shadow-xs flex items-center gap-2 hover:bg-black/85 transition-all cursor-pointer disabled:opacity-50"
              >
                <History size={15} className="text-emerald-400" />
                {seeding ? 'Generating Historical Data...' : `Start ${selectedDaysCount}-Day Backfill`}
              </button>
            </div>

            {/* Seeding Progress Bar */}
            {seeding && seedingProgress && (
              <div className="p-4 rounded-xl bg-[#F2EBE4]/60 border border-border space-y-2">
                <div className="flex items-center justify-between text-xs font-mono-custom">
                  <span className="font-bold text-foreground">
                    Generating for {seedingProgress.hotelId.toUpperCase()} • {seedingProgress.date}
                  </span>
                  <span className="text-muted-foreground">
                    {seedingProgress.current} / {seedingProgress.total} ({Math.round((seedingProgress.current / seedingProgress.total) * 100)}%)
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-black h-2 rounded-full transition-all duration-150"
                    style={{ width: `${(seedingProgress.current / seedingProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Seed Result Banner */}
            <AnimatePresence>
              {seedResult && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-50 text-emerald-900 shadow-sm space-y-3"
                >
                  <div className="flex items-center gap-2 font-mono-custom font-bold text-sm text-emerald-800">
                    <CheckCircle size={18} className="text-emerald-600" />
                    <span>Historical Data Generation Successfully Completed!</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono-custom">
                    <div className="p-2.5 bg-white/80 rounded-xl border border-emerald-200">
                      <span className="text-muted-foreground block text-[10px]">Days Generated</span>
                      <strong className="text-sm text-foreground">{seedResult.daysGenerated} Days</strong>
                    </div>
                    <div className="p-2.5 bg-white/80 rounded-xl border border-emerald-200">
                      <span className="text-muted-foreground block text-[10px]">Check-In Transactions</span>
                      <strong className="text-sm text-foreground">{seedResult.totalCheckins}</strong>
                    </div>
                    <div className="p-2.5 bg-white/80 rounded-xl border border-emerald-200">
                      <span className="text-muted-foreground block text-[10px]">Total Covers</span>
                      <strong className="text-sm text-accent">{seedResult.totalCovers} Pax</strong>
                    </div>
                    <div className="p-2.5 bg-white/80 rounded-xl border border-emerald-200">
                      <span className="text-muted-foreground block text-[10px]">Date Range</span>
                      <strong className="text-xs text-foreground">{seedResult.startDate} → {seedResult.endDate}</strong>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => setActiveSubTab('summaries_explorer')}
                      className="inline-flex items-center gap-1.5 text-xs font-mono-custom font-bold text-emerald-800 hover:text-emerald-950 underline"
                    >
                      <span>Explore Historical Rollups</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* TAB 3: Summaries Explorer */}
      {activeSubTab === 'summaries_explorer' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 border border-border shadow-luxury flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold font-display text-foreground">
                Historical Daily Rollups ({hotelId === 'ibis' ? 'ibis' : 'Novotel'})
              </h3>
              <p className="text-xs text-muted-foreground">
                Pre-aggregated daily performance records, capture rates, and peak dining hours.
              </p>
            </div>

            <button
              onClick={fetchDailySummaries}
              disabled={loadingSummaries}
              className="px-3.5 py-2 rounded-xl border border-border bg-white text-xs font-mono-custom font-bold hover:bg-[#F2EBE4]/60 shadow-xs transition-all"
            >
              {loadingSummaries ? 'Refreshing...' : 'Refresh List'}
            </button>
          </div>

          <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-luxury">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead className="bg-[#F2EBE4]/60 border-b border-border text-[10px] font-mono-custom font-bold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Forecast</th>
                    <th className="px-4 py-3">Breakfast Actual</th>
                    <th className="px-4 py-3">Dinner Actual</th>
                    <th className="px-4 py-3">Total Covers</th>
                    <th className="px-4 py-3">Capture Rate</th>
                    <th className="px-4 py-3">VIP Pax</th>
                    <th className="px-4 py-3">Peak Hour</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loadingSummaries ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-xs font-mono-custom text-muted-foreground">
                        Loading daily summary rollups...
                      </td>
                    </tr>
                  ) : summaries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-xs font-mono-custom text-muted-foreground">
                        No historical daily summaries found. Use the <strong>Historical Data Backfill</strong> tab to generate them.
                      </td>
                    </tr>
                  ) : (
                    summaries.map((summary) => (
                      <tr key={summary.date} className="hover:bg-[#F2EBE4]/30 transition-colors">
                        <td className="px-4 py-3 font-mono-custom font-bold text-foreground">
                          {summary.date}
                        </td>
                        <td className="px-4 py-3 font-mono-custom text-muted-foreground">
                          {summary.forecastCovers}
                        </td>
                        <td className="px-4 py-3 font-mono-custom font-bold text-accent">
                          {summary.totalBreakfastPax}
                        </td>
                        <td className="px-4 py-3 font-mono-custom text-indigo-700">
                          {summary.totalDinnerPax}
                        </td>
                        <td className="px-4 py-3 font-mono-custom font-bold text-foreground">
                          {summary.totalCovers}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-mono-custom font-bold ${
                            summary.captureRatePercent >= 90 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : summary.captureRatePercent >= 75
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {summary.captureRatePercent}%
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono-custom text-foreground">
                          {summary.vipPax > 0 ? `${summary.vipPax} Pax` : '—'}
                        </td>
                        <td className="px-4 py-3 font-mono-custom font-bold text-foreground">
                          {summary.peakHour || '08:00'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
