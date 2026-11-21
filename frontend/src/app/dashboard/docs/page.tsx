'use client';

import React, { useEffect, useState } from 'react';
import {
  Copy,
  Check,
  Terminal,
  Shield,
  CheckCircle2,
  Building,
  Key,
  Play,
  Loader2,
  RefreshCw,
  Send,
  AlertCircle,
  QrCode,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { apiClient } from '@/lib/api';

interface LiveResponseState {
  loading: boolean;
  status: number | null;
  statusText?: string;
  durationMs: number | null;
  data: any;
  error?: string | null;
}

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState<'curl' | 'node' | 'python'>('curl');
  const [tenantSlug, setTenantSlug] = useState('your-tenant-id');
  const [tenantId, setTenantId] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [originUrl, setOriginUrl] = useState('https://auth.yourcompany.com');

  // API Key State for Live Tester
  const [liveApiKey, setLiveApiKey] = useState('');
  const [displayApiKey, setDisplayApiKey] = useState('ag_test_YOUR_SANDBOX_KEY');
  const [generatingKey, setGeneratingKey] = useState(false);

  // Active Live Runner Accordion State
  const [activeRunner, setActiveRunner] = useState<'status' | 'push' | 'push_status' | 'totp' | 'enroll' | null>('push');

  // Input states for Live Runner
  const [statusEmail, setStatusEmail] = useState('demo.user@example.com');
  const [statusRes, setStatusRes] = useState<LiveResponseState>({ loading: false, status: null, durationMs: null, data: null });

  const [pushEmail, setPushEmail] = useState('demo.user@example.com');
  const [pushIssuer, setPushIssuer] = useState('');
  const [pushRes, setPushRes] = useState<LiveResponseState>({ loading: false, status: null, durationMs: null, data: null });

  const [pollRequestId, setPollRequestId] = useState('');
  const [pollRes, setPollRes] = useState<LiveResponseState>({ loading: false, status: null, durationMs: null, data: null });

  const [totpEmail, setTotpEmail] = useState('demo.user@example.com');
  const [totpCode, setTotpCode] = useState('123456');
  const [totpRes, setTotpRes] = useState<LiveResponseState>({ loading: false, status: null, durationMs: null, data: null });

  const [enrollEmail, setEnrollEmail] = useState('new.user@example.com');
  const [enrollIssuer, setEnrollIssuer] = useState('');
  const [enrollRes, setEnrollRes] = useState<LiveResponseState>({ loading: false, status: null, durationMs: null, data: null });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOriginUrl(window.location.origin);
    }

    // Load current tenant profile (slug / id / branding)
    apiClient('/api/tenant/me')
      .then((data) => {
        if (data.tenant?.slug || data.tenant?.id) {
          setTenantSlug(data.tenant.slug || data.tenant.id);
          setTenantId(data.tenant.id);
          if (data.tenant.name) {
            setPushIssuer(data.tenant.branding?.issuerName || data.tenant.name);
            setEnrollIssuer(data.tenant.branding?.issuerName || data.tenant.name);
          }
        }
      })
      .catch(() => {});

    // Attempt to load tenant's active API keys (prioritizing test/sandbox key for docs runner)
    apiClient('/api/tenant/api-keys')
      .then((data) => {
        const testKey = (data.keys || []).find((k: any) => k.is_active && k.environment === 'test');
        const fallbackKey = (data.keys || []).find((k: any) => k.is_active);
        const selected = testKey || fallbackKey;
        if (selected) {
          setDisplayApiKey(`${selected.key_prefix}****************`);
        }
      })
      .catch(() => {});

    // Check if we saved a raw test key in session/local storage
    const savedKey = localStorage.getItem('authguard_demo_api_key');
    if (savedKey) {
      setLiveApiKey(savedKey);
      setDisplayApiKey(savedKey);
    }
  }, []);

  const handleGenerateQuickKey = async () => {
    setGeneratingKey(true);
    try {
      const res = await apiClient('/api/tenant/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: 'Docs Sandbox Test Key', environment: 'test' }),
      });
      if (res.key?.rawKey) {
        setLiveApiKey(res.key.rawKey);
        setDisplayApiKey(res.key.rawKey);
        localStorage.setItem('authguard_demo_api_key', res.key.rawKey);
      }
    } catch (err: any) {
      console.error('Failed to create sandbox test API key:', err);
    } finally {
      setGeneratingKey(false);
    }
  };

  const copyCode = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  // Generic Live Request Executor
  const executeApiCall = async (
    endpointPath: string,
    method: 'GET' | 'POST',
    body: any | null,
    setter: React.Dispatch<React.SetStateAction<LiveResponseState>>
  ) => {
    setter({ loading: true, status: null, durationMs: null, data: null, error: null });
    const startTime = performance.now();

    const url = `${originUrl}/api/tenant/${tenantSlug}${endpointPath}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (liveApiKey.trim()) {
      headers['X-Api-Key'] = liveApiKey.trim();
    }

    try {
      // Use direct fetch with credentials so session fallback works if no API key is specified
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include',
      });

      const durationMs = Math.round(performance.now() - startTime);
      let json = null;
      try {
        json = await res.json();
      } catch {
        json = { error: 'Non-JSON response returned' };
      }

      setter({
        loading: false,
        status: res.status,
        statusText: res.statusText,
        durationMs,
        data: json,
        error: !res.ok ? (json.error || `HTTP ${res.status}`) : null,
      });

      return json;
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - startTime);
      setter({
        loading: false,
        status: 0,
        statusText: 'Network Error',
        durationMs,
        data: null,
        error: err.message || 'Network request failed',
      });
    }
  };

  const codeSnippets = {
    curl: {
      preauth: `# 1. Check if user is enrolled & what 2FA factors are ready
curl -X GET "${originUrl}/api/tenant/${tenantSlug}/users/status?username=${statusEmail}" \\
  -H "X-Api-Key: ${liveApiKey || displayApiKey}"`,

      push: `# 2. Option A: Trigger Phishing-Resistant 2FA Push Challenge
curl -X POST ${originUrl}/api/tenant/${tenantSlug}/push/challenge \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: ${liveApiKey || displayApiKey}" \\
  -d '{
    "username": "${pushEmail}",
    "issuer": "${pushIssuer || 'YourApp'}"
  }'`,

      pushStatus: `# 3. Poll Push Challenge Approval Status
curl -X GET ${originUrl}/api/tenant/${tenantSlug}/push/status/${pollRequestId || 'REQUEST_UUID'} \\
  -H "X-Api-Key: ${liveApiKey || displayApiKey}"`,

      totp: `# 4. Option B: Verify 6-Digit TOTP Passcode
curl -X POST ${originUrl}/api/tenant/${tenantSlug}/totp/verify \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: ${liveApiKey || displayApiKey}" \\
  -d '{
    "username": "${totpEmail}",
    "code": "${totpCode}"
  }'`,

      enroll: `# 5. If User Not Enrolled: Generate Setup QR Code
curl -X POST ${originUrl}/api/tenant/${tenantSlug}/enroll \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: ${liveApiKey || displayApiKey}" \\
  -d '{
    "username": "${enrollEmail}",
    "issuer": "${enrollIssuer || 'YourApp'}"
  }'`,
    },

    node: {
      preauth: `// 1. Check User Enrollment Status
const statusRes = await fetch('${originUrl}/api/tenant/${tenantSlug}/users/status?username=' + encodeURIComponent('${statusEmail}'), {
  headers: { 'X-Api-Key': '${liveApiKey || displayApiKey}' },
});
const { enrolled, factors, activeDevices } = await statusRes.json();
// enrolled: true/false, factors: ['push', 'totp']`,

      push: `// 2. Option A: Trigger 2FA Push Challenge
const challenge = await fetch('${originUrl}/api/tenant/${tenantSlug}/push/challenge', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': '${liveApiKey || displayApiKey}',
  },
  body: JSON.stringify({ username: '${pushEmail}', issuer: '${pushIssuer || 'YourApp'}' }),
}).then(res => res.json());

console.log('Match number to display to customer:', challenge.challengeNumber);
console.log('Status polling endpoint:', challenge.statusUrl);`,

      pushStatus: `// 3. Poll Status of Push Challenge
const status = await fetch('${originUrl}/api/tenant/${tenantSlug}/push/status/' + challenge.requestId, {
  headers: { 'X-Api-Key': '${liveApiKey || displayApiKey}' },
}).then(res => res.json());

if (status.isApproved) {
  // Login approved!
}`,

      totp: `// 4. Option B: Verify 6-Digit TOTP Code
const totpRes = await fetch('${originUrl}/api/tenant/${tenantSlug}/totp/verify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': '${liveApiKey || displayApiKey}',
  },
  body: JSON.stringify({ username: '${totpEmail}', code: '${totpCode}' }),
}).then(res => res.json());

if (totpRes.valid) {
  // Login succeeded!
}`,

      enroll: `// 5. Enroll User & Generate Setup QR Code
const enrollRes = await fetch('${originUrl}/api/tenant/${tenantSlug}/enroll', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': '${liveApiKey || displayApiKey}',
  },
  body: JSON.stringify({
    username: '${enrollEmail}',
    issuer: '${enrollIssuer || 'YourApp'}',
  }),
}).then(res => res.json());

// Present enrollRes.qrCodeDataUrl on your screen to scan with AuthGuard App!`,
    },

    python: {
      preauth: `import requests

# 1. Check User Enrollment Status
headers = {"X-Api-Key": "${liveApiKey || displayApiKey}"}
res = requests.get(
    "${originUrl}/api/tenant/${tenantSlug}/users/status",
    params={"username": "${statusEmail}"},
    headers=headers
)
data = res.json()
print("Enrolled:", data.get("enrolled"), "Factors:", data.get("factors"))`,

      push: `import requests

# 2. Option A: Trigger 2FA Push Challenge
res = requests.post(
    "${originUrl}/api/tenant/${tenantSlug}/push/challenge",
    headers={"X-Api-Key": "${liveApiKey || displayApiKey}"},
    json={"username": "${pushEmail}", "issuer": "${pushIssuer || 'YourApp'}"}
)
challenge = res.json()
print("Display match number to user:", challenge.get("challengeNumber"))`,

      pushStatus: `import requests

# 3. Poll Status of Push Challenge
res = requests.get(
    "${originUrl}/api/tenant/${tenantSlug}/push/status/${pollRequestId || 'REQUEST_UUID'}",
    headers={"X-Api-Key": "${liveApiKey || displayApiKey}"}
)
status = res.json()
print("Is Approved:", status.get("isApproved"))`,

      totp: `import requests

# 4. Option B: Verify 6-Digit TOTP Code
res = requests.post(
    "${originUrl}/api/tenant/${tenantSlug}/totp/verify",
    headers={"X-Api-Key": "${liveApiKey || displayApiKey}"},
    json={"username": "${totpEmail}", "code": "${totpCode}"}
)
result = res.json()
if result.get("valid"):
    print("TOTP verification success!")`,

      enroll: `import requests

# 5. Enroll User & Generate Setup QR Code
res = requests.post(
    "${originUrl}/api/tenant/${tenantSlug}/enroll",
    headers={"X-Api-Key": "${liveApiKey || displayApiKey}"},
    json={"username": "${enrollEmail}", "issuer": "${enrollIssuer || 'YourApp'}"}
)
data = res.json()
print("QR Code Data URL:", data.get("qrCodeDataUrl"))`,
    },
  };

  const renderResponseBox = (state: LiveResponseState) => {
    if (state.loading) {
      return (
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-center gap-2 text-xs text-blue-400 font-mono">
          <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
          <span>Executing live API call...</span>
        </div>
      );
    }

    if (state.status === null && !state.error) {
      return null;
    }

    const isOk = state.status && state.status >= 200 && state.status < 300;

    return (
      <div className="border-t border-slate-800 bg-slate-950/90 p-4 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                isOk
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : 'bg-red-950 text-red-400 border border-red-800'
              }`}
            >
              {state.status ? `${state.status} ${state.statusText || ''}` : 'Error'}
            </span>
            {state.durationMs !== null && (
              <span className="text-slate-400 font-mono text-[11px]">{state.durationMs}ms</span>
            )}
          </div>
          <button
            onClick={() => copyCode('res', JSON.stringify(state.data, null, 2))}
            className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 font-mono transition-colors"
          >
            {copied === 'res' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            <span>{copied === 'res' ? 'Copied' : 'Copy Response'}</span>
          </button>
        </div>

        {/* JSON Viewer */}
        <pre className="font-mono text-xs text-slate-200 bg-slate-900/80 p-3 rounded-xl overflow-x-auto border border-slate-800/80 max-h-64 overflow-y-auto leading-relaxed">
          {state.data ? JSON.stringify(state.data, null, 2) : state.error || 'No body returned'}
        </pre>

        {/* Special rendering for QR code if returned by enroll API */}
        {state.data?.qrCodeDataUrl && (
          <div className="mt-3 p-3 bg-slate-900 border border-purple-800/50 rounded-xl flex items-center gap-4">
            <img
              src={state.data.qrCodeDataUrl}
              alt="Live Enrollment QR"
              className="w-24 h-24 rounded-lg bg-white p-1 shrink-0 shadow-md"
            />
            <div className="text-xs space-y-1">
              <div className="font-bold text-white flex items-center gap-1.5">
                <QrCode className="h-4 w-4 text-purple-400" />
                <span>Live Generated QR Code</span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Scan this live with the AuthGuard PWA Authenticator to instantly pair this test user!
              </p>
              <div className="font-mono text-[10px] text-slate-500">Secret: {state.data.totpSecret}</div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Developer SDK & API Documentation</h1>
        <p className="text-sm text-slate-400 mt-1">
          Interactive REST API & SDK reference with integrated live test runner, request inspection, and instant payload execution.
        </p>
      </div>

      {/* Tenant-Scoped URL & Live API Key Sandbox Bar */}
      <div className="p-5 bg-gradient-to-r from-blue-950/40 via-slate-900/60 to-purple-950/30 border border-blue-800/60 rounded-2xl space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
              <Building className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white">Your Dedicated Tenant Base Path:</span>
                <code className="px-2 py-0.5 bg-blue-900/60 text-blue-300 font-mono text-xs rounded border border-blue-700/50">
                  /api/tenant/{tenantSlug}/...
                </code>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Multi-Tenant Architecture: Every external call is strictly tenant-isolated using your API Key and URL parameter.
              </p>
            </div>
          </div>

          {/* Quick API Key Sandbox Input */}
          <div className="w-full md:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1 sm:w-80">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Key className="h-4 w-4 text-amber-400" />
              </div>
              <input
                type="text"
                value={liveApiKey}
                onChange={(e) => {
                  setLiveApiKey(e.target.value);
                  localStorage.setItem('authguard_demo_api_key', e.target.value);
                }}
                placeholder={displayApiKey || 'Enter ag_test_... key'}
                className="w-full pl-9 pr-3 py-2 bg-slate-950/90 border border-slate-700 text-xs font-mono text-white rounded-xl placeholder-slate-500 focus:outline-none focus:border-amber-400 shadow-inner"
              />
            </div>

            <button
              onClick={handleGenerateQuickKey}
              disabled={generatingKey}
              title="Generate a new active ag_test_ sandbox key to test live APIs instantly"
              className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-amber-600/20 shrink-0 disabled:opacity-50"
            >
              {generatingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span>{liveApiKey ? 'Regenerate Test Key' : 'Generate Test Key'}</span>
            </button>
          </div>
        </div>

        {/* Hint banner */}
        <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-950/50 px-3 py-2 rounded-xl border border-slate-800">
          <AlertCircle className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          <span>
            {liveApiKey
              ? 'Active sandbox test key loaded (' + liveApiKey.slice(0, 16) + '...). Live requests will use header: X-Api-Key.'
              : 'Using authenticated Dashboard Session for Live Playground. (Click "Generate Test Key" to generate a sandbox ag_test_... key).'}
          </span>
        </div>
      </div>

      {/* Code Snippets Language Selector */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          {(['curl', 'node', 'python'] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setActiveTab(lang)}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors ${
                activeTab === lang
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              {lang === 'curl' ? 'cURL' : lang === 'node' ? 'Node.js' : 'Python'}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-500">
          Click <span className="text-blue-400 font-semibold">"Live API Runner"</span> on any endpoint below to test in real-time.
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. PRE-AUTH STATUS CHECK */}
      {/* ========================================================================= */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 font-mono text-[10px] font-bold rounded border border-blue-500/30">
              GET
            </span>
            <code className="text-xs font-mono text-slate-300">/api/tenant/{tenantSlug}/users/status</code>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveRunner(activeRunner === 'status' ? null : 'status')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                activeRunner === 'status'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Play className="h-3 w-3 fill-current" />
              <span>{activeRunner === 'status' ? 'Close Runner' : 'Live API Runner'}</span>
            </button>

            <button
              onClick={() => copyCode('preauth', codeSnippets[activeTab].preauth)}
              className="px-2.5 py-1 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1"
            >
              {copied === 'preauth' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{copied === 'preauth' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        <p className="px-5 pt-4 text-xs text-slate-400">
          Checks whether a user exists and returns which factors are enrolled: <code className="text-slate-300">push</code>, <code className="text-slate-300">totp</code>, or empty array.
        </p>

        {/* Live Runner Drawer */}
        {activeRunner === 'status' && (
          <div className="m-4 p-4 bg-slate-950/80 border border-blue-900/50 rounded-xl space-y-3">
            <div className="text-xs font-semibold text-blue-300 flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-blue-400" />
              <span>Live Query Execution</span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex-1">
                <label className="block text-[10px] font-mono text-slate-400 mb-1 uppercase tracking-wider">
                  Query Parameter: username / email
                </label>
                <input
                  type="text"
                  value={statusEmail}
                  onChange={(e) => setStatusEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-xs font-mono text-white rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                onClick={() => executeApiCall(`/users/status?username=${encodeURIComponent(statusEmail.trim())}`, 'GET', null, setStatusRes)}
                disabled={statusRes.loading}
                className="self-end px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-md shadow-blue-600/20"
              >
                {statusRes.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                <span>Send Request</span>
              </button>
            </div>

            {renderResponseBox(statusRes)}
          </div>
        )}

        <pre className="p-5 font-mono text-xs text-slate-200 overflow-x-auto bg-slate-950/70 leading-relaxed">
          {codeSnippets[activeTab].preauth}
        </pre>
      </div>

      {/* ========================================================================= */}
      {/* 2. FACTOR A: PUSH CHALLENGE */}
      {/* ========================================================================= */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold rounded border border-emerald-500/30">
              POST
            </span>
            <code className="text-xs font-mono text-slate-300">/api/tenant/{tenantSlug}/push/challenge</code>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveRunner(activeRunner === 'push' ? null : 'push')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                activeRunner === 'push'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Play className="h-3 w-3 fill-current" />
              <span>{activeRunner === 'push' ? 'Close Runner' : 'Live API Runner'}</span>
            </button>

            <button
              onClick={() => copyCode('push', codeSnippets[activeTab].push)}
              className="px-2.5 py-1 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1"
            >
              {copied === 'push' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{copied === 'push' ? 'Copy' : 'Copy'}</span>
            </button>
          </div>
        </div>

        <p className="px-5 pt-4 text-xs text-slate-400">
          Dispatches out-of-band Web Push notification to user's enrolled PWA devices. Returns a 2-digit match challenge number to display to the user on their screen.
        </p>

        {/* Live Runner Drawer */}
        {activeRunner === 'push' && (
          <div className="m-4 p-4 bg-slate-950/80 border border-emerald-900/50 rounded-xl space-y-3">
            <div className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-emerald-400" />
              <span>Live Push Dispatcher</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1 uppercase tracking-wider">
                  Target Username / Email *
                </label>
                <input
                  type="text"
                  value={pushEmail}
                  onChange={(e) => setPushEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-xs font-mono text-white rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1 uppercase tracking-wider">
                  Issuer Name (Optional)
                </label>
                <input
                  type="text"
                  value={pushIssuer}
                  onChange={(e) => setPushIssuer(e.target.value)}
                  placeholder="YourApp"
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-xs font-mono text-white rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="text-[11px] text-slate-400">
                User must be enrolled via QR code with active device to receive push.
              </div>
              <button
                onClick={async () => {
                  const data = await executeApiCall(
                    '/push/challenge',
                    'POST',
                    { username: pushEmail.trim(), issuer: pushIssuer.trim() || undefined },
                    setPushRes
                  );
                  if (data?.requestId) {
                    setPollRequestId(data.requestId);
                  }
                }}
                disabled={pushRes.loading}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-md shadow-emerald-600/20"
              >
                {pushRes.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                <span>Dispatch Challenge</span>
              </button>
            </div>

            {/* Special Highlight if Challenge Created */}
            {pushRes.data?.challengeNumber && (
              <div className="p-3 bg-slate-900 border border-emerald-800/80 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Match Number to Show User</div>
                  <div className="text-2xl font-extrabold text-emerald-400 font-mono tracking-widest">
                    {pushRes.data.challengeNumber}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setActiveRunner('push_status');
                    executeApiCall(`/push/status/${pushRes.data.requestId}`, 'GET', null, setPollRes);
                  }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-white rounded-lg font-medium transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Check Status Now</span>
                </button>
              </div>
            )}

            {renderResponseBox(pushRes)}
          </div>
        )}

        <pre className="p-5 font-mono text-xs text-slate-200 overflow-x-auto bg-slate-950/70 leading-relaxed">
          {codeSnippets[activeTab].push}
        </pre>
      </div>

      {/* ========================================================================= */}
      {/* 3. PUSH STATUS POLLING */}
      {/* ========================================================================= */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 font-mono text-[10px] font-bold rounded border border-cyan-500/30">
              GET
            </span>
            <code className="text-xs font-mono text-slate-300">/api/tenant/{tenantSlug}/push/status/:requestId</code>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveRunner(activeRunner === 'push_status' ? null : 'push_status')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                activeRunner === 'push_status'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Play className="h-3 w-3 fill-current" />
              <span>{activeRunner === 'push_status' ? 'Close Runner' : 'Live API Runner'}</span>
            </button>

            <button
              onClick={() => copyCode('pushStatus', codeSnippets[activeTab].pushStatus)}
              className="px-2.5 py-1 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1"
            >
              {copied === 'pushStatus' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{copied === 'pushStatus' ? 'Copy' : 'Copy'}</span>
            </button>
          </div>
        </div>

        <p className="px-5 pt-4 text-xs text-slate-400">
          Client application polls this endpoint every 2 seconds until <code className="text-slate-300">isApproved === true</code>, denied, or expired.
        </p>

        {/* Live Runner Drawer */}
        {activeRunner === 'push_status' && (
          <div className="m-4 p-4 bg-slate-950/80 border border-cyan-900/50 rounded-xl space-y-3">
            <div className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-cyan-400" />
              <span>Live Status Checker</span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex-1">
                <label className="block text-[10px] font-mono text-slate-400 mb-1 uppercase tracking-wider">
                  Request UUID (requestId)
                </label>
                <input
                  type="text"
                  value={pollRequestId}
                  onChange={(e) => setPollRequestId(e.target.value)}
                  placeholder="e.g. 4417e7b6-97bf-4f30-b5c6-0450c0cee10a"
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-xs font-mono text-white rounded-lg focus:outline-none focus:border-cyan-500"
                />
              </div>

              <button
                onClick={() => executeApiCall(`/push/status/${encodeURIComponent(pollRequestId.trim())}`, 'GET', null, setPollRes)}
                disabled={pollRes.loading || !pollRequestId.trim()}
                className="self-end px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-md shadow-cyan-600/20"
              >
                {pollRes.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                <span>Check Status</span>
              </button>
            </div>

            {renderResponseBox(pollRes)}
          </div>
        )}

        <pre className="p-5 font-mono text-xs text-slate-200 overflow-x-auto bg-slate-950/70 leading-relaxed">
          {codeSnippets[activeTab].pushStatus}
        </pre>
      </div>

      {/* ========================================================================= */}
      {/* 4. FACTOR B: TOTP VERIFY */}
      {/* ========================================================================= */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 font-mono text-[10px] font-bold rounded border border-amber-500/30">
              POST
            </span>
            <code className="text-xs font-mono text-slate-300">/api/tenant/{tenantSlug}/totp/verify</code>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveRunner(activeRunner === 'totp' ? null : 'totp')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                activeRunner === 'totp'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Play className="h-3 w-3 fill-current" />
              <span>{activeRunner === 'totp' ? 'Close Runner' : 'Live API Runner'}</span>
            </button>

            <button
              onClick={() => copyCode('totp', codeSnippets[activeTab].totp)}
              className="px-2.5 py-1 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1"
            >
              {copied === 'totp' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{copied === 'totp' ? 'Copy' : 'Copy'}</span>
            </button>
          </div>
        </div>

        <p className="px-5 pt-4 text-xs text-slate-400">
          Cryptographically verifies 6-digit TOTP passcode. Protected by Redis Anti-Replay: duplicate submissions of the same code within 90s are automatically blocked.
        </p>

        {/* Live Runner Drawer */}
        {activeRunner === 'totp' && (
          <div className="m-4 p-4 bg-slate-950/80 border border-amber-900/50 rounded-xl space-y-3">
            <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-amber-400" />
              <span>Live TOTP Verification</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1 uppercase tracking-wider">
                  Target Username / Email *
                </label>
                <input
                  type="text"
                  value={totpEmail}
                  onChange={(e) => setTotpEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-xs font-mono text-white rounded-lg focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1 uppercase tracking-wider">
                  6-Digit Passcode (From Authenticator App) *
                </label>
                <input
                  type="text"
                  value={totpCode}
                  maxLength={6}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="481920"
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-xs font-mono text-white rounded-lg focus:outline-none focus:border-amber-500 tracking-widest text-center font-bold"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() =>
                  executeApiCall(
                    '/totp/verify',
                    'POST',
                    { username: totpEmail.trim(), code: totpCode.trim() },
                    setTotpRes
                  )
                }
                disabled={totpRes.loading || !totpCode.trim()}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-md shadow-amber-600/20"
              >
                {totpRes.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
                <span>Verify Code</span>
              </button>
            </div>

            {renderResponseBox(totpRes)}
          </div>
        )}

        <pre className="p-5 font-mono text-xs text-slate-200 overflow-x-auto bg-slate-950/70 leading-relaxed">
          {codeSnippets[activeTab].totp}
        </pre>
      </div>

      {/* ========================================================================= */}
      {/* 5. USER ENROLLMENT */}
      {/* ========================================================================= */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 font-mono text-[10px] font-bold rounded border border-purple-500/30">
              POST
            </span>
            <code className="text-xs font-mono text-slate-300">/api/tenant/{tenantSlug}/enroll</code>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveRunner(activeRunner === 'enroll' ? null : 'enroll')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                activeRunner === 'enroll'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Play className="h-3 w-3 fill-current" />
              <span>{activeRunner === 'enroll' ? 'Close Runner' : 'Live API Runner'}</span>
            </button>

            <button
              onClick={() => copyCode('enroll', codeSnippets[activeTab].enroll)}
              className="px-2.5 py-1 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1"
            >
              {copied === 'enroll' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{copied === 'enroll' ? 'Copy' : 'Copy'}</span>
            </button>
          </div>
        </div>

        <p className="px-5 pt-4 text-xs text-slate-400">
          Initiates 2FA enrollment for an end user and returns the Setup QR Code Data URL with an atomic 15-minute temporary token.
        </p>

        {/* Live Runner Drawer */}
        {activeRunner === 'enroll' && (
          <div className="m-4 p-4 bg-slate-950/80 border border-purple-900/50 rounded-xl space-y-3">
            <div className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-purple-400" />
              <span>Live Setup Generator</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1 uppercase tracking-wider">
                  Username / Identifier to Enroll *
                </label>
                <input
                  type="text"
                  value={enrollEmail}
                  onChange={(e) => setEnrollEmail(e.target.value)}
                  placeholder="new.user@example.com"
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-xs font-mono text-white rounded-lg focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1 uppercase tracking-wider">
                  Brand / Issuer Name (Optional)
                </label>
                <input
                  type="text"
                  value={enrollIssuer}
                  onChange={(e) => setEnrollIssuer(e.target.value)}
                  placeholder="YourApp"
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-xs font-mono text-white rounded-lg focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() =>
                  executeApiCall(
                    '/enroll',
                    'POST',
                    { username: enrollEmail.trim(), issuer: enrollIssuer.trim() || undefined },
                    setEnrollRes
                  )
                }
                disabled={enrollRes.loading || !enrollEmail.trim()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-md shadow-purple-600/20"
              >
                {enrollRes.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
                <span>Generate Setup QR</span>
              </button>
            </div>

            {renderResponseBox(enrollRes)}
          </div>
        )}

        <pre className="p-5 font-mono text-xs text-slate-200 overflow-x-auto bg-slate-950/70 leading-relaxed">
          {codeSnippets[activeTab].enroll}
        </pre>
      </div>
    </div>
  );
}
