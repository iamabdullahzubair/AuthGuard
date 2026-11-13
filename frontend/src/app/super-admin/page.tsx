'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Crown, Building, Users, Smartphone, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api';

export default function SuperAdminOverviewPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient('/api/super-admin/stats')
      .then((data) => setStats(data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Crown className="h-5 w-5 text-amber-400" />
            <h1 className="text-2xl font-bold text-white tracking-tight">Super Admin Platform Control</h1>
          </div>
          <p className="text-sm text-slate-400">
            Global metrics and multi-tenant management for <code className="text-amber-400 font-mono">{stats?.adminUser}</code>
          </p>
        </div>

        <Link
          href="/super-admin/tenants"
          className="bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors flex items-center gap-2 shadow-md shadow-amber-600/20"
        >
          <span>Manage Tenants</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Global Platform Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Tenants</span>
            <Building className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-3">{stats?.tenants?.total || 0}</div>
          <div className="text-[11px] text-emerald-400 mt-1">{stats?.tenants?.active || 0} active organizations</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Platform End-Users</span>
            <Users className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-3">{stats?.endUsers || 0}</div>
          <div className="text-[11px] text-slate-500 mt-1">Across all client tenants</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Enrolled Devices</span>
            <Smartphone className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-3">{stats?.activeDevices || 0}</div>
          <div className="text-[11px] text-slate-500 mt-1">Active PWA / Mobile keys</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Global Verification Rate</span>
            <ShieldCheck className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-3">{stats?.challenges?.rate || 100}%</div>
          <div className="text-[11px] text-slate-500 mt-1">{stats?.challenges?.total || 0} total requests</div>
        </div>
      </div>

      {/* Platform Health and Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-white mb-2">Platform Infrastructure Status</h2>
          <div className="space-y-3 mt-4 text-xs">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-300">PostgreSQL Multi-Tenant Engine</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Operational
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-300">Web Push VAPID Service</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Operational
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-300">ECDSA P-256 WebCrypto Signature Verification</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Hardware Accelerated
              </span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-white mb-2">Quick Administration</h2>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              As platform Super Admin, you can onboard new B2B enterprise tenants, inspect client usage, manage tier allocations, or suspend non-compliant accounts.
            </p>
          </div>

          <Link
            href="/super-admin/tenants"
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-2.5 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-2"
          >
            <Building className="h-4 w-4" />
            <span>Open Tenants Directory</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
