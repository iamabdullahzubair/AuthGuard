// Demo Website Frontend Controller

let currentUser = null;
let currentChallengePolling = null;
let pendingLoginUserId = null;

// UI Elements
const viewAuth = document.getElementById('view-auth');
const viewDashboard = document.getElementById('view-dashboard');
const authTitle = document.getElementById('auth-title');
const authSubmitBtn = document.getElementById('btn-auth-submit');
const toggleAuthModeBtn = document.getElementById('btn-toggle-auth-mode');
const authErrorEl = document.getElementById('auth-error');
const userEmailDisplay = document.getElementById('user-email-display');
const btnLogout = document.getElementById('btn-logout');

// 2FA Challenge Modal Elements
const modal2fa = document.getElementById('modal-2fa');
const challengeNumberDisplay = document.getElementById('challenge-number-display');
const challengeStatusText = document.getElementById('challenge-status-text');
const challengeExpiryText = document.getElementById('challenge-expiry-text');
const challengeErrorEl = document.getElementById('challenge-error');
const sectionPushChallenge = document.getElementById('section-push-challenge');
const sectionTotpFallback = document.getElementById('section-totp-fallback');
const sectionRecoveryFallback = document.getElementById('section-recovery-fallback');

// Enrollment Modal Elements
const modalEnroll = document.getElementById('modal-enroll');
const qrCodeImage = document.getElementById('qr-code-image');
const enrollTotpInput = document.getElementById('enroll-totp-input');
const btnVerifyEnroll = document.getElementById('btn-verify-enroll');
const enrollErrorEl = document.getElementById('enroll-error');

// Recovery Codes Modal
const modalRecovery = document.getElementById('modal-recovery');
const recoveryGridEl = document.getElementById('recovery-grid');

let isRegisterMode = false;

// API Helper
async function api(path, options = {}) {
  const opts = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    credentials: 'include',
  };

  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Server request failed');
  }
  return data;
}

// Initialize Application
async function init() {
  bindEvents();
  try {
    const data = await api('/api/auth/me');
    if (data.user) {
      setUser(data.user);
    } else {
      showAuth();
    }
  } catch {
    showAuth();
  }
}

function setUser(user) {
  currentUser = user;
  if (user) {
    viewAuth.style.display = 'none';
    viewDashboard.style.display = 'block';
    userEmailDisplay.textContent = user.email;
    document.getElementById('dash-email').textContent = user.email;
    update2FaStatus(user.two_factor_enabled);
    loadDevices();
  } else {
    showAuth();
  }
}

function showAuth() {
  currentUser = null;
  viewAuth.style.display = 'block';
  viewDashboard.style.display = 'none';
  userEmailDisplay.textContent = '';
}

function update2FaStatus(enabled) {
  const badge = document.getElementById('2fa-status-badge');
  const btnEnroll = document.getElementById('btn-open-enroll');
  if (enabled) {
    badge.className = 'badge badge-on';
    badge.textContent = 'ENABLED';
    btnEnroll.textContent = 'Re-configure 2FA';
  } else {
    badge.className = 'badge badge-off';
    badge.textContent = 'DISABLED';
    btnEnroll.textContent = 'Enable 2FA';
  }
}

// Bind UI Events
function bindEvents() {
  // Auth mode toggle
  toggleAuthModeBtn.addEventListener('click', () => {
    isRegisterMode = !isRegisterMode;
    authErrorEl.style.display = 'none';
    if (isRegisterMode) {
      authTitle.textContent = 'Create an Account';
      authSubmitBtn.textContent = 'Register';
      toggleAuthModeBtn.textContent = 'Already have an account? Sign In';
    } else {
      authTitle.textContent = 'Sign In to Demo Website';
      authSubmitBtn.textContent = 'Sign In';
      toggleAuthModeBtn.textContent = "Don't have an account? Register";
    }
  });

  // Auth form submit
  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    authErrorEl.style.display = 'none';
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;

    try {
      if (isRegisterMode) {
        const data = await api('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        setUser(data.user);
      } else {
        const data = await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });

        if (data.twoFactorRequired) {
          pendingLoginUserId = data.userId;
          startLogin2FaFlow(data.userId, data.email);
        } else {
          setUser(data.user);
        }
      }
    } catch (err) {
      authErrorEl.textContent = err.message;
      authErrorEl.style.display = 'block';
    }
  });

  // Logout
  btnLogout.addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  });

  // Open 2FA enrollment modal
  document.getElementById('btn-open-enroll').addEventListener('click', async () => {
    await startEnrollment();
  });

  // Close modals
  document.querySelectorAll('.modal-close').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.remove('active'));
      stopChallengePolling();
    });
  });

  // Complete enrollment verify TOTP
  btnVerifyEnroll.addEventListener('click', async () => {
    enrollErrorEl.style.display = 'none';
    const code = enrollTotpInput.value.trim();
    if (code.length !== 6) {
      enrollErrorEl.textContent = 'Please enter a 6-digit TOTP code.';
      enrollErrorEl.style.display = 'block';
      return;
    }

    try {
      const data = await api('/api/enroll/verify-totp', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });

      modalEnroll.classList.remove('active');
      currentUser.two_factor_enabled = true;
      update2FaStatus(true);
      loadDevices();

      // Show recovery codes
      showRecoveryCodes(data.recovery_codes);
    } catch (err) {
      enrollErrorEl.textContent = err.message;
      enrollErrorEl.style.display = 'block';
    }
  });

  // Fallback toggles in 2FA modal
  document.getElementById('btn-use-totp-fallback').addEventListener('click', () => {
    sectionPushChallenge.style.display = 'none';
    sectionTotpFallback.style.display = 'block';
    sectionRecoveryFallback.style.display = 'none';
    stopChallengePolling();
  });

  document.getElementById('btn-use-recovery-fallback').addEventListener('click', () => {
    sectionPushChallenge.style.display = 'none';
    sectionTotpFallback.style.display = 'none';
    sectionRecoveryFallback.style.display = 'block';
    stopChallengePolling();
  });

  document.getElementById('btn-back-to-push').addEventListener('click', () => {
    sectionPushChallenge.style.display = 'block';
    sectionTotpFallback.style.display = 'none';
    sectionRecoveryFallback.style.display = 'none';
    startLogin2FaFlow(pendingLoginUserId);
  });

  // Submit TOTP fallback
  document.getElementById('btn-submit-totp-fallback').addEventListener('click', async () => {
    const code = document.getElementById('fallback-totp-input').value.trim();
    challengeErrorEl.style.display = 'none';
    try {
      const data = await api('/api/login/verify-totp', {
        method: 'POST',
        body: JSON.stringify({ userId: pendingLoginUserId, code }),
      });
      modal2fa.classList.remove('active');
      setUser(data.user);
    } catch (err) {
      challengeErrorEl.textContent = err.message;
      challengeErrorEl.style.display = 'block';
    }
  });

  // Submit Recovery fallback
  document.getElementById('btn-submit-recovery-fallback').addEventListener('click', async () => {
    const code = document.getElementById('fallback-recovery-input').value.trim();
    challengeErrorEl.style.display = 'none';
    try {
      const data = await api('/api/login/recovery', {
        method: 'POST',
        body: JSON.stringify({ userId: pendingLoginUserId, code }),
      });
      modal2fa.classList.remove('active');
      setUser(data.user);
    } catch (err) {
      challengeErrorEl.textContent = err.message;
      challengeErrorEl.style.display = 'block';
    }
  });
}

// 2FA Enrollment Flow
async function startEnrollment() {
  enrollErrorEl.style.display = 'none';
  enrollTotpInput.value = '';

  try {
    const data = await api('/api/enroll/start', { method: 'POST' });
    qrCodeImage.src = data.qr_data_url;
    document.getElementById('enroll-secret-text').textContent = data.secret;
    modalEnroll.classList.add('active');
  } catch (err) {
    alert('Failed to start 2FA enrollment: ' + err.message);
  }
}

// Show Recovery Codes Modal
function showRecoveryCodes(codes) {
  recoveryGridEl.innerHTML = '';
  codes.forEach((code) => {
    const item = document.createElement('div');
    item.className = 'recovery-item';
    item.textContent = code;
    recoveryGridEl.appendChild(item);
  });
  modalRecovery.classList.add('active');
}

// Start Push Approval Flow
async function startLogin2FaFlow(userId, email = '') {
  challengeErrorEl.style.display = 'none';
  sectionPushChallenge.style.display = 'block';
  sectionTotpFallback.style.display = 'none';
  sectionRecoveryFallback.style.display = 'none';
  modal2fa.classList.add('active');

  challengeNumberDisplay.textContent = '--';
  challengeStatusText.textContent = 'Sending push request to your authenticator...';

  try {
    const data = await api('/api/login/start', {
      method: 'POST',
      body: JSON.stringify({ userId, email }),
    });

    // Display the matching 2-digit number!
    challengeNumberDisplay.textContent = data.challengeNumber;
    challengeStatusText.textContent = `A push notification was sent to ${data.devicesNotified} device(s). Match the number on your Authenticator PWA to approve.`;

    startChallengePolling(data.requestId, data.expiresAt);
  } catch (err) {
    challengeErrorEl.textContent = err.message;
    challengeErrorEl.style.display = 'block';
    challengeStatusText.textContent = 'Failed to initiate push approval.';
  }
}

// Poll for approval status
function startChallengePolling(requestId, expiresAt) {
  stopChallengePolling();

  const expireTime = new Date(expiresAt).getTime();

  currentChallengePolling = setInterval(async () => {
    const now = Date.now();
    const remaining = Math.max(0, Math.ceil((expireTime - now) / 1000));
    challengeExpiryText.textContent = `Expires in ${remaining}s`;

    if (remaining <= 0) {
      stopChallengePolling();
      challengeStatusText.textContent = 'Request expired. Please try again or use fallback.';
      return;
    }

    try {
      const res = await api(`/api/login/status/${requestId}`);
      if (res.status === 'approved') {
        stopChallengePolling();
        challengeStatusText.textContent = 'Approved! Logging in...';
        setTimeout(async () => {
          modal2fa.classList.remove('active');
          const me = await api('/api/auth/me');
          setUser(me.user);
        }, 500);
      } else if (res.status === 'denied') {
        stopChallengePolling();
        challengeErrorEl.textContent = 'Login request was denied on your device.';
        challengeErrorEl.style.display = 'block';
        challengeStatusText.textContent = 'Denied.';
      } else if (res.status === 'expired') {
        stopChallengePolling();
        challengeStatusText.textContent = 'Login request expired.';
      }
    } catch {
      // Continue polling
    }
  }, 1500);
}

function stopChallengePolling() {
  if (currentChallengePolling) {
    clearInterval(currentChallengePolling);
    currentChallengePolling = null;
  }
}

// Device Management
async function loadDevices() {
  const container = document.getElementById('device-list-container');
  try {
    const data = await api('/api/devices');
    const devices = data.devices || [];

    if (devices.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); padding: 12px 0;">No 2FA devices registered yet.</p>';
      return;
    }

    let html = `
      <table class="device-table">
        <thead>
          <tr>
            <th>Device</th>
            <th>Status</th>
            <th>Registered</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    devices.forEach((d) => {
      const isRevoked = d.status === 'revoked';
      const createdDate = new Date(d.created_at).toLocaleDateString();
      html += `
        <tr>
          <td><strong>${d.device_name}</strong></td>
          <td><span class="badge ${isRevoked ? 'badge-off' : 'badge-on'}">${d.status.toUpperCase()}</span></td>
          <td>${createdDate}</td>
          <td>
            ${
              isRevoked
                ? '<span style="color: var(--text-muted); font-size: 0.85rem;">Revoked</span>'
                : `<button class="btn btn-danger" style="padding: 6px 12px; font-size: 0.8rem;" onclick="window.revokeDevice('${d.id}')">Revoke</button>`
            }
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) {
    console.error('Failed to load devices:', err);
  }
}

window.revokeDevice = async (id) => {
  if (confirm('Revoke this device? It will no longer receive login approvals.')) {
    try {
      await api(`/api/devices/${id}`, { method: 'DELETE' });
      await loadDevices();
    } catch (err) {
      alert(err.message);
    }
  }
};

// Bootstrap
init();

