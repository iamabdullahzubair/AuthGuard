import { registerServiceWorker, subscribeToPush } from './push.js';
import {
  getOrCreateEcdsaKeyPair,
  getOrCreateAesKey,
  saveAccount,
  getAccounts,
  deleteAccount,
} from './db.js';
import {
  encryptSecret,
  decryptSecret,
  signPayload,
} from './crypto.js';
import { generateTotp, getTotpRemainingSeconds } from './totp.js';
import { startCameraScanner, stopCameraScanner, decodeQrFromImageFile } from './scanner.js';

// State
let accounts = [];
let currentView = 'view-accounts';
let totpInterval = null;
let activeApprovalRequest = null;
let selectedApprovalNumber = null;

// UI Elements
const views = {
  accounts: document.getElementById('view-accounts'),
  scanner: document.getElementById('view-scanner'),
  approval: document.getElementById('view-approval'),
  settings: document.getElementById('view-settings'),
};

const navItems = {
  accounts: document.getElementById('nav-accounts'),
  scanner: document.getElementById('nav-scanner'),
  approval: document.getElementById('nav-approval'),
  settings: document.getElementById('nav-settings'),
};

const accountsListEl = document.getElementById('accounts-list');
const emptyAccountsEl = document.getElementById('empty-accounts');
const videoEl = document.getElementById('scanner-video');
const canvasEl = document.getElementById('scanner-canvas');
const fileInputEl = document.getElementById('qr-file-input');
const toastContainerEl = document.getElementById('toast-container');
const approvalBadgeEl = document.getElementById('approval-nav-badge');

// Toast Notification
export function showToast(message, type = 'info', duration = 3500) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainerEl.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

// Navigation switcher
export function switchView(viewName) {
  currentView = `view-${viewName}`;
  Object.keys(views).forEach((key) => {
    if (views[key]) {
      views[key].classList.toggle('active', key === viewName);
    }
  });

  Object.keys(navItems).forEach((key) => {
    if (navItems[key]) {
      navItems[key].classList.toggle('active', key === viewName);
    }
  });

  if (viewName === 'scanner') {
    startScanning();
  } else {
    stopCameraScanner();
  }

  if (viewName === 'settings') {
    loadSettingsData();
  }
}

// Bind navigation
Object.keys(navItems).forEach((key) => {
  if (navItems[key]) {
    navItems[key].addEventListener('click', () => switchView(key));
  }
});

const scanQrBtn = document.getElementById('btn-scan-qr-empty');
if (scanQrBtn) {
  scanQrBtn.addEventListener('click', () => switchView('scanner'));
}

// Initialize Application
async function initApp() {
  try {
    // 1. Register Service Worker
    await registerServiceWorker();

    // 2. Pre-generate / load keys
    await getOrCreateEcdsaKeyPair();
    await getOrCreateAesKey();

    // 3. Load accounts
    await refreshAccounts();

    // 4. Start 30-second TOTP loop
    startTotpTimer();

    // 5. Listen for push messages from Service Worker
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'PUSH_LOGIN_REQUEST') {
          handleIncomingLoginRequest(event.data.payload);
        }
      });
    }

    // 6. Check URL search params for deep link e.g. /pwa/?request_id=xxx
    const params = new URLSearchParams(window.location.search);
    const deepRequestId = params.get('request_id');
    if (deepRequestId) {
      loadApprovalRequest(deepRequestId);
    }
  } catch (err) {
    console.error('PWA Initialization error:', err);
    showToast(err.message, 'error');
  }
}

// Refresh Accounts from IndexedDB
async function refreshAccounts() {
  accounts = await getAccounts();
  renderAccounts();
}

// Render Accounts List
async function renderAccounts() {
  if (!accountsListEl) return;

  if (accounts.length === 0) {
    accountsListEl.innerHTML = '';
    if (emptyAccountsEl) emptyAccountsEl.style.display = 'block';
    return;
  }

  if (emptyAccountsEl) emptyAccountsEl.style.display = 'none';

  const aesKey = await getOrCreateAesKey();
  const remainingSeconds = getTotpRemainingSeconds();
  const strokeDashoffset = (1 - remainingSeconds / 30) * 88; // 2 * PI * r (r=14) ~ 88

  let html = '';
  for (const acc of accounts) {
    let plainSecret = '';
    let totpCode = '------';
    try {
      plainSecret = await decryptSecret(aesKey, acc.encryptedSecret, acc.iv);
      totpCode = await generateTotp(plainSecret);
    } catch (e) {
      console.error('Decryption/TOTP error for account:', acc.id, e);
    }

    const formattedCode = `${totpCode.slice(0, 3)} ${totpCode.slice(3)}`;

    html += `
      <div class="account-card" data-account-id="${acc.id}">
        <div class="account-meta">
          <div>
            <div class="account-issuer">${acc.issuer || '2FA Account'}</div>
            <div class="account-email">${acc.account}</div>
          </div>
          <button class="btn-icon delete" title="Delete account" onclick="window.removeAccount('${acc.id}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
        <div class="totp-row">
          <div class="totp-code" title="Click to copy" onclick="window.copyTotpCode('${totpCode}')">${formattedCode}</div>
          <div class="countdown-container">
            <svg class="countdown-circle" viewBox="0 0 36 36">
              <circle class="countdown-bg" cx="18" cy="18" r="14"></circle>
              <circle class="countdown-progress ${remainingSeconds <= 5 ? 'expiring' : ''}" 
                      cx="18" cy="18" r="14" 
                      stroke-dasharray="88" 
                      stroke-dashoffset="${strokeDashoffset}"></circle>
            </svg>
            <span class="countdown-text">${remainingSeconds}s</span>
          </div>
        </div>
      </div>
    `;
  }

  accountsListEl.innerHTML = html;
}

// Global copy helper
window.copyTotpCode = async (code) => {
  try {
    await navigator.clipboard.writeText(code);
    showToast(`Code copied to clipboard: ${code}`, 'success');
  } catch {
    showToast('Failed to copy to clipboard', 'error');
  }
};

// Global delete helper
window.removeAccount = async (id) => {
  if (confirm('Are you sure you want to remove this account from your Authenticator?')) {
    await deleteAccount(id);
    await refreshAccounts();
    showToast('Account removed', 'info');
  }
};

// Start 1-second interval to update countdown and refresh TOTP
function startTotpTimer() {
  if (totpInterval) clearInterval(totpInterval);
  totpInterval = setInterval(async () => {
    if (currentView === 'view-accounts' && accounts.length > 0) {
      await renderAccounts();
    }
  }, 1000);
}

// QR Code Scanning
function startScanning() {
  const scanStatusEl = document.getElementById('scan-status');
  if (scanStatusEl) scanStatusEl.textContent = 'Align QR code within the frame...';

  startCameraScanner(
    videoEl,
    canvasEl,
    async (decodedText) => {
      await handleQrEnrollment(decodedText);
    },
    (err) => {
      console.warn('Scanner error:', err);
      if (scanStatusEl) scanStatusEl.textContent = err.message;
      showToast(err.message, 'error');
    }
  );
}

// Process Enrolled QR code
async function handleQrEnrollment(qrRawString) {
  stopCameraScanner();
  const scanStatusEl = document.getElementById('scan-status');
  if (scanStatusEl) scanStatusEl.textContent = 'Enrolling device with server...';

  try {
    let payload;
    try {
      payload = JSON.parse(qrRawString);
    } catch {
      throw new Error('QR code is not in valid JSON format. Ensure you scanned the 2FA setup QR.');
    }

    const { server, enroll_token, secret, account, issuer } = payload;
    if (!enroll_token || !secret || !account) {
      throw new Error('Invalid enrollment payload: missing enroll_token or secret.');
    }

    const serverUrl = server || window.location.origin;

    // 1. Subscribe to Web Push
    showToast('Subscribing to Push Notifications...', 'info');
    const pushSubscription = await subscribeToPush(serverUrl);

    // 2. Get or create ECDSA key pair
    const keyRecord = await getOrCreateEcdsaKeyPair();

    // 3. Encrypt TOTP secret with non-extractable AES-GCM key and store in IndexedDB
    const aesKey = await getOrCreateAesKey();
    const encrypted = await encryptSecret(aesKey, secret);

    // 4. POST to /api/enroll/complete
    showToast('Registering device key with server...', 'info');
    const enrollRes = await fetch(`${serverUrl}/api/enroll/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enroll_token,
        push_subscription: pushSubscription,
        public_key: keyRecord.jwk,
        device_name: `${navigator.platform || 'Device'} (${navigator.userAgent.slice(0, 30)}...)`,
      }),
    });

    const enrollData = await enrollRes.json();
    if (!enrollRes.ok) {
      throw new Error(enrollData.error || 'Server rejected enrollment.');
    }

    // 5. Save account in IndexedDB
    const accountRecord = {
      id: `${serverUrl}:${account}`,
      server: serverUrl,
      account,
      issuer: issuer || 'MyApp',
      encryptedSecret: encrypted.ciphertextB64,
      iv: encrypted.ivB64,
      deviceId: enrollData.deviceId,
      createdAt: Date.now(),
    };

    await saveAccount(accountRecord);
    await refreshAccounts();

    showToast('Enrolled successfully! Enter the current 6-digit code on the website to finish.', 'success', 6000);
    switchView('accounts');
  } catch (err) {
    console.error('Enrollment error:', err);
    showToast(err.message, 'error', 5000);
    if (scanStatusEl) scanStatusEl.textContent = `Error: ${err.message}`;
  }
}

// File upload QR fallback
if (fileInputEl) {
  fileInputEl.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      showToast('Decoding QR from image...', 'info');
      const text = await decodeQrFromImageFile(file);
      await handleQrEnrollment(text);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// Handle Push Login Request
function handleIncomingLoginRequest(data) {
  if (!data || !data.requestId) return;

  activeApprovalRequest = data;
  if (approvalBadgeEl) approvalBadgeEl.classList.add('active');

  showToast('Login approval request received!', 'info');
  loadApprovalRequest(data.requestId, data);
}

// Load Approval Screen
async function loadApprovalRequest(requestId, initialData = null) {
  switchView('approval');
  if (approvalBadgeEl) approvalBadgeEl.classList.remove('active');

  let reqData = initialData;

  if (!reqData || !reqData.options) {
    try {
      const res = await fetch(`/api/login/request/${requestId}`);
      if (!res.ok) throw new Error('Could not fetch request details.');
      reqData = await res.json();
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }
  }

  activeApprovalRequest = reqData;
  selectedApprovalNumber = null;

  const titleEl = document.getElementById('approval-title');
  const accountEl = document.getElementById('approval-account');
  const gridEl = document.getElementById('number-matching-grid');
  const approveBtn = document.getElementById('btn-approve-login');
  const denyBtn = document.getElementById('btn-deny-login');

  if (titleEl) titleEl.textContent = 'Approve Login Attempt';
  if (accountEl) accountEl.textContent = reqData.account || 'Your Account';
  if (approveBtn) approveBtn.disabled = true;

  // Render 3 number buttons
  const options = reqData.options || [42, 18, 93];
  gridEl.innerHTML = '';
  options.forEach((num) => {
    const btn = document.createElement('button');
    btn.className = 'number-btn';
    btn.textContent = num;
    btn.onclick = () => {
      document.querySelectorAll('.number-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedApprovalNumber = num;
      if (approveBtn) approveBtn.disabled = false;
    };
    gridEl.appendChild(btn);
  });

  if (approveBtn) {
    approveBtn.onclick = () => respondToLogin(requestId, selectedApprovalNumber, 'approve');
  }
  if (denyBtn) {
    denyBtn.onclick = () => respondToLogin(requestId, 0, 'deny');
  }
}

// Respond to login approval request with ECDSA signature
async function respondToLogin(requestId, chosenNumber, decision) {
  try {
    const keyRecord = await getOrCreateEcdsaKeyPair();
    const timestamp = Date.now();

    // Canonical payload structure:
    // { request_id, chosen_number, decision, timestamp }
    const canonicalPayload = JSON.stringify({
      request_id: requestId,
      chosen_number: Number(chosenNumber),
      decision,
      timestamp,
    });

    showToast('Signing approval with hardware-backed key...', 'info');
    const signature = await signPayload(keyRecord.privateKey, canonicalPayload);

    const res = await fetch('/api/login/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: requestId,
        chosen_number: Number(chosenNumber),
        decision,
        timestamp,
        signature,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Server rejected response');
    }

    if (decision === 'approve') {
      showToast('Login Approved Successfully!', 'success', 4000);
    } else {
      showToast('Login Denied.', 'info', 4000);
    }

    activeApprovalRequest = null;
    switchView('accounts');
  } catch (err) {
    console.error('Approval respond error:', err);
    showToast(err.message, 'error', 4500);
  }
}

// Settings Screen
async function loadSettingsData() {
  const notifStatusEl = document.getElementById('setting-notif-status');
  const keyThumbprintEl = document.getElementById('setting-key-thumbprint');
  const notifBtn = document.getElementById('btn-enable-notif');

  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  if (notifStatusEl) {
    notifStatusEl.textContent = perm.toUpperCase();
    notifStatusEl.className = `badge ${perm === 'granted' ? 'badge-green' : perm === 'denied' ? 'badge-red' : 'badge-yellow'}`;
  }

  if (notifBtn) {
    notifBtn.style.display = perm === 'granted' ? 'none' : 'block';
    notifBtn.onclick = async () => {
      try {
        await subscribeToPush();
        loadSettingsData();
        showToast('Push notifications enabled!', 'success');
      } catch (e) {
        showToast(e.message, 'error');
      }
    };
  }

  try {
    const keyRecord = await getOrCreateEcdsaKeyPair();
    if (keyRecord && keyRecord.jwk && keyThumbprintEl) {
      keyThumbprintEl.textContent = `P-256 (x: ${keyRecord.jwk.x?.slice(0, 10)}...)`;
    }
  } catch {
    if (keyThumbprintEl) keyThumbprintEl.textContent = 'None';
  }
}

// Danger Zone: Clear App Data
const clearDataBtn = document.getElementById('btn-clear-data');
if (clearDataBtn) {
  clearDataBtn.addEventListener('click', async () => {
    if (confirm('Warning: This will clear all accounts and keys stored in this Authenticator PWA. Continue?')) {
      indexedDB.deleteDatabase('AuthenticatorPwaDB');
      accounts = [];
      await renderAccounts();
      showToast('All local authenticator data cleared.', 'info');
      switchView('accounts');
    }
  });
}

// Run bootstrap
initApp();

