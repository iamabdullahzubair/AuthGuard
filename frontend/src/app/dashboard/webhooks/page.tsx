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
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import ConfirmModal from '@/components/ConfirmModal';
import WebhookPayloadViewer from '@/components/WebhookPayloadViewer';

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPayloadRef, setShowPayloadRef] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // New Webhook Form State
  const [url, setUrl] = useState('');
  const [customHeaders, setCustomHeaders] = useState<{ key: string; value: string }[]>([
    { key: 'Authorization', value: 'Bearer client_secret_token' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pingStatus, setPingStatus] = useState<Record<string, string>>({});

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
      setWebhooks(data.webhooks || []);
      setDeliveries(data.deliveries || []);
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
    setSubmitting(true);
    setFormError(null);

    try {
      // Map custom headers array to object
      const headersObj: Record<string, string> = {};
      customHeaders.forEach((h) => {
        if (h.key.trim()) {
          headersObj[h.key.trim()] = h.value.trim();
        }
      });

      await apiClient('/api/tenant/webhooks', {
        method: 'POST',
        body: JSON.stringify({
          url,
          customHeaders: headersObj,
          events: ['login.approved', 'login.denied'],
        }),
      });

      setUrl('');
      setCustomHeaders([{ key: '', value: '' }]);
      setShowModal(false);
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
      fetchWebhooks();
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to delete webhook');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTestPing = async (hookId: string) => {
    setPingStatus((prev) => ({ ...prev, [hookId]: 'Pinging...' }));
    try {
      const res = await apiClient(`/api/tenant/webhooks/${hookId}/test`, { method: 'POST' });
      setPingStatus((prev) => ({
        ...prev,
        [hookId]: res.success
          ? `✓ HTTP ${res.status} (${res.durationMs}ms)`
          : `✕ HTTP ${res.status || 'Failed'} (${res.durationMs}ms)`,
      }));
      fetchWebhooks();
    } catch (err: any) {
      setPingStatus((prev) => ({ ...prev, [hookId]: `✕ ${err.message}` }));
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Webhooks & Event Streams</h1>
          <p className="text-sm text-slate-400 mt-1">
            Receive instant, HMAC-signed HTTP notifications when your users approve or deny 2FA challenges
          </p>
        </div>
        <button
          onClick={() => {
            setFormError(null);
            setShowModal(true);
          }}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors flex items-center gap-2 shadow-md shadow-blue-600/20"
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
            No webhooks configured yet. Click <strong className="text-slate-300">Register Webhook</strong> to connect your backend.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {webhooks.map((h) => {
              const headers = typeof h.custom_headers === 'string' ? JSON.parse(h.custom_headers) : h.custom_headers || {};
              const headerKeys = Object.keys(headers);

              return (
                <div key={h.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-white bg-slate-950 px-3 py-1 rounded-lg border border-slate-800 truncate max-w-lg">
                        {h.url}
                      </span>
                      <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full font-semibold">
                        HMAC-SHA256
                      </span>
                    </div>

                    <div className="text-slate-400 font-mono text-[11px] flex items-center gap-4 flex-wrap">
                      <span>
                        Secret: <span className="text-slate-300">{h.secret.slice(0, 10)}...</span>
                      </span>
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
                    {pingStatus[h.id] && (
                      <span className="text-xs font-mono text-slate-300 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                        {pingStatus[h.id]}
                      </span>
                    )}

                    <button
                      onClick={() => handleTestPing(h.id)}
                      className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <Send className="h-3 w-3 text-emerald-400" />
                      <span>Test Ping</span>
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

      {/* Interactive Webhook Documentation & Payload Spec */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setShowPayloadRef(!showPayloadRef)}
          className="w-full p-4 text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between hover:bg-slate-850/50 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-blue-400" />
            <span>Webhook Payload & Headers Specification</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400 text-xs font-normal">
            <span>{showPayloadRef ? 'Collapse' : 'Show Spec & Schema'}</span>
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
            No webhook deliveries recorded yet. Trigger a login or use Test Ping to record delivery logs.
          </div>
        ) : (
          <div className="divide-y divide-slate-800 font-mono text-xs">
            {deliveries.map((d) => (
              <div key={d.id} className="p-3.5 flex items-center justify-between hover:bg-slate-850/50">
                <div className="flex items-center gap-3">
                  {d.success ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                  )}
                  <div>
                    <span className="font-semibold text-white mr-2">{d.event}</span>
                    <span className="text-slate-500 text-[11px]">{d.url}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-slate-400 text-[11px]">
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
                Configure your server URL and inspect the payload format AuthGuard will send
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
                <label className="block text-xs font-semibold text-slate-300 mb-1">Webhook URL</label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://api.yourcompany.com/v1/authguard-callback"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              {/* Custom Headers Builder */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Custom Headers (API Keys, Authorization)
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

              {/* Live Preview Inside Modal */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-xs font-semibold text-slate-400">
                  Outgoing Request Preview (Live):
                </label>
                <WebhookPayloadViewer customHeaders={customHeaders} compact={true} />
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
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2 rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-blue-600/20"
                >
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Save Webhook</span>
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
