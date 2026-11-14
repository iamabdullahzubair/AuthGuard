'use client';

import React, { useEffect, useState } from 'react';
import { Copy, Check, Terminal, Shield, CheckCircle2, Building, Key } from 'lucide-react';
import { apiClient } from '@/lib/api';

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState<'curl' | 'node' | 'python'>('curl');
  const [liveApiKey, setLiveApiKey] = useState('ag_live_YOUR_API_KEY');
  const [tenantSlug, setTenantSlug] = useState('your-tenant-id');
  const [copied, setCopied] = useState<string | null>(null);
  const [originUrl, setOriginUrl] = useState('https://auth.yourcompany.com');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOriginUrl(window.location.origin);
    }

    // Load current tenant profile (slug / id)
    apiClient('/api/tenant/me')
      .then((data) => {
        if (data.tenant?.slug || data.tenant?.id) {
          setTenantSlug(data.tenant.slug || data.tenant.id);
        }
      })
      .catch(() => {});

    // Attempt to load tenant's first live API key
    apiClient('/api/tenant/api-keys')
      .then((data) => {
        const live = (data.keys || []).find((k: any) => k.is_active && k.environment === 'live');
        if (live) {
          setLiveApiKey(`${live.key_prefix}****************`);
        }
      })
      .catch(() => {});
  }, []);

  const copyCode = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const codeSnippets = {
    curl: {
      preauth: `# 1. Check if user is enrolled & what 2FA factors are ready
curl -X GET "${originUrl}/api/tenant/${tenantSlug}/users/status?email=customer@yourcompany.com" \\
  -H "X-Api-Key: ${liveApiKey}"`,

      push: `# 2. Option A: Trigger Phishing-Resistant 2FA Push Challenge
curl -X POST ${originUrl}/api/tenant/${tenantSlug}/push/challenge \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: ${liveApiKey}" \\
  -d '{
    "email": "customer@yourcompany.com"
  }'`,

      totp: `# 3. Option B: Verify 6-Digit TOTP Passcode
curl -X POST ${originUrl}/api/tenant/${tenantSlug}/totp/verify \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: ${liveApiKey}" \\
  -d '{
    "email": "customer@yourcompany.com",
    "code": "481920"
  }'`,

      enroll: `# 4. If User Not Enrolled: Generate Setup QR Code
curl -X POST ${originUrl}/api/tenant/${tenantSlug}/enroll \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: ${liveApiKey}" \\
  -d '{
    "email": "customer@yourcompany.com",
    "issuer": "YourApp"
  }'`,
    },

    node: {
      preauth: `// 1. Check User Enrollment Status
const statusRes = await fetch('${originUrl}/api/tenant/${tenantSlug}/users/status?email=' + encodeURIComponent('customer@yourcompany.com'), {
  headers: { 'X-Api-Key': '${liveApiKey}' },
});
const { enrolled, factors, activeDevices } = await statusRes.json();
// factors: ['push', 'totp']`,

      push: `// 2. Option A: Trigger 2FA Push Challenge
const challenge = await fetch('${originUrl}/api/tenant/${tenantSlug}/push/challenge', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': '${liveApiKey}',
  },
  body: JSON.stringify({ email: 'customer@yourcompany.com' }),
}).then(res => res.json());

console.log('Match number to display to customer:', challenge.challengeNumber);
console.log('Status polling endpoint:', challenge.statusUrl);`,

      totp: `// 3. Option B: Verify 6-Digit TOTP Code
const totpRes = await fetch('${originUrl}/api/tenant/${tenantSlug}/totp/verify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': '${liveApiKey}',
  },
  body: JSON.stringify({ email: 'customer@yourcompany.com', code: '481920' }),
}).then(res => res.json());

if (totpRes.valid) {
  // Login succeeded!
}`,

      enroll: `// 4. Enroll User & Generate Setup QR Code
const enrollRes = await fetch('${originUrl}/api/tenant/${tenantSlug}/enroll', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': '${liveApiKey}',
  },
  body: JSON.stringify({
    email: 'customer@yourcompany.com',
    issuer: 'YourApp',
  }),
}).then(res => res.json());

// Present enrollRes.qrCodeDataUrl image on your screen to scan with AuthGuard App!`,
    },

    python: {
      preauth: `import requests

# 1. Check User Enrollment Status
headers = {"X-Api-Key": "${liveApiKey}"}
res = requests.get(
    "${originUrl}/api/tenant/${tenantSlug}/users/status",
    params={"email": "customer@yourcompany.com"},
    headers=headers
)
data = res.json()
print("Enrolled:", data.get("enrolled"), "Factors:", data.get("factors"))`,

      push: `import requests

# 2. Option A: Trigger 2FA Push Challenge
res = requests.post(
    "${originUrl}/api/tenant/${tenantSlug}/push/challenge",
    headers={"X-Api-Key": "${liveApiKey}"},
    json={"email": "customer@yourcompany.com"}
)
challenge = res.json()
print("Display match number to user:", challenge["challengeNumber"])`,

      totp: `import requests

# 3. Option B: Verify 6-Digit TOTP Code
res = requests.post(
    "${originUrl}/api/tenant/${tenantSlug}/totp/verify",
    headers={"X-Api-Key": "${liveApiKey}"},
    json={"email": "customer@yourcompany.com", "code": "481920"}
)
result = res.json()
if result.get("valid"):
    print("TOTP verification success!")`,

      enroll: `import requests

# 4. Enroll User & Generate Setup QR Code
res = requests.post(
    "${originUrl}/api/tenant/${tenantSlug}/enroll",
    headers={"X-Api-Key": "${liveApiKey}"},
    json={
        "email": "customer@yourcompany.com",
        "issuer": "YourApp"
    }
)
data = res.json()
print("QR Code Data URL:", data["qrCodeDataUrl"])`,
    },
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Developer SDK & API Documentation</h1>
        <p className="text-sm text-slate-400 mt-1">
          Complete client authentication lifecycle: Pre-Auth Check &rarr; Push / TOTP Verification &rarr; Onboarding Enrollment
        </p>
      </div>

      {/* Tenant-Scoped URL Badge */}
      <div className="p-4 bg-blue-950/40 border border-blue-800/60 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
            <Building className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white">Your Tenant API Endpoint:</span>
              <code className="px-2 py-0.5 bg-blue-900/50 text-blue-300 font-mono text-xs rounded border border-blue-700/50">
                /api/tenant/{tenantSlug}/...
              </code>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Strict Multi-Tenant Isolation enabled. Requests verify that your API Key matches <code className="text-slate-300 font-mono">{tenantSlug}</code> in the URL, preventing any cross-tenant data access.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-xl shrink-0">
          <Key className="h-4 w-4 text-amber-400" />
          <span className="text-xs text-slate-300 font-mono">{liveApiKey}</span>
        </div>
      </div>

      {/* Language Selector */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        {(['curl', 'node', 'python'] as const).map((lang) => (
          <button
            key={lang}
            onClick={() => setActiveTab(lang)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors ${
              activeTab === lang
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            {lang === 'curl' ? 'cURL' : lang === 'node' ? 'Node.js' : 'Python'}
          </button>
        ))}
      </div>

      {/* Step 1: Pre-Auth Check */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">1. Pre-Auth: Check If User Is Registered</span>
          </div>
          <button
            onClick={() => copyCode('preauth', codeSnippets[activeTab].preauth)}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 font-medium transition-colors"
          >
            {copied === 'preauth' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied === 'preauth' ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <pre className="p-5 font-mono text-xs text-slate-200 overflow-x-auto bg-slate-950/70 leading-relaxed">
          {codeSnippets[activeTab].preauth}
        </pre>
      </div>

      {/* Step 2: Push Challenge */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-semibold text-white">2. Factor A: Trigger 2FA Push Challenge</span>
          </div>
          <button
            onClick={() => copyCode('push', codeSnippets[activeTab].push)}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 font-medium transition-colors"
          >
            {copied === 'push' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied === 'push' ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <pre className="p-5 font-mono text-xs text-slate-200 overflow-x-auto bg-slate-950/70 leading-relaxed">
          {codeSnippets[activeTab].push}
        </pre>
      </div>

      {/* Step 3: TOTP Code */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-semibold text-white">3. Factor B: Verify 6-Digit TOTP Passcode</span>
          </div>
          <button
            onClick={() => copyCode('totp', codeSnippets[activeTab].totp)}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 font-medium transition-colors"
          >
            {copied === 'totp' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied === 'totp' ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <pre className="p-5 font-mono text-xs text-slate-200 overflow-x-auto bg-slate-950/70 leading-relaxed">
          {codeSnippets[activeTab].totp}
        </pre>
      </div>

      {/* Step 4: Enroll */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-purple-400" />
            <span className="text-xs font-semibold text-white">4. User Enrollment: Generate QR Code for New Users</span>
          </div>
          <button
            onClick={() => copyCode('enroll', codeSnippets[activeTab].enroll)}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 font-medium transition-colors"
          >
            {copied === 'enroll' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied === 'enroll' ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <pre className="p-5 font-mono text-xs text-slate-200 overflow-x-auto bg-slate-950/70 leading-relaxed">
          {codeSnippets[activeTab].enroll}
        </pre>
      </div>
    </div>
  );
}
