import { useState, useEffect } from 'react';
import { Layout, Copy, Wand2, CheckCircle, ArrowRight, RefreshCw, FolderSearch, Cloud, Sparkles, KeyRound, Trash2, Info, FileMinus, FilePlus, FolderOpen, Eye, Edit2, Check, X, Folder, ArrowUpLeft, File } from 'lucide-react';

interface Stats {
  totalFiles: number;
  totalSize: number;
  pendingItems: number;
  duplicates: number;
  proposals: number;
  archives: number;
}

interface ReviewItem {
  id: string;
  type: string;
  action: string;
  status: string;
  risk: string;
  subjectPath: string;
  proposedPath?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evidence: any;
}

interface Health {
  ok: boolean;
  ai: {
    available: boolean;
    model: string;
    reason: string;
  };
  managedRoots: string[];
}

function App() {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7>(1);
  const [directory, setDirectory] = useState<string>('');
  const [health, setHealth] = useState<Health | null>(null);
  const [scanning, setScanning] = useState(false);
  const [checkingAi, setCheckingAi] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordFile, setPasswordFile] = useState("");
  const [pdfPassword, setPdfPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [skippedPasswordFiles, setSkippedPasswordFiles] = useState<string[]>([]);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0, file: "", status: "idle", error: "" });
  
  const [stats, setStats] = useState<Stats | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [applying, setApplying] = useState(false);
  const [proposalFilter, setProposalFilter] = useState<'all' | 'move' | 'rename'>('all');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [lastApplyResult, setLastApplyResult] = useState<{ applied?: unknown[]; errors?: { message: string }[] } | null>(null);

  const [aiExclusions, setAiExclusions] = useState<{ exclusions: string[], reasoning: string } | null>(null);
  const [aiReasoning, setAiReasoning] = useState<Record<string, string>>({});
  const [selectedDuplicates, setSelectedDuplicates] = useState<string[]>([]);
  const [browsePath, setBrowsePath] = useState<string>("");
  const [browseEntries, setBrowseEntries] = useState<{ name: string; path: string; isDirectory: boolean }[]>([]);
  const [isBrowseRoot, setIsBrowseRoot] = useState(true);
  const [showPickerModal, setShowPickerModal] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);

  const fetchDirectoryListing = async (pathStr: string) => {
    try {
      const res = await fetch(`/api/browse-directory?path=${encodeURIComponent(pathStr)}`);
      if (res.ok) {
        const data = await res.json();
        setBrowsePath(data.currentPath);
        setBrowseEntries(data.entries || []);
        setIsBrowseRoot(data.isRoot);
      }
    } catch (e) {
      console.error("Failed to browse directory", e);
    }
  };

  const openDirectoryPicker = () => {
    // Populate selection paths from the current input string (split by comma)
    const paths = directory
      .split(",")
      .map(p => p.trim())
      .filter(Boolean);
    setSelectedPaths(paths);
    fetchDirectoryListing("");
    setShowPickerModal(true);
  };

  const togglePathSelection = (pathStr: string) => {
    setSelectedPaths(prev =>
      prev.includes(pathStr)
        ? prev.filter(p => p !== pathStr)
        : [...prev, pathStr]
    );
  };

  const selectBrowsedDirectory = (selectedPath: string) => {
    setDirectory(selectedPath);
    setShowPickerModal(false);
  };

  const confirmSelection = () => {
    setDirectory(selectedPaths.join(", "));
    setShowPickerModal(false);
  };

  const openFileLocally = async (filePath: string | undefined) => {
    if (!filePath) return;
    try {
      const res = await fetch(`/api/open-file?path=${encodeURIComponent(filePath)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'File is outside the approved managed roots.');
      }
    } catch {
      console.error("Failed to open file");
    }
  };

  const fetchData = async () => {
    try {
      const statsRes = await fetch('/api/overview');
      const statsData = await statsRes.json();
      setStats(statsData);

      const itemsRes = await fetch('/api/items');
      const itemsData = await itemsRes.json();
      setItems(itemsData);
    } catch {
      console.error('Failed to fetch data');
    }
  };

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealth(data);
      if (!directory && data.managedRoots?.[0]) {
        setDirectory(data.managedRoots[0]);
      }
    } catch {
      console.error('Failed to fetch health status');
    }
  };

  const recheckAi = async () => {
    setCheckingAi(true);
    try {
      const res = await fetch('/api/ai/recheck', { method: 'POST' });
      const data = await res.json();
      if (data.ai) {
        setHealth(prev => prev ? { ...prev, ai: data.ai } : null);
      }
    } catch (e) {
      console.error("Failed to recheck AI status", e);
    } finally {
      setCheckingAi(false);
    }
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (scanning && step === 2) {
      interval = setInterval(async () => {
        try {
          const res = await fetch('/api/scan/progress');
          const data = await res.json();
          setScanProgress(data);
          
          if (data.status === "complete") {
             setScanning(false);
             await fetchData();
             // Fetch AI exclusions
             const exRes = await fetch('/api/ai/exclusions', { method: 'POST' });
             if (exRes.ok) {
               setAiExclusions(await exRes.json());
             }
             setStep(3);
          } else if (data.status === "needs_password") {
             setScanning(false);
             setNeedsPassword(true);
             setPasswordFile(data.passwordFile || "Unknown File");
             setPasswordError("");
          } else if (data.status === "failed") {
             setScanning(false);
             alert(`Scan failed: ${data.error}`);
             setStep(1);
          }
        } catch {
          // ignore
        }
      }, 500);
    }
    return () => clearInterval(interval);
  }, [scanning, step]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchHealth().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step > 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchData().catch(console.error);
    }
  }, [step]);



  const startScan = async (currentSkipped = skippedPasswordFiles) => {
    if (!directory.trim()) {
      alert('Enter an approved directory path before scanning.');
      return;
    }

    setScanning(true);
    setScanProgress({ current: 0, total: 0, file: "", status: "running", error: "" });
    setStep(2);
    try {
      const res = await fetch('/api/scan/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory, skippedFiles: currentSkipped })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Scan initiation failed');
        setStep(1);
        setScanning(false);
      }
    } catch {
      alert('Scan initiation failed');
      setStep(1);
      setScanning(false);
    }
  };

  const submitPassword = async () => {
    if (!pdfPassword) return;
    try {
      const res = await fetch('/api/add-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pdfPassword, filePath: passwordFile })
      });
      const data = await res.json();
      
      if (!data.success) {
         setPasswordError(data.error || "Incorrect password");
         return;
      }
      
      setNeedsPassword(false);
      setPasswordError("");
      setPdfPassword("");
      startScan();
    } catch {
      console.error("Server error verifying password");
      setPasswordError("Server error verifying password");
    }
  };

  const skipPassword = () => {
    const newSkipped = [...skippedPasswordFiles, passwordFile];
    setSkippedPasswordFiles(newSkipped);
    setNeedsPassword(false);
    setPasswordError("");
    setPdfPassword("");
    startScan(newSkipped);
  };

  const approveItem = async (id: string, updatedItem?: ReviewItem) => {
    await fetch(`/api/items/${encodeURIComponent(id)}/approve`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: updatedItem ? JSON.stringify({ evidence: updatedItem.evidence, proposedPath: updatedItem.proposedPath }) : undefined
    });
    fetchData();
  };

  const rejectItem = async (id: string) => {
    await fetch(`/api/items/${encodeURIComponent(id)}/reject`, { method: 'POST' });
    fetchData();
  };

  const handleBulkApprove = async () => {
    try {
      await Promise.all(selectedDuplicates.map(id => 
        fetch(`/api/items/${encodeURIComponent(id)}/approve`, { method: 'POST' })
      ));
      setSelectedDuplicates([]);
      fetchData();
    } catch (e) {
      console.error("Bulk approve failed", e);
    }
  };

  const handleBulkReject = async () => {
    try {
      await Promise.all(selectedDuplicates.map(id => 
        fetch(`/api/items/${encodeURIComponent(id)}/reject`, { method: 'POST' })
      ));
      setSelectedDuplicates([]);
      fetchData();
    } catch (e) {
      console.error("Bulk reject failed", e);
    }
  };

  const handleSaveEdit = async (id: string) => {
    if (!editingName.trim()) return;
    
    // Optimistically update the UI
    setItems(prev => prev.map(i => {
      if (i.id === id) {
        return {
          ...i,
          proposedPath: i.proposedPath?.replace(/[^\\/]+$/, editingName),
          evidence: { ...i.evidence, proposedName: editingName }
        };
      }
      return i;
    }));
    
    setEditingItemId(null);
    setEditingName("");
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setEditingName("");
  };

  const getAiReasoning = async (item: ReviewItem) => {
    if (aiReasoning[item.id]) return; // Use cache

    try {
      setAiReasoning(prev => ({ ...prev, [item.id]: 'Thinking...' }));
      const res = await fetch('/api/ai/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileInfo: item.evidence, subjectPath: item.subjectPath })
      });
      const data = await res.json();
      
      let explanation = data.reasoning;
      if (data.error === "AI unavailable" || data.degraded) {
        explanation = "Ollama is offline. Proposed name using deterministic category heuristics.";
      }
      setAiReasoning(prev => ({ ...prev, [item.id]: explanation || data.error || 'AI reasoning is unavailable.' }));

      // If the AI actually proposed a new name, update the local item state!
      if (data.proposedName && item.action === 'rename_file') {
         setItems(prevItems => prevItems.map(i => {
           if (i.id === item.id) {
             return {
               ...i,
               proposedPath: i.proposedPath?.replace(/[^\\/]+$/, data.proposedName),
               evidence: { ...i.evidence, proposedName: data.proposedName }
             };
           }
           return i;
         }));
      }

    } catch {
      setAiReasoning(prev => ({ ...prev, [item.id]: 'Failed to get AI reasoning.' }));
    }
  };

  const cancelScan = async () => {
    try {
      await fetch('/api/scan/cancel', { method: 'POST' });
      setScanning(false);
      setStep(1);
    } catch {
      console.error("Failed to cancel scan");
    }
  };

  const rollbackChanges = async () => {
    if (!window.confirm("Are you sure you want to rollback all applied changes? This will move files back to their original locations.")) {
      return;
    }
    try {
      const res = await fetch('/api/rollback', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.errors?.length) {
        alert("Rollback completed with some errors.");
      } else {
        alert(`Successfully rolled back ${data.rolledBack?.length ?? 0} actions.`);
      }
      await fetchData();
      setStep(1);
    } catch {
      alert("Failed to rollback changes");
    }
  };

  const applyChanges = async () => {
    setApplying(true);
    try {
      const res = await fetch('/api/apply', { method: 'POST' });
      const data = await res.json();
      setLastApplyResult(data);
      if (!res.ok || data.errors?.length) {
        alert(`Applied with ${data.errors?.length ?? 1} error(s). Review the summary before continuing.`);
      }
      await fetchData();
      setStep(6);
    } catch {
      alert('Failed to apply changes');
    } finally {
      setApplying(false);
    }
  };

  const isFolderClean = stats && stats.pendingItems === 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans">
      {/* Sidebar Wizard Navigation */}
      <div className="w-72 border-r border-slate-800 p-6 flex flex-col gap-8 bg-slate-900/50">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 bg-sky-500 rounded rotate-45 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Layout className="-rotate-45 w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight">Nyx AI</span>
        </div>

        <nav className="flex flex-col gap-2">
          {[
            { s: 1, label: '1. Select Directory', icon: FolderSearch },
            { s: 2, label: '2. AI Analysis', icon: RefreshCw },
            { s: 3, label: '3. AI Exclusions', icon: Sparkles },
            { s: 4, label: `4. Duplicates (${stats?.duplicates ?? 0})`, icon: Copy },
            { s: 5, label: `5. Organization (${stats?.proposals ?? 0})`, icon: Wand2 },
            { s: 6, label: '6. Summary', icon: CheckCircle },
            { s: 7, label: '7. Cloud Backup', icon: Cloud }
          ].map(({ s, label, icon: Icon }) => (
            <button 
              key={s}
              onClick={() => { if(stats || s === 1) setStep(s as 1 | 2 | 3 | 4 | 5 | 6 | 7) }}
              disabled={!stats && s > 2}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left font-medium ${step === s ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-inner' : 'hover:bg-slate-800 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed'}`}
            >
              <Icon className={`w-5 h-5 ${step === s && s === 2 && scanning ? 'animate-spin' : ''}`} /> 
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-10 overflow-y-auto relative bg-gradient-to-br from-slate-950 to-slate-900">
        {step === 1 && (
          <div className="max-w-2xl mx-auto mt-20 flex flex-col gap-6">
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-4 tracking-tight">What would you like to organize?</h1>
              <p className="text-slate-400 text-lg">Enter an approved managed directory. Nyx will refuse paths outside the engagement scope.</p>
            </div>
            
            <div className="bg-slate-900/80 border border-slate-800 p-8 rounded-2xl shadow-xl backdrop-blur-sm mt-4">
              <label className="block text-sm font-semibold text-slate-400 mb-2">TARGET DIRECTORY</label>
              <div className="flex gap-3">
                <input 
                  type="text" 
                  value={directory} 
                  onChange={(e) => setDirectory(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all font-mono text-sm"
                  placeholder="C:\Path\To\Your\Files"
                />
                <button 
                  onClick={openDirectoryPicker}
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-700 px-5 py-3 rounded-xl font-semibold transition-all flex items-center gap-2"
                >
                  <FolderOpen className="w-4 h-4" /> Browse
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                <div className={`rounded-xl border px-4 py-3 text-sm flex items-center justify-between gap-3 ${health?.ai?.available ? 'border-green-500/20 bg-green-500/10 text-green-300' : 'border-amber-500/20 bg-amber-500/10 text-amber-300'}`}>
                  <div>
                    <span className="font-semibold">AI status:</span>{' '}
                    {health?.ai?.available
                      ? `Ready (${health.ai.model})`
                      : `Deterministic mode${health?.ai?.reason ? ` - ${health.ai.reason}` : ''}`}
                  </div>
                  {!health?.ai?.available && (
                    <button
                      onClick={recheckAi}
                      disabled={checkingAi}
                      className="text-xs bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800 text-white px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 shrink-0"
                    >
                      {checkingAi ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          Recheck
                        </>
                      )}
                    </button>
                  )}
                </div>

                {health?.managedRoots?.length ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Approved Roots</div>
                    <div className="flex flex-col gap-1">
                      {health.managedRoots.map(root => (
                        <button
                          key={root}
                          onClick={() => setDirectory(root)}
                          className="text-left text-xs font-mono text-slate-400 hover:text-sky-400 transition-colors break-all"
                        >
                          {root}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              
              <button 
                onClick={() => startScan()}
                className="w-full mt-6 bg-sky-600 hover:bg-sky-500 text-white py-4 rounded-xl font-bold transition-all shadow-lg shadow-sky-900/30 flex items-center justify-center gap-2"
              >
                <Sparkles className="w-5 h-5" /> Analyze with AI
              </button>
              
              <button 
                onClick={rollbackChanges}
                className="w-full mt-3 bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Rollback Last Session
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            {needsPassword ? (
              <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
                 <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center border border-amber-500/50 mx-auto mb-6">
                    <KeyRound className="w-8 h-8 text-amber-400" />
                 </div>
                 <h2 className="text-2xl font-bold mb-2">Password Required</h2>
                 <p className="text-slate-400 mb-2">Nyx encountered a password-protected PDF during extraction:</p>
                 <p className="text-sky-400 font-mono text-sm mb-6 break-all bg-slate-950 p-3 rounded-lg border border-slate-800" title={passwordFile}>{passwordFile.split('\\').pop()}</p>
                 <input 
                   type="password" 
                   value={pdfPassword}
                   onChange={e => setPdfPassword(e.target.value)}
                   className={`w-full bg-slate-950 border ${passwordError ? 'border-rose-500 focus:ring-rose-500' : 'border-slate-700 focus:border-amber-500 focus:ring-amber-500'} rounded-xl px-4 py-3 text-center text-xl tracking-widest focus:outline-none focus:ring-1 mb-2`}
                   placeholder="••••••••"
                 />
                 {passwordError && <p className="text-rose-500 text-sm font-bold mb-4">{passwordError}</p>}
                 <div className="flex gap-4 mt-2">
                   <button onClick={submitPassword} className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-xl transition-all text-sm">
                     Save & Continue
                   </button>
                   <button onClick={skipPassword} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl transition-all border border-slate-700 text-sm">
                     Skip & Continue
                   </button>
                 </div>
                 <p className="text-xs text-slate-500 mt-4">Passwords are securely stored in your local configuration file and never sent to the cloud.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center max-w-md w-full text-center gap-6">
                <div className="relative mb-4">
                  <div className="absolute inset-0 bg-sky-500/20 blur-xl rounded-full"></div>
                  <RefreshCw className="w-16 h-16 animate-spin text-sky-500 relative z-10" />
                </div>
                <h2 className="text-3xl font-bold tracking-tight">Analyzing Directory...</h2>
                <p className="text-slate-400 text-lg mb-2">Nyx is currently fingerprinting files and extracting semantic context.</p>
                
                {scanProgress.status === "discovering" && (
                  <div className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-inner">
                    <div className="flex justify-between text-xs font-bold text-amber-400 mb-2 uppercase tracking-widest">
                      <span>Discovering & AI Reasoning</span>
                      <span>{scanProgress.current} Folders</span>
                    </div>
                    <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                      <div className="bg-amber-500 h-2 rounded-full w-full animate-pulse"></div>
                    </div>
                    <p className="text-xs font-mono text-slate-500 mt-3 truncate text-left" title={scanProgress.file}>
                      ...\{scanProgress.file?.split('\\').slice(-2).join('\\')}
                    </p>
                  </div>
                )}
                
                {scanProgress.status === "running" && scanProgress.total > 0 && (
                  <div className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-inner">
                    <div className="flex justify-between text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest">
                      <span>Scanning & Fingerprinting</span>
                      <span>{Math.round((scanProgress.current / scanProgress.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                      <div 
                        className="bg-sky-500 h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}
                      ></div>
                    </div>
                    <p className="text-xs font-mono text-slate-500 mt-3 whitespace-normal break-all text-left" title={scanProgress.file}>
                      {scanProgress.file}
                    </p>
                  </div>
                )}
                <button
                  onClick={cancelScan}
                  className="mt-6 px-6 py-2 rounded-xl font-bold transition-all bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                >
                  Cancel Scan
                </button>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-6 max-w-5xl mx-auto">
            <header className="flex justify-between items-end border-b border-slate-800 pb-6">
              <div>
                <h1 className="text-4xl font-bold flex items-center gap-3 tracking-tight"><Sparkles className="text-amber-400 w-8 h-8"/> AI Exclusions Review</h1>
                <p className="text-slate-400 mt-2 text-lg">Nyx AI has identified directories that should be skipped. Uncheck any you want to scan.</p>
              </div>
              <button onClick={() => setStep(4)} className="bg-white text-slate-950 font-bold px-6 py-3 rounded-xl flex items-center gap-2 hover:bg-slate-200 transition-all shadow-lg">
                Continue <ArrowRight className="w-4 h-4"/>
              </button>
            </header>

            {aiExclusions ? (
              <div className="flex flex-col gap-6">
                {isFolderClean && (
                   <div className="bg-sky-500/10 border border-sky-500/20 p-6 rounded-2xl flex items-center gap-4 shadow-lg shadow-sky-500/5 animate-in fade-in slide-in-from-top-4 duration-700">
                      <div className="w-12 h-12 bg-sky-500/20 rounded-full flex items-center justify-center border border-sky-500/50">
                        <Info className="w-6 h-6 text-sky-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sky-400 text-lg">AI Observation: This folder already looks organized!</h3>
                        <p className="text-slate-400">Nyx found no duplicates and no further organizational improvements needed for the remaining files.</p>
                      </div>
                   </div>
                )}

                <div className="bg-slate-900/80 border border-slate-800 p-8 rounded-2xl shadow-xl">
                  <h3 className="font-semibold text-xl text-amber-400 mb-4 flex items-center gap-2"><Layout className="w-5 h-5"/> AI Reasoning</h3>
                  <div className="p-6 bg-amber-500/5 border border-amber-500/10 rounded-xl mb-8">
                    <p className="text-slate-300 italic text-lg leading-relaxed">"{aiExclusions.reasoning}"</p>
                  </div>
                  
                  <h3 className="font-semibold text-lg mb-4 text-white">Recommended Exclusions Applied</h3>
                  <div className="flex gap-3 flex-wrap">
                    {(aiExclusions.exclusions || []).map(ex => (
                      <label key={ex} className="flex items-center gap-2 px-4 py-2 bg-slate-950 rounded-lg border border-slate-800 text-sm font-mono text-slate-300 shadow-inner cursor-pointer hover:bg-slate-800">
                        <input 
                          type="checkbox" 
                          defaultChecked={true}
                          className="w-4 h-4 rounded border-slate-700 text-sky-500 focus:ring-sky-500 focus:ring-offset-slate-950" 
                        />
                        {ex}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin text-sky-500"/> 
                <p className="text-lg">Waiting for local AI reasoning...</p>
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-6 max-w-5xl mx-auto">
            <header className="flex justify-between items-end border-b border-slate-800 pb-6">
              <div>
                <h1 className="text-4xl font-bold tracking-tight">Duplicates Resolver</h1>
                <p className="text-slate-400 mt-2 text-lg">Intelligent cleanup prioritizing original files over copy suffixes.</p>
              </div>
              <button onClick={() => setStep(5)} className="bg-white text-slate-950 font-bold px-6 py-3 rounded-xl flex items-center gap-2 hover:bg-slate-200 transition-all shadow-lg">
                Next: Smart Renaming <ArrowRight className="w-4 h-4"/>
              </button>
            </header>

            {items.filter(i => i.action === 'review_duplicate_deletion').length > 0 && (
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex justify-between items-center gap-4 shadow-md mt-4 shrink-0">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={
                      selectedDuplicates.length > 0 &&
                      selectedDuplicates.length === items.filter(i => i.action === 'review_duplicate_deletion').length
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        const allIds = items.filter(i => i.action === 'review_duplicate_deletion').map(i => i.id);
                        setSelectedDuplicates(allIds);
                      } else {
                        setSelectedDuplicates([]);
                      }
                    }}
                    className="w-4 h-4 rounded border-slate-700 text-sky-500 focus:ring-sky-500 cursor-pointer"
                  />
                  <span className="text-sm font-semibold text-slate-300">
                    Select All ({selectedDuplicates.length} of {items.filter(i => i.action === 'review_duplicate_deletion').length} selected)
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={selectedDuplicates.length === 0}
                    onClick={handleBulkReject}
                    className="px-4 py-2 rounded-lg text-sm font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Reject Selected
                  </button>
                  <button
                    disabled={selectedDuplicates.length === 0}
                    onClick={handleBulkApprove}
                    className="px-4 py-2 rounded-lg text-sm font-bold bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Approve Selected Deletions
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-6 mt-4">
              {items.filter(i => i.action === 'review_duplicate_deletion').map(item => (
                <div key={item.id} className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
                   <div className="bg-slate-800/40 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <input 
                          type="checkbox"
                          checked={selectedDuplicates.includes(item.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDuplicates([...selectedDuplicates, item.id]);
                            } else {
                              setSelectedDuplicates(selectedDuplicates.filter(id => id !== item.id));
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-700 text-sky-500 focus:ring-sky-500 cursor-pointer mr-1"
                        />
                        <Copy className="w-4 h-4 text-slate-500" />
                        <span className="text-sm font-mono text-slate-400">SHA256: {item.evidence.sha256.slice(0, 16)}...</span>
                        <button onClick={() => openFileLocally(item.subjectPath)} className="text-sky-400 hover:text-sky-300 transition-colors ml-2" title="Open File Natively">
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => rejectItem(item.id)}
                          className="px-4 py-2 rounded-lg text-sm font-bold transition-all bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                        >
                          Reject
                        </button>
                        <button 
                          onClick={() => approveItem(item.id, item)}
                          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${item.status === 'approved' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/20'}`}
                        >
                          {item.status === 'approved' ? '✓ Approved' : 'Approve Deletion'}
                        </button>
                      </div>
                   </div>
                   <div className="p-8 grid grid-cols-2 gap-12 relative">
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center border-4 border-slate-950 z-10">
                        <ArrowRight className="w-5 h-5 text-slate-500" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-green-500 uppercase tracking-widest mb-3 flex items-center gap-2"><CheckCircle className="w-4 h-4"/> Keep Original</div>
                        <div className="p-5 bg-green-500/5 border border-green-500/20 rounded-xl text-sm font-mono whitespace-normal break-all shadow-inner relative pr-10" title={item.evidence.proposedKeepPath || item.evidence.keptPath}>
                          {(item.evidence.proposedKeepPath || item.evidence.keptPath)?.split('\\').pop()}
                          <button onClick={() => openFileLocally(item.evidence.proposedKeepPath || item.evidence.keptPath)} className="absolute right-3 top-1/2 -translate-y-1/2 text-sky-400 hover:text-sky-300 transition-colors" title="Open Keep File Natively">
                             <Eye className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-bold text-rose-500 uppercase tracking-widest mb-3 flex items-center gap-2"><Trash2 className="w-4 h-4"/> Delete Duplicate</div>
                        <div className="p-5 bg-rose-500/5 border border-rose-500/20 rounded-xl text-sm font-mono whitespace-normal break-all opacity-60 line-through decoration-rose-500/50 shadow-inner relative pr-10" title={item.evidence.proposedDeletePaths?.[0] || item.evidence.deletedPaths?.[0]}>
                          {(item.evidence.proposedDeletePaths?.[0] || item.evidence.deletedPaths?.[0])?.split('\\').pop()}
                          <button onClick={() => openFileLocally(item.evidence.proposedDeletePaths?.[0] || item.evidence.deletedPaths?.[0])} className="absolute right-3 top-1/2 -translate-y-1/2 text-sky-400 hover:text-sky-300 transition-colors opacity-100" title="Open Duplicate File Natively">
                             <Eye className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                   </div>
                </div>
              ))}
              {items.filter(i => i.action === 'review_duplicate_deletion').length === 0 && (
                <div className="bg-slate-900/50 border border-slate-800 border-dashed rounded-2xl py-20 text-center flex flex-col items-center gap-4">
                  <div className="p-4 bg-slate-800 rounded-full">
                    <Copy className="w-8 h-8 text-slate-600" />
                  </div>
                  <div className="text-slate-500 text-lg">No duplicates found in this scan.</div>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-6 max-w-6xl mx-auto">
             <header className="flex justify-between items-end border-b border-slate-800 pb-6">
              <div>
                <h1 className="text-4xl font-bold tracking-tight">Organization Proposals</h1>
                <p className="text-slate-400 mt-2 text-lg">Suggestions for moves and renames based on content intelligence.</p>
                <div className="flex gap-2 mt-6">
                  <button onClick={() => setProposalFilter('all')} className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${proposalFilter === 'all' ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>All</button>
                  <button onClick={() => setProposalFilter('move')} className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${proposalFilter === 'move' ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>Moves</button>
                  <button onClick={() => setProposalFilter('rename')} className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${proposalFilter === 'rename' ? 'bg-pink-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>Renames</button>
                </div>
              </div>
              <button 
                onClick={applyChanges}
                disabled={applying || !stats?.pendingItems}
                className="bg-sky-600 hover:bg-sky-500 text-white font-bold px-8 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-sky-900/30 disabled:opacity-50"
              >
                {applying ? <RefreshCw className="w-5 h-5 animate-spin"/> : <Wand2 className="w-5 h-5"/>}
                Apply Selected Changes
              </button>
            </header>

            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl mt-4">
              <table className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 text-xs uppercase tracking-widest border-b border-slate-800">
                    <th className="px-6 py-5 font-semibold w-32">Action</th>
                    <th className="px-6 py-5 font-semibold">Details & AI Reasoning</th>
                    <th className="px-6 py-5 font-semibold text-right w-40">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {items.filter(i => i.type === 'organization_proposal').filter(i => proposalFilter === 'all' || (proposalFilter === 'move' ? i.action === 'move_file' : i.action === 'rename_file')).map(item => (
                    <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-5 align-top">
                        <span className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap inline-block ${item.action === 'move_file' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/20' : 'bg-pink-500/20 text-pink-400 border border-pink-500/20'}`}>
                          {item.action.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-5 pr-8">
                        <div className="flex flex-col gap-3 mb-4">
                          <div className="flex items-center gap-3 text-slate-500 line-through decoration-rose-500/50 overflow-hidden">
                            <div className="p-2 bg-slate-950 rounded border border-slate-800 shrink-0"><FileMinus className="w-4 h-4 text-rose-400"/></div>
                            <span className="text-xs font-mono whitespace-normal break-all w-full" title={item.subjectPath}>{item.subjectPath}</span>
                            <button onClick={() => openFileLocally(item.subjectPath)} className="text-sky-400 hover:text-sky-300 transition-colors ml-auto shrink-0" title="Open File Natively">
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                          
                          <div className="flex items-center gap-3 bg-sky-500/10 p-3 rounded-xl border border-sky-500/20 overflow-hidden group">
                            <div className="p-2 bg-sky-500/20 rounded shrink-0"><FilePlus className="w-4 h-4 text-sky-400"/></div>
                            
                            {editingItemId === item.id ? (
                              <div className="flex items-center gap-2 w-full">
                                <input 
                                  type="text" 
                                  value={editingName} 
                                  onChange={e => setEditingName(e.target.value)}
                                  className="flex-1 bg-slate-950 border border-sky-500 rounded px-2 py-1 text-sm font-bold text-sky-400 focus:outline-none"
                                  autoFocus
                                  onKeyDown={e => e.key === 'Enter' && handleSaveEdit(item.id)}
                                />
                                <button onClick={() => handleSaveEdit(item.id)} className="p-1 hover:bg-green-500/20 rounded text-green-400"><Check className="w-4 h-4"/></button>
                                <button onClick={handleCancelEdit} className="p-1 hover:bg-rose-500/20 rounded text-rose-400"><X className="w-4 h-4"/></button>
                              </div>
                            ) : (
                              <>
                                <span className="text-sm font-bold text-sky-400 whitespace-normal break-all w-full" title={item.proposedPath || item.evidence?.proposedName}>
                                  {item.evidence?.proposedRelativePath || item.evidence?.proposedName || item.proposedPath}
                                </span>
                                <button 
                                  onClick={() => {
                                    setEditingItemId(item.id);
                                    setEditingName(item.evidence?.proposedName || item.proposedPath?.split('\\').pop()?.split('/').pop() || "");
                                  }} 
                                  className="text-slate-500 hover:text-sky-400 opacity-0 group-hover:opacity-100 transition-all shrink-0 ml-auto"
                                  title="Edit Name"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        
                        {/* AI Reasoning Section */}
                        <div className="mt-2">
                          {aiReasoning[item.id] ? (
                            <div className="text-sm bg-slate-950 text-slate-300 p-4 rounded-xl border border-slate-800 flex gap-3 shadow-inner">
                              <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                              <span className="leading-relaxed">{aiReasoning[item.id]}</span>
                            </div>
                          ) : (
                            <button onClick={() => getAiReasoning(item)} className="text-sm text-slate-400 hover:text-amber-400 flex items-center gap-2 transition-colors font-medium border border-transparent hover:border-amber-400/20 hover:bg-amber-400/5 px-3 py-1.5 rounded-lg">
                              <Sparkles className="w-4 h-4"/> Ask AI for reasoning
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right align-top w-56">
                         <div className="flex flex-col gap-2">
                           <button 
                              onClick={() => approveItem(item.id, item)}
                              className={`px-5 py-2 rounded-lg text-sm font-bold transition-all w-full ${item.status === 'approved' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white'}`}
                            >
                              {item.status === 'approved' ? '✓ Approved' : 'Approve'}
                            </button>
                            <button 
                              onClick={() => rejectItem(item.id)}
                              className="px-5 py-2 rounded-lg text-sm font-bold transition-all w-full bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                            >
                              Reject
                            </button>
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {items.filter(i => i.type === 'organization_proposal').length === 0 && (
                <div className="bg-slate-900/50 border border-slate-800 border-dashed rounded-2xl py-20 text-center flex flex-col items-center gap-4 m-8">
                  <div className="p-4 bg-slate-800 rounded-full">
                    <Wand2 className="w-8 h-8 text-slate-600" />
                  </div>
                  <div className="text-slate-500 text-lg">No proposals available.</div>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="flex flex-col items-center mt-20 gap-8 max-w-3xl mx-auto">
            <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center border-4 border-green-500/50 shadow-xl shadow-green-500/20">
              <CheckCircle className="w-12 h-12 text-green-400" />
            </div>
            <div className="text-center">
              <h1 className="text-5xl font-bold mb-4 tracking-tight">
                {lastApplyResult?.errors?.length ? 'Review Apply Results' : 'Organization Complete'}
              </h1>
              <p className="text-xl text-slate-400">Nyx applied approved changes and recorded the result in the local audit trail.</p>
            </div>

            <div className="grid grid-cols-3 gap-6 w-full mt-8">
              <div className="bg-slate-900/80 border border-slate-800 p-8 rounded-2xl text-center shadow-lg">
                <div className="text-4xl font-bold text-sky-400 mb-3">{lastApplyResult?.applied?.length ?? 0}</div>
                <div className="text-slate-400 text-sm font-semibold uppercase tracking-widest">Actions Applied</div>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-8 rounded-2xl text-center shadow-lg">
                <div className="text-4xl font-bold text-green-400 mb-3">{stats?.pendingItems ?? 0}</div>
                <div className="text-slate-400 text-sm font-semibold uppercase tracking-widest">Items Remaining</div>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-8 rounded-2xl text-center shadow-lg">
                <div className="text-4xl font-bold text-rose-400 mb-3">{lastApplyResult?.errors?.length ?? 0}</div>
                <div className="text-slate-400 text-sm font-semibold uppercase tracking-widest">Apply Errors</div>
              </div>
            </div>

            {lastApplyResult?.errors?.length ? (
              <div className="w-full bg-rose-500/10 border border-rose-500/20 rounded-2xl p-5">
                <div className="text-sm font-bold text-rose-300 mb-3 uppercase tracking-widest">Errors</div>
                <div className="flex flex-col gap-2">
                  {lastApplyResult.errors.map((error, index) => (
                    <div key={`${error.message}-${index}`} className="text-sm text-rose-200 font-mono break-all">
                      {error.message}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex gap-4 mt-8">
              <button onClick={() => setStep(7)} className="bg-sky-600 hover:bg-sky-500 text-white px-10 py-4 rounded-xl font-bold transition-all shadow-xl shadow-sky-900/30 flex items-center gap-3 text-lg">
                View V6 Cloud Backup Plan <ArrowRight className="w-6 h-6"/>
              </button>
              {lastApplyResult?.applied?.length ? (
                <button onClick={rollbackChanges} className="bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/20 px-10 py-4 rounded-xl font-bold transition-all flex items-center gap-3 text-lg">
                  Rollback Changes
                </button>
              ) : null}
            </div>
          </div>
        )}

        {step === 7 && (
          <div className="max-w-2xl mx-auto mt-20 text-center flex flex-col gap-6">
            <div className="w-32 h-32 bg-sky-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-sky-500/20">
              <Cloud className="w-16 h-16 text-sky-500" />
            </div>
            <h1 className="text-5xl font-bold tracking-tight">Cloud Backup Phase</h1>
            <p className="text-slate-400 text-xl leading-relaxed">Nyx is ready to mirror your newly organized taxonomy securely to Google Drive or OneDrive. This advanced feature is scheduled for V6.</p>
            
            <div className="p-8 bg-slate-900/80 border border-slate-800 rounded-2xl text-left mt-8 shadow-xl">
              <h3 className="font-bold text-xl mb-6 text-white border-b border-slate-800 pb-4">Upcoming Capabilities:</h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-green-500 shrink-0"/>
                  <span className="text-slate-300">Native OAuth2 flows for Google Drive & OneDrive without exposing your keys.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-green-500 shrink-0"/>
                  <span className="text-slate-300">Durable Backup Proof state tracked in the local SQLite catalog.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-green-500 shrink-0"/>
                  <span className="text-slate-300">Remote Drive restructuring capabilities to match your local layout without requiring re-uploading of existing files.</span>
                </li>
              </ul>
            </div>
          </div>
        )}
      </main>

      {showPickerModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <header className="p-6 border-b border-slate-800 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2 text-white"><Folder className="w-5 h-5 text-sky-400" /> Select Files & Directories</h2>
                <p className="text-xs text-slate-400 mt-1">Select multiple items to analyze. Double-click a folder to navigate inside.</p>
              </div>
              <button 
                onClick={() => setShowPickerModal(false)}
                className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </header>

            <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex items-center gap-2 text-xs font-mono text-slate-400 shrink-0 overflow-x-auto whitespace-nowrap">
              <span className="text-slate-500 uppercase tracking-widest font-bold font-sans text-[10px]">Path:</span>
              <span className="text-sky-400">{browsePath || "Roots Listing"}</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1 min-h-[300px]">
              {/* Back navigation */}
              {!isBrowseRoot && (
                <button
                  onClick={async () => {
                    const parts = browsePath.split('/');
                    parts.pop();
                    const parent = parts.join('/');
                    await fetchDirectoryListing(parent);
                  }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-800/50 text-left text-sm text-sky-400 transition-colors font-semibold"
                >
                  <ArrowUpLeft className="w-4 h-4 shrink-0" /> .. (Go Up)
                </button>
              )}

              {/* Browse listings */}
              {browseEntries.map((entry) => (
                <div 
                  key={entry.path}
                  onDoubleClick={async () => {
                    if (entry.isDirectory) {
                      await fetchDirectoryListing(entry.path);
                    }
                  }}
                  className="flex items-center justify-between px-4 py-2 rounded-xl hover:bg-slate-800/80 text-left text-sm text-slate-300 transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-3 truncate flex-1">
                    <input 
                      type="checkbox"
                      checked={selectedPaths.includes(entry.path)}
                      onChange={() => togglePathSelection(entry.path)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-sky-600 focus:ring-sky-500 focus:ring-offset-slate-900 transition-colors cursor-pointer shrink-0"
                    />
                    <span 
                      onClick={() => {
                        if (entry.isDirectory) {
                          fetchDirectoryListing(entry.path);
                        } else {
                          togglePathSelection(entry.path);
                        }
                      }}
                      className="flex items-center gap-2.5 font-medium truncate flex-1 select-none"
                    >
                      {entry.isDirectory ? (
                        <Folder className="w-4 h-4 text-sky-400 shrink-0" />
                      ) : (
                        <File className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <span className="truncate hover:text-white transition-colors">{entry.name}</span>
                    </span>
                  </div>
                  
                  {entry.isDirectory && (
                    <button
                      onClick={async () => {
                        await fetchDirectoryListing(entry.path);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity px-2.5 py-1 text-xs bg-slate-850 hover:bg-slate-750 text-sky-400 rounded-lg font-semibold"
                    >
                      Open
                    </button>
                  )}
                </div>
              ))}

              {browseEntries.length === 0 && (
                <div className="text-center py-12 text-slate-500 text-sm">
                  No folders or files found here.
                </div>
              )}
            </div>

            <footer className="p-6 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-400 font-medium">
                {selectedPaths.length} item{selectedPaths.length === 1 ? '' : 's'} selected
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPickerModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition-all border border-slate-700"
                >
                  Cancel
                </button>
                {browsePath && (
                  <button
                    onClick={() => selectBrowsedDirectory(browsePath)}
                    className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition-all border border-slate-700"
                  >
                    Select Current Folder
                  </button>
                )}
                <button
                  disabled={selectedPaths.length === 0}
                  onClick={confirmSelection}
                  className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-sky-900/20"
                >
                  Confirm Selection
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* Global CSS */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        body { font-family: 'Inter', sans-serif; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #475569; }
      `}</style>
    </div>
  );
}

export default App;
