'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  Users,
  Smartphone,
  ShieldCheck,
  Send,
  Loader2,
  Search,
  UserPlus,
  QrCode,
  Copy,
  Check,
  X,
  Trash2,
  Edit2,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Radio,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import ConfirmModal from '@/components/ConfirmModal';

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
  const [autoConfirmed, setAutoConfirmed] = useState(false);

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete User Confirmation State
  const [deletingUser, setDeletingUser] = useState<any | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset 2FA Confirmation State
  const [resetConfirmState, setResetConfirmState] = useState<{
    isOpen: boolean;
    userId: string;
    email: string;
  } | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const pollIntervalRef = useRef<any>(null);

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

  // Auto-poll enrollment status while QR modal is active (gentle 4s polling with 3-min timeout)
  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 45; // 45 * 4s = 3 minutes max

    if (showModal && enrollResult && !autoConfirmed) {
      pollIntervalRef.current = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          return;
        }

        try {
          const target = enrollResult.username || enrollResult.email;
          const status = await apiClient(
            `/api/tenant/users/enroll-status?username=${encodeURIComponent(target)}`
          );
          if (status.enrolled) {
            setAutoConfirmed(true);
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            fetchUsers();
          }
        } catch {
          // ignore polling transient errors
        }
      }, 4000);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [showModal, enrollResult, autoConfirmed]);

  const handleEnrollUser = async (e?: React.FormEvent, targetEmail?: string) => {
    if (e) e.preventDefault();
    const emailToEnroll = targetEmail || enrollEmail;
    if (!emailToEnroll) return;

    setEnrolling(true);
    setEnrollResult(null);
    setAutoConfirmed(false);

    try {
      const res = await apiClient('/api/tenant/users/enroll', {
        method: 'POST',
        body: JSON.stringify({ email: emailToEnroll }),
      });

      setEnrollResult(res);
      setEnrollEmail(emailToEnroll);
      setShowModal(true);
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
      const res = await apiClient('/api/tenant/test-push', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });

      let statusMsg = 'Pending...';
      if (res.challengeWord) {
        statusMsg = `Match Word: "${res.challengeWord}" (Pending...)`;
      } else if (res.challengeNumber !== undefined && res.challengeNumber !== null) {
        statusMsg = `Matching #: ${res.challengeNumber} (Pending...)`;
      } else if (res.mode === 'one_click') {
        statusMsg = '1-Tap Approval (Pending...)';
      }

      setPushStatus((prev) => ({
        ...prev,
        [email]: statusMsg,
      }));

      // Poll push resolution (3s interval, max 25 attempts / 75 seconds)
      let attempts = 0;
      const timer = setInterval(async () => {
        attempts++;
        if (attempts > 25) {
          clearInterval(timer);
          setPushStatus((prev) => ({ ...prev, [email]: '⏱ Expired' }));
          setTriggeringUser(null);
          return;
        }

        try {
          const s = await apiClient(`/api/tenant/push/status/${res.requestId}`);
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
      }, 3000);
    } catch (err: any) {
      setPushStatus((prev) => ({ ...prev, [email]: `Error: ${err.message}` }));
      setTriggeringUser(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setConfirmDelete(true);

    try {
      await apiClient(`/api/tenant/users/${deletingUser.id}`, {
        method: 'DELETE',
      });
      setDeletingUser(null);
      fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to delete user');
    } finally {
      setConfirmDelete(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !editEmail) return;

    setSavingEdit(true);
    try {
      await apiClient(`/api/tenant/users/${editingUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ email: editEmail }),
      });
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to update user');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleReset2FA = (userId: string, email: string) => {
    setResetConfirmState({ isOpen: true, userId, email });
  };

  const handleExecuteReset2FA = async () => {
    if (!resetConfirmState) return;
    setIsResetting(true);
    const { userId, email } = resetConfirmState;

    try {
      await apiClient(`/api/tenant/users/${userId}/reset-2fa`, {
        method: 'POST',
      });
      setResetConfirmState(null);
      fetchUsers();
      // Immediately open enrollment modal with fresh QR code
      handleEnrollUser(undefined, email);
    } catch (err: any) {
      alert(err.message || 'Failed to reset 2FA');
    } finally {
      setIsResetting(false);
    }
  };

  const filtered = users.filter((u) => {
    const val = (u.username || u.email || '').toLowerCase();
    return val.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Customer & User Directory</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage end-user 2FA lifecycle, monitor paired authenticator devices, and test push authentication
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
              placeholder="Search by username or email..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <button
            onClick={() => {
              setEnrollResult(null);
              setEnrollEmail('');
              setAutoConfirmed(false);
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
            <span>Enrolled Directory</span>
          </div>
          <span>Total: {filtered.length} Users</span>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="h-6 w-6 text-blue-500 animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="h-8 w-8 text-slate-600 mx-auto mb-3" />
            <div className="text-sm font-semibold text-slate-300">No users found</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              Enroll users manually with the button above or programmatically via API with <code>POST /api/v1/enroll</code>.
            </p>
            <button
              onClick={() => {
                setEnrollResult(null);
                setEnrollEmail('');
                setAutoConfirmed(false);
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
              const userIdentifier = u.username || u.email;
              const deviceCount = parseInt(u.active_devices_count || '0', 10);
              const isSetupComplete = u.two_factor_enabled && deviceCount > 0;

              return (
                <div
                  key={u.id}
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs hover:bg-slate-850/50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-white text-sm">{userIdentifier}</span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 ${
                          isSetupComplete
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80'
                            : 'bg-amber-950/80 text-amber-300 border border-amber-800/80'
                        }`}
                      >
                        {isSetupComplete ? (
                          <>
                            <ShieldCheck className="h-3 w-3" />
                            <span>2FA Active</span>
                          </>
                        ) : (
                          <>
                            <Clock className="h-3 w-3 text-amber-400 animate-pulse" />
                            <span>Setup Incomplete</span>
                          </>
                        )}
                      </span>
                    </div>

                    <div className="text-slate-400 text-[11px] flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Smartphone className="h-3 w-3 text-slate-500" />
                        <span>
                          {deviceCount} {deviceCount === 1 ? 'Paired Device' : 'Paired Devices'}
                        </span>
                      </span>
                      <span>•</span>
                      <span>Created: {new Date(u.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex flex-wrap items-center gap-2">
                    {pushStatus[userIdentifier] && (
                      <span className="text-xs font-mono font-medium text-blue-400 bg-blue-950/60 border border-blue-800/80 px-2.5 py-1 rounded-lg">
                        {pushStatus[userIdentifier]}
                      </span>
                    )}

                    {/* Resume Setup / Scan QR Button if Setup Incomplete */}
                    {!isSetupComplete && (
                      <button
                        onClick={() => handleEnrollUser(undefined, userIdentifier)}
                        className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-medium py-1.5 px-3 rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
                        title="Generate fresh QR code to complete 2FA setup"
                      >
                        <QrCode className="h-3.5 w-3.5 text-amber-400" />
                        <span>Scan / Finish Setup</span>
                      </button>
                    )}

                    {/* Test Push Challenge Button */}
                    <button
                      onClick={() => handleTriggerPush(userIdentifier)}
                      disabled={triggeringUser === userIdentifier || deviceCount === 0}
                      title={
                        deviceCount === 0
                          ? 'User has no active mobile devices enrolled'
                          : 'Send Push 2FA Challenge with Number Matching'
                      }
                      className="bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-white font-medium py-1.5 px-3 rounded-xl flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <Send className="h-3.5 w-3.5 text-blue-400" />
                      <span>Send Push</span>
                    </button>

                    {/* Reset 2FA Button */}
                    <button
                      onClick={() => handleReset2FA(u.id, userIdentifier)}
                      title="Reset 2FA and remove paired devices"
                      className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-xl text-slate-400 hover:text-amber-400 transition-colors"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>

                    {/* Edit User Button */}
                    <button
                      onClick={() => {
                        setEditingUser(u);
                        setEditEmail(userIdentifier);
                      }}
                      title="Edit Username / Identifier"
                      className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-xl text-slate-400 hover:text-white transition-colors"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>

                    {/* Delete User Button */}
                    <button
                      onClick={() => setDeletingUser(u)}
                      title="Delete User"
                      className="p-1.5 bg-slate-900 hover:bg-rose-950/40 border border-slate-700/80 hover:border-rose-800/80 rounded-xl text-slate-400 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Enroll User / QR Scanner with Auto-Detection */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <button
              onClick={() => {
                setShowModal(false);
                fetchUsers();
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <QrCode className="h-5 w-5 text-blue-400" />
              <span>Enroll End-User for 2FA</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Scan this single-payload QR code with the AuthGuard Authenticator PWA to complete device pairing.
            </p>

            {enrollResult ? (
              <div className="space-y-4">
                {/* Auto-Detection Success Banner */}
                {autoConfirmed ? (
                  <div className="bg-emerald-950/80 border border-emerald-800 p-4 rounded-xl text-center space-y-2 animate-in fade-in zoom-in duration-300">
                    <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
                    <div className="text-sm font-bold text-white">🎉 Device Paired & 2FA Activated!</div>
                    <p className="text-xs text-emerald-300">
                      User <strong>{enrollResult.username || enrollResult.email}</strong> successfully scanned the QR code. Push authentication & TOTP are now active.
                    </p>
                    <button
                      onClick={() => {
                        setShowModal(false);
                        fetchUsers();
                      }}
                      className="mt-2 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 rounded-xl text-xs transition-colors"
                    >
                      Done & Return to Directory
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center relative">
                      {/* Live scanning indicator */}
                      <div className="absolute top-3 right-3 flex items-center gap-1.5 text-[10px] text-amber-400 font-mono">
                        <Radio className="h-3 w-3 animate-ping" />
                        <span>Awaiting Scan...</span>
                      </div>

                      <div className="bg-white p-3 rounded-lg inline-block shadow-md mb-2 mt-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={enrollResult.qrCodeDataUrl}
                          alt="Setup QR Code"
                          className="h-44 w-44 object-contain"
                        />
                      </div>
                      <div className="text-xs text-slate-300 font-semibold">{enrollResult.username || enrollResult.email}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Issuer: <strong className="text-slate-300">{enrollResult.issuer || enrollResult.qrPayload?.issuer || 'AuthGuard'}</strong>
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
                      📱 Have the user open <code className="text-blue-300 font-mono">/pwa</code> on their mobile device and scan this QR code. The modal will automatically close when scanned!
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setShowModal(false);
                        fetchUsers();
                      }}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-2 rounded-xl text-xs transition-colors"
                    >
                      Close & Finish Later
                    </button>
                  </>
                )}
              </div>
            ) : (
              <form onSubmit={handleEnrollUser} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                    Username / Identifier
                  </label>
                  <input
                    type="text"
                    value={enrollEmail}
                    onChange={(e) => setEnrollEmail(e.target.value)}
                    placeholder="e.g. john.doe, emp_101, or alex@company.com"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    A single-use enrollment token will be created and bound to this username/identifier.
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

      {/* Modal: Edit User */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <button
              onClick={() => setEditingUser(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-blue-400" />
              <span>Edit User Profile</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Update username/identifier or manage 2FA configuration.
            </p>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Username / Identifier
                </label>
                <input
                  type="text"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="e.g. john.doe or alex@company.com"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-slate-300">Quick Actions:</div>
                <button
                  type="button"
                  onClick={() => {
                    handleReset2FA(editingUser.id, editingUser.email);
                    setEditingUser(null);
                  }}
                  className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset 2FA & Generate New QR Code</span>
                </button>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-blue-600/20"
                >
                  {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Delete User */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <h3 className="text-base font-bold mb-2 flex items-center gap-2 text-rose-400">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
              <span>Confirm Delete User</span>
            </h3>

            <p className="text-xs text-slate-300 mb-4">
              Are you sure you want to permanently delete user <strong className="text-white font-mono">{deletingUser.email}</strong>?
            </p>

            <div className="bg-rose-950/30 border border-rose-900/50 p-3 rounded-xl text-[11px] text-rose-300 mb-6 space-y-1">
              <div>⚠️ This action will immediately:</div>
              <ul className="list-disc list-inside ml-1 space-y-0.5 text-slate-400">
                <li>Revoke all active push tokens and devices</li>
                <li>Delete cryptographic TOTP secrets</li>
                <li>Expire any open push verification challenges</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={confirmDelete}
                className="bg-rose-600 hover:bg-rose-500 text-white font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-rose-600/20"
              >
                {confirmDelete ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                <span>Permanently Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Confirm Reset 2FA Modal */}
      <ConfirmModal
        isOpen={Boolean(resetConfirmState?.isOpen)}
        onClose={() => setResetConfirmState(null)}
        onConfirm={handleExecuteReset2FA}
        isLoading={isResetting}
        title="Reset 2FA Enrollment"
        variant="warning"
        confirmText="Yes, Reset 2FA"
        description={
          <div>
            Are you sure you want to reset 2FA for <strong className="text-white">{resetConfirmState?.email}</strong>?
            <p className="mt-2 text-slate-400">
              This will revoke all active mobile authenticator devices and cryptographic credentials for this user, and immediately launch a fresh QR code enrollment prompt.
            </p>
          </div>
        }
      />
    </div>
  );
}
