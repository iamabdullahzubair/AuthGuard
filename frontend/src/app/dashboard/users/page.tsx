'use client';

import React, { useEffect, useState } from 'react';
import { Users, Smartphone, ShieldCheck, Send, Loader2, Search, UserPlus, QrCode, Copy, Check, X } from 'lucide-react';
import { apiClient } from '@/lib/api';

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [triggeringUser, setTriggeringUser] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<Record<string, string>>({});

  // Manual Enrollment Modal State
  const [showModal, setShowModal] = useState(false);
  const [enrollEmail, setEnrollEmail] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [enrollResult, setEnrollResult] = useState<any>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const fetchUsers = async () => {
    try {
      const data = await apiClient('/api/tenant/users');
      setUsers(data.users || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleEnrollUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollEmail) return;

    setEnrolling(true);
    setEnrollResult(null);

    try {
      const res = await apiClient('/api/tenant/users/enroll', {
        method: 'POST',
        body: JSON.stringify({ email: enrollEmail }),
      });

      setEnrollResult(res);
      fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to enroll user');
    } finally {
      setEnrolling(false);
    }
  };

  const handleCopySecret = (secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleTriggerPush = async (email: string) => {
    setTriggeringUser(email);
    setPushStatus((prev) => ({ ...prev, [email]: 'Sending push...' }));

    try {
      const res = await apiClient('/api/v1/push/challenge', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });

      setPushStatus((prev) => ({
        ...prev,
        [email]: `Number: ${res.challengeNumber} (Pending...)`,
      }));

      // Poll
      const timer = setInterval(async () => {
        try {
          const s = await apiClient(`/api/v1/push/status/${res.requestId}`);
          if (s.status === 'approved') {
            clearInterval(timer);
            setPushStatus((prev) => ({ ...prev, [email]: '✓ Approved!' }));
            setTriggeringUser(null);
          } else if (s.status === 'denied') {
            clearInterval(timer);
            setPushStatus((prev) => ({ ...prev, [email]: '✕ Denied' }));
            setTriggeringUser(null);
          } else if (s.status === 'expired') {
            clearInterval(timer);
            setPushStatus((prev) => ({ ...prev, [email]: '⏱ Expired' }));
            setTriggeringUser(null);
          }
        } catch {}
      }, 1500);
    } catch (err: any) {
      setPushStatus((prev) => ({ ...prev, [email]: `Error: ${err.message}` }));
      setTriggeringUser(null);
    }
  };

  const filtered = users.filter((u) =>
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Enrolled Users</h1>
          <p className="text-sm text-slate-400 mt-1">
            End-users registered with your organization for Push & TOTP 2FA
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search email..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <button
            onClick={() => {
              setEnrollResult(null);
              setEnrollEmail('');
              setShowModal(true);
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-3.5 rounded-xl text-xs transition-colors flex items-center gap-2 shadow-md shadow-blue-600/20 shrink-0"
          >
            <UserPlus className="h-4 w-4" />
            <span>Enroll New User</span>
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-400" />
            <span>Customer Directory</span>
          </div>
          <span>Total: {filtered.length}</span>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="h-6 w-6 text-blue-500 animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="h-8 w-8 text-slate-600 mx-auto mb-3" />
            <div className="text-sm font-semibold text-slate-300">No enrolled users yet</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              Users can be enrolled directly using the button above or programmatically via your backend using <code>POST /api/v1/enroll</code>.
            </p>
            <button
              onClick={() => {
                setEnrollResult(null);
                setEnrollEmail('');
                setShowModal(true);
              }}
              className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-1.5 px-4 rounded-xl text-xs inline-flex items-center gap-1.5 transition-colors"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>Enroll First User</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filtered.map((u) => {
              const deviceCount = parseInt(u.active_devices_count || '0', 10);

              return (
                <div key={u.id} className="p-4 flex items-center justify-between text-xs hover:bg-slate-850/50 transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-sm">{u.email}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 ${
                          u.two_factor_enabled
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}
                      >
                        <ShieldCheck className="h-3 w-3" />
                        <span>{u.two_factor_enabled ? '2FA Active' : 'Setup Pending'}</span>
                      </span>
                    </div>

                    <div className="text-slate-400 text-[11px] flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Smartphone className="h-3 w-3 text-slate-500" />
                        <span>{deviceCount} Active {deviceCount === 1 ? 'Device' : 'Devices'}</span>
                      </span>
                      <span>•</span>
                      <span>Enrolled: {new Date(u.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {pushStatus[u.email] && (
                      <span className="text-xs font-mono font-medium text-blue-400 bg-blue-950/60 border border-blue-800/80 px-2.5 py-1 rounded-lg">
                        {pushStatus[u.email]}
                      </span>
                    )}

                    <button
                      onClick={() => handleTriggerPush(u.email)}
                      disabled={triggeringUser === u.email || deviceCount === 0}
                      title={deviceCount === 0 ? 'User has no active mobile devices enrolled' : 'Send Push Challenge'}
                      className="bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-white font-medium py-1.5 px-3 rounded-xl flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Send className="h-3.5 w-3.5 text-blue-400" />
                      <span>Test Push</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Enroll User */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <QrCode className="h-5 w-5 text-blue-400" />
              <span>Enroll End-User for 2FA</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Generate a single-payload QR code for the user to scan with the AuthGuard Authenticator App.
            </p>

            {enrollResult ? (
              <div className="space-y-4">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center">
                  <div className="bg-white p-3 rounded-lg inline-block shadow-md mb-3">
                    <img
                      src={enrollResult.qrCodeDataUrl}
                      alt="Setup QR Code"
                      className="h-44 w-44 object-contain"
                    />
                  </div>
                  <div className="text-xs text-slate-300 font-semibold">{enrollResult.email}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Issuer: <strong>{enrollResult.issuer}</strong>
                  </div>
                </div>

                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Manual Entry Secret Key:
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-amber-300 font-mono break-all select-all">
                      {enrollResult.totpSecret}
                    </code>
                    <button
                      onClick={() => handleCopySecret(enrollResult.totpSecret)}
                      className="bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1 rounded text-xs flex items-center gap-1 shrink-0"
                    >
                      {copiedSecret ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 bg-blue-950/30 border border-blue-900/40 p-2.5 rounded-xl">
                  📱 Have the user open <code className="text-blue-300">/pwa</code> on their mobile device and scan this QR code to complete device pairing and push notifications.
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    fetchUsers();
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 rounded-xl text-xs transition-colors"
                >
                  Done & Refresh List
                </button>
              </div>
            ) : (
              <form onSubmit={handleEnrollUser} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                    User Email Address
                  </label>
                  <input
                    type="email"
                    value={enrollEmail}
                    onChange={(e) => setEnrollEmail(e.target.value)}
                    placeholder="employee@yourcompany.com"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    An enrollment token will be created and bound to this email.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={enrolling}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-blue-600/20"
                  >
                    {enrolling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
                    <span>Generate Setup QR</span>
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
