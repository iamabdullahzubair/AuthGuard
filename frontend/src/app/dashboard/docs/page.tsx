'use client';

import React, { useEffect, useState } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';
import { apiClient } from '@/lib/api';

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState<'curl' | 'node' | 'python' | 'php' | 'go'>('curl');
  const [liveApiKey, setLiveApiKey] = useState('ag_live_YOUR_API_KEY');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
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

  const codeSnippets: Record<string, { title: string; enroll: string; challenge: string }> = {
    curl: {
      title: 'cURL',
      enroll: `# 1. Enroll User & Generate Setup QR Code
curl -X POST https://15.135.173.157.nip.io/api/v1/enroll \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: ${liveApiKey}" \\
  -d '{
    "email": "customer@yourcompany.com",
    "issuer": "YourApp",
    "webhookUrl": "https://yourcompany.com/authguard-webhook"
  }'`,
      challenge: `# 2. Trigger Phishing-Resistant 2FA Push Challenge
curl -X POST https://15.135.173.157.nip.io/api/v1/push/challenge \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: ${liveApiKey}" \\
  -d '{
    "email": "customer@yourcompany.com"
  }'`,
    },
    node: {
      title: 'Node.js',
      enroll: `// 1. Enroll User
const response = await fetch('https://15.135.173.157.nip.io/api/v1/enroll', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': '${liveApiKey}',
  },
  body: JSON.stringify({
    email: 'customer@yourcompany.com',
    issuer: 'YourApp',
    webhookUrl: 'https://yourcompany.com/authguard-webhook',
  }),
});
const { qrCodeDataUrl, enrollToken } = await response.json();
// Present qrCodeDataUrl image to your customer to scan with Authenticator PWA!`,
      challenge: `// 2. Trigger 2FA Push Challenge
const challenge = await fetch('https://15.135.173.157.nip.io/api/v1/push/challenge', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': '${liveApiKey}',
  },
  body: JSON.stringify({ email: 'customer@yourcompany.com' }),
}).then(res => res.json());

console.log('Match number to display on web screen:', challenge.challengeNumber);`,
    },
    python: {
      title: 'Python',
      enroll: `import requests

# 1. Enroll User
res = requests.post(
    "https://15.135.173.157.nip.io/api/v1/enroll",
    headers={"X-Api-Key": "${liveApiKey}"},
    json={
        "email": "customer@yourcompany.com",
        "issuer": "YourApp",
        "webhookUrl": "https://yourcompany.com/authguard-webhook"
    }
)
data = res.json()
print("QR Code Data URL:", data["qrCodeDataUrl"])`,
      challenge: `import requests

# 2. Trigger 2FA Push Challenge
res = requests.post(
    "https://15.135.173.157.nip.io/api/v1/push/challenge",
    headers={"X-Api-Key": "${liveApiKey}"},
    json={"email": "customer@yourcompany.com"}
)
challenge = res.json()
print("Display this number to user:", challenge["challengeNumber"])`,
    },
    php: {
      title: 'PHP',
      enroll: `<?php
// 1. Enroll User
$ch = curl_init('https://15.135.173.157.nip.io/api/v1/enroll');
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'X-Api-Key: ${liveApiKey}'
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'email' => 'customer@yourcompany.com',
    'issuer' => 'YourApp',
    'webhookUrl' => 'https://yourcompany.com/authguard-webhook'
]));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$result = json_decode(curl_exec($ch), true);
echo $result['qrCodeDataUrl'];`,
      challenge: `<?php
// 2. Trigger 2FA Push Challenge
$ch = curl_init('https://15.135.173.157.nip.io/api/v1/push/challenge');
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'X-Api-Key: ${liveApiKey}'
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'email' => 'customer@yourcompany.com'
]));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$challenge = json_decode(curl_exec($ch), true);
echo "Match number: " . $challenge['challengeNumber'];`,
    },
    go: {
      title: 'Go',
      enroll: `package main

import (
    "bytes"
    "encoding/json"
    "net/http"
)

func main() {
    payload, _ := json.Marshal(map[string]string{
        "email": "customer@yourcompany.com",
        "issuer": "YourApp",
        "webhookUrl": "https://yourcompany.com/authguard-webhook",
    })
    req, _ := http.NewRequest("POST", "https://15.135.173.157.nip.io/api/v1/enroll", bytes.NewBuffer(payload))
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("X-Api-Key", "${liveApiKey}")

    client := &http.Client{}
    resp, _ := client.Do(req)
    defer resp.Body.Close()
}`,
      challenge: `package main

import (
    "bytes"
    "encoding/json"
    "net/http"
)

func main() {
    payload, _ := json.Marshal(map[string]string{
        "email": "customer@yourcompany.com",
    })
    req, _ := http.NewRequest("POST", "https://15.135.173.157.nip.io/api/v1/push/challenge", bytes.NewBuffer(payload))
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("X-Api-Key", "${liveApiKey}")

    client := &http.Client{}
    resp, _ := client.Do(req)
    defer resp.Body.Close()
}`,
    },
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Developer SDK & Documentation</h1>
        <p className="text-sm text-slate-400 mt-1">
          Integrate AuthGuard 2FA into your existing stack in under 5 minutes
        </p>
      </div>

      {/* Language Selector */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        {(['curl', 'node', 'python', 'php', 'go'] as const).map((lang) => (
          <button
            key={lang}
            onClick={() => setActiveTab(lang)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold capitalize transition-colors ${
              activeTab === lang
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            {codeSnippets[lang].title}
          </button>
        ))}
      </div>

      {/* Snippet 1: Enroll */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">Step 1: User Enrollment & Setup QR</span>
          </div>
          <button
            onClick={() => copyCode('enroll', codeSnippets[activeTab].enroll)}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 font-medium transition-colors"
          >
            {copied === 'enroll' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied === 'enroll' ? 'Copied' : 'Copy Snippet'}</span>
          </button>
        </div>
        <pre className="p-5 font-mono text-xs text-slate-200 overflow-x-auto bg-slate-950/70 leading-relaxed">
          {codeSnippets[activeTab].enroll}
        </pre>
      </div>

      {/* Snippet 2: Challenge */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-semibold text-white">Step 2: Trigger 2FA Push Challenge</span>
          </div>
          <button
            onClick={() => copyCode('challenge', codeSnippets[activeTab].challenge)}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 font-medium transition-colors"
          >
            {copied === 'challenge' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied === 'challenge' ? 'Copied' : 'Copy Snippet'}</span>
          </button>
        </div>
        <pre className="p-5 font-mono text-xs text-slate-200 overflow-x-auto bg-slate-950/70 leading-relaxed">
          {codeSnippets[activeTab].challenge}
        </pre>
      </div>
    </div>
  );
}
