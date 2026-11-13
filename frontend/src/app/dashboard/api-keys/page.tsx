'use client';

import React, { useEffect, useState } from 'react';
import { Key, Plus, Trash2, Copy, Check, AlertCircle, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api';

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [env, setEnv] = useState<'live' | 'test'>('live');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const fetchKeys = async () => {
    try {
      const res = await apiClient('/api/tenant/api-keys');
      setKeys(res.keys || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);

    try {
      const res = await apiClient('/api/tenant/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: keyName || `${env} Key`, environment: env }),
      });

      setRevealedKey(res.key.rawKey);
      setKeyName('');
      setShowModal(false);
      fetchKeys();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key? External applications using it will be blocked.')) {
      return;
    }

    try {
      await apiClient(`/api/tenant/api-keys/${keyId}`, { method: 'DELETE' });
      fetchKeys();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">API Keys</h1>
          <p className="text-sm text-slate-400 mt-1">
            Authenticate external backend systems and microservices with AuthGuard
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors flex items-center gap-2 shadow-md shadow-blue-600/20"
        >
          <Plus className="h-4 w-4" />
          <span>Create New API Key</span>
        </button>
      </div>

      {/* One-time Key Revealed Alert */}
      {revealedKey && (
        <div className="bg-amber-950/40 border border-amber-800/80 rounded-2xl p-5 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-300">
                Save your new API key now!
              </h3>
              <p className="text-xs text-amber-200/80 mt-0.5">
                For security reasons, this raw key is only shown once. You will not be able to view it again.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="bg-slate-950 px-3 py-2 rounded-xl text-xs font-mono text-emerald-400 border border-slate-800 flex-1 truncate">
                  {revealedKey}
                </code>
                <button
                  onClick={() => copyToClipboard(revealedKey)}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy Key'}</span>
                </button>
              </div>
            </div>
            <button
              onClick={() => setRevealedKey(null)}
              className="text-amber-400/60 hover:text-amber-400 text-xs px-2 py-1"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Keys Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <Key className="h-4 w-4 text-blue-400" />
          <span>Active Credentials</span>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="h-6 w-6 text-blue-500 animate-spin mx-auto" />
          </div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            No API keys found. Generate a key to begin integrating with your backend.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {keys.map((k) => (
              <div key={k.id} className="p-4 flex items-center justify-between text-xs hover:bg-slate-850/50 transition-colors">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-sm">{k.name}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                        k.environment === 'live'
                          ? 'bg-blue-950 text-blue-400 border border-blue-800'
                          : 'bg-purple-950 text-purple-400 border border-purple-800'
                      }`}
                    >
                      {k.environment}
                    </span>
                    {!k.is_active && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-950 text-red-400 border border-red-800">
                        Revoked
                      </span>
                    )}
                  </div>
                  <div className="text-slate-400 font-mono text-[11px] flex items-center gap-3">
                    <span>Prefix: <span className="text-slate-300">{k.key_prefix}...</span></span>
                    <span>Created: {new Date(k.created_at).toLocaleDateString()}</span>
                    <span>Last used: {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}</span>
                  </div>
                </div>

                <div>
                  {k.is_active ? (
                    <button
                      onClick={() => handleRevoke(k.id)}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                      title="Revoke Key"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="text-slate-500 text-xs italic">Disabled</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Create Key */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Create API Key</h3>
            <p className="text-xs text-slate-400 mb-4">
              Issue a new credential for server-to-server 2FA dispatching
            </p>

            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Key Name</label>
                <input
                  type="text"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="e.g. Production Backend or Staging Server"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Environment</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEnv('live')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border text-center transition-colors ${
                      env === 'live'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    Live (ag_live_...)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnv('test')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border text-center transition-colors ${
                      env === 'test'
                        ? 'bg-purple-600/20 border-purple-500 text-purple-400'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    Test (ag_test_...)
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2 rounded-xl text-xs transition-colors flex items-center gap-1.5"
                >
                  {generating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Generate Key</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
