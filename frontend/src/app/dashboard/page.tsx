'use client';

import React, { useEffect, useState } from 'react';
import {
  Users,
  Smartphone,
  CheckCircle2,
  Send,
  Loader2,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { apiClient } from '@/lib/api';

export default function TenantOverviewPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Push Simulator state
  const [testEmail, setTestEmail] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);

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

  const handleTestPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail) return;

    setTestLoading(true);
    setTestResult(null);
    setTestStatus('Sending push notification to user device(s)...');

    try {
      const res = await apiClient('/api/tenant/test-push', {
        method: 'POST',
        body: JSON.stringify({ email: testEmail }),
      });

      setTestResult(res);
      setTestStatus(`Push sent! Present number ${res.challengeNumber} to user.`);

      // Poll status
      const timer = setInterval(async () => {
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
        } catch {}
      }, 1500);
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
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Tenant Overview</h1>
        <p className="text-sm text-slate-400 mt-1">
          Real-time metrics and authentication analytics for your workspace
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Enrolled Users</span>
            <Users className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-3">{stats?.totalUsers || 0}</div>
          <div className="text-[11px] text-slate-500 mt-1">2FA-activated accounts</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Devices</span>
            <Smartphone className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-3">{stats?.activeDevices || 0}</div>
          <div className="text-[11px] text-slate-500 mt-1">Registered PWA / Mobile keys</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Push Challenges</span>
            <TrendingUp className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-3">{stats?.totalChallenges || 0}</div>
          <div className="text-[11px] text-slate-500 mt-1">{stats?.approvedChallenges || 0} approved</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Verification Rate</span>
            <CheckCircle2 className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-3">{stats?.verificationRate || 100}%</div>
          <div className="text-[11px] text-slate-500 mt-1">Phishing-resistant approval</div>
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
              <div>
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="enrolled-user@company.com"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={testLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
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
        <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">Recent Authentication Logs</h2>
            <Clock className="h-4 w-4 text-slate-500" />
          </div>

          {!stats?.recentActivity || stats.recentActivity.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              No authentication events recorded yet. Trigger a push challenge above to start.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
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
