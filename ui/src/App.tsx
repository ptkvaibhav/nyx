import { useState, useEffect } from 'react';
import { Layout, Files, Copy, Wand2, CheckCircle, AlertCircle, Trash2, ArrowRight, RefreshCw } from 'lucide-react';

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
  const [view, setView] = useState<'overview' | 'duplicates' | 'proposals'>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const statsRes = await fetch('/api/overview');
      const statsData = await statsRes.json();
      setStats(statsData);

      const itemsRes = await fetch('/api/items');
      const itemsData = await itemsRes.json();
      setItems(itemsData);
    } catch (error) {
      console.error('Failed to fetch data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const approveItem = async (id: string) => {
    await fetch(`/api/items/${encodeURIComponent(id)}/approve`, { method: 'POST' });
    fetchData();
  };

  const applyChanges = async () => {
    setApplying(true);
    try {
      await fetch('/api/apply', { method: 'POST' });
      alert('Changes applied successfully!');
      fetchData();
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
      {/* Sidebar */}
      <div className="w-64 border-r border-slate-800 p-6 flex flex-col gap-8 bg-slate-900/50">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 bg-sky-500 rounded rotate-45 flex items-center justify-center">
            <Layout className="-rotate-45 w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight">NYX</span>
        </div>

        <nav className="flex flex-col gap-2">
          <button 
            onClick={() => setView('overview')}
            className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${view === 'overview' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'hover:bg-slate-800 text-slate-400'}`}
          >
            <Layout className="w-4 h-4" /> Overview
          </button>
          <button 
            onClick={() => setView('duplicates')}
            className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${view === 'duplicates' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'hover:bg-slate-800 text-slate-400'}`}
          >
            <Copy className="w-4 h-4" /> Duplicates ({stats?.duplicates ?? 0})
          </button>
          <button 
            onClick={() => setView('proposals')}
            className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${view === 'proposals' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'hover:bg-slate-800 text-slate-400'}`}
          >
            <Wand2 className="w-4 h-4" /> Proposals ({stats?.proposals ?? 0})
          </button>
        </nav>

        <div className="mt-auto border-t border-slate-800 pt-6">
          <button 
            onClick={applyChanges}
            disabled={applying || !stats?.pendingItems}
            className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-sky-900/20"
          >
            {applying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Apply Changes
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-10 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="w-8 h-8 animate-spin text-sky-500" />
          </div>
        ) : (
          <>
            {view === 'overview' && (
              <div className="flex flex-col gap-8">
                <header>
                  <h1 className="text-3xl font-bold">System Overview</h1>
                  <p className="text-slate-400 mt-2">Metadata captured from SQLite catalog</p>
                </header>

                <div className="grid grid-cols-4 gap-6">
                  <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
                    <Files className="w-8 h-8 text-sky-500 mb-4" />
                    <div className="text-2xl font-bold">{stats?.totalFiles.toLocaleString()}</div>
                    <div className="text-slate-400 text-sm">Total Files Scanned</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
                    <Layout className="w-8 h-8 text-indigo-500 mb-4" />
                    <div className="text-2xl font-bold">{formatSize(stats?.totalSize ?? 0)}</div>
                    <div className="text-slate-400 text-sm">Total Data Managed</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
                    <AlertCircle className="w-8 h-8 text-amber-500 mb-4" />
                    <div className="text-2xl font-bold">{stats?.pendingItems}</div>
                    <div className="text-slate-400 text-sm">Pending Actions</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
                    <Trash2 className="w-8 h-8 text-rose-500 mb-4" />
                    <div className="text-2xl font-bold">{stats?.archives}</div>
                    <div className="text-slate-400 text-sm">Extraction Cleanups</div>
                  </div>
                </div>
              </div>
            )}

            {view === 'duplicates' && (
              <div className="flex flex-col gap-6">
                <header>
                  <h1 className="text-3xl font-bold">Duplicates Resolver</h1>
                  <p className="text-slate-400 mt-2">Intelligent cleanup prioritizing original files over copy suffixes</p>
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
                            <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg text-sm truncate" title={item.evidence.proposedKeepPath}>
                              {item.evidence.proposedKeepPath.split('\\').pop()}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-rose-500 uppercase tracking-wider mb-2">Delete Duplicate</div>
                            <div className="p-4 bg-rose-500/5 border border-rose-500/20 rounded-lg text-sm truncate" title={item.evidence.proposedDeletePaths[0]}>
                              {item.evidence.proposedDeletePaths[0].split('\\').pop()}
                            </div>
                          </div>
                       </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === 'proposals' && (
              <div className="flex flex-col gap-6">
                 <header>
                  <h1 className="text-3xl font-bold">Organization Proposals</h1>
                  <p className="text-slate-400 mt-2">Suggestions for moves and renames based on content intelligence</p>
                </header>

                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider">
                        <th className="px-6 py-4 font-semibold">Action</th>
                        <th className="px-6 py-4 font-semibold">Current Path</th>
                        <th className="px-6 py-4 font-semibold">Proposed</th>
                        <th className="px-6 py-4 font-semibold text-right">Review</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {items.filter(i => i.type === 'organization_proposal').map(item => (
                        <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${item.action === 'move_file' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-pink-500/20 text-pink-400'}`}>
                              {item.action.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-300 max-w-xs truncate" title={item.subjectPath}>
                            {item.subjectPath.split('\\').pop()}
                          </td>
                          <td className="px-6 py-4 text-sm text-sky-400 max-w-xs truncate" title={item.proposedPath}>
                            {item.proposedPath?.split('\\').pop() || item.evidence?.proposedName}
                          </td>
                          <td className="px-6 py-4 text-right">
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
          </>
        )}
      </main>

      {/* Global CSS for Tailwind-like utilities since we aren't setting up a full Tailwind build step in this turn */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono&display=swap');
        body { font-family: 'Inter', sans-serif; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
      `}</style>
    </div>
  );
}

export default App;
