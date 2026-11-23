'use client';

import React, { useEffect, useState } from 'react';
import {
  Shield,
  Save,
  CheckCircle2,
  Loader2,
  Smartphone,
  AlertCircle,
  Zap,
  KeyRound,
  Type,
} from 'lucide-react';
import { apiClient, getStoredTenant, setStoredAuth, getStoredMember, getStoredToken } from '@/lib/api';

export default function BrandingPage() {
  const [issuerName, setIssuerName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#3b82f6');
  const [logoUrl, setLogoUrl] = useState('');
  const [verificationMode, setVerificationMode] = useState<'number_choice' | 'one_click' | 'word_input'>('number_choice');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  useEffect(() => {
    // 1. Check stored auth
    const t = getStoredTenant();
    if (t?.verification_mode) {
      setVerificationMode(t.verification_mode);
    }
    if (t?.branding) {
      setIssuerName(t.branding.issuerName || t.name);
      setPrimaryColor(t.branding.primaryColor || '#3b82f6');
      setLogoUrl(t.branding.logoUrl || '');
    } else if (t?.name) {
      setIssuerName(t.name);
    }

    // 2. Fetch fresh tenant profile from API
    apiClient('/api/tenant/me')
      .then((data) => {
        if (data.tenant?.verification_mode) {
          setVerificationMode(data.tenant.verification_mode);
        }
        if (data.tenant?.branding) {
          setIssuerName(data.tenant.branding.issuerName || data.tenant.name);
          setPrimaryColor(data.tenant.branding.primaryColor || '#3b82f6');
          setLogoUrl(data.tenant.branding.logoUrl || '');
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);

    try {
      const res = await apiClient('/api/tenant/branding', {
        method: 'PATCH',
        body: JSON.stringify({
          issuerName,
          primaryColor,
          logoUrl,
          verificationMode,
        }),
      });

      const member = getStoredMember();
      const tenant = getStoredTenant();
      const token = getStoredToken();
      if (tenant && member && token) {
        tenant.branding = res.branding;
        tenant.verification_mode = res.verificationMode || verificationMode;
        setStoredAuth(token, member, tenant);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to save branding & verification policy');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
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

      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Branding & Security Policies</h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure your white-label branding and choose the push challenge verification mode for all organization users.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form */}
        <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-sm">
          <form onSubmit={handleSave} className="space-y-6">
            {/* 1. Issuer Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Issuer / Display Name
              </label>
              <input
                type="text"
                value={issuerName}
                onChange={(e) => setIssuerName(e.target.value)}
                placeholder="e.g. Acme Bank or MyCompany SaaS"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                This name appears on the PWA account card, notification header, and QR codes.
              </p>
            </div>

            {/* 2. Color & Logo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Brand Accent Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-10 w-16 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer p-1"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    placeholder="#3b82f6"
                    className="w-32 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Logo URL (Optional)
                </label>
                <input
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://yourcompany.com/logo.png"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* 3. Verification Security Mode Policy (Dedicated Column in DB) */}
            <div className="pt-2 border-t border-slate-800/80 space-y-3">
              <div>
                <label className="block text-xs font-bold text-white uppercase tracking-wider">
                  Push Verification Security Mode (Tenant Policy)
                </label>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Choose how your users verify login challenges on their paired mobile Authenticator app:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Mode 1: 1-Click Approve */}
                <div
                  onClick={() => setVerificationMode('one_click')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    verificationMode === 'one_click'
                      ? 'bg-blue-600/20 border-blue-500 shadow-md shadow-blue-600/10'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Zap className={`h-4 w-4 ${verificationMode === 'one_click' ? 'text-amber-400' : 'text-slate-400'}`} />
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800">
                      ⚡ FASTEST
                    </span>
                  </div>
                  <div className="text-xs font-bold text-white mb-1">1-Click Approve</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    User taps single [ Approve ] button. No numbers or typing required.
                  </p>
                </div>

                {/* Mode 2: Number Matching (Recommended) */}
                <div
                  onClick={() => setVerificationMode('number_choice')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    verificationMode === 'number_choice'
                      ? 'bg-blue-600/20 border-blue-500 shadow-md shadow-blue-600/10'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <KeyRound className={`h-4 w-4 ${verificationMode === 'number_choice' ? 'text-blue-400' : 'text-slate-400'}`} />
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800">
                      🛡️ RECOMMENDED
                    </span>
                  </div>
                  <div className="text-xs font-bold text-white mb-1">Number Match Grid</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Presents 3 numbers on phone; user selects matching number shown on screen.
                  </p>
                </div>

                {/* Mode 3: Word Input */}
                <div
                  onClick={() => setVerificationMode('word_input')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    verificationMode === 'word_input'
                      ? 'bg-blue-600/20 border-blue-500 shadow-md shadow-blue-600/10'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Type className={`h-4 w-4 ${verificationMode === 'word_input' ? 'text-purple-400' : 'text-slate-400'}`} />
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-400 border border-purple-800">
                      🔤 ACTIVE CODE
                    </span>
                  </div>
                  <div className="text-xs font-bold text-white mb-1">Word / Code Entry</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    User types the verification word (e.g. HAWK, BLUE) into phone to approve.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-3 flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 px-5 rounded-xl text-xs transition-colors flex items-center gap-2 shadow-md shadow-blue-600/20 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span>Save Branding & Policies</span>
              </button>

              {saved && (
                <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Branding & verification mode updated!</span>
                </span>
              )}
            </div>
          </form>
        </div>

        {/* Live Mobile PWA Preview Simulator */}
        <div className="lg:col-span-1">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
              <Smartphone className="h-4 w-4 text-emerald-400" />
              <span>Live PWA Simulator Preview</span>
            </div>

            {/* Mock Mobile Screen */}
            <div className="mx-auto w-64 bg-slate-950 rounded-[32px] p-3 border-4 border-slate-800 shadow-2xl relative">
              <div className="w-20 h-4 bg-slate-800 rounded-full mx-auto mb-3" />

              {/* Mock Push Notification Popup */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-lg mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="h-5 w-5 rounded-md flex items-center justify-center text-white text-[10px]"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <Shield className="h-3 w-3" />
                  </div>
                  <span className="text-[11px] font-bold text-white truncate">
                    {issuerName || 'AuthGuard'}
                  </span>
                  <span className="text-[9px] text-slate-500 ml-auto">Now</span>
                </div>
                <div className="text-[11px] text-slate-300 font-semibold">
                  Confirm Login Request
                </div>

                {/* Dynamic Instructions Based on Verification Mode */}
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {verificationMode === 'one_click' && 'Tap Approve to authenticate login'}
                  {verificationMode === 'number_choice' && 'Select match number on your browser screen'}
                  {verificationMode === 'word_input' && 'Enter verification word shown on screen'}
                </div>

                {/* Dynamic Mobile Component */}
                {verificationMode === 'one_click' && (
                  <div className="mt-2.5 flex items-center gap-1.5">
                    <div className="flex-1 py-1.5 text-center text-[10px] font-bold rounded-lg bg-red-950/60 border border-red-800 text-red-400">
                      Deny
                    </div>
                    <div className="flex-1 py-1.5 text-center text-[10px] font-bold rounded-lg bg-emerald-600 text-white">
                      Approve
                    </div>
                  </div>
                )}

                {verificationMode === 'number_choice' && (
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    {['42', '18', '79'].map((n) => (
                      <div
                        key={n}
                        className="py-1 text-center font-mono text-xs font-bold rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                      >
                        {n}
                      </div>
                    ))}
                  </div>
                )}

                {verificationMode === 'word_input' && (
                  <div className="mt-2">
                    <div className="w-full py-1 text-center font-mono text-xs font-bold rounded-lg bg-slate-950 border border-purple-500/60 text-purple-300 tracking-widest">
                      HAWK
                    </div>
                  </div>
                )}
              </div>

              {/* Mock Account Card in PWA */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-white truncate">
                    {issuerName || 'AuthGuard'}
                  </span>
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                    style={{ color: primaryColor, backgroundColor: `${primaryColor}20` }}
                  >
                    🛡️ Protected
                  </span>
                </div>
                <div className="text-xl font-mono font-extrabold text-white tracking-widest text-center py-1">
                  842 190
                </div>
                <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: '70%', backgroundColor: primaryColor }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
