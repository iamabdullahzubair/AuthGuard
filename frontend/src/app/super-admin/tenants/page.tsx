'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building, Plus, Loader2, ExternalLink, Copy, Check, Globe, RefreshCw, AlertCircle, KeyRound, X, ShieldCheck } from 'lucide-react';
import { apiClient, setStoredAuth } from '@/lib/api';
import ConfirmModal from '@/components/ConfirmModal';

export default function SuperAdminTenantsPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // New Tenant Form
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [isSlugCustom, setIsSlugCustom] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [initialPassword, setInitialPassword] = useState('Welcome123!Secure');
  const [tier, setTier] = useState('enterprise');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<any>(null);

  // Confirmation Modal State for Status Toggle
  const [statusConfirm, setStatusConfirm] = useState<{
    isOpen: boolean;
    tenantId: string;
    currentStatus: string;
    tenantName: string;
  } | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  // Reset Tenant Password State
  const [resetTenant, setResetTenant] = useState<any | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  const generateSlug = (val: string) => {
    return val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const fetchTenants = async () => {
    try {
      const data = await apiClient('/api/super-admin/tenants');
      setTenants(data.tenants || []);
    } catch (err: any) {
      console.error(err);
      setErrorBanner(err.message || 'Failed to fetch tenants');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const handleEnterTenant = async (tenantId: string) => {
    try {
      const res = await apiClient(`/api/super-admin/impersonate/${tenantId}`, {
        method: 'POST',
      });
      setStoredAuth(res.token, res.member, res.tenant);
      router.push('/dashboard');
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to enter tenant workspace');
    }
  };

  const copyTenantUrl = (tenantSlug: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/login?tenant=${tenantSlug}`;
    navigator.clipboard.writeText(url);
    setCopiedSlug(tenantSlug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const openStatusConfirm = (tenantId: string, currentStatus: string, tenantName: string) => {
    setStatusConfirm({
      isOpen: true,
      tenantId,
      currentStatus,
      tenantName,
    });
  };

  const handleExecuteStatusToggle = async () => {
    if (!statusConfirm) return;
    setStatusUpdating(true);
    const newStatus = statusConfirm.currentStatus === 'active' ? 'suspended' : 'active';

    try {
      await apiClient(`/api/super-admin/tenants/${statusConfirm.tenantId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      setStatusConfirm(null);
      fetchTenants();
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to update tenant status');
    } finally {
      setStatusUpdating(false);
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
      setErrorBanner(err.message || 'Failed to change tier');
    }
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!isSlugCustom) {
      setSlug(generateSlug(val));
    }
  };

  const handleSlugChange = (val: string) => {
    const cleaned = val.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSlug(cleaned);
    const expected = generateSlug(name);
    setIsSlugCustom(cleaned.length > 0 && cleaned !== expected);
  };

  const handleResetSlug = () => {
    setSlug(generateSlug(name));
    setIsSlugCustom(false);
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setCreatedResult(null);

    const finalSlug = slug || generateSlug(name);

    try {
      const res = await apiClient('/api/super-admin/tenants', {
        method: 'POST',
        body: JSON.stringify({ name, slug: finalSlug, ownerEmail, initialPassword, tier }),
      });

      setCreatedResult({ ...res, initialPassword });
      setName('');
      setSlug('');
      setIsSlugCustom(false);
      setOwnerEmail('');
      fetchTenants();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create tenant');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGeneratePassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
    let pass = '';
    for (let i = 0; i < 14; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setResetPassword(pass);
  };

  const handleExecutePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTenant) return;

    if (resetPassword.length < 8) {
      setResetError('New password must be at least 8 characters long');
      return;
    }

    setResetSubmitting(true);
    setResetError(null);
    setResetSuccess(null);

    try {
      const res = await apiClient(`/api/super-admin/tenants/${resetTenant.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: resetPassword }),
      });

      setResetSuccess(res.message || 'Tenant password reset successfully');
      setTimeout(() => {
        setResetTenant(null);
        setResetPassword('');
        setResetSuccess(null);
      }, 2500);
    } catch (err: any) {
      setResetError(err.message || 'Failed to reset tenant password');
    } finally {
      setResetSubmitting(false);
    }
  };

  const getOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '');

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
            setFormError(null);
            setShowModal(true);
          }}
          className="bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors flex items-center gap-2 shadow-md shadow-amber-600/20"
        >
          <Plus className="h-4 w-4" />
          <span>Onboard New Tenant</span>
        </button>
      </div>

      {errorBanner && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center justify-between text-xs text-red-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{errorBanner}</span>
          </div>
          <button
            onClick={() => setErrorBanner(null)}
            className="text-red-400 hover:text-red-200 text-xs font-semibold px-2 py-0.5 rounded"
          >
            Dismiss
          </button>
        </div>
      )}

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
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white text-sm">{t.name}</span>
                    <button
                      onClick={() => copyTenantUrl(t.slug)}
                      title="Copy dedicated tenant login link"
                      className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-400 bg-slate-950 hover:bg-slate-800 hover:text-white px-2 py-0.5 rounded border border-slate-800 transition-colors"
                    >
                      <Globe className="h-3 w-3 text-blue-400" />
                      <span>/{t.slug}</span>
                      {copiedSlug === t.slug ? (
                        <Check className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Copy className="h-3 w-3 text-slate-500" />
                      )}
                    </button>
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

                <div className="flex items-center gap-2.5 flex-wrap">
                  <button
                    onClick={() => handleEnterTenant(t.id)}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-3 py-1 rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Enter Dashboard</span>
                  </button>

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
                    onClick={() => {
                      setResetTenant(t);
                      setResetPassword('');
                      setResetError(null);
                      setResetSuccess(null);
                    }}
                    title="Reset Tenant Owner Password"
                    className="bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 px-2.5 py-1 rounded-lg text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <KeyRound className="h-3.5 w-3.5 text-amber-400" />
                    <span>Reset Password</span>
                  </button>

                  <button
                    onClick={() => openStatusConfirm(t.id, t.status, t.name)}
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

            {formError && (
              <div className="mb-4 p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2 text-xs text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{formError}</span>
              </div>
            )}

            {createdResult ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-800 text-xs text-emerald-300 space-y-2.5">
                  <div className="font-bold text-sm">Organization Provisioned Successfully!</div>
                  <div><strong>Name:</strong> {createdResult.name}</div>
                  <div><strong>Owner Email:</strong> {createdResult.ownerEmail}</div>
                  <div><strong>Initial Password:</strong> <code className="bg-slate-950 px-1.5 py-0.5 rounded text-white">{createdResult.initialPassword}</code></div>
                  
                  <div className="pt-2 border-t border-emerald-800/60">
                    <div className="text-[11px] font-semibold text-emerald-200 mb-1">Tenant Dedicated Login Link:</div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        readOnly
                        value={`${getOrigin()}/login?tenant=${createdResult.slug}`}
                        className="flex-1 bg-slate-950 border border-emerald-800/80 rounded-lg px-2.5 py-1 font-mono text-[11px] text-white select-all"
                      />
                      <button
                        onClick={() => copyTenantUrl(createdResult.slug)}
                        className="bg-emerald-700 hover:bg-emerald-600 text-white px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 shrink-0"
                      >
                        {copiedSlug === createdResult.slug ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        <span>{copiedSlug === createdResult.slug ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleEnterTenant(createdResult.tenantId)}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Open Dashboard Directly</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-xs font-semibold"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateTenant} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="FinTech Global"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-300">
                      Tenant Slug (Identifier)
                    </label>
                    {isSlugCustom ? (
                      <button
                        type="button"
                        onClick={handleResetSlug}
                        className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium"
                        title="Reset slug to auto-match Company Name"
                      >
                        <RefreshCw className="h-2.5 w-2.5" />
                        <span>Auto-sync with name</span>
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-500 italic">
                        Auto-generated
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder="fintech-global"
                    required
                    className={`w-full bg-slate-950 border rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none ${
                      isSlugCustom ? 'border-amber-600/70 focus:border-amber-500' : 'border-slate-800 focus:border-amber-500'
                    }`}
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Dedicated URL: <span className="font-mono text-slate-400">/login?tenant={slug || 'your-slug'}</span>
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Owner Email</label>
                  <input
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="admin@fintechglobal.com"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Initial Password</label>
                  <input
                    type="text"
                    value={initialPassword}
                    onChange={(e) => setInitialPassword(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Tier</label>
                  <select
                    value={tier}
                    onChange={(e) => setTier(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
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
                    className="bg-amber-600 hover:bg-amber-500 text-white font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-amber-600/20"
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

      {/* Confirmation Modal for Tenant Status Toggle */}
      <ConfirmModal
        isOpen={Boolean(statusConfirm?.isOpen)}
        onClose={() => setStatusConfirm(null)}
        onConfirm={handleExecuteStatusToggle}
        isLoading={statusUpdating}
        title={statusConfirm?.currentStatus === 'active' ? 'Suspend Organization' : 'Reactivate Organization'}
        variant={statusConfirm?.currentStatus === 'active' ? 'danger' : 'primary'}
        confirmText={statusConfirm?.currentStatus === 'active' ? 'Yes, Suspend' : 'Yes, Reactivate'}
        description={
          <div>
            Are you sure you want to {statusConfirm?.currentStatus === 'active' ? 'suspend' : 'activate'}{' '}
            <strong className="text-white">{statusConfirm?.tenantName}</strong>?
            {statusConfirm?.currentStatus === 'active' ? (
              <p className="mt-1 text-slate-400">
                End users and API keys under this organization will be temporarily blocked from signing in.
              </p>
            ) : (
              <p className="mt-1 text-slate-400">
                All services, logins, and API access for this workspace will be immediately restored.
              </p>
            )}
          </div>
        }
      />

      {/* Modal: Reset Tenant Owner Password */}
      {resetTenant && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative text-slate-100">
            <button
              onClick={() => {
                setResetTenant(null);
                setResetPassword('');
                setResetError(null);
                setResetSuccess(null);
              }}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Reset Tenant Password</h3>
                <p className="text-xs text-slate-400">
                  Update credentials for workspace <strong className="text-white">{resetTenant.name}</strong>
                </p>
              </div>
            </div>

            {resetError && (
              <div className="mb-4 p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-start gap-2.5 text-xs text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                <span>{resetError}</span>
              </div>
            )}

            {resetSuccess && (
              <div className="mb-4 p-3 bg-emerald-950/60 border border-emerald-800 rounded-xl flex items-center gap-2.5 text-xs text-emerald-300">
                <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>{resetSuccess}</span>
              </div>
            )}

            <form onSubmit={handleExecutePasswordReset} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    New Temporary or Permanent Password
                  </label>
                  <button
                    type="button"
                    onClick={handleGeneratePassword}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Generate Strong</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="Enter or generate new password"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                  required
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Minimum 8 characters. The tenant owner can change this anytime after logging in.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setResetTenant(null);
                    setResetPassword('');
                    setResetError(null);
                    setResetSuccess(null);
                  }}
                  disabled={resetSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetSubmitting}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition-all shadow-md shadow-amber-600/20 disabled:opacity-50"
                >
                  {resetSubmitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>Set New Password</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
