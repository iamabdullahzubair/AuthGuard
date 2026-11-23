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
  Pencil,
  Eye,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Activity,
  Layers,
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
    desc: 'Dispatched when end-user denies 2FA challenge or enters mismatch number/word',
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
    challengeId: 'c4d7f8a1-3b2a-4c5e-8d9e-0f1a2b3c4d5e',
    requestId: 'c4d7f8a1-3b2a-4c5e-8d9e-0f1a2b3c4d5e',
    userId: 'usr_c299db73-45f8-4177-8fa2-0391d4e022cc',
    email: 'alex.developer@example.com',
    deviceId: 'dev_8f19da52-9b04-4b53-93d1-f81d1982f6e9',
    status: 'approved',
    timestamp: 1732402123456,
  },
  'login.denied': {
    challengeId: 'c4d7f8a1-3b2a-4c5e-8d9e-0f1a2b3c4d5e',
    requestId: 'c4d7f8a1-3b2a-4c5e-8d9e-0f1a2b3c4d5e',
    userId: 'usr_c299db73-45f8-4177-8fa2-0391d4e022cc',
    email: 'alex.developer@example.com',
    deviceId: 'dev_8f19da52-9b04-4b53-93d1-f81d1982f6e9',
    status: 'denied',
    reason: 'user_denied',
    timestamp: 1732402123456,
  },
  'user.enrolled': {
    email: 'new.member@example.com',
    userId: 'usr_c299db73-45f8-4177-8fa2-0391d4e022cc',
    timestamp: 1732402123456,
  },
  'test.ping': {
    message: 'AuthGuard live webhook test ping',
    timestamp: 1732402123456,
    system: 'AuthGuard 2.0 Webhook Engine',
  },
};

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Active View: null = List View (Overview), string = Specific Webhook ID (Detail View)
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);

  // Notification Banner
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedSecretId, setCopiedSecretId] = useState<string | null>(null);

  // Register Modal State
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerUrl, setRegisterUrl] = useState('');
  const [registerEvents, setRegisterEvents] = useState<string[]>(['login.approved', 'login.denied']);
  const [showRegisterHeaders, setShowRegisterHeaders] = useState(false);
  const [registerHeaders, setRegisterHeaders] = useState<{ key: string; value: string }[]>([]);
  const [submittingRegister, setSubmittingRegister] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  // Edit Modal State
  const [editingWebhook, setEditingWebhook] = useState<any | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [editEvents, setEditEvents] = useState<string[]>([]);
  const [editIsActive, setEditIsActive] = useState(true);
  const [editHeaders, setEditHeaders] = useState<{ key: string; value: string }[]>([]);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Toggle Active State Loading
  const [togglingWebhookId, setTogglingWebhookId] = useState<string | null>(null);

  // Delivery Inspection Modal State
  const [selectedDelivery, setSelectedDelivery] = useState<any | null>(null);
  const [deliveryActiveTab, setDeliveryActiveTab] = useState<'response' | 'payload' | 'headers'>('response');
  const [retryingDeliveryId, setRetryingDeliveryId] = useState<string | null>(null);
  const [deliveryFilter, setDeliveryFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [deliveryPage, setDeliveryPage] = useState<number>(1);
  const [deliveryPageSize, setDeliveryPageSize] = useState<number>(5);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [deliveryPagination, setDeliveryPagination] = useState<{
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  }>({
    total: 0,
    page: 1,
    limit: 5,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  // Payload Doc Accordion
  const [showPayloadRef, setShowPayloadRef] = useState(true);

  // Playground State
  const [playgroundEvent, setPlaygroundEvent] = useState<string>('login.approved');
  const [playgroundPayloadText, setPlaygroundPayloadText] = useState<string>(
    JSON.stringify(DEFAULT_MOCK_PAYLOADS['login.approved'], null, 2)
  );
  const [playgroundEditorMode, setPlaygroundEditorMode] = useState<'data' | 'wire'>('data');
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

  // Delete Modal State
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    hookId: string;
    url: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchWebhooks = async (isBackground = false) => {
    if (!isBackground) setRefreshing(true);
    try {
      const data = await apiClient('/api/tenant/webhooks');
      const list = data.webhooks || [];
      setWebhooks(list);
    } catch (err: any) {
      console.error(err);
      if (!isBackground) {
        setNotification({ type: 'error', message: err.message || 'Failed to fetch webhooks' });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchDeliveries = async (
    targetWebhookId?: string,
    targetPage: number = deliveryPage,
    targetLimit: number = deliveryPageSize,
    targetFilter: 'all' | 'success' | 'failed' = deliveryFilter,
    isBackground = false
  ) => {
    const hookId = targetWebhookId !== undefined ? targetWebhookId : selectedWebhookId;
    if (!hookId) return;

    if (!isBackground) setDeliveriesLoading(true);
    try {
      const params = new URLSearchParams({
        webhookId: hookId,
        page: String(targetPage),
        limit: String(targetLimit),
        status: targetFilter,
      });
      const data = await apiClient(`/api/tenant/webhooks/deliveries?${params.toString()}`);
      setDeliveries(data.deliveries || []);
      if (data.pagination) {
        setDeliveryPagination(data.pagination);
      }
    } catch (err: any) {
      console.error('Failed to fetch webhook deliveries:', err);
    } finally {
      if (!isBackground) setDeliveriesLoading(false);
    }
  };

  useEffect(() => {
    fetchWebhooks();
  }, []);

  // When selected webhook changes, fetch page 1 from backend
  useEffect(() => {
    if (selectedWebhookId) {
      setDeliveryPage(1);
      fetchDeliveries(selectedWebhookId, 1, deliveryPageSize, deliveryFilter);
    }
  }, [selectedWebhookId]);

  // When page, page size, or filter changes, fetch from backend
  useEffect(() => {
    if (selectedWebhookId) {
      fetchDeliveries(selectedWebhookId, deliveryPage, deliveryPageSize, deliveryFilter);
    }
  }, [deliveryPage, deliveryPageSize, deliveryFilter]);

  // Auto-refresh interval (every 5 seconds when toggled on)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (selectedWebhookId) {
        fetchDeliveries(selectedWebhookId, deliveryPage, deliveryPageSize, deliveryFilter, true);
      } else {
        fetchWebhooks(true);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedWebhookId, deliveryPage, deliveryPageSize, deliveryFilter]);

  const handleCopySecret = (hookId: string, secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedSecretId(hookId);
    setTimeout(() => setCopiedSecretId(null), 2000);
  };

  // Toggle Active/Inactive
  const handleToggleActive = async (hook: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTogglingWebhookId(hook.id);
    const newStatus = !hook.is_active;

    // Optimistic update
    setWebhooks((prev) =>
      prev.map((w) => (w.id === hook.id ? { ...w, is_active: newStatus } : w))
    );

    try {
      await apiClient(`/api/tenant/webhooks/${hook.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: newStatus }),
      });
      setNotification({
        type: 'success',
        message: `Webhook ${newStatus ? 'activated' : 'paused'} successfully.`,
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      // Revert optimistic update
      setWebhooks((prev) =>
        prev.map((w) => (w.id === hook.id ? { ...w, is_active: hook.is_active } : w))
      );
      setNotification({
        type: 'error',
        message: err.message || 'Failed to update webhook status',
      });
    } finally {
      setTogglingWebhookId(null);
    }
  };

  // Open Edit Modal
  const openEditModal = (hook: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingWebhook(hook);
    setEditUrl(hook.url);
    const hookEvents = Array.isArray(hook.events)
      ? hook.events
      : typeof hook.events === 'string'
      ? JSON.parse(hook.events)
      : [];
    setEditEvents(hookEvents);
    setEditIsActive(hook.is_active ?? true);

    const rawHeaders = typeof hook.custom_headers === 'string'
      ? JSON.parse(hook.custom_headers)
      : hook.custom_headers || {};
    const headerArr = Object.entries(rawHeaders).map(([k, v]) => ({ key: k, value: String(v) }));
    setEditHeaders(headerArr);
    setEditError(null);
  };

  const handleUpdateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWebhook) return;
    setEditError(null);

    if (editEvents.length === 0) {
      setEditError('Please select at least one event subscription.');
      return;
    }

    setSubmittingEdit(true);
    try {
      const headersObj: Record<string, string> = {};
      editHeaders.forEach((h) => {
        if (h.key.trim()) {
          headersObj[h.key.trim()] = h.value.trim();
        }
      });

      await apiClient(`/api/tenant/webhooks/${editingWebhook.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          url: editUrl.trim(),
          events: editEvents,
          customHeaders: headersObj,
          is_active: editIsActive,
        }),
      });

      setNotification({ type: 'success', message: 'Webhook updated successfully!' });
      setTimeout(() => setNotification(null), 3000);
      setEditingWebhook(null);
      fetchWebhooks();
    } catch (err: any) {
      setEditError(err.message || 'Failed to update webhook');
    } finally {
      setSubmittingEdit(false);
    }
  };

  // Register Webhook
  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);

    if (registerEvents.length === 0) {
      setRegisterError('Please select at least one event subscription for this webhook.');
      return;
    }

    setSubmittingRegister(true);
    try {
      const headersObj: Record<string, string> = {};
      registerHeaders.forEach((h) => {
        if (h.key.trim()) {
          headersObj[h.key.trim()] = h.value.trim();
        }
      });

      const res = await apiClient('/api/tenant/webhooks', {
        method: 'POST',
        body: JSON.stringify({
          url: registerUrl.trim(),
          customHeaders: headersObj,
          events: registerEvents,
        }),
      });

      setRegisterUrl('');
      setRegisterHeaders([]);
      setRegisterEvents(['login.approved', 'login.denied']);
      setShowRegisterModal(false);
      setShowRegisterHeaders(false);

      setNotification({ type: 'success', message: 'Webhook registered and active!' });
      setTimeout(() => setNotification(null), 3000);

      await fetchWebhooks();
      if (res.webhook?.id) {
        setSelectedWebhookId(res.webhook.id);
      }
    } catch (err: any) {
      setRegisterError(err.message || 'Failed to register webhook');
    } finally {
      setSubmittingRegister(false);
    }
  };

  // Delete Webhook
  const openDeleteModal = (hookId: string, hookUrl: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
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
      if (selectedWebhookId === deleteModalState.hookId) {
        setSelectedWebhookId(null);
      }
      setNotification({ type: 'success', message: 'Webhook deleted successfully.' });
      setTimeout(() => setNotification(null), 3000);
      fetchWebhooks();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to delete webhook' });
    } finally {
      setIsDeleting(false);
    }
  };

  // Retry / Redeliver past delivery log
  const handleRetryDelivery = async (deliveryId: string) => {
    setRetryingDeliveryId(deliveryId);
    try {
      const res = await apiClient(`/api/tenant/webhooks/deliveries/${deliveryId}/retry`, {
        method: 'POST',
      });
      setNotification({
        type: res.result?.success ? 'success' : 'error',
        message: res.result?.success
          ? `Webhook re-delivered successfully! HTTP ${res.result.status}`
          : `Re-delivery completed with response: ${res.result?.responseBody || `HTTP ${res.result?.status}`}`,
      });
      setTimeout(() => setNotification(null), 5000);
      await fetchWebhooks(true);
      if (selectedWebhookId) {
        fetchDeliveries(selectedWebhookId, deliveryPage, deliveryPageSize, deliveryFilter, true);
      }

      if (selectedDelivery && selectedDelivery.id === deliveryId) {
        setSelectedDelivery((prev: any) => ({
          ...prev,
          response_status: res.result?.status,
          response_body: res.result?.responseBody,
          duration_ms: res.result?.durationMs,
          success: res.result?.success,
        }));
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Failed to re-dispatch webhook',
      });
    } finally {
      setRetryingDeliveryId(null);
    }
  };

  // Switch event in playground
  const handlePlaygroundEventSelect = (evtId: string) => {
    setPlaygroundEvent(evtId);
    setPlaygroundPayloadText(JSON.stringify(DEFAULT_MOCK_PAYLOADS[evtId] || {}, null, 2));
  };

  // Run live simulation in playground
  const handleExecutePlayground = async (targetHookId: string) => {
    if (!targetHookId) return;

    setPlaygroundLoading(true);
    setPlaygroundResult(null);

    try {
      let parsedData = {};
      try {
        parsedData = JSON.parse(playgroundPayloadText);
      } catch (e: any) {
        throw new Error('Invalid JSON payload: ' + e.message);
      }

      const res = await apiClient(`/api/tenant/webhooks/${targetHookId}/test`, {
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

      fetchWebhooks(true);
      if (selectedWebhookId) {
        setDeliveryPage(1);
        fetchDeliveries(selectedWebhookId, 1, deliveryPageSize, deliveryFilter, true);
      }
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

  const selectedWebhook = webhooks.find((w) => w.id === selectedWebhookId);

  const totalDeliveries = deliveryPagination.total;
  const totalPages = deliveryPagination.totalPages;
  const safePage = deliveryPagination.page;
  const startIndex = totalDeliveries === 0 ? 0 : (safePage - 1) * deliveryPagination.limit;
  const endIndex = Math.min(startIndex + deliveries.length, totalDeliveries);

  return (
    <div className="space-y-8">
      {/* Global Notification Banner */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-800 text-emerald-200'
              : 'bg-red-950/70 border-red-800 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notification.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            )}
            <span className="font-medium">{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-white font-semibold px-2 py-0.5 rounded text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 1: OVERVIEW - REGISTERED WEBHOOK CARDS & SPEC */}
      {/* ========================================================================= */}
      {!selectedWebhook ? (
        <div className="space-y-8">
          {/* Top Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Webhooks & Event Streams</h1>
              <p className="text-sm text-slate-400 mt-1">
                Real-time HMAC-SHA256 push event streams. Click any webhook card to view deliveries & test playground.
              </p>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                onClick={() => fetchWebhooks()}
                disabled={refreshing}
                className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl text-xs transition-colors flex items-center justify-center disabled:opacity-50"
                title="Refresh Webhooks List"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
              </button>

              <button
                onClick={() => {
                  setRegisterError(null);
                  setRegisterUrl('');
                  setRegisterEvents(['login.approved', 'login.denied']);
                  setRegisterHeaders([]);
                  setShowRegisterHeaders(false);
                  setShowRegisterModal(true);
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors flex items-center gap-2 shadow-md shadow-blue-600/20 shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>Register Webhook</span>
              </button>
            </div>
          </div>

          {/* Section 1: Registered Webhooks Cards */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                <Webhook className="h-4 w-4 text-emerald-400" />
                <span>Registered Endpoints ({webhooks.length})</span>
              </div>
              <span className="text-[11px] text-slate-500">
                Click any card to inspect delivery logs and launch simulation playground
              </span>
            </div>

            {loading ? (
              <div className="p-12 text-center bg-slate-900/60 border border-slate-800 rounded-2xl">
                <Loader2 className="h-6 w-6 text-blue-500 animate-spin mx-auto" />
                <p className="text-xs text-slate-500 mt-2">Loading endpoints...</p>
              </div>
            ) : webhooks.length === 0 ? (
              <div className="p-12 text-center bg-slate-900/60 border border-slate-800 rounded-2xl space-y-3">
                <div className="h-12 w-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
                  <Webhook className="h-6 w-6" />
                </div>
                <div className="text-sm font-semibold text-white">No Webhooks Registered Yet</div>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Add your server endpoint callback URL to receive real-time HTTP POST notifications when users approve or deny logins on the mobile authenticator.
                </p>
                <button
                  onClick={() => setShowRegisterModal(true)}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors inline-flex items-center gap-2 shadow-md shadow-blue-600/20"
                >
                  <Plus className="h-4 w-4" />
                  <span>Register First Webhook</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {webhooks.map((h) => {
                  const headers = typeof h.custom_headers === 'string' ? JSON.parse(h.custom_headers) : h.custom_headers || {};
                  const headerKeys = Object.keys(headers);
                  const hookEvents: string[] = Array.isArray(h.events)
                    ? h.events
                    : typeof h.events === 'string'
                    ? JSON.parse(h.events)
                    : [];
                  const isActive = h.is_active !== false;
                  const hookDeliveriesCount = Number(h.delivery_count || 0);

                  return (
                    <div
                      key={h.id}
                      onClick={() => setSelectedWebhookId(h.id)}
                      className={`group relative p-5 bg-slate-900/90 border rounded-2xl cursor-pointer transition-all duration-200 flex flex-col justify-between hover:shadow-xl hover:border-blue-500/60 ${
                        isActive ? 'border-slate-800' : 'border-slate-800/60 opacity-75 bg-slate-950/40'
                      }`}
                    >
                      <div className="space-y-3">
                        {/* Card Header: Status & Actions */}
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1.5 border ${
                              isActive
                                ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                : 'bg-amber-950/70 text-amber-400 border-amber-800'
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                            <span>{isActive ? 'Active' : 'Paused'}</span>
                          </span>

                          {/* Quick Actions (Prevent bubbling into card click) */}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => handleToggleActive(h, e)}
                              disabled={togglingWebhookId === h.id}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                                isActive ? 'bg-emerald-600' : 'bg-slate-800'
                              }`}
                              title={isActive ? 'Click to Pause' : 'Click to Activate'}
                            >
                              <span
                                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                  isActive ? 'translate-x-4.5' : 'translate-x-1'
                                }`}
                              />
                            </button>

                            <button
                              onClick={(e) => openEditModal(h, e)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors"
                              title="Edit Webhook"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>

                            <button
                              onClick={(e) => openDeleteModal(h.id, h.url, e)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                              title="Delete Webhook"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Target URL */}
                        <div>
                          <div className="font-mono text-xs font-bold text-white bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 truncate group-hover:border-blue-500/40 transition-colors">
                            {h.url}
                          </div>
                        </div>

                        {/* Event Badges */}
                        <div>
                          <span className="text-[10px] uppercase font-semibold text-slate-500 block mb-1">
                            Subscribed Events ({hookEvents.length})
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {hookEvents.slice(0, 3).map((evt) => (
                              <span
                                key={evt}
                                className="text-[10px] font-mono px-2 py-0.5 rounded-md border bg-slate-950 text-slate-300 border-slate-800"
                              >
                                {evt}
                              </span>
                            ))}
                            {hookEvents.length > 3 && (
                              <span className="text-[10px] text-slate-500 font-mono">
                                +{hookEvents.length - 3} more
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Secret Preview */}
                        <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/80">
                          <span className="text-slate-500">Signing Secret:</span>
                          <div className="flex items-center gap-1">
                            <code className="text-slate-300 bg-slate-950 px-1.5 py-0.5 rounded text-[10px] border border-slate-800">
                              {h.secret.slice(0, 6)}••••
                            </code>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopySecret(h.id, h.secret);
                              }}
                              className="p-1 hover:text-white transition-colors text-slate-500"
                              title="Copy Full Secret"
                            >
                              {copiedSecretId === h.id ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Card Footer: Detail Link */}
                      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-blue-400 font-semibold group-hover:text-blue-300">
                        <span className="text-[11px] text-slate-500 font-normal">
                          {hookDeliveriesCount} deliveries recorded
                        </span>
                        <div className="flex items-center gap-1">
                          <span>Details & Playground</span>
                          <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: Webhook Architecture & Signature Verification Spec */}
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
                <span>{showPayloadRef ? 'Collapse Spec' : 'Show Spec & Verification Code'}</span>
                {showPayloadRef ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>

            {showPayloadRef && (
              <div className="p-5 border-t border-slate-800 space-y-4">
                <p className="text-xs text-slate-400">
                  Below is the exact standard wire envelope, dispatched headers, and Node.js verification code dispatched to your server:
                </p>
                <WebhookPayloadViewer />
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* VIEW 2: DETAIL VIEW - TARGET WEBHOOK PLAYGROUND & DELIVERIES */
        /* ========================================================================= */
        <div className="space-y-8">
          {/* Back Navigation Bar */}
          <div className="flex items-center justify-between gap-4 pb-2 border-b border-slate-800">
            <button
              onClick={() => setSelectedWebhookId(null)}
              className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1.5 transition-colors group"
            >
              <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
              <span>Back to All Webhook Endpoints</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all ${
                  autoRefresh
                    ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
                title="Auto-refresh deliveries every 5 seconds"
              >
                <span className={`h-2 w-2 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                <span>Auto-refresh {autoRefresh ? 'ON' : 'OFF'}</span>
              </button>

              <button
                onClick={() => {
                  fetchWebhooks();
                  if (selectedWebhookId) {
                    fetchDeliveries(selectedWebhookId, deliveryPage, deliveryPageSize, deliveryFilter);
                  }
                }}
                disabled={refreshing || deliveriesLoading}
                className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl text-xs transition-colors flex items-center justify-center disabled:opacity-50"
                title="Refresh Deliveries"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing || deliveriesLoading ? 'animate-spin text-blue-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Webhook Endpoint Summary Banner */}
          <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1.5 border ${
                      selectedWebhook.is_active !== false
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                        : 'bg-amber-950 text-amber-400 border-amber-800'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        selectedWebhook.is_active !== false ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                    <span>{selectedWebhook.is_active !== false ? 'Active' : 'Paused (Disabled)'}</span>
                  </span>
                  <span className="text-xs text-slate-400 font-mono">ID: {selectedWebhook.id}</span>
                </div>

                <div className="font-mono text-sm sm:text-base font-bold text-white bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 break-all select-all">
                  {selectedWebhook.url}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Active Toggle Switch */}
                <button
                  onClick={(e) => handleToggleActive(selectedWebhook, e)}
                  disabled={togglingWebhookId === selectedWebhook.id}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    selectedWebhook.is_active !== false ? 'bg-emerald-600' : 'bg-slate-800'
                  }`}
                  title={selectedWebhook.is_active !== false ? 'Click to Pause' : 'Click to Activate'}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      selectedWebhook.is_active !== false ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>

                <button
                  onClick={(e) => openEditModal(selectedWebhook, e)}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Edit</span>
                </button>

                <button
                  onClick={(e) => openDeleteModal(selectedWebhook.id, selectedWebhook.url, e)}
                  className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-colors border border-slate-800"
                  title="Delete Webhook"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-slate-800/80 text-xs font-mono">
              {/* Signing Secret */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">HMAC Signing Secret</span>
                <div className="flex items-center justify-between">
                  <code className="text-slate-300 font-mono text-xs">{selectedWebhook.secret}</code>
                  <button
                    onClick={() => handleCopySecret(selectedWebhook.id, selectedWebhook.secret)}
                    className="p-1 hover:text-white transition-colors text-slate-500"
                    title="Copy Secret"
                  >
                    {copiedSecretId === selectedWebhook.id ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Subscribed Events */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Subscribed Events</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(Array.isArray(selectedWebhook.events)
                    ? selectedWebhook.events
                    : typeof selectedWebhook.events === 'string'
                    ? JSON.parse(selectedWebhook.events)
                    : []
                  ).map((evt: string) => (
                    <span
                      key={evt}
                      className="text-[10px] font-mono px-2 py-0.5 rounded-md border bg-slate-900 text-slate-300 border-slate-800"
                    >
                      {evt}
                    </span>
                  ))}
                </div>
              </div>

              {/* Custom Headers */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Custom Client Headers</span>
                <div>
                  {(() => {
                    const headers = typeof selectedWebhook.custom_headers === 'string'
                      ? JSON.parse(selectedWebhook.custom_headers)
                      : selectedWebhook.custom_headers || {};
                    const keys = Object.keys(headers);
                    return keys.length > 0 ? (
                      <span className="text-blue-400 font-semibold">{keys.join(', ')}</span>
                    ) : (
                      <span className="text-slate-500 italic">None configured</span>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Section A: Live Webhook Playground (Targeted for this Webhook) */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-emerald-400" />
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                  Interactive Simulator & Playground
                </h2>
              </div>
              <span className="text-[11px] text-slate-400">
                Dispatches real HTTP POST with HMAC signature to{' '}
                <code className="text-slate-200">{selectedWebhook.url}</code>
              </span>
            </div>

            <div className="p-5 space-y-5">
              {/* Event Type Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">
                  Select Event Type To Simulate
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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

              {/* Payload Editor with Wire Preview Toggle */}
              <div>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setPlaygroundEditorMode('data')}
                      className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                        playgroundEditorMode === 'data'
                          ? 'bg-slate-800 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Edit Inner <code className="text-emerald-400 font-mono">data</code> Object
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlaygroundEditorMode('wire')}
                      className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                        playgroundEditorMode === 'wire'
                          ? 'bg-blue-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Preview Full HTTP Body (As Received by Server)
                    </button>
                  </div>

                  {playgroundEditorMode === 'data' && (
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
                      <span>Reset Mock Data</span>
                    </button>
                  )}
                </div>

                {playgroundEditorMode === 'data' ? (
                  <>
                    <textarea
                      rows={7}
                      value={playgroundPayloadText}
                      onChange={(e) => setPlaygroundPayloadText(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500 shadow-inner leading-relaxed"
                    />
                    <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
                      <span>📦 When dispatched, your server receives this wrapped in the envelope:</span>
                      <code className="text-slate-400 font-mono text-[10px] bg-slate-950 px-1 py-0.5 rounded border border-slate-800">
                        {`{ id, event, tenantId, timestamp, data }`}
                      </code>
                    </p>
                  </>
                ) : (
                  <div className="bg-slate-950 rounded-xl p-3.5 border border-slate-700 relative group font-mono text-xs">
                    <pre className="text-emerald-300 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
                      {(() => {
                        let parsedData = {};
                        try {
                          parsedData = JSON.parse(playgroundPayloadText);
                        } catch {
                          parsedData = { error: 'Invalid JSON entered in data editor' };
                        }
                        const wireEnvelope = {
                          id: 'e931ca87-25e2-446a-939e-2199b4aa0368',
                          event: playgroundEvent,
                          tenantId: selectedWebhook.tenant_id || 'org_tenant_id',
                          timestamp: Date.now(),
                          data: parsedData,
                        };
                        return JSON.stringify(wireEnvelope, null, 2);
                      })()}
                    </pre>
                  </div>
                )}
              </div>

              {/* Action Button */}
              <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                <div className="text-[11px] text-slate-400">
                  Target: <span className="font-mono text-white font-semibold">{selectedWebhook.url}</span>
                </div>

                <button
                  onClick={() => handleExecutePlayground(selectedWebhook.id)}
                  disabled={playgroundLoading}
                  className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50"
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
            </div>
          </div>

          {/* Section B: Delivery Logs Filtered For This Webhook */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-400" />
                <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <span>Deliveries For This Webhook</span>
                  <span className="text-slate-400">({deliveryPagination.total})</span>
                  {deliveriesLoading && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                  )}
                </h2>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-950 rounded-xl p-1 border border-slate-800 text-[11px]">
                  <button
                    onClick={() => {
                      setDeliveryFilter('all');
                      setDeliveryPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                      deliveryFilter === 'all'
                        ? 'bg-slate-800 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => {
                      setDeliveryFilter('success');
                      setDeliveryPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                      deliveryFilter === 'success'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Success
                  </button>
                  <button
                    onClick={() => {
                      setDeliveryFilter('failed');
                      setDeliveryPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                      deliveryFilter === 'failed'
                        ? 'bg-rose-950 text-rose-300 border border-rose-800'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Failed
                  </button>
                </div>
              </div>
            </div>

            {deliveriesLoading && deliveries.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                <span>Loading delivery logs from server...</span>
              </div>
            ) : deliveryPagination.total === 0 ? (
              <div className="p-10 text-center text-slate-500 text-xs space-y-2">
                <p>
                  {deliveryFilter === 'all'
                    ? 'No delivery attempts recorded for this webhook yet.'
                    : `No deliveries match the "${deliveryFilter}" filter.`}
                </p>
                <p className="text-slate-600 text-[11px]">
                  Use the Playground above to dispatch a test event, or trigger a live push login challenge on the authenticator app.
                </p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-800 font-mono text-xs">
                  {deliveries.map((d) => (
                    <div
                      key={d.id}
                      onClick={() => {
                        setSelectedDelivery(d);
                        setDeliveryActiveTab('response');
                      }}
                      className="p-3.5 flex items-center justify-between hover:bg-slate-850/60 cursor-pointer transition-colors flex-wrap gap-2 group"
                      title="Click to inspect response body and payload"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {d.success ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                        )}

                        <div>
                          <span className="font-semibold text-white mr-2">{d.event}</span>
                          <span className="text-slate-500 text-[11px]">{new Date(d.created_at).toLocaleTimeString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-slate-400 text-[11px] shrink-0">
                        <span
                          className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                            d.success
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}
                        >
                          HTTP {d.response_status || 'ERR'}
                        </span>

                        <span>{d.duration_ms ? `${d.duration_ms}ms` : '—'}</span>

                        {/* Quick Inspect Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDelivery(d);
                            setDeliveryActiveTab('response');
                          }}
                          className="p-1 rounded text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors flex items-center gap-1 text-[11px] font-sans"
                          title="Inspect Delivery"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Inspect</span>
                        </button>

                        {/* Quick Retry Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRetryDelivery(d.id);
                          }}
                          disabled={retryingDeliveryId === d.id}
                          className="p-1 rounded text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors flex items-center gap-1 text-[11px] font-sans disabled:opacity-50"
                          title="Re-send this webhook delivery"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${retryingDeliveryId === d.id ? 'animate-spin text-emerald-400' : ''}`} />
                          <span>Retry</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination Controls */}
                <div className="p-3.5 bg-slate-950/70 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
                  <div className="flex items-center gap-3">
                    <span>
                      Showing <span className="font-semibold text-white">{totalDeliveries === 0 ? 0 : startIndex + 1}</span> to{' '}
                      <span className="font-semibold text-white">{endIndex}</span> of{' '}
                      <span className="font-semibold text-white">{totalDeliveries}</span> deliveries
                    </span>
                    <span className="text-slate-700">|</span>
                    <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer">
                      <span className="text-[11px] text-slate-500">Per page:</span>
                      <select
                        value={deliveryPageSize}
                        onChange={(e) => {
                          setDeliveryPageSize(Number(e.target.value));
                          setDeliveryPage(1);
                        }}
                        className="bg-slate-900 border border-slate-750 text-white rounded-md px-2 py-0.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                    </label>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setDeliveryPage((prev) => Math.max(prev - 1, 1))}
                        disabled={!deliveryPagination.hasPrevPage || deliveriesLoading}
                        className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
                        title="Previous Page"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>

                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                          <button
                            key={pageNum}
                            onClick={() => setDeliveryPage(pageNum)}
                            disabled={deliveriesLoading}
                            className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-semibold transition-all ${
                              safePage === pageNum
                                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
                            }`}
                          >
                            {pageNum}
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={() => setDeliveryPage((prev) => Math.min(prev + 1, totalPages))}
                        disabled={!deliveryPagination.hasNextPage || deliveriesLoading}
                        className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
                        title="Next Page"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* =============================================================== */}
      {/* MODAL 1: REGISTER WEBHOOK (CLEAN DEVELOPER UX) */}
      {/* =============================================================== */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl w-full shadow-2xl max-h-[92vh] overflow-y-auto space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-white mb-1">Register Webhook Endpoint</h3>
                <p className="text-xs text-slate-400">
                  Configure your HTTPS callback URL to receive real-time push event streams.
                </p>
              </div>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="text-slate-400 hover:text-white p-1 text-sm font-semibold rounded-lg"
              >
                ✕
              </button>
            </div>

            {registerError && (
              <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2 text-xs text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{registerError}</span>
              </div>
            )}

            <form onSubmit={handleCreateWebhook} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Webhook Callback URL *
                </label>
                <input
                  type="url"
                  value={registerUrl}
                  onChange={(e) => setRegisterUrl(e.target.value)}
                  placeholder="https://api.yourcompany.com/webhooks/authguard"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono shadow-inner"
                />
                <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1.5">
                  <span>💡 Testing locally? You can use a free temporary endpoint from</span>
                  <a
                    href="https://webhook.site"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline flex items-center gap-0.5"
                  >
                    webhook.site <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </div>

              {/* Event Subscriptions Checklist with Quick Presets */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Event Subscriptions *
                  </label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setRegisterEvents(AVAILABLE_EVENTS.map((e) => e.id))}
                      className="text-blue-400 hover:text-blue-300 font-medium"
                    >
                      Select All
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      type="button"
                      onClick={() => setRegisterEvents(['login.approved', 'login.denied'])}
                      className="text-emerald-400 hover:text-emerald-300 font-medium"
                    >
                      Auth Only
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      type="button"
                      onClick={() => setRegisterEvents([])}
                      className="text-slate-400 hover:text-slate-300 font-medium"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="space-y-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  {AVAILABLE_EVENTS.map((evt) => {
                    const isChecked = registerEvents.includes(evt.id);
                    return (
                      <label
                        key={evt.id}
                        className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-slate-900 border-blue-600/40 shadow-sm'
                            : 'bg-transparent border-slate-800/60 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() =>
                            setRegisterEvents((prev) =>
                              prev.includes(evt.id)
                                ? prev.filter((e) => e !== evt.id)
                                : [...prev, evt.id]
                            )
                          }
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

              {/* Optional Custom Headers */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowRegisterHeaders(!showRegisterHeaders)}
                  className="text-xs font-semibold text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-colors mb-2"
                >
                  {showRegisterHeaders ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  <span>Custom Request Headers (Optional) {registerHeaders.length > 0 && `(${registerHeaders.length})`}</span>
                </button>

                {showRegisterHeaders && (
                  <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-slate-400">
                        Add client API keys, auth tokens, or custom headers dispatched with each webhook.
                      </p>
                      <button
                        type="button"
                        onClick={() => setRegisterHeaders([...registerHeaders, { key: '', value: '' }])}
                        className="text-[11px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Add Header</span>
                      </button>
                    </div>

                    {registerHeaders.length === 0 ? (
                      <p className="text-[11px] text-slate-500 italic py-1">
                        No custom headers configured. Click &quot;Add Header&quot; if your endpoint requires authentication.
                      </p>
                    ) : (
                      registerHeaders.map((header, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={header.key}
                            onChange={(e) => {
                              const updated = [...registerHeaders];
                              updated[idx].key = e.target.value;
                              setRegisterHeaders(updated);
                            }}
                            placeholder="Header Key (e.g. X-Api-Key)"
                            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-blue-500"
                          />
                          <input
                            type="text"
                            value={header.value}
                            onChange={(e) => {
                              const updated = [...registerHeaders];
                              updated[idx].value = e.target.value;
                              setRegisterHeaders(updated);
                            }}
                            placeholder="Value (e.g. key_12345)"
                            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => setRegisterHeaders(registerHeaders.filter((_, i) => i !== idx))}
                            className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                            title="Remove header"
                          >
                            ✕
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRegister}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-5 py-2.5 rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-blue-600/20 disabled:opacity-50"
                >
                  {submittingRegister && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Save & Register Webhook</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =============================================================== */}
      {/* MODAL 2: EDIT WEBHOOK MODAL */}
      {/* =============================================================== */}
      {editingWebhook && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl w-full shadow-2xl max-h-[92vh] overflow-y-auto space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-white mb-1">Edit Webhook Configuration</h3>
                <p className="text-xs text-slate-400">
                  Update target URL, subscription events, status, and headers.
                </p>
              </div>
              <button
                onClick={() => setEditingWebhook(null)}
                className="text-slate-400 hover:text-white p-1 text-sm font-semibold rounded-lg"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2 text-xs text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateWebhook} className="space-y-4">
              {/* Webhook Status Toggle */}
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-white flex items-center gap-2">
                    <span>Webhook Status:</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                        editIsActive
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                          : 'bg-amber-950 text-amber-400 border-amber-800'
                      }`}
                    >
                      {editIsActive ? 'Active (Receiving Events)' : 'Paused (Disabled)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Toggle whether AuthGuard should dispatch events to this URL
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditIsActive(!editIsActive)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    editIsActive ? 'bg-emerald-600' : 'bg-slate-800'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      editIsActive ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* URL */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Webhook Callback URL *
                </label>
                <input
                  type="url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              {/* HMAC Secret Info */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-mono">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">HMAC Signing Secret</span>
                  <code className="text-slate-300 font-mono text-xs">{editingWebhook.secret}</code>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopySecret(editingWebhook.id, editingWebhook.secret)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-sans flex items-center gap-1.5 transition-colors"
                >
                  {copiedSecretId === editingWebhook.id ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              {/* Event Subscriptions */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Event Subscriptions *
                  </label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setEditEvents(AVAILABLE_EVENTS.map((e) => e.id))}
                      className="text-blue-400 hover:text-blue-300 font-medium"
                    >
                      Select All
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      type="button"
                      onClick={() => setEditEvents(['login.approved', 'login.denied'])}
                      className="text-emerald-400 hover:text-emerald-300 font-medium"
                    >
                      Auth Only
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      type="button"
                      onClick={() => setEditEvents([])}
                      className="text-slate-400 hover:text-slate-300 font-medium"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="space-y-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  {AVAILABLE_EVENTS.map((evt) => {
                    const isChecked = editEvents.includes(evt.id);
                    return (
                      <label
                        key={evt.id}
                        className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-slate-900 border-blue-600/40 shadow-sm'
                            : 'bg-transparent border-slate-800/60 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() =>
                            setEditEvents((prev) =>
                              prev.includes(evt.id)
                                ? prev.filter((e) => e !== evt.id)
                                : [...prev, evt.id]
                            )
                          }
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

              {/* Custom Headers */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Custom Client Headers ({editHeaders.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditHeaders([...editHeaders, { key: '', value: '' }])}
                    className="text-[11px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add Header</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {editHeaders.length === 0 ? (
                    <p className="text-[11px] text-slate-500 italic py-1">
                      No custom headers configured.
                    </p>
                  ) : (
                    editHeaders.map((header, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={header.key}
                          onChange={(e) => {
                            const updated = [...editHeaders];
                            updated[idx].key = e.target.value;
                            setEditHeaders(updated);
                          }}
                          placeholder="Header Key (e.g. Authorization)"
                          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-blue-500"
                        />
                        <input
                          type="text"
                          value={header.value}
                          onChange={(e) => {
                            const updated = [...editHeaders];
                            updated[idx].value = e.target.value;
                            setEditHeaders(updated);
                          }}
                          placeholder="Header Value"
                          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => setEditHeaders(editHeaders.filter((_, i) => i !== idx))}
                          className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                          title="Remove header"
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingWebhook(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-5 py-2.5 rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-blue-600/20 disabled:opacity-50"
                >
                  {submittingEdit && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =============================================================== */}
      {/* MODAL 3: WEBHOOK DELIVERY INSPECTION (STRIPE-GRADE OBSERVABILITY) */}
      {/* =============================================================== */}
      {selectedDelivery && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-start justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span
                    className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-md border ${
                      selectedDelivery.success
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                        : 'bg-rose-950 text-rose-400 border-rose-800'
                    }`}
                  >
                    HTTP {selectedDelivery.response_status || 'ERROR'}
                  </span>
                  <span className="text-sm font-bold text-white font-mono">{selectedDelivery.event}</span>
                  <span className="text-xs text-slate-400 font-mono">
                    ⏱ {selectedDelivery.duration_ms ? `${selectedDelivery.duration_ms}ms` : '—'}
                  </span>
                </div>

                <div className="text-xs font-mono text-slate-400 flex items-center gap-2 flex-wrap">
                  <span className="text-slate-500">Target:</span>
                  <span className="text-slate-200">{selectedDelivery.url}</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-400">{new Date(selectedDelivery.created_at).toLocaleString()}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRetryDelivery(selectedDelivery.id)}
                  disabled={retryingDeliveryId === selectedDelivery.id}
                  className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-600/40 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  title="Re-send this webhook delivery"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      retryingDeliveryId === selectedDelivery.id ? 'animate-spin text-emerald-400' : ''
                    }`}
                  />
                  <span>Re-send Webhook</span>
                </button>
                <button
                  onClick={() => setSelectedDelivery(null)}
                  className="text-slate-400 hover:text-white p-1 text-sm font-semibold rounded-lg"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Tab navigation */}
            <div className="px-5 pt-3 border-b border-slate-800 bg-slate-950 flex items-center gap-2">
              <button
                onClick={() => setDeliveryActiveTab('response')}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  deliveryActiveTab === 'response'
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Server Response Body
              </button>
              <button
                onClick={() => setDeliveryActiveTab('payload')}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  deliveryActiveTab === 'payload'
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Request Payload Dispatched
              </button>
              <button
                onClick={() => setDeliveryActiveTab('headers')}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  deliveryActiveTab === 'headers'
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Dispatched Headers (HMAC)
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex-1 overflow-y-auto font-mono text-xs space-y-4">
              {deliveryActiveTab === 'response' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Target Server Return Status:</span>
                    <span className="font-bold text-white">
                      HTTP {selectedDelivery.response_status || 'Connection Failed / Aborted'}
                    </span>
                  </div>

                  <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 relative group">
                    <pre className="text-slate-200 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                      {selectedDelivery.response_body ||
                        (selectedDelivery.success
                          ? '(Endpoint returned empty 200 OK body)'
                          : '(No response body received from server)')}
                    </pre>
                    <button
                      onClick={() => navigator.clipboard.writeText(selectedDelivery.response_body || '')}
                      className="absolute top-2.5 right-2.5 p-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors"
                      title="Copy Response Body"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {deliveryActiveTab === 'payload' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Full JSON Body Dispatched to Endpoint:</span>
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(JSON.stringify(selectedDelivery.payload, null, 2))
                      }
                      className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      <Copy className="h-3 w-3" />
                      <span>Copy JSON</span>
                    </button>
                  </div>

                  <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 relative">
                    <pre className="text-emerald-400 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                      {JSON.stringify(selectedDelivery.payload, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {deliveryActiveTab === 'headers' && (
                <div className="space-y-3">
                  <div className="text-[11px] text-slate-400">
                    Dispatched Request Headers with HMAC-SHA256 Signature:
                  </div>

                  <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-2">
                    {selectedDelivery.payload?._headers ? (
                      Object.entries(selectedDelivery.payload._headers).map(([k, v]) => (
                        <div key={k} className="flex items-start gap-2 py-0.5 border-b border-slate-900 last:border-none">
                          <span className="text-blue-400 font-bold shrink-0">{k}:</span>
                          <span className="text-slate-300 break-all">{String(v)}</span>
                        </div>
                      ))
                    ) : (
                      <div className="space-y-1.5 text-slate-300">
                        <div className="flex items-start gap-2">
                          <span className="text-blue-400 font-bold shrink-0">Content-Type:</span>
                          <span>application/json</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-blue-400 font-bold shrink-0">User-Agent:</span>
                          <span>AuthGuard-Webhook-Dispatcher/2.0</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-blue-400 font-bold shrink-0">X-AuthGuard-Event:</span>
                          <span>{selectedDelivery.event}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-blue-400 font-bold shrink-0">X-AuthGuard-Tenant:</span>
                          <span>{selectedDelivery.tenant_id}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-blue-400 font-bold shrink-0">X-AuthGuard-Signature:</span>
                          <span className="text-slate-500 italic">(HMAC-SHA256 computed on dispatch)</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedDelivery(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:bg-slate-800 transition-colors"
              >
                Close Inspector
              </button>
            </div>
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
