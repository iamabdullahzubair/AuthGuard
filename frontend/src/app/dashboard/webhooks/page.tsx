'use client';

import React, { useEffect, useState } from 'react';
import {
  Webhook,
  Plus,
  Trash2,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  Code2,
  ChevronDown,
  ChevronUp,
  Play,
  Terminal,
  Copy,
  Check,
  Shield,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import ConfirmModal from '@/components/ConfirmModal';
import WebhookPayloadViewer from '@/components/WebhookPayloadViewer';

interface AvailableEvent {
  id: string;
  label: string;
  badgeClass: string;
  desc: string;
}

const AVAILABLE_EVENTS: AvailableEvent[] = [
  {
    id: 'login.approved',
    label: 'login.approved',
    badgeClass: 'bg-emerald-950 text-emerald-400 border-emerald-800',
    desc: 'Dispatched immediately when end-user approves 2FA push on Authenticator app',
  },
  {
    id: 'login.denied',
    label: 'login.denied',
    badgeClass: 'bg-rose-950 text-rose-400 border-rose-800',
    desc: 'Dispatched when end-user denies 2FA challenge or enters mismatch challenge number',
  },
  {
    id: 'user.enrolled',
    label: 'user.enrolled',
    badgeClass: 'bg-purple-950 text-purple-400 border-purple-800',
    desc: 'Dispatched when a new user is enrolled/paired via external SDK /enroll API',
  },
  {
    id: 'test.ping',
    label: 'test.ping',
    badgeClass: 'bg-blue-950 text-blue-400 border-blue-800',
    desc: 'Dispatched on manual test pings and playground diagnostics',
  },
];

const DEFAULT_MOCK_PAYLOADS: Record<string, any> = {
  'login.approved': {
    requestId: 'req_8f19da52-9b04-4b53-93d1-f81d1982f6e9',
    username: 'alex.developer@example.com',
    status: 'approved',
    approvedAt: new Date().toISOString(),
    ipAddress: '192.168.1.105',
    userAgent: 'AuthGuard-PWA/1.0 (Android 14; Mobile)',
  },
  'login.denied': {
    requestId: 'req_8f19da52-9b04-4b53-93d1-f81d1982f6e9',
    username: 'alex.developer@example.com',
    status: 'denied',
    reason: 'user_denied',
    deniedAt: new Date().toISOString(),
    ipAddress: '192.168.1.105',
  },
  'user.enrolled': {
    userId: 'usr_c299db73-45f8-4177-8fa2-0391d4e022cc',
    email: 'new.member@example.com',
    enrolledAt: new Date().toISOString(),
    twoFactorEnabled: true,
  },
  'test.ping': {
    message: 'AuthGuard live webhook test ping',
    timestamp: new Date().toISOString(),
    system: 'AuthGuard 2.0 Webhook Engine',
  },
};

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPayloadRef, setShowPayloadRef] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [copiedSecretId, setCopiedSecretId] = useState<string | null>(null);

  // New Webhook Form State
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['login.approved', 'login.denied']);
  const [customHeaders, setCustomHeaders] = useState<{ key: string; value: string }[]>([
    { key: 'Authorization', value: 'Bearer client_secret_token' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Playground State
  const [playgroundHookId, setPlaygroundHookId] = useState<string>('');
  const [playgroundEvent, setPlaygroundEvent] = useState<string>('login.approved');
  const [playgroundPayloadText, setPlaygroundPayloadText] = useState<string>(
    JSON.stringify(DEFAULT_MOCK_PAYLOADS['login.approved'], null, 2)
  );
  const [playgroundLoading, setPlaygroundLoading] = useState<boolean>(false);
  const [playgroundResult, setPlaygroundResult] = useState<{
    success: boolean;
    status: number | null;
    durationMs: number | null;
    responseBody: string | null;
    sentHeaders: Record<string, string> | null;
    sentPayload: any | null;
    error?: string | null;
  } | null>(null);
  const [playgroundActiveTab, setPlaygroundActiveTab] = useState<'response' | 'payload' | 'headers'>('response');

  // Confirm Modal State
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    hookId: string;
    url: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchWebhooks = async () => {
    try {
      const data = await apiClient('/api/tenant/webhooks');
      const list = data.webhooks || [];
      setWebhooks(list);
      setDeliveries(data.deliveries || []);

      // Pre-select first webhook if none selected in playground
      if (list.length > 0 && !playgroundHookId) {
        setPlaygroundHookId(list[0].id);
      }
    } catch (err: any) {
      console.error(err);
      setErrorBanner(err.message || 'Failed to fetch webhooks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const handleCopySecret = (hookId: string, secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedSecretId(hookId);
    setTimeout(() => setCopiedSecretId(null), 2000);
  };

  const handleToggleEvent = (eventId: string) => {
    setSelectedEvents((prev) =>
      prev.includes(eventId) ? prev.filter((e) => e !== eventId) : [...prev, eventId]
    );
  };

  const handleAddHeader = () => {
    setCustomHeaders([...customHeaders, { key: '', value: '' }]);
  };

  const handleRemoveHeader = (idx: number) => {
    setCustomHeaders(customHeaders.filter((_, i) => i !== idx));
  };

  const handleHeaderChange = (idx: number, field: 'key' | 'value', val: string) => {
    const updated = [...customHeaders];
    updated[idx][field] = val;
    setCustomHeaders(updated);
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (selectedEvents.length === 0) {
      setFormError('Please select at least one event subscription for this webhook.');
      return;
    }

    setSubmitting(true);
    try {
      const headersObj: Record<string, string> = {};
      customHeaders.forEach((h) => {
        if (h.key.trim()) {
          headersObj[h.key.trim()] = h.value.trim();
        }
      });

      const res = await apiClient('/api/tenant/webhooks', {
        method: 'POST',
        body: JSON.stringify({
          url,
          customHeaders: headersObj,
          events: selectedEvents,
        }),
      });

      setUrl('');
      setCustomHeaders([{ key: '', value: '' }]);
      setSelectedEvents(['login.approved', 'login.denied']);
      setShowModal(false);
      if (res.webhook?.id) {
        setPlaygroundHookId(res.webhook.id);
      }
      fetchWebhooks();
    } catch (err: any) {
      setFormError(err.message || 'Failed to register webhook');
    } finally {
      setSubmitting(false);
    }
  };

  const openDeleteModal = (hookId: string, hookUrl: string) => {
    setDeleteModalState({
      isOpen: true,
      hookId,
      url: hookUrl,
    });
  };

  const handleExecuteDelete = async () => {
    if (!deleteModalState) return;
    setIsDeleting(true);

    try {
      await apiClient(`/api/tenant/webhooks/${deleteModalState.hookId}`, { method: 'DELETE' });
      setDeleteModalState(null);
      if (playgroundHookId === deleteModalState.hookId) {
        setPlaygroundHookId('');
      }
      fetchWebhooks();
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to delete webhook');
    } finally {
      setIsDeleting(false);
    }
  };

  // Switch event in playground
  const handlePlaygroundEventSelect = (evtId: string) => {
    setPlaygroundEvent(evtId);
    setPlaygroundPayloadText(JSON.stringify(DEFAULT_MOCK_PAYLOADS[evtId] || {}, null, 2));
  };

  // Run live hit from playground
  const handleExecutePlayground = async () => {
    if (!playgroundHookId) {
      setErrorBanner('Please select a target webhook to test.');
      return;
    }

    setPlaygroundLoading(true);
    setPlaygroundResult(null);

    try {
      let parsedData = {};
      try {
        parsedData = JSON.parse(playgroundPayloadText);
      } catch (e: any) {
        throw new Error('Invalid JSON payload: ' + e.message);
      }

      const res = await apiClient(`/api/tenant/webhooks/${playgroundHookId}/test`, {
        method: 'POST',
        body: JSON.stringify({
          event: playgroundEvent,
          data: parsedData,
        }),
      });

      setPlaygroundResult({
        success: res.success,
        status: res.status,
        durationMs: res.durationMs,
        responseBody: res.responseBody,
        sentHeaders: res.sentHeaders,
        sentPayload: res.sentPayload,
      });

      // Refresh recent deliveries history table
      fetchWebhooks();
    } catch (err: any) {
      setPlaygroundResult({
        success: false,
        status: null,
        durationMs: null,
        responseBody: null,
        sentHeaders: null,
        sentPayload: null,
        error: err.message || 'Failed to dispatch webhook',
      });
    } finally {
      setPlaygroundLoading(false);
    }
  };

  const activeWebhookObj = webhooks.find((w) => w.id === playgroundHookId);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Webhooks & Event Streams</h1>
          <p className="text-sm text-slate-400 mt-1">
            HMAC-SHA256 signed event streams. Webhooks strictly fire only for events you explicitly select.
          </p>
        </div>
        <button
          onClick={() => {
            setFormError(null);
            setShowModal(true);
          }}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors flex items-center gap-2 shadow-md shadow-blue-600/20 shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Register Webhook</span>
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

      {/* Configured Webhooks List */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-emerald-400" />
            <span>Configured Endpoints</span>
          </div>
          <span className="text-[11px] text-slate-500 font-normal">Active: {webhooks.length}</span>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="h-6 w-6 text-blue-500 animate-spin mx-auto" />
          </div>
        ) : webhooks.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            No webhooks configured yet. Click <strong className="text-slate-300">Register Webhook</strong> to connect your backend callback URL.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {webhooks.map((h) => {
              const headers = typeof h.custom_headers === 'string' ? JSON.parse(h.custom_headers) : h.custom_headers || {};
              const headerKeys = Object.keys(headers);
              const hookEvents: string[] = Array.isArray(h.events)
                ? h.events
                : typeof h.events === 'string'
                ? JSON.parse(h.events)
                : [];

              return (
                <div key={h.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-white bg-slate-950 px-3 py-1 rounded-lg border border-slate-800 truncate max-w-lg">
                        {h.url}
                      </span>
                      <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full font-semibold">
                        HMAC-SHA256
                      </span>
                    </div>

                    {/* Subscribed Events Badges */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-slate-500 font-medium mr-1">Subscribed Events:</span>
                      {hookEvents.length > 0 ? (
                        hookEvents.map((evt) => {
                          const meta = AVAILABLE_EVENTS.find((e) => e.id === evt);
                          return (
                            <span
                              key={evt}
                              className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md border ${
                                meta?.badgeClass || 'bg-slate-800 text-slate-300 border-slate-700'
                              }`}
                            >
                              {evt}
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-[11px] text-amber-400 font-medium">None (Silent)</span>
                      )}
                    </div>

                    <div className="text-slate-400 font-mono text-[11px] flex items-center gap-4 flex-wrap pt-0.5">
                      <div className="flex items-center gap-1.5">
                        <span>Secret:</span>
                        <code className="text-slate-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                          {h.secret.slice(0, 10)}...
                        </code>
                        <button
                          onClick={() => handleCopySecret(h.id, h.secret)}
                          className="p-1 hover:text-white transition-colors text-slate-500"
                          title="Copy Full HMAC Secret"
                        >
                          {copiedSecretId === h.id ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>

                      <span>
                        Custom Headers:{' '}
                        {headerKeys.length > 0 ? (
                          <span className="text-blue-400 font-semibold">{headerKeys.join(', ')}</span>
                        ) : (
                          <span className="text-slate-600">None</span>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        setPlaygroundHookId(h.id);
                        const playgroundEl = document.getElementById('webhook-playground-section');
                        if (playgroundEl) {
                          playgroundEl.scrollIntoView({ behavior: 'smooth' });
                        }
                      }}
                      className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-600/40 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      <span>Playground</span>
                    </button>

                    <button
                      onClick={() => openDeleteModal(h.id, h.url)}
                      className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                      title="Delete Webhook"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* =============================================================== */}
      {/* LIVE WEBHOOK PLAYGROUND (REAL-TIME HIT & DIAGNOSTICS) */}
      {/* =============================================================== */}
      <div
        id="webhook-playground-section"
        className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl"
      >
        <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-emerald-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Live Webhook Playground (Simulate & Inspect)
            </h2>
          </div>
          <span className="text-[11px] text-slate-400">Real HTTP dispatch with HMAC signature verification</span>
        </div>

        <div className="p-5 space-y-5">
          {webhooks.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-500">
              Register at least one webhook endpoint above to run live simulation tests.
            </div>
          ) : (
            <>
              {/* Target Webhook & Event Selector Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Target Webhook Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                    Select Target Endpoint
                  </label>
                  <select
                    value={playgroundHookId}
                    onChange={(e) => setPlaygroundHookId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  >
                    {webhooks.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.url}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Event Type Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                    Select Event Type To Simulate
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {AVAILABLE_EVENTS.map((evt) => (
                      <button
                        key={evt.id}
                        type="button"
                        onClick={() => handlePlaygroundEventSelect(evt.id)}
                        className={`px-3 py-2 rounded-xl text-xs font-mono font-semibold text-left transition-all border ${
                          playgroundEvent === evt.id
                            ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500 shadow-sm'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        <div>{evt.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Payload Editor */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Simulation Event Payload (<code className="text-emerald-400">data</code> object)
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setPlaygroundPayloadText(
                        JSON.stringify(DEFAULT_MOCK_PAYLOADS[playgroundEvent] || {}, null, 2)
                      )
                    }
                    className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Reset Mock Payload</span>
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={playgroundPayloadText}
                  onChange={(e) => setPlaygroundPayloadText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500 shadow-inner leading-relaxed"
                />
              </div>

              {/* Action Button */}
              <div className="flex items-center justify-between pt-1">
                <div className="text-[11px] text-slate-400">
                  Target URL:{' '}
                  <span className="font-mono text-white font-semibold">
                    {activeWebhookObj?.url || 'Select endpoint above'}
                  </span>
                </div>

                <button
                  onClick={handleExecutePlayground}
                  disabled={playgroundLoading || !playgroundHookId}
                  className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {playgroundLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Dispatching Real Webhook...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 fill-current" />
                      <span>Dispatch Webhook Live</span>
                    </>
                  )}
                </button>
              </div>

              {/* Playground Response & Diagnostics Drawer */}
              {playgroundResult && (
                <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                        Dispatch Result:
                      </span>
                      {playgroundResult.status !== null ? (
                        <span
                          className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-md border ${
                            playgroundResult.success
                              ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                              : 'bg-rose-950 text-rose-400 border-rose-800'
                          }`}
                        >
                          HTTP {playgroundResult.status} {playgroundResult.success ? 'OK' : 'Error'}
                        </span>
                      ) : (
                        <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-md border bg-rose-950 text-rose-400 border-rose-800">
                          Network / Connection Failed
                        </span>
                      )}

                      {playgroundResult.durationMs !== null && (
                        <span className="text-xs font-mono text-slate-400">
                          ⏱ {playgroundResult.durationMs}ms
                        </span>
                      )}
                    </div>

                    {/* Diagnostics Tabs */}
                    <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                      <button
                        onClick={() => setPlaygroundActiveTab('response')}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                          playgroundActiveTab === 'response'
                            ? 'bg-slate-800 text-white shadow'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Server Response
                      </button>
                      <button
                        onClick={() => setPlaygroundActiveTab('payload')}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                          playgroundActiveTab === 'payload'
                            ? 'bg-slate-800 text-white shadow'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Sent Payload
                      </button>
                      <button
                        onClick={() => setPlaygroundActiveTab('headers')}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                          playgroundActiveTab === 'headers'
                            ? 'bg-slate-800 text-white shadow'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Sent Headers (HMAC)
                      </button>
                    </div>
                  </div>

                  {playgroundResult.error && (
                    <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-xs text-red-300">
                      {playgroundResult.error}
                    </div>
                  )}

                  <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 overflow-x-auto max-h-72 text-xs font-mono">
                    {playgroundActiveTab === 'response' && (
                      <div>
                        <div className="text-[11px] text-slate-500 mb-1 uppercase font-semibold">
                          Raw Server Response Body:
                        </div>
                        <pre className="text-slate-300 whitespace-pre-wrap">
                          {playgroundResult.responseBody || '(Empty response body returned by target server)'}
                        </pre>
                      </div>
                    )}

                    {playgroundActiveTab === 'payload' && (
                      <div>
                        <div className="text-[11px] text-slate-500 mb-1 uppercase font-semibold">
                          Full JSON Body Delivered:
                        </div>
                        <pre className="text-emerald-400 whitespace-pre-wrap">
                          {JSON.stringify(playgroundResult.sentPayload, null, 2)}
                        </pre>
                      </div>
                    )}

                    {playgroundActiveTab === 'headers' && (
                      <div>
                        <div className="text-[11px] text-slate-500 mb-1 uppercase font-semibold">
                          Cryptographic & Custom Headers Dispatched:
                        </div>
                        <pre className="text-blue-400 whitespace-pre-wrap">
                          {JSON.stringify(playgroundResult.sentHeaders, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Interactive Webhook Documentation & Payload Spec */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setShowPayloadRef(!showPayloadRef)}
          className="w-full p-4 text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between hover:bg-slate-850/50 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-blue-400" />
            <span>Webhook Architecture & Signature Verification Spec</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400 text-xs font-normal">
            <span>{showPayloadRef ? 'Collapse' : 'Show Spec & Verification Code'}</span>
            {showPayloadRef ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>

        {showPayloadRef && (
          <div className="p-5 border-t border-slate-800 space-y-4">
            <p className="text-xs text-slate-400">
              Below is the exact schema, headers, and cryptographic signature dispatched to your server when a webhook fires:
            </p>
            <WebhookPayloadViewer />
          </div>
        )}
      </div>

      {/* Webhook Deliveries Log */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-400" />
            <span>Recent Delivery History</span>
          </div>
          <span className="text-[11px] text-slate-500 font-normal">Last 20 dispatches</span>
        </div>

        {deliveries.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            No webhook deliveries recorded yet. Trigger a live challenge or use the Playground above to record delivery logs.
          </div>
        ) : (
          <div className="divide-y divide-slate-800 font-mono text-xs">
            {deliveries.map((d) => (
              <div key={d.id} className="p-3.5 flex items-center justify-between hover:bg-slate-850/50 flex-wrap gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  {d.success ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                  )}
                  <div className="truncate">
                    <span className="font-semibold text-white mr-2">{d.event}</span>
                    <span className="text-slate-500 text-[11px]">{d.url}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-slate-400 text-[11px] shrink-0">
                  <span className={d.success ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                    HTTP {d.response_status || 'ERR'}
                  </span>
                  <span>{d.duration_ms}ms</span>
                  <span>{new Date(d.created_at).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Register Webhook */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl w-full shadow-2xl max-h-[92vh] overflow-y-auto space-y-4">
            <div>
              <h3 className="text-base font-bold text-white mb-1">Register Webhook Endpoint</h3>
              <p className="text-xs text-slate-400">
                Configure your server callback URL and select only the events you wish to receive
              </p>
            </div>

            {formError && (
              <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2 text-xs text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateWebhook} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Webhook URL *</label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://api.yourcompany.com/v1/authguard-callback"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              {/* Event Subscriptions Checklist */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Event Subscriptions (Select Events to Receive) *
                </label>
                <div className="space-y-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  {AVAILABLE_EVENTS.map((evt) => {
                    const isChecked = selectedEvents.includes(evt.id);
                    return (
                      <label
                        key={evt.id}
                        className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-slate-900 border-blue-600/40'
                            : 'bg-transparent border-slate-800/60 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleEvent(evt.id)}
                          className="mt-0.5 rounded border-slate-700 text-blue-600 focus:ring-0 bg-slate-950"
                        />
                        <div className="text-xs">
                          <div className="font-mono font-semibold text-white flex items-center gap-2">
                            <span>{evt.label}</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded border ${evt.badgeClass}`}>
                              event
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">{evt.desc}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Custom Headers Builder */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Custom Client Headers (API Keys, Authorization)
                  </label>
                  <button
                    type="button"
                    onClick={handleAddHeader}
                    className="text-[11px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add Header</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {customHeaders.map((header, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={header.key}
                        onChange={(e) => handleHeaderChange(idx, 'key', e.target.value)}
                        placeholder="Header Key (e.g. X-Api-Key)"
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-blue-500"
                      />
                      <input
                        type="text"
                        value={header.value}
                        onChange={(e) => handleHeaderChange(idx, 'value', e.target.value)}
                        placeholder="Value (e.g. key_12345)"
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-blue-500"
                      />
                      {customHeaders.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveHeader(idx)}
                          className="p-1.5 text-slate-500 hover:text-red-400"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2 rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-blue-600/20 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Save & Subscribe Webhook</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteModalState?.isOpen)}
        onClose={() => setDeleteModalState(null)}
        onConfirm={handleExecuteDelete}
        isLoading={isDeleting}
        title="Delete Webhook"
        variant="danger"
        confirmText="Yes, Delete Webhook"
        description={
          <div>
            Are you sure you want to delete the webhook for{' '}
            <code className="text-white font-mono bg-slate-950 px-1 py-0.5 rounded break-all">
              {deleteModalState?.url}
            </code>
            ?
            <p className="mt-2 text-slate-400">
              AuthGuard will immediately cease sending events to this URL. Delivery history for this webhook will also be removed.
            </p>
          </div>
        }
      />
    </div>
  );
}
