import React, { useState, useRef } from 'react';
import { 
  FolderUp, 
  FileSpreadsheet, 
  FolderTree, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  Database, 
  Download, 
  ArrowRight, 
  Layers, 
  RefreshCw,
  Zap,
  Building,
  Trash2,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DiscoveredFile, 
  FolderScanHierarchy, 
  BulkUploadProgress, 
  BulkUploadResult,
  getFilesFromDataTransferItems, 
  getFilesFromFileInput, 
  analyzeDiscoveredHierarchy, 
  processBulkHistoricalFiles,
  downloadSample4YearTemplate,
  formatBytes
} from '../lib/excelFolderParser';

interface BulkFolderUploaderProps {
  hotelId: string;
  onUploadSuccess?: () => void;
}

export const BulkFolderUploader: React.FC<BulkFolderUploaderProps> = ({ hotelId, onUploadSuccess }) => {
  const [dragActive, setDragActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [hierarchy, setHierarchy] = useState<FolderScanHierarchy | null>(null);
  
  // Execution state
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<BulkUploadProgress | null>(null);
  const [result, setResult] = useState<BulkUploadResult | null>(null);
  const [selectedPropertyOverride, setSelectedPropertyOverride] = useState<'both' | 'novotel' | 'ibis'>('both');

  const folderInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);

  // Handle Drag & Drop with recursive directory traversal
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setScanning(true);
      setResult(null);
      try {
        const files = await getFilesFromDataTransferItems(e.dataTransfer.items);
        if (files.length > 0) {
          const analyzed = analyzeDiscoveredHierarchy(files);
          setHierarchy(analyzed);
        } else {
          alert('No supported Excel (.xlsx, .xls) or TSV/CSV files found in the dropped folder.');
        }
      } catch (err: any) {
        alert(`Error scanning folder: ${err.message}`);
      } finally {
        setScanning(false);
      }
    }
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setScanning(true);
      setResult(null);
      try {
        const files = getFilesFromFileInput(e.target.files);
        if (files.length > 0) {
          const analyzed = analyzeDiscoveredHierarchy(files);
          setHierarchy(analyzed);
        } else {
          alert('No supported Excel (.xlsx, .xls) or TSV/CSV files found in the selected folder.');
        }
      } catch (err: any) {
        alert(`Error processing folder: ${err.message}`);
      } finally {
        setScanning(false);
      }
    }
  };

  const handleFilesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setScanning(true);
      setResult(null);
      try {
        const files = getFilesFromFileInput(e.target.files);
        if (files.length > 0) {
          const analyzed = analyzeDiscoveredHierarchy(files);
          setHierarchy(analyzed);
        }
      } catch (err: any) {
        alert(`Error processing files: ${err.message}`);
      } finally {
        setScanning(false);
      }
    }
  };

  const handleStartIngestion = async () => {
    if (!hierarchy || hierarchy.files.length === 0) return;

    setUploading(true);
    setResult(null);
    setProgress(null);

    try {
      const res = await processBulkHistoricalFiles(
        hierarchy.files,
        selectedPropertyOverride,
        (p) => setProgress(p)
      );
      setResult(res);
      if (onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (err: any) {
      alert(`Bulk ingestion failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleClearHierarchy = () => {
    setHierarchy(null);
    setResult(null);
    setProgress(null);
    if (folderInputRef.current) folderInputRef.current.value = '';
    if (filesInputRef.current) filesInputRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Template Download */}
      <div className="bg-white rounded-2xl p-6 border border-border shadow-luxury">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="label-mono text-accent">High-Volume Historical Archive Hub</span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="font-mono-custom text-xs font-semibold text-muted-foreground">Multi-Folder & Multi-Sheet</span>
            </div>
            <h3 className="text-xl font-bold font-display text-foreground mt-1 tracking-tight">
              4-Year Historical Archive & Multi-Excel Ingestion
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              Upload multi-year archives (e.g. 2023–2026) containing nested folders, multiple Excel workbooks (<code className="font-mono text-accent">.xlsx</code>, <code className="font-mono text-accent">.xls</code>), and multi-tab operational ledgers for Novotel & ibis.
            </p>
          </div>

          <button
            onClick={downloadSample4YearTemplate}
            className="px-4 py-2.5 rounded-xl border border-border bg-white hover:bg-[#F2EBE4]/60 text-foreground font-mono-custom font-bold text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer shrink-0"
          >
            <Download size={14} className="text-accent" />
            <span>Download 4-Year Excel Template</span>
          </button>
        </div>
      </div>

      {/* Upload Zone (Drag & Drop + Buttons) */}
      {!hierarchy && (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`p-10 rounded-2xl border-2 border-dashed transition-all text-center space-y-5 bg-white shadow-luxury ${
            dragActive ? 'border-accent bg-accent/5 scale-[0.99]' : 'border-border hover:border-accent/40'
          }`}
        >
          <div className="w-16 h-16 rounded-2xl bg-[#F2EBE4] text-accent mx-auto flex items-center justify-center shadow-xs">
            <FolderUp size={30} />
          </div>

          <div className="space-y-1 max-w-md mx-auto">
            <h4 className="text-lg font-bold font-display text-foreground">
              Drop 4-Year Historical Archive Folder Here
            </h4>
            <p className="text-xs text-muted-foreground">
              Drop a master folder containing subfolders (e.g., <code className="font-mono">2023/</code>, <code className="font-mono">2024/</code>, <code className="font-mono">2025/</code>, <code className="font-mono">2026/</code>) and all Excel spreadsheets.
            </p>
          </div>

          {/* Hidden inputs for folder and multiple files */}
          <input
            ref={folderInputRef}
            type="file"
            /* @ts-ignore */
            webkitdirectory="true"
            directory="true"
            multiple
            onChange={handleFolderSelect}
            className="hidden"
          />
          <input
            ref={filesInputRef}
            type="file"
            multiple
            accept=".xlsx,.xls,.csv,.tsv,.txt"
            onChange={handleFilesSelect}
            className="hidden"
          />

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => folderInputRef.current?.click()}
              disabled={scanning}
              className="px-5 py-2.5 rounded-xl bg-black text-white font-mono-custom font-bold text-xs shadow-xs flex items-center gap-2 hover:bg-black/85 transition-all cursor-pointer disabled:opacity-50"
            >
              <FolderTree size={15} className="text-amber-400" />
              <span>Select Archive Folder (With Subfolders)</span>
            </button>

            <button
              onClick={() => filesInputRef.current?.click()}
              disabled={scanning}
              className="px-5 py-2.5 rounded-xl bg-white border border-border hover:bg-[#F2EBE4]/60 text-foreground font-mono-custom font-bold text-xs shadow-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <FileSpreadsheet size={15} className="text-accent" />
              <span>Select Multiple Excel Files</span>
            </button>
          </div>

          {scanning && (
            <div className="text-xs font-mono-custom text-accent animate-pulse font-bold">
              Scanning directory structure and Excel workbooks...
            </div>
          )}
        </div>
      )}

      {/* Discovered Archive Hierarchy Preview */}
      {hierarchy && !uploading && !result && (
        <div className="bg-white rounded-2xl p-6 border border-border shadow-luxury space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono-custom font-bold uppercase bg-blue-100 text-blue-800">
                  <FolderTree size={12} />
                  Archive Scanned
                </span>
                <span className="text-xs text-muted-foreground font-mono-custom">
                  {hierarchy.totalFiles} Files Discovered • {hierarchy.totalSizeFormatted}
                </span>
              </div>
              <h4 className="text-lg font-bold font-display text-foreground mt-1">
                Historical Archive Structure Ready for Ingestion
              </h4>
            </div>

            <button
              onClick={handleClearHierarchy}
              className="px-3.5 py-1.5 rounded-xl border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 text-xs font-mono-custom font-bold flex items-center gap-1.5 transition-all cursor-pointer self-start"
            >
              <Trash2 size={13} />
              <span>Clear & Rescan</span>
            </button>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-[#F2EBE4]/40 border border-border/80">
              <span className="text-[10px] font-mono-custom uppercase font-bold text-muted-foreground block">
                Excel Workbooks
              </span>
              <strong className="text-xl font-bold font-display text-foreground mt-0.5 block">
                {hierarchy.excelFilesCount} Files
              </strong>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F2EBE4]/40 border border-border/80">
              <span className="text-[10px] font-mono-custom uppercase font-bold text-muted-foreground block">
                Years Detected
              </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {hierarchy.yearsDetected.length > 0 ? (
                  hierarchy.yearsDetected.map((yr) => (
                    <span key={yr} className="px-1.5 py-0.5 rounded bg-black text-white font-mono-custom text-[11px] font-bold">
                      {yr}
                    </span>
                  ))
                ) : (
                  <span className="font-mono-custom text-xs font-bold text-muted-foreground">Auto-Index</span>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F2EBE4]/40 border border-border/80">
              <span className="text-[10px] font-mono-custom uppercase font-bold text-muted-foreground block">
                Subfolders Found
              </span>
              <strong className="text-xl font-bold font-display text-foreground mt-0.5 block">
                {hierarchy.folders.length} Folders
              </strong>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F2EBE4]/40 border border-border/80">
              <span className="text-[10px] font-mono-custom uppercase font-bold text-muted-foreground block">
                Target Properties
              </span>
              <div className="flex items-center gap-1 mt-1">
                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono-custom text-[10px] font-bold">
                  Novotel & ibis
                </span>
              </div>
            </div>
          </div>

          {/* Properties Override Selector */}
          <div className="p-4 rounded-xl bg-[#F2EBE4]/60 border border-border space-y-2">
            <label className="text-xs font-bold font-mono-custom text-foreground block">
              Property Assignment Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { id: 'both', label: 'Auto-Detect (Novotel & ibis by sheet/path)' },
                { id: 'novotel', label: 'Route all to Novotel Food Exchange' },
                { id: 'ibis', label: 'Route all to ibis Delhi Street' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setSelectedPropertyOverride(opt.id as any)}
                  className={`py-2 px-3 rounded-xl text-xs font-mono-custom font-bold border transition-all text-left cursor-pointer ${
                    selectedPropertyOverride === opt.id
                      ? 'bg-black text-white border-black shadow-xs'
                      : 'bg-white border-border text-foreground hover:bg-[#F2EBE4]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Discovered Files Sample List */}
          <div className="space-y-2">
            <span className="text-xs font-bold font-mono-custom text-foreground block">
              Discovered Archive Files Sample ({hierarchy.files.length} total)
            </span>
            <div className="max-h-48 overflow-y-auto border border-border rounded-xl divide-y divide-border bg-[#F2EBE4]/20 text-xs font-mono-custom">
              {hierarchy.files.slice(0, 15).map((f, idx) => (
                <div key={idx} className="p-2.5 flex items-center justify-between hover:bg-white/80 transition-colors">
                  <div className="flex items-center gap-2 truncate">
                    <FileSpreadsheet size={14} className="text-accent shrink-0" />
                    <span className="font-semibold text-foreground truncate">{f.relativePath}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-[11px] text-muted-foreground">
                    {f.year && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-bold">
                        {f.year}
                      </span>
                    )}
                    <span>{formatBytes(f.size)}</span>
                  </div>
                </div>
              ))}
              {hierarchy.files.length > 15 && (
                <div className="p-2.5 text-center text-xs font-mono-custom text-muted-foreground bg-white/40">
                  + {hierarchy.files.length - 15} more files will be processed in sequence
                </div>
              )}
            </div>
          </div>

          {/* Launch Ingestion Button */}
          <div className="pt-4 border-t border-border flex items-center justify-end">
            <button
              onClick={handleStartIngestion}
              className="px-7 py-3.5 rounded-xl bg-black text-white font-mono-custom font-bold text-xs shadow-xs flex items-center gap-2 hover:bg-black/85 transition-all cursor-pointer"
            >
              <Zap size={16} className="text-amber-400" />
              <span>Start 4-Year Bulk Ingestion ({hierarchy.totalFiles} Files)</span>
            </button>
          </div>
        </div>
      )}

      {/* Live Ingestion Progress Monitor */}
      {uploading && progress && (
        <div className="bg-white rounded-2xl p-6 border border-border shadow-luxury space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                <span className="font-mono-custom text-xs font-bold uppercase text-amber-700">
                  {progress.stage === 'committing' ? 'Committing Batches to Database...' : 'Processing Excel Worksheets...'}
                </span>
              </div>
              <h4 className="text-lg font-bold font-display text-foreground mt-1 truncate max-w-xl">
                {progress.currentFileName}
              </h4>
            </div>

            <span className="text-2xl font-bold font-mono-custom text-foreground">
              {progress.percent}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
            <div 
              className="bg-black h-2.5 rounded-full transition-all duration-150"
              style={{ width: `${progress.percent}%` }}
            />
          </div>

          {/* Live Extracted Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono-custom">
            <div className="p-3 bg-[#F2EBE4]/60 rounded-xl border border-border">
              <span className="text-muted-foreground block text-[10px]">Daily Rollups Extracted</span>
              <strong className="text-base text-accent">{progress.recordsExtracted.dailySummaries} Days</strong>
            </div>
            <div className="p-3 bg-[#F2EBE4]/60 rounded-xl border border-border">
              <span className="text-muted-foreground block text-[10px]">Forecast Records</span>
              <strong className="text-base text-foreground">{progress.recordsExtracted.forecasts}</strong>
            </div>
            <div className="p-3 bg-[#F2EBE4]/60 rounded-xl border border-border">
              <span className="text-muted-foreground block text-[10px]">Files Processed</span>
              <strong className="text-base text-foreground">{progress.currentFileIndex} / {progress.totalFiles}</strong>
            </div>
            <div className="p-3 bg-[#F2EBE4]/60 rounded-xl border border-border">
              <span className="text-muted-foreground block text-[10px]">Years Active</span>
              <div className="flex gap-1 mt-0.5">
                {progress.yearsCovered.map((yr) => (
                  <span key={yr} className="px-1 py-0.2 rounded bg-black text-white text-[10px] font-bold">
                    {yr}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Completion & Success Summary */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="bg-emerald-50 border border-emerald-500/40 rounded-2xl p-6 text-emerald-950 shadow-luxury space-y-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <CheckCircle size={22} />
                </div>
                <div>
                  <h4 className="text-lg font-bold font-display text-emerald-900">
                    4-Year Historical Ingestion Successfully Completed!
                  </h4>
                  <p className="text-xs text-emerald-700 font-mono-custom mt-0.5">
                    Time Elapsed: {(result.timeElapsedMs / 1000).toFixed(1)}s • Years Covered: {result.yearsCovered.join(', ')}
                  </p>
                </div>
              </div>

              <button
                onClick={handleClearHierarchy}
                className="px-4 py-2 rounded-xl bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100 text-xs font-mono-custom font-bold shadow-xs transition-all cursor-pointer"
              >
                Upload Another Archive
              </button>
            </div>

            {/* Ingestion Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono-custom">
              <div className="p-3 bg-white/90 rounded-xl border border-emerald-200">
                <span className="text-muted-foreground block text-[10px]">Files & Worksheets</span>
                <strong className="text-sm text-foreground">{result.totalFilesProcessed} files ({result.totalSheetsParsed} sheets)</strong>
              </div>

              <div className="p-3 bg-white/90 rounded-xl border border-emerald-200">
                <span className="text-muted-foreground block text-[10px]">Daily Rollups Generated</span>
                <strong className="text-sm text-accent">{result.dailySummariesCreated} Days</strong>
              </div>

              <div className="p-3 bg-white/90 rounded-xl border border-emerald-200">
                <span className="text-muted-foreground block text-[10px]">Forecast Days</span>
                <strong className="text-sm text-foreground">{result.forecastsCreated} Days</strong>
              </div>

              <div className="p-3 bg-white/90 rounded-xl border border-emerald-200">
                <span className="text-muted-foreground block text-[10px]">Timeline Range</span>
                <strong className="text-xs text-foreground">{result.dateRange.start} → {result.dateRange.end}</strong>
              </div>
            </div>

            {/* Errors if any */}
            {result.errors.length > 0 && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-300 text-amber-900 text-xs font-mono-custom space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle size={14} className="text-amber-600" />
                  <span>{result.errors.length} files or sheets contained non-fatal warnings (skipped safely):</span>
                </div>
                <ul className="list-disc pl-5 max-h-24 overflow-y-auto text-[11px] text-amber-800">
                  {result.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
