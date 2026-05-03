import { useState } from 'react';
import { Layout, Copy, Wand2, CheckCircle, ArrowRight, RefreshCw, FolderSearch, Cloud, Sparkles } from 'lucide-react';

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
  evidence: any;
}

function App() {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7>(1);
  const [directory, setDirectory] = useState<string>('C:\\Users\\ptkva\\Documents\\nyx\\File');
  const [scanning, setScanning] = useState(false);
  
  const [stats, setStats] = useState<Stats | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [applying, setApplying] = useState(false);

  const [aiExclusions, setAiExclusions] = useState<{ exclusions: string[], reasoning: string } | null>(null);
  const [aiReasoning, setAiReasoning] = useState<Record<string, string>>({});

  const fetchData = async () => {
    try {
      const statsRes = await fetch('/api/overview');
      const statsData = await statsRes.json();
      setStats(statsData);

      const itemsRes = await fetch('/api/items');
      const itemsData = await itemsRes.json();
      setItems(itemsData);
    } catch (error) {
      console.error('Failed to fetch data', error);
    }
  };

  const startScan = async () => {
    setScanning(true);
    setStep(2);
    try {
      await fetch('/api/scan/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory })
      });
      await fetchData();
      
      // Fetch AI exclusions
      const exRes = await fetch('/api/ai/exclusions', { method: 'POST' });
      if (exRes.ok) {
        setAiExclusions(await exRes.json());
      }
      
      setStep(3);
    } catch (error) {
      alert('Scan failed');
      setStep(1);
    } finally {
      setScanning(false);
    }
  };

  const approveItem = async (id: string) => {
    await fetch(`/api/items/${encodeURIComponent(id)}/approve`, { method: 'POST' });
    fetchData();
  };

  const getAiReasoning = async (item: ReviewItem) => {
    try {
      setAiReasoning(prev => ({ ...prev, [item.id]: 'Thinking...' }));
      const res = await fetch('/api/ai/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileInfo: item.evidence })
      });
      const data = await res.json();
      setAiReasoning(prev => ({ ...prev, [item.id]: data.reasoning }));
    } catch (e) {
      setAiReasoning(prev => ({ ...prev, [item.id]: 'Failed to get AI reasoning.' }));
    }
  };

  const applyChanges = async () => {
    setApplying(true);
    try {
      await fetch('/api/apply', { method: 'POST' });
      await fetchData();
      setStep(6);
    } catch (error) {
      alert('Failed to apply changes');
    } finally {
      setApplying(false);
    }
  };

  const formatSize = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return gb.toFixed(2) + ' GB';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans">
      {/* Sidebar Wizard Navigation */}
      <div className="w-72 border-r border-slate-800 p-6 flex flex-col gap-8 bg-slate-900/50">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 bg-sky-500 rounded rotate-45 flex items-center justify-center">
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
              onClick={() => { if(stats || s === 1) setStep(s as any) }}
              disabled={!stats && s > 2}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-left ${step === s ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'hover:bg-slate-800 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed'}`}
            >
              <Icon className={`w-4 h-4 ${step === s && s === 2 && scanning ? 'animate-spin' : ''}`} /> 
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-10 overflow-y-auto relative">
        {step === 1 && (
          <div className="max-w-2xl mx-auto mt-20 text-center flex flex-col gap-6">
            <h1 className="text-4xl font-bold">What would you like to organize?</h1>
            <p className="text-slate-400">Enter the directory path to let Nyx AI scan and reason about your files.</p>
            <div className="flex gap-4 mt-4">
              <input 
                type="text" 
                value={directory} 
                onChange={(e) => setDirectory(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 focus:outline-none focus:border-sky-500"
                placeholder="C:\Path\To\Your\Files"
              />
              <button 
                onClick={startScan}
                className="bg-sky-600 hover:bg-sky-500 px-6 py-3 rounded-lg font-bold transition-all shadow-lg shadow-sky-900/20"
              >
                Scan with AI
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <RefreshCw className="w-12 h-12 animate-spin text-sky-500" />
            <h2 className="text-2xl font-bold">Analyzing Directory...</h2>
            <p className="text-slate-400">Nyx is currently fingerprinting files and extracting context.</p>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-6">
            <header className="flex justify-between items-end">
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-3"><Sparkles className="text-amber-400 w-6 h-6"/> AI Exclusions Review</h1>
                <p className="text-slate-400 mt-2">Nyx AI has identified directories that should be skipped.</p>
              </div>
              <button onClick={() => setStep(4)} className="bg-white text-slate-950 font-bold px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-200">
                Continue <ArrowRight className="w-4 h-4"/>
              </button>
            </header>

            {aiExclusions ? (
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
                <h3 className="font-semibold text-lg text-amber-400 mb-2">AI Reasoning</h3>
                <p className="text-slate-300 italic mb-6">"{aiExclusions.reasoning}"</p>
                
                <h3 className="font-semibold text-lg mb-4">Recommended Exclusions</h3>
                <div className="flex gap-3 flex-wrap">
                  {aiExclusions.exclusions.map(ex => (
                    <div key={ex} className="px-3 py-1 bg-slate-800 rounded border border-slate-700 text-sm">
                      {ex}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-slate-400"><RefreshCw className="w-4 h-4 animate-spin"/> Waiting for AI reasoning...</div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-6">
            <header className="flex justify-between items-end">
              <div>
                <h1 className="text-3xl font-bold">Duplicates Resolver</h1>
                <p className="text-slate-400 mt-2">Intelligent cleanup prioritizing original files over copy suffixes</p>
              </div>
              <button onClick={() => setStep(5)} className="bg-white text-slate-950 font-bold px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-200">
                Next: Smart Renaming <ArrowRight className="w-4 h-4"/>
              </button>
            </header>

            <div className="flex flex-col gap-4">
              {items.filter(i => i.action === 'review_duplicate_deletion').map(item => (
                <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                   <div className="bg-slate-800/50 px-6 py-3 border-b border-slate-800 flex justify-between items-center">
                      <span className="text-sm font-mono text-slate-400">{item.evidence.sha256.slice(0, 16)}...</span>
                      <button 
                        onClick={() => approveItem(item.id)}
                        className={`px-3 py-1 rounded text-sm font-medium ${item.status === 'approved' ? 'bg-green-500/20 text-green-400' : 'bg-sky-500/10 text-sky-400 hover:bg-sky-500/20'}`}
                      >
                        {item.status === 'approved' ? 'Approved' : 'Approve Deletion'}
                      </button>
                   </div>
                   <div className="p-6 grid grid-cols-2 gap-8 relative">
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center border border-slate-700 z-10">
                        <ArrowRight className="w-4 h-4 text-slate-500" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-green-500 uppercase tracking-wider mb-2">Keep Original</div>
                        <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg text-sm truncate" title={item.evidence.proposedKeepPath || item.evidence.keptPath}>
                          {(item.evidence.proposedKeepPath || item.evidence.keptPath)?.split('\\').pop()}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-rose-500 uppercase tracking-wider mb-2">Delete Duplicate</div>
                        <div className="p-4 bg-rose-500/5 border border-rose-500/20 rounded-lg text-sm truncate" title={item.evidence.proposedDeletePaths?.[0] || item.evidence.deletedPaths?.[0]}>
                          {(item.evidence.proposedDeletePaths?.[0] || item.evidence.deletedPaths?.[0])?.split('\\').pop()}
                        </div>
                      </div>
                   </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-6">
             <header className="flex justify-between items-end">
              <div>
                <h1 className="text-3xl font-bold">Organization Proposals</h1>
                <p className="text-slate-400 mt-2">Suggestions for moves and renames based on content intelligence</p>
              </div>
              <button 
                onClick={applyChanges}
                disabled={applying || !stats?.pendingItems}
                className="bg-sky-600 hover:bg-sky-500 text-white font-bold px-6 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-sky-900/20 disabled:opacity-50"
              >
                {applying ? <RefreshCw className="w-4 h-4 animate-spin"/> : <CheckCircle className="w-4 h-4"/>}
                Apply Selected Changes
              </button>
            </header>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="px-6 py-4 font-semibold">Action</th>
                    <th className="px-6 py-4 font-semibold">Details</th>
                    <th className="px-6 py-4 font-semibold text-right">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {items.filter(i => i.type === 'organization_proposal').map(item => (
                    <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 align-top">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${item.action === 'move_file' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-pink-500/20 text-pink-400'}`}>
                          {item.action.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs text-slate-500 mb-1" title={item.subjectPath}>{item.subjectPath}</div>
                        <div className="text-sm text-sky-400 font-medium" title={item.proposedPath}>
                          ➜ {item.proposedPath || item.evidence?.proposedName}
                        </div>
                        
                        {/* AI Reasoning Section */}
                        <div className="mt-3">
                          {aiReasoning[item.id] ? (
                            <div className="text-xs bg-amber-500/10 text-amber-300 p-2 rounded border border-amber-500/20 flex gap-2">
                              <Sparkles className="w-3 h-3 shrink-0 mt-0.5" />
                              <span>{aiReasoning[item.id]}</span>
                            </div>
                          ) : (
                            <button onClick={() => getAiReasoning(item)} className="text-xs text-slate-500 hover:text-sky-400 flex items-center gap-1">
                              <Sparkles className="w-3 h-3"/> Ask AI for reasoning
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right align-top">
                         <button 
                            onClick={() => approveItem(item.id)}
                            className={`px-3 py-1 rounded text-xs font-medium ${item.status === 'approved' ? 'bg-green-500/20 text-green-400' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'}`}
                          >
                            {item.status === 'approved' ? 'Approved' : 'Approve'}
                          </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="flex flex-col items-center mt-20 gap-8">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center border-4 border-green-500/50">
              <CheckCircle className="w-10 h-10 text-green-400" />
            </div>
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-4">Organization Complete!</h1>
              <p className="text-xl text-slate-400">Your files are now beautifully categorized and deduplicated.</p>
            </div>

            <div className="grid grid-cols-3 gap-6 w-full max-w-3xl mt-8">
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl text-center">
                <div className="text-3xl font-bold text-sky-400 mb-2">{stats?.proposals ?? 0}</div>
                <div className="text-slate-400 text-sm">Files Organized</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl text-center">
                <div className="text-3xl font-bold text-green-400 mb-2">{stats?.duplicates ?? 0}</div>
                <div className="text-slate-400 text-sm">Duplicates Removed</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl text-center">
                <div className="text-3xl font-bold text-indigo-400 mb-2">{formatSize(stats?.totalSize ?? 0)}</div>
                <div className="text-slate-400 text-sm">Total Data Managed</div>
              </div>
            </div>

            <button onClick={() => setStep(7)} className="mt-8 bg-sky-600 hover:bg-sky-500 px-8 py-3 rounded-lg font-bold transition-all shadow-lg shadow-sky-900/20 flex items-center gap-2">
              Proceed to Cloud Backup <ArrowRight className="w-5 h-5"/>
            </button>
          </div>
        )}

        {step === 7 && (
          <div className="max-w-2xl mx-auto mt-20 text-center flex flex-col gap-6">
            <Cloud className="w-20 h-20 text-sky-500 mx-auto opacity-80" />
            <h1 className="text-4xl font-bold">Cloud Backup Phase</h1>
            <p className="text-slate-400 text-lg">Nyx is ready to mirror your organized taxonomy to Google Drive or OneDrive. This feature is coming in V6.</p>
            
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl text-left mt-8">
              <h3 className="font-semibold text-lg mb-2 text-white">Upcoming Features:</h3>
              <ul className="list-disc list-inside text-slate-400 space-y-2 ml-2">
                <li>OAuth2 flows for Google Drive & OneDrive.</li>
                <li>Durable Backup Proof state tracked in SQLite.</li>
                <li>Remote Drive restructuring without re-uploading.</li>
              </ul>
            </div>
          </div>
        )}
      </main>

      {/* Global CSS */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono&display=swap');
        body { font-family: 'Inter', sans-serif; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
      `}</style>
    </div>
  );
}

export default App;