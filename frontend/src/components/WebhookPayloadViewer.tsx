'use client';

import React, { useState } from 'react';
import { Code2, Copy, Check, FileJson, Layers, ShieldCheck, HelpCircle } from 'lucide-react';

interface WebhookPayloadViewerProps {
  customHeaders?: { key: string; value: string }[];
  compact?: boolean;
}

export default function WebhookPayloadViewer({
  customHeaders = [],
  compact = false,
}: WebhookPayloadViewerProps) {
  const [activeTab, setActiveTab] = useState<'headers' | 'body' | 'verify'>('body');
  const [selectedEvent, setSelectedEvent] = useState<'login.approved' | 'login.denied' | 'user.enrolled' | 'test.ping'>('login.approved');
  const [copied, setCopied] = useState(false);

  const samplePayloads: Record<string, unknown> = {
    'login.approved': {
      id: 'd9b73f8a-92f4-41d3-9bc7-5f726cb3b9a1',
      event: 'login.approved',
      tenantId: 'tenant_enterprise_xyz',
      timestamp: 1716300123456,
      data: {
        userId: 'usr_8923a1',
        email: 'alex.developer@company.com',
        challengeNumber: 42,
        approvalMethod: 'webpush_p256_signed',
        ip: '192.168.1.105',
        approvedAt: '2026-11-21T10:00:00.000Z',
      },
    },
    'login.denied': {
      id: 'fa42c9e1-2e6b-4e89-9a1b-10f54367ef92',
      event: 'login.denied',
      tenantId: 'tenant_enterprise_xyz',
      timestamp: 1716300150000,
      data: {
        userId: 'usr_8923a1',
        email: 'alex.developer@company.com',
        reason: 'Number mismatch or user rejected challenge',
        ip: '192.168.1.105',
        deniedAt: '2026-11-21T10:00:30.000Z',
      },
    },
    'user.enrolled': {
      id: 'b12c8a90-7d34-4bc1-aa8e-90234b5cde78',
      event: 'user.enrolled',
      tenantId: 'tenant_enterprise_xyz',
      timestamp: 1716300200000,
      data: {
        userId: 'usr_8923a1',
        email: 'alex.developer@company.com',
        enrolledAt: '2026-11-21T10:01:20.000Z',
        algorithm: 'ECDSA_P256_RAW',
      },
    },
    'test.ping': {
      id: '1c4f5b2e-982a-43cf-8ef3-72819ab3c042',
      event: 'test.ping',
      tenantId: 'tenant_enterprise_xyz',
      timestamp: 1716300000000,
      data: {
        message: 'Ping delivery test from AuthGuard',
        sentAt: '2026-11-21T10:00:00.000Z',
      },
    },
  };

  const currentPayloadJson = JSON.stringify(samplePayloads[selectedEvent], null, 2);

  const verificationCode = `// Node.js Express / Next.js Webhook Verification
import crypto from 'node:crypto';

export async function verifyWebhook(req, res) {
  const secret = process.env.AUTHGUARD_WEBHOOK_SECRET;
  const signature = req.headers['x-authguard-signature'];
  const rawBody = JSON.stringify(req.body); // or req.rawBody

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(401).json({ error: 'Invalid HMAC signature' });
  }

  // Handle verified event: req.body.event
  const { event, data } = req.body;
  console.log('Received verified event:', event, data);

  return res.status(200).json({ received: true });
}`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`bg-slate-950/70 border border-slate-800 rounded-2xl overflow-hidden ${compact ? 'text-xs' : 'text-xs'}`}>
      {/* Header bar */}
      <div className="p-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-emerald-400" />
          <span className="font-semibold text-white">HTTP Request Spec</span>
          <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded">
            POST
          </span>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('body')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-colors ${
              activeTab === 'body' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileJson className="h-3 w-3 text-blue-400" />
            <span>Body (JSON)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('headers')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-colors ${
              activeTab === 'headers' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="h-3 w-3 text-amber-400" />
            <span>Headers</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('verify')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-colors ${
              activeTab === 'verify' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="h-3 w-3 text-emerald-400" />
            <span>Verify Signature</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Request Body */}
      {activeTab === 'body' && (
        <div className="p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-400 font-medium">Event:</span>
              {(['login.approved', 'login.denied', 'user.enrolled', 'test.ping'] as const).map((ev) => (
                <button
                  key={ev}
                  type="button"
                  onClick={() => setSelectedEvent(ev)}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border transition-colors ${
                    selectedEvent === ev
                      ? 'bg-blue-600/30 text-blue-300 border-blue-500 font-bold'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {ev}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => copyToClipboard(currentPayloadJson)}
              className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 px-2 py-1 rounded bg-slate-900 border border-slate-800 transition-colors"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? 'Copied' : 'Copy JSON'}</span>
            </button>
          </div>

          <div className="relative">
            <pre className="bg-slate-950 p-3 rounded-xl border border-slate-800/90 font-mono text-[11px] text-emerald-300 overflow-x-auto max-h-56 leading-relaxed">
              {currentPayloadJson}
            </pre>
          </div>
        </div>
      )}

      {/* Tab 2: Headers */}
      {activeTab === 'headers' && (
        <div className="p-3.5 space-y-3">
          <p className="text-[11px] text-slate-400 leading-normal">
            When AuthGuard delivers an event to your endpoint, these HTTP headers are included automatically:
          </p>

          <div className="border border-slate-800 rounded-xl overflow-hidden font-mono text-[11px]">
            <table className="w-full text-left">
              <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-2.5">Header Name</th>
                  <th className="p-2.5">Example Value</th>
                  <th className="p-2.5">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 bg-slate-950/60">
                <tr>
                  <td className="p-2.5 text-blue-300 font-bold">Content-Type</td>
                  <td className="p-2.5 text-slate-300">application/json</td>
                  <td className="p-2.5 text-slate-400 font-sans text-[11px]">Standard JSON request body</td>
                </tr>
                <tr>
                  <td className="p-2.5 text-blue-300 font-bold">X-AuthGuard-Event</td>
                  <td className="p-2.5 text-slate-300">{selectedEvent}</td>
                  <td className="p-2.5 text-slate-400 font-sans text-[11px]">Triggered event type</td>
                </tr>
                <tr>
                  <td className="p-2.5 text-blue-300 font-bold">X-AuthGuard-Signature</td>
                  <td className="p-2.5 text-amber-300">d41d8cd98f00b204e980...</td>
                  <td className="p-2.5 text-slate-400 font-sans text-[11px]">HMAC-SHA256 signature of the raw body</td>
                </tr>
                <tr>
                  <td className="p-2.5 text-blue-300 font-bold">X-AuthGuard-Tenant</td>
                  <td className="p-2.5 text-slate-300">tenant_enterprise_xyz</td>
                  <td className="p-2.5 text-slate-400 font-sans text-[11px]">Your workspace ID</td>
                </tr>
                <tr>
                  <td className="p-2.5 text-blue-300 font-bold">X-AuthGuard-Timestamp</td>
                  <td className="p-2.5 text-slate-300">{Date.now()}</td>
                  <td className="p-2.5 text-slate-400 font-sans text-[11px]">Dispatch epoch timestamp in ms</td>
                </tr>
                <tr>
                  <td className="p-2.5 text-blue-300 font-bold">User-Agent</td>
                  <td className="p-2.5 text-slate-300">AuthGuard-Webhook-Dispatcher/2.0</td>
                  <td className="p-2.5 text-slate-400 font-sans text-[11px]">Identifier of webhook agent</td>
                </tr>
                {/* Dynamically append custom headers configured in the form */}
                {customHeaders.filter((h) => h.key.trim()).map((h, i) => (
                  <tr key={i} className="bg-blue-950/20">
                    <td className="p-2.5 text-emerald-400 font-bold">{h.key}</td>
                    <td className="p-2.5 text-emerald-200">{h.value || '""'}</td>
                    <td className="p-2.5 text-slate-400 font-sans text-[11px]">Custom header defined by you</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-start gap-2 p-2.5 bg-slate-900/60 rounded-xl border border-slate-800 text-[11px] text-slate-400">
            <HelpCircle className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <strong>Query Parameters:</strong> AuthGuard transmits all event payloads inside the HTTP POST body. If your registered URL contains query parameters (e.g., <code className="text-slate-300">https://api.site.com/hook?env=live</code>), AuthGuard preserves them exactly when dispatching.
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Verification Snippet */}
      {activeTab === 'verify' && (
        <div className="p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-slate-400">
              Verify the authenticity of incoming webhooks using HMAC-SHA256 and your Webhook Secret:
            </p>
            <button
              type="button"
              onClick={() => copyToClipboard(verificationCode)}
              className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 px-2 py-1 rounded bg-slate-900 border border-slate-800 transition-colors"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? 'Copied' : 'Copy Code'}</span>
            </button>
          </div>
          <pre className="bg-slate-950 p-3 rounded-xl border border-slate-800/90 font-mono text-[11px] text-blue-300 overflow-x-auto max-h-56 leading-relaxed">
            {verificationCode}
          </pre>
        </div>
      )}
    </div>
  );
}
