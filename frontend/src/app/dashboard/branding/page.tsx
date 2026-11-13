'use client';

import React, { useEffect, useState } from 'react';
import { Shield, Save, CheckCircle2, Loader2, Smartphone } from 'lucide-react';
import { apiClient, getStoredTenant, setStoredAuth, getStoredMember, getStoredToken } from '@/lib/api';

export default function BrandingPage() {
  const [issuerName, setIssuerName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#3b82f6');
  const [logoUrl, setLogoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const t = getStoredTenant();
    if (t?.branding) {
      setIssuerName(t.branding.issuerName || t.name);
      setPrimaryColor(t.branding.primaryColor || '#3b82f6');
      setLogoUrl(t.branding.logoUrl || '');
    } else if (t?.name) {
      setIssuerName(t.name);
    }
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);

    try {
      const res = await apiClient('/api/tenant/branding', {
        method: 'PATCH',
        body: JSON.stringify({ issuerName, primaryColor, logoUrl }),
      });

      const member = getStoredMember();
      const tenant = getStoredTenant();
      const token = getStoredToken();
      if (tenant && member && token) {
        tenant.branding = res.branding;
        setStoredAuth(token, member, tenant);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">White-Label Branding</h1>
        <p className="text-sm text-slate-400 mt-1">
          Customize the appearance and issuer name presented to your end-users in push notifications & Authenticator PWA
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form */}
        <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-sm">
          <form onSubmit={handleSave} className="space-y-5">
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

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Primary Brand Accent Color
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

            <div className="pt-3 flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 px-5 rounded-xl text-xs transition-colors flex items-center gap-2 shadow-md shadow-blue-600/20 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span>Save Branding Changes</span>
              </button>

              {saved && (
                <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Branding updated!</span>
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
              <span>PWA End-User Preview</span>
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
                <div className="text-[10px] text-slate-400">
                  Select match number on your browser screen
                </div>

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
