'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import {
  Users,
  Smartphone,
  CheckCircle2,
  Send,
  Loader2,
  Clock,
  TrendingUp,
  Search,
  ShieldCheck,
  AlertCircle,
  Lock,
} from 'lucide-react';
import { apiClient } from '@/lib/api';

interface TenantUser {
  id: string;
  username?: string;
  email?: string;
  two_factor_enabled: boolean;
  active_devices_count: number;
}

export default function TenantOverviewPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Push Simulator state
  const [testEmail, setTestEmail] = useState('');
  const [selectedUser, setSelectedUser] = useState<TenantUser | null>(null);
  const [suggestions, setSuggestions] = useState<TenantUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  const fetchStats = async () => {
    try {
      const data = await apiClient('/api/tenant/stats');
      setStats(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // Debounced search for tenant users
  useEffect(() => {
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const queryParam = testEmail.trim() ? `?q=${encodeURIComponent(testEmail.trim())}` : '';
        const res = await apiClient(`/api/tenant/users${queryParam}`);
        setSuggestions(res.users || []);
      } catch (err) {
        console.error('Failed to search tenant users:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [testEmail]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleSelectUser = (user: TenantUser) => {
    setTestEmail(user.username || user.email || '');
    setSelectedUser(user);
    setShowDropdown(false);
  };

  const handleTestPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail) return;

    setTestLoading(true);
    setTestResult(null);
    setTestStatus('Sending push notification to user device(s)...');

    try {
      const res = await apiClient('/api/tenant/test-push', {
        method: 'POST',
        body: JSON.stringify({ username: testEmail }),
      });

      setTestResult(res);
      setTestStatus(`Push sent! Present number ${res.challengeNumber} to user.`);

      // Poll status (3s interval, max 25 attempts / 75 seconds)
      let attempts = 0;
      const timer = setInterval(async () => {
        attempts++;
        if (attempts > 25) {
          clearInterval(timer);
          setTestStatus('⏱️ Push Challenge Expired.');
          return;
        }

        try {
          const s = await apiClient(`/api/tenant/push/status/${res.requestId}`);
          if (s.status === 'approved') {
            clearInterval(timer);
            setTestStatus('🎉 Push Challenge Approved by user!');
            fetchStats();
          } else if (s.status === 'denied') {
            clearInterval(timer);
            setTestStatus('❌ Push Challenge Denied by user.');
            fetchStats();
          } else if (s.status === 'expired') {
            clearInterval(timer);
            setTestStatus('⏱️ Push Challenge Expired.');
          }
        } catch {
          // ignore transient polling errors
        }
      }, 3000);
    } catch (err: any) {
      setTestStatus(`Error: ${err.message}`);
    } finally {
      setTestLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Tenant Overview</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time metrics and authentication analytics for your workspace
          </p>
        </div>
        <Link
          href="/dashboard/security"
          className="bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 font-medium py-2 px-3.5 rounded-xl text-xs transition-colors flex items-center gap-2 self-start sm:self-auto shadow-sm"
        >
          <Lock className="h-3.5 w-3.5 text-blue-400" />
          <span>Security & Password</span>
        </Link>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Enrolled End Users</span>
            <Users className="h-4 w-4 text-blue-400" />
          </div>
          <div className="mt-3 text-2xl font-bold text-white tracking-tight">
            {stats?.totalUsers || 0}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Registered in this organization</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Active Paired Devices</span>
            <Smartphone className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-3 text-2xl font-bold text-white tracking-tight">
            {stats?.activeDevices || 0}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Hardware & PWA keys online</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>MFA Push Challenges</span>
            <CheckCircle2 className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="mt-3 text-2xl font-bold text-white tracking-tight">
            {stats?.totalChallenges || 0}
          </div>
          <div className="mt-1 text-[11px] text-emerald-400 font-medium">
            {stats?.approvedChallenges || 0} Approved
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Verification Rate</span>
            <TrendingUp className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-3 text-2xl font-bold text-white tracking-tight">
            {stats?.verificationRate || 100}%
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Approval success ratio</div>
        </div>
      </div>

      {/* Main Grid: Simulator & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Simulator Widget */}
        <div className="lg:col-span-1 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <h2 className="text-base font-semibold text-white">Live Push Simulator</h2>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Trigger a real-time push challenge to any enrolled device from this workspace.
            </p>

            <form onSubmit={handleTestPush} className="space-y-3">
              {/* Debounced Search Input with Tenant-Scoped Dropdown */}
              <div className="relative" ref={searchContainerRef}>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Target Username / Identifier (Scoped to this Tenant)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={testEmail}
                    onFocus={() => setShowDropdown(true)}
                    onChange={(e) => {
                      setTestEmail(e.target.value);
                      setSelectedUser(null);
                      setShowDropdown(true);
                    }}
                    placeholder="Search enrolled user by username, identifier or email..."
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-3.5 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-medium"
                  />
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                    {searchLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                    ) : (
                      <Search className="h-3.5 w-3.5" />
                    )}
                  </div>
                </div>

                {/* Dropdown with filtered users strictly belonging to this tenant */}
                {showDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 z-30 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-h-56 overflow-y-auto divide-y divide-slate-800/80 animate-in fade-in duration-100">
                    <div className="p-2 bg-slate-950/70 border-b border-slate-800 text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Matching Workspace Users</span>
                      <span>Total: {suggestions.length}</span>
                    </div>

                    {suggestions.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500">
                        {testEmail.trim()
                          ? 'No matching users found in this workspace'
                          : 'No enrolled users found in this workspace'}
                      </div>
                    ) : (
                      suggestions.map((u) => {
                        const userIdentifier = u.username || u.email || '';
                        const hasActiveDevice = Number(u.active_devices_count) > 0;
                        const isSelected = testEmail.toLowerCase() === userIdentifier.toLowerCase();

                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => handleSelectUser(u)}
                            className={`w-full p-2.5 text-left text-xs transition-colors flex items-center justify-between gap-2 hover:bg-slate-800/80 ${
                              isSelected ? 'bg-blue-950/30 text-blue-300' : 'text-slate-200'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold truncate">{userIdentifier}</div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                                {u.two_factor_enabled ? (
                                  <span className="text-emerald-400 flex items-center gap-0.5">
                                    <ShieldCheck className="h-3 w-3" />
                                    <span>2FA Active</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-500">2FA Pending</span>
                                )}
                              </div>
                            </div>

                            <div className="shrink-0">
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                  hasActiveDevice
                                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                                    : 'bg-amber-950/80 text-amber-300 border-amber-800'
                                }`}
                              >
                                {hasActiveDevice
                                  ? `${u.active_devices_count} Device`
                                  : 'No Device'}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Device Status Hint */}
                {selectedUser && selectedUser.active_devices_count === 0 && (
                  <div className="mt-1.5 p-2 bg-amber-950/30 border border-amber-800/60 rounded-lg flex items-center gap-1.5 text-[11px] text-amber-300">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <span>User has no active mobile devices. Push may fail until enrolled.</span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={testLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-md shadow-emerald-600/20"
              >
                {testLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>Dispatch 2FA Push</span>
                  </>
                )}
              </button>
            </form>

            {testStatus && (
              <div className="mt-4 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                {testResult && (
                  <div className="text-center py-2 mb-2 border-b border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Number to Match</div>
                    <div className="text-3xl font-extrabold text-emerald-400 font-mono tracking-widest mt-1">
                      {testResult.challengeNumber}
                    </div>
                  </div>
                )}
                <div className="text-slate-300 leading-relaxed font-medium">{testStatus}</div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Authentication Activity */}
        <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col min-h-[420px]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">Recent Authentication Logs</h2>
            <Clock className="h-4 w-4 text-slate-500" />
          </div>

          {!stats?.recentActivity || stats.recentActivity.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12 text-slate-500 text-sm">
              No authentication events recorded yet. Trigger a push challenge above to start.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80 flex-1">
              {stats.recentActivity.map((log: any) => (
                <div key={log.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-white">{log.email}</div>
                    <div className="text-slate-500 text-[11px] font-mono mt-0.5">
                      Match Number: {log.challenge_number} • {new Date(log.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                  <div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                        log.status === 'approved'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : log.status === 'denied'
                          ? 'bg-red-950 text-red-400 border border-red-800'
                          : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {log.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
