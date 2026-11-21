'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredMember, getStoredToken } from '@/lib/api';
import {
  Terminal,
  Play,
  Pause,
  Trash2,
  Search,
  Zap,
  Activity,
  Download,
  ChevronRight,
  ChevronDown,
  Radio,
  RefreshCw,
  AlertCircle,
  FileCode,
  ArrowRight,
} from 'lucide-react';

interface LogEntry {
  id?: string;
  timestamp?: string;
  level?: string;
  category?: string;
  message?: any;
  metadata?: Record<string, any> | null;
}

export default function SuperAdminLogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error' | 'paused'>('connecting');
  const [redisActive, setRedisActive] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Fallback REST fetch function
  const fetchRecentLogs = useCallback((token: string) => {
    fetch('/api/super-admin/logs', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data.redis?.connected) {
          setRedisActive(true);
        }
        if (Array.isArray(data.logs)) {
          setLogs((prev) => {
            if (prev.length === 0) return data.logs;
            // Merge & deduplicate by id
            const existingIds = new Set(prev.map((l) => l.id).filter(Boolean));
            const newEntries = data.logs.filter((l: LogEntry) => l.id && !existingIds.has(l.id));
            if (newEntries.length === 0) return prev;
            const merged = [...prev, ...newEntries];
            return merged.length > 300 ? merged.slice(-300) : merged;
          });
        }
      })
      .catch((err) => {
        console.warn('[Logs REST fetch]:', err.message);
      });
  }, []);

  useEffect(() => {
    const member = getStoredMember();
    const token = getStoredToken();

    if (!token || !member?.isSuperAdmin) {
      router.push('/login');
      return;
    }

    // 1. Initial REST fetch
    fetchRecentLogs(token);

    // 2. Establish live SSE stream
    let eventSource: EventSource | null = null;
    let fallbackPollTimer: NodeJS.Timeout | null = null;

    try {
      const sseUrl = `/api/super-admin/logs/stream?token=${encodeURIComponent(token)}`;
      eventSource = new EventSource(sseUrl);

      eventSource.onopen = () => {
        setStatus('connected');
        if (fallbackPollTimer) {
          clearInterval(fallbackPollTimer);
          fallbackPollTimer = null;
        }
      };

      eventSource.addEventListener('initial', (e: MessageEvent) => {
        try {
          const initial = JSON.parse(e.data);
          if (Array.isArray(initial)) {
            setLogs(initial);
          }
        } catch (err) {
          console.warn('Failed to parse initial logs:', err);
        }
      });

      eventSource.addEventListener('log', (e: MessageEvent) => {
        try {
          const entry: LogEntry = JSON.parse(e.data);
          if (!entry) return;

          setLogs((prev) => {
            // Avoid duplicate log entries by id
            if (entry.id && prev.some((l) => l.id === entry.id)) {
              return prev;
            }
            const next = [...prev, entry];
            return next.length > 300 ? next.slice(-300) : next;
          });
        } catch (err) {
          console.warn('Failed to parse log entry:', err);
        }
      });

      eventSource.onerror = () => {
        setStatus('error');
        // Activate smooth polling fallback every 4 seconds if SSE drops
        if (!fallbackPollTimer) {
          fallbackPollTimer = setInterval(() => {
            fetchRecentLogs(token);
          }, 4000);
        }
      };
    } catch {
      setStatus('error');
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      if (fallbackPollTimer) {
        clearInterval(fallbackPollTimer);
      }
    };
  }, [router, fetchRecentLogs]);

  // Auto-scroll when new logs arrive (if not paused)
  useEffect(() => {
    if (!isPaused && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length, isPaused]);

  const handleClear = () => {
    setLogs([]);
  };

  const handleExport = () => {
    const json = JSON.stringify(logs, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `authguard-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = logs.filter((log) => {
    if (!log) return false;
    const level = (log.level || 'INFO').toUpperCase();
    if (filterLevel !== 'ALL' && level !== filterLevel) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const msg = typeof log.message === 'object' ? JSON.stringify(log.message) : String(log.message ?? '');
      const matchMsg = msg.toLowerCase().includes(q);
      const matchMeta = log.metadata ? JSON.stringify(log.metadata).toLowerCase().includes(q) : false;
      const matchCat = String(log.category || '').toLowerCase().includes(q);
      return matchMsg || matchMeta || matchCat;
    }
    return true;
  });

  const getLevelBadge = (level?: string) => {
    const lvl = (level || 'INFO').toUpperCase();
    switch (lvl) {
      case 'INFO':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/30';
      case 'AUTH':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'PUSH':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'SECURITY':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'WARN':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      case 'ERROR':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const formatTimestamp = (ts?: string) => {
    if (!ts) return '--:--:--';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return String(ts);
      return d.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
      });
    } catch {
      return String(ts);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Terminal className="h-5 w-5 text-blue-400" />
            <h1 className="text-2xl font-bold text-white tracking-tight">Live Backend Logs & Telemetry</h1>
          </div>
          <p className="text-sm text-slate-400">
            Real-time distributed system event stream, push challenge delivery, security audits, and API logs
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-medium">
            <Radio className={`h-3.5 w-3.5 ${status === 'connected' ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} />
            <span className={status === 'connected' ? 'text-emerald-400' : 'text-amber-400'}>
              {status === 'connected' ? 'SSE Live Stream Active' : status === 'error' ? 'Live Stream Polling Active' : 'Connecting...'}
            </span>
          </span>
          <button
            onClick={() => {
              const token = getStoredToken();
              if (token) fetchRecentLogs(token);
            }}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Refresh Logs"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Telemetry Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-medium">Stream Status</div>
            <div className="text-sm font-semibold mt-1 flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    status === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                ></span>
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    status === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                ></span>
              </span>
              <span className={status === 'connected' ? 'text-emerald-400' : 'text-amber-400'}>
                {status === 'connected' ? 'Connected (Zero Lag)' : 'Live Polling Mode'}
              </span>
            </div>
          </div>
          <Activity className="h-6 w-6 text-slate-500" />
        </div>

        <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-medium">Redis Acceleration</div>
            <div className="text-sm font-semibold mt-1 flex items-center gap-1.5">
              <Zap className={`h-4 w-4 ${redisActive ? 'text-amber-400' : 'text-slate-500'}`} />
              <span className={redisActive ? 'text-amber-400' : 'text-slate-400'}>
                {redisActive ? 'Redis 7.0 (Active)' : 'High-Speed In-Memory'}
              </span>
            </div>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            {redisActive ? 'Distributed Pub/Sub' : 'Local Fallback'}
          </span>
        </div>

        <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-medium">Captured Events</div>
            <div className="text-xl font-bold text-white mt-0.5">{logs.length}</div>
          </div>
          <Terminal className="h-6 w-6 text-blue-500" />
        </div>

        <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-medium">Auto-Scroll</div>
            <div className="text-sm font-semibold text-white mt-1">
              {isPaused ? (
                <span className="text-amber-400">Paused (Viewing History)</span>
              ) : (
                <span className="text-emerald-400">Active (Auto-Tracking)</span>
              )}
            </div>
          </div>
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`p-2 rounded-lg border text-xs font-medium transition-colors ${
              isPaused
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title={isPaused ? 'Resume Auto-Scroll' : 'Pause Auto-Scroll'}
          >
            {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Filter & Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Filter logs by message, IP, path..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-64"
            />
          </div>

          {/* Level Selector Pills */}
          <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-xs">
            {['ALL', 'INFO', 'AUTH', 'PUSH', 'SECURITY', 'WARN', 'ERROR'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilterLevel(lvl)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  filterLevel === lvl
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs font-medium text-slate-300 flex items-center gap-1.5 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export JSON
          </button>
          <button
            onClick={handleClear}
            className="px-3 py-1.5 bg-slate-900 hover:bg-rose-950/40 border border-slate-700 hover:border-rose-700/50 rounded-lg text-xs font-medium text-slate-300 hover:text-rose-400 flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear Console
          </button>
        </div>
      </div>

      {/* Live Terminal Window */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col">
        {/* Terminal Title Bar */}
        <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-rose-500/80"></div>
              <div className="h-3 w-3 rounded-full bg-amber-500/80"></div>
              <div className="h-3 w-3 rounded-full bg-emerald-500/80"></div>
            </div>
            <span className="text-xs font-mono text-slate-400 ml-2">
              authguard@cluster: /var/log/authguard/live.stream
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-500">
            Showing {filteredLogs.length} of {logs.length} events
          </div>
        </div>

        {/* Terminal Output Area */}
        <div
          ref={terminalRef}
          className="p-4 font-mono text-xs overflow-y-auto max-h-[600px] min-h-[420px] space-y-1.5 bg-slate-950"
        >
          {filteredLogs.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-slate-500 gap-2">
              <Terminal className="h-8 w-8 text-slate-600" />
              <p>No matching logs in buffer. Waiting for live events...</p>
              <p className="text-[10px] text-slate-600">Send an API request, enroll a user, or dispatch a push challenge to see it stream live.</p>
            </div>
          ) : (
            filteredLogs.map((log, index) => {
              if (!log) return null;
              const logKey = log.id ? `${log.id}-${index}` : `log-${index}`;
              const isExpanded = expandedId === (log.id || logKey);
              const hasMeta = log.metadata && typeof log.metadata === 'object' && Object.keys(log.metadata).length > 0;
              const safeMsg = typeof log.message === 'object' ? JSON.stringify(log.message) : String(log.message ?? '');
              const safeLevel = (log.level || 'INFO').toUpperCase();
              const safeCategory = (log.category || 'system').toLowerCase();

              return (
                <div
                  key={logKey}
                  className={`group border rounded-lg p-2 transition-colors ${
                    isExpanded
                      ? 'border-slate-700 bg-slate-900/90 shadow-lg'
                      : log.metadata?.errorReason || safeLevel === 'ERROR'
                      ? 'border-rose-950/60 bg-rose-950/10 hover:border-rose-800 hover:bg-slate-900/60'
                      : 'border-transparent hover:border-slate-800 hover:bg-slate-900/50'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Expand Arrow if metadata exists */}
                    <button
                      onClick={() => hasMeta && setExpandedId(isExpanded ? null : (log.id || logKey))}
                      className={`text-slate-500 hover:text-white transition-colors mt-0.5 ${
                        !hasMeta ? 'opacity-20 cursor-default' : ''
                      }`}
                      title={hasMeta ? (isExpanded ? 'Collapse' : 'Expand Details') : 'No metadata'}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-blue-400" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {/* Timestamp */}
                    <span className="text-slate-500 shrink-0 select-none">
                      {formatTimestamp(log.timestamp)}
                    </span>

                    {/* Level Badge */}
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-semibold border shrink-0 ${getLevelBadge(
                        safeLevel
                      )}`}
                    >
                      [{safeLevel}]
                    </span>

                    {/* Category */}
                    <span className="text-slate-400 font-semibold shrink-0">
                      [{safeCategory}]
                    </span>

                    {/* Error Tag if captured */}
                    {log.metadata?.errorReason && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-950/80 border border-rose-800 text-[10px] text-rose-300 font-mono shrink-0 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 text-rose-400" />
                        <span className="truncate max-w-[200px]">{String(log.metadata.errorReason)}</span>
                      </span>
                    )}

                    {/* Message */}
                    <span
                      className={`flex-1 break-all ${
                        safeLevel === 'ERROR'
                          ? 'text-rose-300'
                          : safeLevel === 'WARN'
                          ? 'text-yellow-300'
                          : safeLevel === 'SECURITY'
                          ? 'text-amber-300'
                          : safeLevel === 'PUSH'
                          ? 'text-purple-300'
                          : safeLevel === 'AUTH'
                          ? 'text-emerald-300'
                          : 'text-slate-200'
                      }`}
                    >
                      {safeMsg}
                    </span>
                  </div>

                  {/* Metadata & Error Details Inspection if toggled */}
                  {isExpanded && hasMeta && (
                    <div className="mt-3 ml-6 space-y-3 pt-2 border-t border-slate-800/80 text-[11px]">
                      {/* Highlighted Error Banner if present */}
                      {log.metadata?.errorReason && (
                        <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800/90 text-rose-200 flex items-start gap-2.5 shadow-md">
                          <AlertCircle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-bold text-rose-300 uppercase tracking-wider">
                              Server Error / Failure Reason:
                            </div>
                            <div className="text-xs font-semibold text-white mt-0.5 font-mono">
                              {String(log.metadata.errorReason)}
                            </div>
                            {log.metadata.statusCode && (
                              <div className="text-[11px] text-rose-300/80 mt-1">
                                HTTP Status: <span className="font-bold text-white">{log.metadata.statusCode}</span> •
                                Endpoint: <code className="text-rose-200">{log.metadata.method} {log.metadata.path}</code>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Request & Response Inspection Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Request Summary & Body */}
                        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                          <div className="flex items-center justify-between text-slate-400 font-semibold mb-2">
                            <span className="flex items-center gap-1.5 text-xs text-blue-400">
                              <FileCode className="h-3.5 w-3.5" />
                              <span>Request Info & Payload</span>
                            </span>
                            {log.metadata?.method && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-white">
                                {log.metadata.method}
                              </span>
                            )}
                          </div>

                          <div className="space-y-1 text-slate-400 text-[11px] mb-2 font-mono">
                            <div><span className="text-slate-500">Path:</span> <span className="text-slate-200">{log.metadata?.path || '-'}</span></div>
                            <div><span className="text-slate-500">Client IP:</span> <span className="text-slate-300">{log.metadata?.ip || '-'}</span></div>
                            {log.metadata?.durationMs !== undefined && (
                              <div><span className="text-slate-500">Latency:</span> <span className="text-emerald-400">{log.metadata.durationMs}ms</span></div>
                            )}
                          </div>

                          {log.metadata?.requestBody ? (
                            <div>
                              <div className="text-[10px] text-slate-500 uppercase font-sans font-semibold mb-1">Body Payload:</div>
                              <pre className="p-2 rounded bg-slate-900 border border-slate-800 text-slate-200 font-mono text-[10px] max-h-48 overflow-y-auto">
                                {JSON.stringify(log.metadata.requestBody, null, 2)}
                              </pre>
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-600 italic">No request payload sent</div>
                          )}
                        </div>

                        {/* Response Payload */}
                        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                          <div className="flex items-center justify-between text-slate-400 font-semibold mb-2">
                            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                              <ArrowRight className="h-3.5 w-3.5" />
                              <span>Server Response</span>
                            </span>
                            {log.metadata?.statusCode && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                                  log.metadata.statusCode >= 400
                                    ? 'bg-rose-950 border border-rose-800 text-rose-300'
                                    : 'bg-emerald-950 border border-emerald-800 text-emerald-300'
                                }`}
                              >
                                HTTP {log.metadata.statusCode}
                              </span>
                            )}
                          </div>

                          {log.metadata?.responseBody ? (
                            <pre
                              className={`p-2 rounded border font-mono text-[10px] max-h-60 overflow-y-auto ${
                                log.metadata.statusCode >= 400
                                  ? 'bg-rose-950/30 border-rose-900/60 text-rose-200'
                                  : 'bg-slate-900 border-slate-800 text-emerald-300'
                              }`}
                            >
                              {JSON.stringify(log.metadata.responseBody, null, 2)}
                            </pre>
                          ) : (
                            <div className="text-[10px] text-slate-600 italic">No response payload captured</div>
                          )}
                        </div>
                      </div>

                      {/* Raw Metadata Details */}
                      <details className="text-[10px] text-slate-500">
                        <summary className="cursor-pointer hover:text-slate-300 font-sans font-medium select-none">
                          View full raw metadata JSON
                        </summary>
                        <pre className="mt-2 p-2.5 rounded bg-slate-900 border border-slate-800 text-slate-300 font-mono text-[10px] overflow-x-auto">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
}
