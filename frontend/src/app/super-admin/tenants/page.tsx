'use client';

import React, { useEffect, useState } from 'react';
import { Building, Plus, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api';

export default function SuperAdminTenantsPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // New Tenant Form
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [initialPassword, setInitialPassword] = useState('Welcome123!Secure');
  const [tier, setTier] = useState('enterprise');
  const [submitting, setSubmitting] = useState(false);
  const [createdResult, setCreatedResult] = useState<any>(null);

  const fetchTenants = async () => {
    try {
      const data = await apiClient('/api/super-admin/tenants');
      setTenants(data.tenants || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const handleToggleStatus = async (tenantId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    if (!confirm(`Are you sure you want to change this tenant status to ${newStatus}?`)) return;

    try {
      await apiClient(`/api/super-admin/tenants/${tenantId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      fetchTenants();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleChangeTier = async (tenantId: string, newTier: string) => {
    try {
      await apiClient(`/api/super-admin/tenants/${tenantId}`, {
        method: 'PATCH',
        body: JSON.stringify({ tier: newTier }),
      });
      fetchTenants();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setCreatedResult(null);

    try {
      const res = await apiClient('/api/super-admin/tenants', {
        method: 'POST',
        body: JSON.stringify({ name, slug, ownerEmail, initialPassword, tier }),
      });

      setCreatedResult(res);
      setName('');
      setSlug('');
      setOwnerEmail('');
      fetchTenants();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Tenants Directory</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage client workspaces, service tiers, and active status across AuthGuard
          </p>
        </div>
        <button
          onClick={() => {
            setCreatedResult(null);
            setShowModal(true);
          }}
          className="bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors flex items-center gap-2 shadow-md shadow-amber-600/20"
        >
          <Plus className="h-4 w-4" />
          <span>Onboard New Tenant</span>
        </button>
      </div>

      {/* Tenants Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building className="h-4 w-4 text-amber-400" />
            <span>All Organizations</span>
          </div>
          <span>Total: {tenants.length}</span>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="h-6 w-6 text-amber-500 animate-spin mx-auto" />
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {tenants.map((t) => (
              <div key={t.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-850/50 transition-colors">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-sm">{t.name}</span>
                    <code className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      /{t.slug}
                    </code>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                        t.status === 'active'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-red-950 text-red-400 border border-red-800'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>

                  <div className="text-slate-400 text-[11px] flex items-center gap-4 flex-wrap">
                    <span>End Users: <strong className="text-white">{t.end_users_count || 0}</strong></span>
                    <span>API Keys: <strong className="text-white">{t.api_keys_count || 0}</strong></span>
                    <span>Created: {new Date(t.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <select
                    value={t.tier}
                    onChange={(e) => handleChangeTier(t.id, e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white capitalize font-medium focus:outline-none focus:border-amber-500"
                  >
                    <option value="developer">Developer</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>

                  <button
                    onClick={() => handleToggleStatus(t.id, t.status)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                      t.status === 'active'
                        ? 'bg-red-950/40 border-red-800 text-red-300 hover:bg-red-900/60'
                        : 'bg-emerald-950/40 border-emerald-800 text-emerald-300 hover:bg-emerald-900/60'
                    }`}
                  >
                    {t.status === 'active' ? 'Suspend' : 'Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Onboard Tenant */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Onboard Enterprise Tenant</h3>
            <p className="text-xs text-slate-400 mb-4">
              Manually provision an organization workspace with initial credentials
            </p>

            {createdResult ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-800 text-xs text-emerald-300 space-y-2">
                  <div className="font-bold text-sm">Tenant Provisioned Successfully!</div>
                  <div><strong>Name:</strong> {createdResult.name}</div>
                  <div><strong>Slug:</strong> /{createdResult.slug}</div>
                  <div><strong>Owner Email:</strong> {createdResult.ownerEmail}</div>
                  <div><strong>Initial Live API Key:</strong></div>
                  <code className="block p-2 rounded bg-slate-950 text-white font-mono break-all border border-slate-800">
                    {createdResult.apiKey}
                  </code>
                </div>

                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-xl text-xs font-semibold"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateTenant} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
                    }}
                    placeholder="FinTech Global"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Tenant Slug</label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="fintech-global"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Owner Email</label>
                  <input
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="admin@fintechglobal.com"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Tier</label>
                  <select
                    value={tier}
                    onChange={(e) => setTier(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="developer">Developer</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-amber-600 hover:bg-amber-500 text-white font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5"
                  >
                    {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>Provision Tenant</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
