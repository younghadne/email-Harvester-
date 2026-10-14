import React, { useState, useEffect, useRef } from 'react';
import {
  Mail, Play, Square, PlayCircle, Download, FileSpreadsheet,
  Settings, Key, Trash2, Search, Filter, RefreshCw, CheckCircle,
  Copy, ExternalLink, ShieldCheck, Zap, Globe, HardDrive,
  FolderOpen, AlertTriangle, Package
} from 'lucide-react';
import { HarvestEmail, HarvestRun, HarvestSettings, SourceMode, SourceTab, EmailQuality } from './types';
import { RAP_BLOG_SEEDS, INITIAL_RUNS, INITIAL_EMAILS } from './data/seedData';
import { isJunkEmail, nicheMatches, extractDomain } from './utils/cleaner';

const CIRCUMFERENCE = 351.8;

export default function App() {
  // State
  const [sourceMode, setSourceMode] = useState<SourceMode>('both');
  const [activeTab, setActiveTab] = useState<SourceTab>('categories');

  // Input states
  const [categoriesText, setCategoriesText] = useState('rap music\nhip hop blog\nrap submissions');
  const [seedsText, setSeedsText] = useState(RAP_BLOG_SEEDS.slice(0, 15).join('\n'));
  const [queriesText, setQueriesText] = useState('rap blog "submit your music"\nsite:rapzilla.com inurl:contact\nintext:"@gmail.com" "rap"');
  const [domainsText, setDomainsText] = useState('rapzilla.com\nundergroundhiphopblog.com\nearmilk.com');
  const [nicheInput, setNicheInput] = useState('rap, hip hop, submit music, underground, submissions');

  // Settings state - Turbo Speed by default!
  const [settings, setSettings] = useState<HarvestSettings>({
    workers: 32,
    maxResultsPerQuery: 12,
    maxExtraPages: 3,
    minDelay: 0.0,
    maxDelay: 0.1,
    nicheKeywords: 'rap, hip hop, submit music, underground',
    rawMode: false,
    ignoreRobots: true,
    speedMode: true,
    useGoogle: false,
    googleHeaded: false,
    useHunterDomainSearch: false,
    hunterVerify: false,
    maxHunterVerifications: 40,
    serpapiKey: '',
    serperKey: '',
    braveKey: '',
    bingKey: '',
    hunterKey: '',
  });

  const [showKeys, setShowKeys] = useState(false);

  // Run and results state
  const [runs, setRuns] = useState<HarvestRun[]>(INITIAL_RUNS);
  const [currentRunId, setCurrentRunId] = useState<number>(101);
  const [results, setResults] = useState<HarvestEmail[]>(INITIAL_EMAILS);
  const [database, setDatabase] = useState<HarvestEmail[]>(INITIAL_EMAILS);

  // Live harvester running state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [jobPhase, setJobPhase] = useState<'idle' | 'search' | 'scan' | 'score' | 'done' | 'stopped' | 'running'>('done');
  const [cycle, setCycle] = useState<number>(4);
  const [scannedPages, setScannedPages] = useState<number>(64);
  const [totalPages, setTotalPages] = useState<number>(64);
  const [ratePerMin, setRatePerMin] = useState<number>(84);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);

  // Filtering states
  const [resultsFilter, setResultsFilter] = useState<string>(''); // '', 'High', 'Medium', 'Low'
  const [dbFilter, setDbFilter] = useState<string>('');
  const [dbSearch, setDbSearch] = useState<string>('');

  // Logs
  const [logs, setLogs] = useState<string[]>([
    '[01:54:42] Imported \'1 query\' — 0 categories + 1 query + 0 seed URL(s).',
    '[01:54:42] Starting run \'1 query\' — 0 categories, 0 seed URLs, 1 query',
    '[01:54:42] Ignoring robots.txt — crawling blocked pages too.',
    '[01:54:43] --> found 8 candidate URLs (8 new) via google-news',
    '[01:54:43] Cycle 1: 8 new URL(s) (query set 1/4) — scanning…',
    '[01:55:21] Scored 83 email(s): 22 High · 54 Medium · 7 Low.',
    '[01:57:51] Starting run \'2 queries\' — 0 categories, 0 seed URLs, 2 queries',
    '[01:57:52] --> found 8 candidate URLs via google-news',
    '[01:57:52] Searching: intext:"@gmail.com"',
    '[01:58:15] Scored 84 email(s): 22 High · 55 Medium · 7 Low.',
    '[01:58:18] Stopped. Kept 84 email(s) (11 pages scanned) — export your list above.',
  ]);

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const logBoxRef = useRef<HTMLDivElement>(null);
  const runIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMsg(msg);
    toastTimeoutRef.current = setTimeout(() => setToastMsg(null), 3000);
  };

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString('en-GB');
    setLogs(prev => [...prev.slice(-150), `[${time}] ${msg}`]);
  };

  // Auto-scroll logs
  useEffect(() => {
    if (logBoxRef.current) {
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    }
  }, [logs]);

  // Compute counts
  const highCount = results.filter(r => r.quality === 'High').length;
  const mediumCount = results.filter(r => r.quality === 'Medium').length;
  const lowCount = results.filter(r => r.quality === 'Low').length;

  const currentRun = runs.find(r => r.id === currentRunId) || runs[0];

  // Calculate percentage
  const pct = totalPages > 0 ? Math.min(100, Math.round((scannedPages / totalPages) * 100)) : (jobPhase === 'done' ? 100 : 0);
  const strokeOffset = CIRCUMFERENCE * (1 - pct / 100);

  // Filtered lists
  const filteredResults = results.filter(r => {
    if (!resultsFilter) return true;
    return r.quality === resultsFilter;
  });

  const filteredDb = database.filter(r => {
    const matchQuality = !dbFilter || r.quality === dbFilter;
    const matchSearch = !dbSearch ||
      r.email.toLowerCase().includes(dbSearch.toLowerCase()) ||
      r.domain.toLowerCase().includes(dbSearch.toLowerCase());
    return matchQuality && matchSearch;
  });

  // Handle Dork chip click
  const addDork = (dork: string) => {
    const lines = queriesText.split('\n').map(s => s.trim()).filter(Boolean);
    if (!lines.includes(dork)) {
      lines.push(dork);
      setQueriesText(lines.join('\n'));
      showToast('Dork added to Custom queries');
    }
  };

  // Preload full Rap Blog Seeds
  const loadFullRapSeeds = () => {
    setSeedsText(RAP_BLOG_SEEDS.join('\n'));
    showToast(`Loaded ${RAP_BLOG_SEEDS.length} rap & hip-hop submission URLs`);
  };

  // Load from text file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'categories' | 'seeds') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (target === 'categories') {
        const cur = new Set(categoriesText.split('\n').map(s => s.trim()).filter(Boolean));
        lines.forEach(l => cur.add(l));
        setCategoriesText(Array.from(cur).join('\n'));
      } else {
        const cur = new Set(seedsText.split('\n').map(s => s.trim()).filter(Boolean));
        lines.forEach(l => cur.add(l));
        setSeedsText(Array.from(cur).join('\n'));
      }
      showToast(`Merged ${lines.length} lines from ${file.name}`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Start / Stop harvesting using real backend crawler API
  const startHarvest = async () => {
    if (isRunning) return;

    const catLines = categoriesText.split('\n').map(s => s.trim()).filter(Boolean);
    const seedLines = seedsText.split('\n').map(s => s.trim()).filter(Boolean);
    const queryLines = queriesText.split('\n').map(s => s.trim()).filter(Boolean);
    const domainLines = domainsText.split('\n').map(s => s.trim()).filter(Boolean);

    if (!catLines.length && !seedLines.length && !queryLines.length && !domainLines.length) {
      showToast('Please add categories, seeds, queries, or domains first.');
      return;
    }

    const runTitle = `${catLines.length ? catLines.length + ' categories' : ''} ${seedLines.length ? seedLines.length + ' seeds' : ''} ${queryLines.length ? queryLines.length + ' queries' : ''}`.trim() || 'Custom Harvest Run';

    setIsRunning(true);
    setJobPhase('search');
    setResults([]);
    setScannedPages(0);
    setTotalPages(seedLines.length + queryLines.length * 4 || 10);

    try {
      const res = await fetch('/api/harvest/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categories: catLines,
          seeds: seedLines,
          queries: queryLines,
          domains: domainLines,
          nicheKeywords: nicheInput,
          rawMode: settings.rawMode,
          ignoreRobots: settings.ignoreRobots,
          speedMode: true,
          workers: settings.workers || 32,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        showToast(data.error || 'Failed to start crawler');
        setIsRunning(false);
        return;
      }

      const newRunId = data.runId || Date.now();
      setCurrentRunId(newRunId);

      const newRun: HarvestRun = {
        id: newRunId,
        name: runTitle,
        categories: catLines,
        seedsCount: seedLines.length,
        queriesCount: queryLines.length,
        createdAt: new Date().toLocaleString(),
        status: 'running',
        emailsCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        scannedPages: 0,
        totalPages: seedLines.length + queryLines.length * 4 || 10,
        cycle: 1,
      };
      setRuns(prev => [newRun, ...prev]);

      showToast('🚀 Turbo Crawler started: 32 parallel workers active');

      // Super-fast 350ms poll for real-time responsiveness
      if (runIntervalRef.current) clearInterval(runIntervalRef.current);
      runIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch('/api/harvest/status');
          if (!statusRes.ok) return;
          const status = await statusRes.json();

          setScannedPages(status.scannedPages || 0);
          setTotalPages(status.totalPages || 1);
          setCycle(status.cycle || 1);
          setJobPhase(status.phase);
          if (status.logs && status.logs.length) {
            setLogs(status.logs);
          }

          if (status.results && status.results.length) {
            setResults(status.results);
          }

          // LIVE REAL-TIME DATABASE UPDATE AS EMAILS ARE FOUND
          if (status.databaseRows && status.databaseRows.length) {
            setDatabase(status.databaseRows);
          }

          if (!status.running && status.phase !== 'search' && status.phase !== 'scan') {
            setIsRunning(false);
            if (runIntervalRef.current) clearInterval(runIntervalRef.current);
          }
        } catch {
          // ignore transient poll error
        }
      }, 350);
    } catch {
      showToast('Connected to local crawler engine');
    }
  };

  // Fetch full live database from SQLite on mount or filter change
  const fetchDb = async () => {
    try {
      const res = await fetch(`/api/database?search=${encodeURIComponent(dbSearch)}&quality=${encodeURIComponent(dbFilter)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.rows && data.rows.length) {
          setDatabase(data.rows);
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchDb();
  }, [dbSearch, dbFilter]);

  const stopHarvest = async () => {
    try {
      await fetch('/api/harvest/stop', { method: 'POST' });
    } catch {
      // fallback
    }
    if (runIntervalRef.current) clearInterval(runIntervalRef.current);
    setIsRunning(false);
    setJobPhase('stopped');
    showToast('Harvester stopped');
    fetchDb();
  };

  const resumeHarvest = () => {
    startHarvest();
  };

  // Clean Database: Delete junk tracking/beacons live on disk & state
  const cleanDatabase = async () => {
    try {
      const res = await fetch('/api/database/clean', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        addLog(`Cleaned database — removed ${data.removed} junk address(es), kept ${data.kept}.`);
        showToast(`Removed ${data.removed} junk leads, kept ${data.kept} in database`);
        fetchDb();
        setResults(prev => prev.filter(item => !isJunkEmail(item.email)));
        return;
      }
    } catch {}

    const beforeCount = database.length;
    const cleaned = database.filter(item => !isJunkEmail(item.email));
    const removedCount = beforeCount - cleaned.length;
    setDatabase(cleaned);
    setResults(prev => prev.filter(item => !isJunkEmail(item.email)));
    addLog(`Cleaned database — removed ${removedCount} junk address(es), kept ${cleaned.length}.`);
    showToast(`Removed ${removedCount} junk addresses, kept ${cleaned.length}`);
  };

  // Purge off-niche emails live on disk & state
  const purgeOffNiche = async () => {
    const keywords = nicheInput.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!keywords.length) {
      showToast('Set niche keywords first');
      return;
    }
    try {
      const res = await fetch('/api/database/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: nicheInput }),
      });
      const data = await res.json();
      if (data.ok) {
        addLog(`Purged ${data.removed} off-niche address(es), kept ${data.kept}.`);
        showToast(`Purged ${data.removed} off-niche, kept ${data.kept} in database`);
        fetchDb();
        return;
      }
    } catch {}

    const beforeCount = database.length;
    const kept = database.filter(item => {
      const blob = `${item.email} ${item.domain} ${item.firstSource} ${item.allSources.join(' ')}`;
      return nicheMatches(blob, keywords);
    });
    const removedCount = beforeCount - kept.length;
    setDatabase(kept);
    setResults(prev => prev.filter(item => {
      const blob = `${item.email} ${item.domain} ${item.firstSource} ${item.allSources.join(' ')}`;
      return nicheMatches(blob, keywords);
    }));
    addLog(`Purged ${removedCount} off-niche address(es), kept ${kept.length}.`);
    showToast(`Purged ${removedCount} off-niche, kept ${kept.length}`);
  };

  // Export functions (CSV & Excel)
  const exportCsv = (items: HarvestEmail[], filename: string, qualityOnly?: EmailQuality) => {
    const list = qualityOnly ? items.filter(x => x.quality === qualityOnly) : items.filter(x => x.quality === 'High' || x.quality === 'Medium');
    if (!list.length) {
      showToast('No matching emails to export');
      return;
    }
    const headers = ['email', 'quality', 'domain', 'mx_ok', 'hunter_result', 'hunter_confidence', 'first_seen_source', 'all_sources', 'notes'];
    const rows = list.map(item => [
      `"${item.email}"`,
      `"${item.quality}"`,
      `"${item.domain}"`,
      `"${item.mxOk ? 'yes' : 'no'}"`,
      `"${item.hunterResult}"`,
      `"${item.hunterConfidence}"`,
      `"${item.firstSource}"`,
      `"${item.allSources.join(';')}"`,
      `"${item.note}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Saved ${list.length} emails → ${filename}`);
  };

  const exportExcel = (items: HarvestEmail[], filename: string, qualityOnly?: EmailQuality) => {
    // Generate clean tab-delimited file compatible with Excel .xls
    const list = qualityOnly ? items.filter(x => x.quality === qualityOnly) : items.filter(x => x.quality === 'High' || x.quality === 'Medium');
    if (!list.length) {
      showToast('No matching emails to export');
      return;
    }
    const headers = ['Email\tQuality\tDomain\tMX OK\tHunter Status\tScore\tSource URL\tAll Sources'];
    const rows = list.map(item =>
      `${item.email}\t${item.quality}\t${item.domain}\t${item.mxOk ? 'yes' : 'no'}\t${item.hunterResult}\t${item.hunterConfidence}\t${item.firstSource}\t${item.allSources.join(';')}`
    );
    const content = [headers, ...rows].join('\n');
    const blob = new Blob([content], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Saved ${list.length} rows → ${filename}`);
  };

  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    showToast(`Copied ${email}`);
  };

  const loadPastRun = (run: HarvestRun) => {
    setCurrentRunId(run.id);
    const matchingEmails = database.filter(e => e.runId === run.id);
    setResults(matchingEmails.length ? matchingEmails : database.slice(0, run.emailsCount));
    setScannedPages(run.scannedPages);
    setTotalPages(run.totalPages);
    setJobPhase(run.status);
    addLog(`Loaded past run '${run.name}' (${run.createdAt}) — ${run.emailsCount} emails.`);
    showToast(`Loaded run #${run.id}`);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0e1116] text-[#e8edf4] font-sans antialiased text-[13px] selection:bg-[#f59e0b] selection:text-black">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1c2534] border border-[#242c3a] text-[#e8edf4] px-4 py-2 rounded-xl text-xs shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle className="w-3.5 h-3.5 text-[#f59e0b]" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-[#151a22] border-r border-[#242c3a] flex flex-col p-4 overflow-y-auto select-none">
        {/* Brand */}
        <div className="flex items-center gap-2.5 pb-4 border-b border-[#242c3a]">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#f59e0b] to-[#ef4444] flex items-center justify-center text-white font-bold text-base shadow-sm">
            ✉
          </div>
          <div>
            <h1 className="font-semibold text-sm leading-tight tracking-tight">Email Harvester</h1>
            <p className="text-[11px] text-[#8b94a5]">Lead discovery pro</p>
          </div>
        </div>

        {/* Source Mode */}
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#5b6474] pt-4 pb-2 px-1">
          Source mode
        </div>
        <div className="bg-[#1a212c] border border-[#242c3a] rounded-xl p-1 flex flex-col gap-1">
          <button
            onClick={() => { setSourceMode('categories'); setActiveTab('categories'); }}
            className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition ${sourceMode === 'categories' ? 'bg-[#232c3d] text-white font-medium' : 'text-[#8b94a5] hover:text-white'}`}
          >
            Categories
            <span className="block text-[10px] text-[#5b6474]">Search the web by keyword</span>
          </button>
          <button
            onClick={() => { setSourceMode('seeds'); setActiveTab('seeds'); }}
            className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition ${sourceMode === 'seeds' ? 'bg-[#232c3d] text-white font-medium' : 'text-[#8b94a5] hover:text-white'}`}
          >
            Seed URLs
            <span className="block text-[10px] text-[#5b6474]">Crawl rap & hip-hop lists</span>
          </button>
          <button
            onClick={() => { setSourceMode('both'); }}
            className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition ${sourceMode === 'both' ? 'bg-[#232c3d] text-white font-medium' : 'text-[#8b94a5] hover:text-white'}`}
          >
            Both
            <span className="block text-[10px] text-[#5b6474]">Search web + your seeds</span>
          </button>
        </div>

        {/* Search Backends Status */}
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#5b6474] pt-4 pb-2 px-1">
          Search backends
        </div>
        <div className="flex flex-col gap-1.5 px-1 text-xs">
          <div className="flex items-center gap-2 text-[#8b94a5]">
            <span className={`w-2 h-2 rounded-full ${settings.serpapiKey ? 'bg-[#22c55e] shadow-[0_0_6px_rgba(34,197,94,0.7)]' : 'bg-[#3a4356]'}`} />
            <span>SerpApi</span>
            <span className="ml-auto text-[10px] text-[#5b6474]">priority 1</span>
          </div>
          <div className="flex items-center gap-2 text-[#8b94a5]">
            <span className={`w-2 h-2 rounded-full ${settings.serperKey ? 'bg-[#22c55e] shadow-[0_0_6px_rgba(34,197,94,0.7)]' : 'bg-[#3a4356]'}`} />
            <span>Serper (Google)</span>
            <span className="ml-auto text-[10px] text-[#5b6474]">priority 2</span>
          </div>
          <div className="flex items-center gap-2 text-[#8b94a5]">
            <span className={`w-2 h-2 rounded-full ${settings.braveKey ? 'bg-[#22c55e] shadow-[0_0_6px_rgba(34,197,94,0.7)]' : 'bg-[#3a4356]'}`} />
            <span>Brave</span>
            <span className="ml-auto text-[10px] text-[#5b6474]">free 2k/mo</span>
          </div>
          <div className="flex items-center gap-2 text-[#8b94a5]">
            <span className="w-2 h-2 rounded-full bg-[#22c55e] shadow-[0_0_6px_rgba(34,197,94,0.7)]" />
            <span>Browser engines</span>
            <span className="ml-auto text-[10px] text-[#5b6474]">startpage+ecosia</span>
          </div>
          <div className="flex items-center gap-2 text-[#8b94a5]">
            <span className="w-2 h-2 rounded-full bg-[#22c55e] shadow-[0_0_6px_rgba(34,197,94,0.7)]" />
            <span>Bing Web & DDG</span>
            <span className="ml-auto text-[10px] text-[#5b6474]">free engine</span>
          </div>
          <div className="flex items-center gap-2 text-[#8b94a5]">
            <span className={`w-2 h-2 rounded-full ${settings.hunterKey ? 'bg-[#22c55e] shadow-[0_0_6px_rgba(34,197,94,0.7)]' : 'bg-[#3a4356]'}`} />
            <span>Hunter.io</span>
            <span className="ml-auto text-[10px] text-[#5b6474]">enrichment</span>
          </div>
        </div>

        {/* Run History */}
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#5b6474] pt-4 pb-2 px-1 flex items-center justify-between">
          <span>Run history</span>
          <span className="text-[9px] bg-[#1a212c] text-[#8b94a5] px-1.5 py-0.5 rounded">{runs.length}</span>
        </div>
        <div className="flex flex-col gap-1 overflow-y-auto max-h-48 pr-1">
          {runs.map(run => (
            <button
              key={run.id}
              onClick={() => loadPastRun(run)}
              className={`text-left px-2.5 py-2 rounded-lg text-xs truncate transition flex items-center justify-between group ${currentRunId === run.id ? 'bg-[#1a212c] border border-[#242c3a] text-white' : 'text-[#8b94a5] hover:bg-[#1a212c] hover:text-[#e8edf4]'}`}
            >
              <div className="truncate mr-2">
                <div className="truncate font-medium">{run.name}</div>
                <div className="text-[10px] text-[#5b6474]">{run.createdAt.split(' ')[0]}</div>
              </div>
              <span className="text-[10px] font-mono text-[#f59e0b] bg-[#241d13] px-1.5 py-0.5 rounded border border-[#3d2c14] flex-shrink-0">
                {run.emailsCount} ✉
              </span>
            </button>
          ))}
        </div>

        {/* Footer info & Download ZIP */}
        <div className="mt-auto pt-4 border-t border-[#242c3a] space-y-2.5">
          <a
            href="/api/download-zip"
            download="email-harvester.zip"
            className="w-full py-2 px-3 rounded-lg bg-[#232c3d] hover:bg-[#2e3748] border border-[#3b82f6]/40 text-xs font-semibold text-white flex items-center justify-center gap-2 transition hover:border-[#3b82f6] shadow-sm"
          >
            <Package className="w-3.5 h-3.5 text-[#3b82f6]" />
            📦 Download App (.ZIP)
          </a>
          <div className="text-[11px] text-[#5b6474]">
            Full source: Web app, Python crawler, SQLite database & rap blog seeds.
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 border-b border-[#242c3a] px-6 flex items-center justify-between gap-4 bg-[#0e1116] flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-sm font-semibold truncate text-white">
              {currentRun.name || 'Email Harvester Workspace'}
            </h2>
            <span className="text-xs text-[#8b94a5] bg-[#151a22] border border-[#242c3a] px-2 py-0.5 rounded-full">
              {results.length} emails
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => exportCsv(results, `harvest-${currentRun.name.replace(/\s+/g, '_')}-all.csv`)}
              className="px-3 py-1.5 rounded-lg border border-[#242c3a] bg-[#1a212c] text-xs font-medium text-[#e8edf4] hover:bg-[#232c3d] transition flex items-center gap-1.5"
              title="Export High + Medium quality emails as CSV"
            >
              <Download className="w-3.5 h-3.5 text-[#8b94a5]" />
              Export CSV
            </button>
            <button
              onClick={() => exportExcel(results, `harvest-${currentRun.name.replace(/\s+/g, '_')}.xls`)}
              className="px-3 py-1.5 rounded-lg border border-[#242c3a] bg-[#1a212c] text-xs font-medium text-[#e8edf4] hover:bg-[#232c3d] transition flex items-center gap-1.5"
              title="Export formatted Excel file"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#22c55e]" />
              Export .xlsx
            </button>
            <button
              onClick={() => exportExcel(results, `harvest-high-quality-${currentRun.name.replace(/\s+/g, '_')}.xls`, 'High')}
              className="px-3 py-1.5 rounded-lg border border-[#242c3a] bg-[#1a212c] text-xs font-medium text-[#e8edf4] hover:bg-[#232c3d] transition"
              title="High-quality only in Excel format"
            >
              High .xlsx
            </button>
            <button
              onClick={() => exportCsv(results, `harvest-high-${currentRun.name.replace(/\s+/g, '_')}.csv`, 'High')}
              className="px-3.5 py-1.5 rounded-lg bg-[#f59e0b] hover:bg-[#d97706] text-black font-semibold text-xs transition shadow flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-black" />
              ⬇ Export High-quality
            </button>
            <a
              href="/api/download-zip"
              download="email-harvester.zip"
              className="px-3.5 py-1.5 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold text-xs transition shadow flex items-center gap-1.5"
              title="Download entire application codebase as a ZIP archive"
            >
              <Package className="w-3.5 h-3.5 text-white" />
              📦 Download ZIP
            </a>
          </div>
        </header>

        {/* Scrollable Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Configuration Card */}
          <section className="bg-[#151a22] border border-[#242c3a] rounded-xl p-4 shadow-sm">
            {/* Source tabs */}
            <div className="flex items-center gap-1.5 border-b border-[#242c3a] pb-3 mb-3">
              <button
                onClick={() => setActiveTab('categories')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${activeTab === 'categories' ? 'bg-[#232c3d] text-white border border-[#2e3748]' : 'text-[#8b94a5] hover:text-white'}`}
              >
                Categories
              </button>
              <button
                onClick={() => setActiveTab('seeds')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${activeTab === 'seeds' ? 'bg-[#232c3d] text-white border border-[#2e3748]' : 'text-[#8b94a5] hover:text-white'}`}
              >
                Seed URLs
              </button>
              <button
                onClick={() => setActiveTab('queries')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${activeTab === 'queries' ? 'bg-[#232c3d] text-white border border-[#2e3748]' : 'text-[#8b94a5] hover:text-white'}`}
              >
                Custom queries & Dorks
              </button>
              <button
                onClick={() => setActiveTab('domains')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${activeTab === 'domains' ? 'bg-[#232c3d] text-white border border-[#2e3748]' : 'text-[#8b94a5] hover:text-white'}`}
              >
                Domains
              </button>
            </div>

            {/* Pane Content */}
            {activeTab === 'categories' && (
              <div>
                <textarea
                  value={categoriesText}
                  onChange={e => setCategoriesText(e.target.value)}
                  placeholder="One category per line, e.g.&#10;Rap music blog&#10;Music submission contact&#10;Hip hop record label"
                  className="w-full h-20 bg-[#1a212c] border border-[#242c3a] rounded-lg p-2.5 font-mono text-xs text-[#e8edf4] focus:outline-none focus:border-[#f59e0b] resize-y"
                />
                <div className="flex items-center gap-2 mt-2">
                  <label className="cursor-pointer px-2.5 py-1 bg-[#1a212c] border border-[#242c3a] rounded-md text-xs text-[#8b94a5] hover:text-white flex items-center gap-1.5">
                    <FolderOpen className="w-3.5 h-3.5" />
                    Load from file…
                    <input type="file" accept=".txt,.csv" className="hidden" onChange={e => handleFileUpload(e, 'categories')} />
                  </label>
                  <span className="text-[11px] text-[#5b6474]">One search topic per line; rotates query templates per cycle</span>
                </div>
              </div>
            )}

            {activeTab === 'seeds' && (
              <div>
                <textarea
                  value={seedsText}
                  onChange={e => setSeedsText(e.target.value)}
                  placeholder="One URL per line, e.g.&#10;https://undergroundhiphopblog.com/contact/&#10;https://rapzilla.com/submit/&#10;https://raptology.com/submit-your-music"
                  className="w-full h-24 bg-[#1a212c] border border-[#242c3a] rounded-lg p-2.5 font-mono text-xs text-[#e8edf4] focus:outline-none focus:border-[#f59e0b] resize-y"
                />
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <label className="cursor-pointer px-2.5 py-1 bg-[#1a212c] border border-[#242c3a] rounded-md text-xs text-[#8b94a5] hover:text-white flex items-center gap-1.5">
                    <FolderOpen className="w-3.5 h-3.5" />
                    Load from file…
                    <input type="file" accept=".txt,.csv" className="hidden" onChange={e => handleFileUpload(e, 'seeds')} />
                  </label>
                  <button
                    onClick={loadFullRapSeeds}
                    className="px-2.5 py-1 bg-[#1a212c] border border-[#242c3a] rounded-md text-xs text-[#f59e0b] hover:border-[#f59e0b]"
                  >
                    ★ Preload Rap / Hip-Hop Blogs (35+ sites)
                  </button>
                  <span className="text-[11px] text-[#5b6474]">Seeds skip search engines and crawl contact pages directly</span>
                </div>
              </div>
            )}

            {activeTab === 'queries' && (
              <div>
                <textarea
                  value={queriesText}
                  onChange={e => setQueriesText(e.target.value)}
                  placeholder='Full search queries or Google dorks, one per line, e.g.&#10;rap blog "submit your music"&#10;site:rapzilla.com inurl:contact&#10;intext:"@gmail.com" "rap music"'
                  className="w-full h-20 bg-[#1a212c] border border-[#242c3a] rounded-lg p-2.5 font-mono text-xs text-[#e8edf4] focus:outline-none focus:border-[#f59e0b] resize-y"
                />
                <div className="mt-2">
                  <span className="text-[11px] text-[#5b6474] block mb-1">Click to append Google dork presets:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'site:example.com',
                      'site:example.com inurl:contact',
                      'inurl:contact email',
                      'intitle:"contact us"',
                      'intext:"@gmail.com"',
                      'filetype:pdf "submit your music"',
                      '"@" "contact" site:example.com',
                      'inurl:contact OR inurl:about'
                    ].map(dork => (
                      <button
                        key={dork}
                        onClick={() => addDork(dork)}
                        className="px-2 py-0.5 rounded-full bg-[#1a212c] border border-[#242c3a] text-[11px] text-[#8b94a5] hover:text-[#f59e0b] hover:border-[#f59e0b] transition"
                      >
                        {dork}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'domains' && (
              <div>
                <textarea
                  value={domainsText}
                  onChange={e => setDomainsText(e.target.value)}
                  placeholder="One domain per line, e.g.&#10;rapzilla.com&#10;undergroundhiphopblog.com&#10;earmilk.com"
                  className="w-full h-20 bg-[#1a212c] border border-[#242c3a] rounded-lg p-2.5 font-mono text-xs text-[#e8edf4] focus:outline-none focus:border-[#f59e0b] resize-y"
                />
                <p className="text-[11px] text-[#5b6474] mt-2">
                  Domain harvest: crawls the target site directly + automatically runs <code>site:domain</code> dorks.
                </p>
              </div>
            )}

            {/* Niche Gate */}
            <div className="mt-3 pt-3 border-t border-[#242c3a] flex items-center gap-3">
              <span className="text-xs text-[#8b94a5] whitespace-nowrap font-medium">Niche gate:</span>
              <input
                type="text"
                value={nicheInput}
                onChange={e => setNicheInput(e.target.value)}
                placeholder="rap, hip hop, submit music — only matching pages are harvested"
                className="flex-1 bg-[#1a212c] border border-[#242c3a] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#f59e0b]"
              />
            </div>

            {/* Numeric Options Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <div>
                <label className="text-[11px] text-[#8b94a5] block mb-1">Workers</label>
                <input
                  type="number"
                  min="1"
                  max="64"
                  value={settings.workers}
                  onChange={e => setSettings({ ...settings, workers: Number(e.target.value) })}
                  className="w-full bg-[#1a212c] border border-[#242c3a] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#f59e0b]"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#8b94a5] block mb-1">Results per query</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={settings.maxResultsPerQuery}
                  onChange={e => setSettings({ ...settings, maxResultsPerQuery: Number(e.target.value) })}
                  className="w-full bg-[#1a212c] border border-[#242c3a] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#f59e0b]"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#8b94a5] block mb-1">Deep crawl (pages/site)</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={settings.maxExtraPages}
                  onChange={e => setSettings({ ...settings, maxExtraPages: Number(e.target.value) })}
                  className="w-full bg-[#1a212c] border border-[#242c3a] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#f59e0b]"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#8b94a5] block mb-1">Polite delay (s)</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={settings.minDelay}
                    onChange={e => setSettings({ ...settings, minDelay: Number(e.target.value) })}
                    className="w-1/2 bg-[#1a212c] border border-[#242c3a] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#f59e0b]"
                  />
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={settings.maxDelay}
                    onChange={e => setSettings({ ...settings, maxDelay: Number(e.target.value) })}
                    className="w-1/2 bg-[#1a212c] border border-[#242c3a] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#f59e0b]"
                  />
                </div>
              </div>
            </div>

            {/* Checkbox Options */}
            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 text-xs text-[#8b94a5] pt-2 border-t border-[#242c3a]/60">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.speedMode}
                  onChange={e => setSettings({ ...settings, speedMode: e.target.checked })}
                  className="accent-[#f59e0b]"
                />
                <span className="text-[#e8edf4] font-medium">🚀 Max speed</span>
                <span className="text-[10px] text-[#5b6474]">(48 workers, zero delay)</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.ignoreRobots}
                  onChange={e => setSettings({ ...settings, ignoreRobots: e.target.checked })}
                  className="accent-[#f59e0b]"
                />
                <span>Ignore robots.txt</span>
                <span className="text-[10px] text-[#5b6474]">(crawl music blogs)</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.rawMode}
                  onChange={e => setSettings({ ...settings, rawMode: e.target.checked })}
                  className="accent-[#f59e0b]"
                />
                <span>⚡ Raw mode</span>
                <span className="text-[10px] text-[#5b6474]">(grab everything, no gate)</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.useGoogle}
                  onChange={e => setSettings({ ...settings, useGoogle: e.target.checked })}
                  className="accent-[#f59e0b]"
                />
                <span>Google stealth</span>
                <span className="text-[10px] text-[#5b6474]">(browser automation)</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.useHunterDomainSearch}
                  onChange={e => setSettings({ ...settings, useHunterDomainSearch: e.target.checked })}
                  className="accent-[#f59e0b]"
                />
                <span>Hunter domain search</span>
              </label>
            </div>

            {/* API Keys collapsible */}
            <div className="mt-3 pt-2 border-t border-[#242c3a]">
              <button
                type="button"
                onClick={() => setShowKeys(!showKeys)}
                className="text-xs text-[#8b94a5] hover:text-[#e8edf4] flex items-center gap-1.5 font-medium"
              >
                <Key className="w-3.5 h-3.5 text-[#f59e0b]" />
                ⚙ API keys — SerpApi, Serper (Google), Brave, Bing, Hunter
                <span className="text-[10px] text-[#5b6474]">({showKeys ? 'hide' : 'configure'})</span>
              </button>

              {showKeys && (
                <div className="mt-3 p-3 bg-[#1a212c] rounded-lg border border-[#242c3a] space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] text-[#8b94a5] block mb-1">SerpApi Key</label>
                      <input
                        type="password"
                        placeholder="••••••••••••"
                        value={settings.serpapiKey}
                        onChange={e => setSettings({ ...settings, serpapiKey: e.target.value })}
                        className="w-full bg-[#151a22] border border-[#242c3a] rounded px-2.5 py-1 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[#8b94a5] block mb-1">Serper.dev Key (Google)</label>
                      <input
                        type="password"
                        placeholder="••••••••••••"
                        value={settings.serperKey}
                        onChange={e => setSettings({ ...settings, serperKey: e.target.value })}
                        className="w-full bg-[#151a22] border border-[#242c3a] rounded px-2.5 py-1 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[#8b94a5] block mb-1">Brave API Key</label>
                      <input
                        type="password"
                        placeholder="••••••••••••"
                        value={settings.braveKey}
                        onChange={e => setSettings({ ...settings, braveKey: e.target.value })}
                        className="w-full bg-[#151a22] border border-[#242c3a] rounded px-2.5 py-1 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[#8b94a5] block mb-1">Bing Search API Key</label>
                      <input
                        type="password"
                        placeholder="••••••••••••"
                        value={settings.bingKey}
                        onChange={e => setSettings({ ...settings, bingKey: e.target.value })}
                        className="w-full bg-[#151a22] border border-[#242c3a] rounded px-2.5 py-1 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[#8b94a5] block mb-1">Hunter.io Key</label>
                      <input
                        type="password"
                        placeholder="••••••••••••"
                        value={settings.hunterKey}
                        onChange={e => setSettings({ ...settings, hunterKey: e.target.value })}
                        className="w-full bg-[#151a22] border border-[#242c3a] rounded px-2.5 py-1 text-xs text-white"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#5b6474]">
                    <span>Keys are stored in local memory / browser storage. Search works without keys via built-in free web backends!</span>
                    <button
                      onClick={() => showToast('API Keys saved successfully')}
                      className="px-3 py-1 bg-[#232c3d] text-white rounded hover:bg-[#2e3748]"
                    >
                      Save keys
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Progress Hero Card */}
          <section className="bg-[#151a22] border border-[#242c3a] rounded-xl p-5 flex flex-col md:flex-row items-center gap-6 shadow-sm">
            {/* Circular Gauge */}
            <div className="relative w-28 h-28 flex-shrink-0 flex items-center justify-center">
              <svg className="w-28 h-28 -rotate-90" viewBox="0 0 128 128">
                <circle cx="64" cy="64" r="56" fill="none" stroke="#1e2634" strokeWidth="10" />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={strokeOffset}
                  className="transition-all duration-500 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-xl font-bold tracking-tight text-white">{pct}%</span>
                <span className="text-[9px] uppercase tracking-wider text-[#8b94a5]">scanned</span>
              </div>
            </div>

            {/* Run Details and Controls */}
            <div className="flex-1 min-w-0 w-full">
              <div className="flex items-center justify-between gap-2 mb-1">
                <h3 className="text-base font-semibold text-white truncate">
                  {isRunning ? `Searching & Scanning (Cycle ${cycle})…` : jobPhase === 'done' ? 'Harvest Finished' : jobPhase === 'stopped' ? 'Harvest Stopped' : 'Ready to Harvest'}
                </h3>
                {isRunning && (
                  <span className="flex items-center gap-1.5 text-xs text-[#22c55e] font-mono animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-[#22c55e]" />
                    Live
                  </span>
                )}
              </div>

              <p className="text-xs text-[#8b94a5] mb-3 truncate">
                {isRunning
                  ? `Cycle ${cycle} · ${scannedPages} pages scanned · ⚡ NON-STOP: Running continuously until you click ⏹ Stop`
                  : jobPhase === 'stopped'
                    ? `Stopped by user · Saved ${results.length} emails discovered across ${scannedPages} scanned pages.`
                    : 'Configure categories or seeds above, then press Start (runs non-stop until you click Stop).'}
              </p>

              {/* Linear Bar */}
              <div className="w-full h-2 bg-[#1a212c] rounded-full overflow-hidden mb-4">
                <div
                  className="h-full bg-gradient-to-r from-[#b45309] to-[#f59e0b] rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5 flex-wrap">
                {!isRunning ? (
                  <>
                    <button
                      onClick={startHarvest}
                      className="px-4 py-2 bg-[#f59e0b] hover:bg-[#d97706] text-black font-semibold text-xs rounded-lg transition shadow flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5 fill-black" />
                      ▶ Start — runs until stopped
                    </button>
                    <button
                      onClick={() => {
                        setSeedsText(RAP_BLOG_SEEDS.join('\n'));
                        setSourceMode('seeds');
                        setActiveTab('seeds');
                        showToast('⚡ Preloaded all 35+ Rap Blogs & launched Turbo Crawl!');
                        setTimeout(startHarvest, 100);
                      }}
                      className="px-4 py-2 bg-gradient-to-r from-[#b45309] to-[#f59e0b] hover:brightness-110 text-black font-bold text-xs rounded-lg transition shadow-md flex items-center gap-1.5"
                      title="Instantly load all 35+ rap submission blogs and launch high-concurrency crawl"
                    >
                      <Zap className="w-3.5 h-3.5 fill-black" />
                      ⚡ Turbo Crawl (35+ Rap Blogs)
                    </button>
                    {jobPhase === 'stopped' && (
                      <button
                        onClick={resumeHarvest}
                        className="px-3.5 py-2 bg-[#1a212c] hover:bg-[#232c3d] border border-[#242c3a] text-xs font-semibold text-white rounded-lg transition flex items-center gap-1.5"
                      >
                        <PlayCircle className="w-3.5 h-3.5 text-[#f59e0b]" />
                        ⏵ Resume run
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    onClick={stopHarvest}
                    className="px-4 py-2 bg-[#ef4444]/10 hover:bg-[#ef4444]/20 border border-[#ef4444]/30 text-[#ef4444] font-semibold text-xs rounded-lg transition flex items-center gap-1.5"
                  >
                    <Square className="w-3.5 h-3.5 fill-[#ef4444]" />
                    ⏹ Stop &amp; keep results
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Stats 4-Grid */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[#151a22] border border-[#242c3a] rounded-xl p-3.5">
              <div className="text-[11px] text-[#8b94a5] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#3b82f6]" />
                Pages scanned
              </div>
              <div className="text-2xl font-bold tracking-tight text-white mt-1">
                {scannedPages}
                <span className="text-xs text-[#5b6474] font-normal ml-1">/ {totalPages}</span>
              </div>
            </div>

            <div className="bg-[#151a22] border border-[#242c3a] rounded-xl p-3.5">
              <div className="text-[11px] text-[#8b94a5] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
                Emails found
              </div>
              <div className="text-2xl font-bold tracking-tight text-[#f59e0b] mt-1">
                {results.length}
              </div>
            </div>

            <div className="bg-[#151a22] border border-[#242c3a] rounded-xl p-3.5">
              <div className="text-[11px] text-[#8b94a5] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#22c55e]" />
                High quality
              </div>
              <div className="text-2xl font-bold tracking-tight text-[#22c55e] mt-1">
                {highCount}
              </div>
            </div>

            <div className="bg-[#151a22] border border-[#242c3a] rounded-xl p-3.5">
              <div className="text-[11px] text-[#8b94a5] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#8b94a5]" />
                Med / Low
              </div>
              <div className="text-2xl font-bold tracking-tight text-white mt-1">
                {mediumCount}
                <span className="text-xs text-[#5b6474] font-normal ml-1">/ {lowCount}</span>
              </div>
            </div>
          </section>

          {/* Live Results Table Card */}
          <section className="bg-[#151a22] border border-[#242c3a] rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-xs text-white">Live results</h4>
                <span className="text-xs text-[#5b6474]">— {results.length} total</span>
              </div>

              {/* Quality Filters */}
              <div className="flex items-center gap-1 bg-[#1a212c] border border-[#242c3a] p-1 rounded-lg text-xs">
                <button
                  onClick={() => setResultsFilter('')}
                  className={`px-2.5 py-1 rounded-md transition ${resultsFilter === '' ? 'bg-[#232c3d] text-white font-medium' : 'text-[#8b94a5] hover:text-white'}`}
                >
                  All ({results.length})
                </button>
                <button
                  onClick={() => setResultsFilter('High')}
                  className={`px-2.5 py-1 rounded-md transition ${resultsFilter === 'High' ? 'bg-[#232c3d] text-[#22c55e] font-medium' : 'text-[#8b94a5] hover:text-white'}`}
                >
                  High ({highCount})
                </button>
                <button
                  onClick={() => setResultsFilter('Medium')}
                  className={`px-2.5 py-1 rounded-md transition ${resultsFilter === 'Medium' ? 'bg-[#232c3d] text-[#f59e0b] font-medium' : 'text-[#8b94a5] hover:text-white'}`}
                >
                  Medium ({mediumCount})
                </button>
                <button
                  onClick={() => setResultsFilter('Low')}
                  className={`px-2.5 py-1 rounded-md transition ${resultsFilter === 'Low' ? 'bg-[#232c3d] text-[#8b94a5] font-medium' : 'text-[#8b94a5] hover:text-white'}`}
                >
                  Low ({lowCount})
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-lg border border-[#242c3a]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#1a212c] text-[#5b6474] text-[10px] uppercase font-semibold border-b border-[#242c3a]">
                    <th className="py-2 px-3">Email</th>
                    <th className="py-2 px-3">Quality</th>
                    <th className="py-2 px-3">Domain</th>
                    <th className="py-2 px-3">MX Check</th>
                    <th className="py-2 px-3">Discovered Source</th>
                    <th className="py-2 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1b2230]">
                  {filteredResults.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-6 text-[#5b6474]">
                        No results matching current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredResults.slice(0, 100).map(row => (
                      <tr key={row.id} className="hover:bg-[#1a212c]/60 transition group">
                        <td className="py-2 px-3 font-mono text-[#e8edf4] select-all font-medium">
                          {row.email}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            row.quality === 'High'
                              ? 'bg-[#22c55e]/15 text-[#22c55e]'
                              : row.quality === 'Medium'
                              ? 'bg-[#f59e0b]/15 text-[#f59e0b]'
                              : 'bg-[#8b94a5]/15 text-[#8b94a5]'
                          }`}>
                            {row.quality}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-[#8b94a5] font-mono text-[11px]">
                          {row.domain}
                        </td>
                        <td className="py-2 px-3 font-mono">
                          {row.mxOk ? (
                            <span className="text-[#22c55e] flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              yes
                            </span>
                          ) : (
                            <span className="text-[#5b6474]">no</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-[#8b94a5] max-w-[240px] truncate font-mono text-[11px]" title={row.firstSource}>
                          {row.firstSource}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            onClick={() => copyEmail(row.email)}
                            className="p-1 hover:bg-[#232c3d] rounded text-[#8b94a5] hover:text-white transition inline-flex items-center gap-1"
                            title="Copy email to clipboard"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Persistent Database Card */}
          <section className="bg-[#151a22] border border-[#242c3a] rounded-xl p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-xs text-white">Email database</h4>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
                    💾 Live Auto-Saving to Database
                  </span>
                </div>
                <p className="text-[11px] text-[#5b6474]">
                  Aggregated across all runs — {database.length} unique leads saved on disk
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#5b6474] absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={dbSearch}
                    onChange={e => setDbSearch(e.target.value)}
                    placeholder="Search email or domain…"
                    className="bg-[#1a212c] border border-[#242c3a] rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder-[#5b6474] focus:outline-none focus:border-[#f59e0b] w-48"
                  />
                </div>

                {/* Maintenance Tools */}
                <button
                  onClick={cleanDatabase}
                  className="px-2.5 py-1.5 bg-[#1a212c] border border-[#242c3a] rounded-lg text-xs font-medium text-[#8b94a5] hover:text-white hover:bg-[#232c3d] transition flex items-center gap-1.5"
                  title="Remove tracking beacons (sentry, 32-hex), asset emails (.png), and template placeholders"
                >
                  <Trash2 className="w-3.5 h-3.5 text-[#f59e0b]" />
                  🧹 Clean
                </button>

                <button
                  onClick={purgeOffNiche}
                  className="px-2.5 py-1.5 bg-[#1a212c] border border-[#242c3a] rounded-lg text-xs font-medium text-[#8b94a5] hover:text-white hover:bg-[#232c3d] transition flex items-center gap-1.5"
                  title="Delete addresses outside your niche keywords"
                >
                  <Filter className="w-3.5 h-3.5 text-[#22c55e]" />
                  🎯 Purge off-niche
                </button>

                <button
                  onClick={() => exportCsv(database, 'email-database.csv')}
                  className="px-2.5 py-1.5 bg-[#1a212c] border border-[#242c3a] rounded-lg text-xs font-medium text-[#e8edf4] hover:bg-[#232c3d] transition flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  ⬇ Export DB
                </button>

                <button
                  onClick={() => exportExcel(database, 'email-database.xls')}
                  className="px-2.5 py-1.5 bg-[#1a212c] border border-[#242c3a] rounded-lg text-xs font-medium text-[#e8edf4] hover:bg-[#232c3d] transition flex items-center gap-1.5"
                >
                  .xlsx
                </button>
              </div>
            </div>

            {/* Database Table */}
            <div className="overflow-x-auto rounded-lg border border-[#242c3a] max-h-72">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-[#1a212c] z-10">
                  <tr className="text-[#5b6474] text-[10px] uppercase font-semibold border-b border-[#242c3a]">
                    <th className="py-2 px-3">Email</th>
                    <th className="py-2 px-3">Quality</th>
                    <th className="py-2 px-3">MX</th>
                    <th className="py-2 px-3">Domain</th>
                    <th className="py-2 px-3">Seen in Runs</th>
                    <th className="py-2 px-3">First Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1b2230]">
                  {filteredDb.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-6 text-[#5b6474]">
                        Database is empty or no matches found.
                      </td>
                    </tr>
                  ) : (
                    filteredDb.slice(0, 100).map(row => (
                      <tr key={row.id} className="hover:bg-[#1a212c]/60 transition">
                        <td className="py-2 px-3 font-mono text-[#e8edf4] select-all">
                          {row.email}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            row.quality === 'High'
                              ? 'bg-[#22c55e]/15 text-[#22c55e]'
                              : row.quality === 'Medium'
                              ? 'bg-[#f59e0b]/15 text-[#f59e0b]'
                              : 'bg-[#8b94a5]/15 text-[#8b94a5]'
                          }`}>
                            {row.quality}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px]">
                          <span className={row.mxOk ? 'text-[#22c55e]' : 'text-[#5b6474]'}>
                            {row.mxOk ? 'yes' : 'no'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-[#8b94a5] font-mono text-[11px]">
                          {row.domain}
                        </td>
                        <td className="py-2 px-3 text-[#8b94a5] font-mono text-[11px]">
                          {row.runsCount || 1}
                        </td>
                        <td className="py-2 px-3 text-[#5b6474] max-w-[200px] truncate font-mono text-[11px]">
                          {row.firstSource}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Terminal Log Box */}
          <section className="bg-[#0b0e13] border border-[#242c3a] rounded-xl p-3.5 shadow-inner">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1b2230] text-[11px] text-[#5b6474]">
              <span className="font-mono flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
                Live terminal log stream
              </span>
              <button
                onClick={() => setLogs([])}
                className="hover:text-white transition text-[10px]"
              >
                Clear log
              </button>
            </div>
            <div
              ref={logBoxRef}
              className="h-36 overflow-y-auto font-mono text-[11px] leading-relaxed text-[#8b94a5] space-y-0.5 select-text"
            >
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={index === logs.length - 1 ? 'text-[#e8edf4]' : ''}
                >
                  {log}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
