import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from '../db/index.js';
import { config } from '../config/index.js';
import { authLimiter, recoveryLimiter } from '../middleware/rateLimiter.js';
import {
  decryptAesGcm,
  verifyEcdsaSignature,
  createSessionToken,
  hashRecoveryCode,
} from '../services/cryptoService.js';
import { verifyTotpTokenWithAntiReplay } from '../services/totpService.js';
import { sendPushToUser } from '../services/pushService.js';
import { logAuditEvent } from '../services/auditService.js';
import { dispatchWebhook } from '../services/webhookService.js';

const router = Router();

// Helper to generate a random 2-digit number between 10 and 99
function randomTwoDigit(exclude = []) {
  let num;
  do {
    num = Math.floor(Math.random() * 90) + 10;
  } while (exclude.includes(num));
  return num;
}

// POST /api/login/start
// Initiates Web Push login approval request
router.post('/start', authLimiter, async (req, res) => {
  const { email, userId: inputUserId } = req.body;

  let userId = inputUserId;
  let userEmail = email;

  if (!userId && email) {
    const userRes = await query('SELECT id, email, two_factor_enabled FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    userId = userRes.rows[0].id;
    userEmail = userRes.rows[0].email;
  }

  if (!userId) {
    return res.status(400).json({ error: 'User ID or email is required' });
  }

  const userRes = await query('SELECT id, email, two_factor_enabled FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  const user = userRes.rows[0];
  if (!user.two_factor_enabled) {
    return res.status(400).json({ error: '2FA is not enabled for this account' });
  }

  // Generate 2-digit challenge number (10 - 99)
  const challengeNumber = randomTwoDigit();
  // Generate 2 decoys
  const decoy1 = randomTwoDigit([challengeNumber]);
  const decoy2 = randomTwoDigit([challengeNumber, decoy1]);
  const decoys = [decoy1, decoy2];

  // Options shuffled for the PWA approval screen
  const shuffledOptions = [challengeNumber, decoy1, decoy2].sort(() => Math.random() - 0.5);

  const requestId = crypto.randomUUID();
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 1000); // 60 seconds

  // Clean up any old pending login requests for this user
  await query(
    `UPDATE login_requests SET status = 'expired' WHERE user_id = $1 AND status = 'pending'`,
    [userId]
  );

  // Store login request
  await query(
    `INSERT INTO login_requests (id, user_id, challenge_number, decoys, status, nonce, expires_at)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
    [
      requestId,
      userId,
      challengeNumber,
      JSON.stringify(shuffledOptions),
      nonce,
      expiresAt,
    ]
  );

  // Send push notification to user's registered devices
  const pushPayload = {
    title: 'Login Approval Request',
    body: `Login attempted. Confirm number on website to approve.`,
    icon: '/pwa/icons/icon-192.png',
    data: {
      type: 'LOGIN_APPROVAL',
      requestId,
      options: shuffledOptions,
      expiresAt: expiresAt.toISOString(),
      url: `/pwa/?request_id=${requestId}`,
    },
  };

  const pushResult = await sendPushToUser(userId, pushPayload);

  await logAuditEvent({
    userId,
    event: 'LOGIN_PUSH_INITIATED',
    req,
    metadata: { requestId, devicesSent: pushResult.sent },
  });

  return res.json({
    requestId,
    challengeNumber, // Shown on the website
    expiresAt: expiresAt.toISOString(),
    devicesNotified: pushResult.sent,
  });
});

// GET /api/login/request/:id
// PWA fetches challenge options if needed when opening via push or link
router.get('/request/:id', async (req, res) => {
  const { id } = req.params;

  const result = await query(
    `SELECT lr.id, lr.user_id, lr.decoys, lr.status, lr.expires_at, u.email
     FROM login_requests lr
     JOIN users u ON lr.user_id = u.id
     WHERE lr.id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Login request not found' });
  }

  const reqData = result.rows[0];
  const isExpired = new Date(reqData.expires_at) < new Date();

  return res.json({
    id: reqData.id,
    userId: reqData.user_id,
    account: reqData.email,
    options: typeof reqData.decoys === 'string' ? JSON.parse(reqData.decoys) : reqData.decoys,
    status: isExpired ? 'expired' : reqData.status,
    expiresAt: reqData.expires_at,
  });
});

// GET /api/login/status/:id
// Polled by the website to detect push approval or denial
router.get('/status/:id', async (req, res) => {
  const { id } = req.params;

  const result = await query(
    `SELECT id, user_id, status, session_token, expires_at 
     FROM login_requests WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Request not found' });
  }

  const reqData = result.rows[0];

  // Check expiration
  if (reqData.status === 'pending' && new Date(reqData.expires_at) < new Date()) {
    await query(`UPDATE login_requests SET status = 'expired' WHERE id = $1`, [id]);
    return res.json({ status: 'expired' });
  }

  if (reqData.status === 'approved') {
    // If approved, attach cookie
    res.cookie('session', reqData.session_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 86400 * 1000,
    });

    return res.json({
      status: 'approved',
      token: reqData.session_token,
    });
  }

  return res.json({ status: reqData.status });
});

const respondSchema = z.object({
  request_id: z.string().uuid(),
  chosen_number: z.number().int(),
  decision: z.enum(['approve', 'deny']),
  timestamp: z.number().int(),
  signature: z.string().min(10),
  device_id: z.string().optional(),
});

// POST /api/login/respond (PWA, signed)
router.post('/respond', authLimiter, async (req, res) => {
  const parseResult = respondSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid response payload', details: parseResult.error.errors });
  }

  const { request_id, chosen_number, decision, timestamp, signature, device_id } = parseResult.data;

  // Check timestamp freshness (within ±120 seconds to prevent replay)
  const now = Date.now();
  if (Math.abs(now - timestamp) > 120 * 1000) {
    return res.status(400).json({ error: 'Timestamp is outside acceptable window (replay protection)' });
  }

  // Retrieve login request
  const reqResult = await query(
    `SELECT id, user_id, challenge_number, status, expires_at 
     FROM login_requests WHERE id = $1`,
    [request_id]
  );

  if (reqResult.rows.length === 0) {
    return res.status(404).json({ error: 'Login request not found' });
  }

  const loginReq = reqResult.rows[0];

  if (loginReq.status !== 'pending') {
    return res.status(400).json({ error: `Login request is already ${loginReq.status}` });
  }

  if (new Date(loginReq.expires_at) < new Date()) {
    await query(`UPDATE login_requests SET status = 'expired' WHERE id = $1`, [request_id]);
    return res.status(400).json({ error: 'Login request has expired' });
  }

  // Canonical string format that was signed by PWA
  const canonicalPayload = JSON.stringify({
    request_id,
    chosen_number,
    decision,
    timestamp,
  });

  // Find candidate devices for signature verification
  let deviceQuery = `SELECT id, user_id, public_key, status FROM devices WHERE user_id = $1 AND status = 'active'`;
  const deviceParams = [loginReq.user_id];

  if (device_id) {
    deviceQuery += ` AND id = $2`;
    deviceParams.push(device_id);
  }

  const devicesResult = await query(deviceQuery, deviceParams);
  if (devicesResult.rows.length === 0) {
    return res.status(403).json({ error: 'No active device registered for this user' });
  }

  let verifiedDevice = null;
  for (const dev of devicesResult.rows) {
    const jwk = typeof dev.public_key === 'string' ? JSON.parse(dev.public_key) : dev.public_key;
    const isValid = verifyEcdsaSignature(jwk, canonicalPayload, signature);
    if (isValid) {
      verifiedDevice = dev;
      break;
    }
  }

  if (!verifiedDevice) {
    await logAuditEvent({
      userId: loginReq.user_id,
      event: 'LOGIN_PUSH_SIGNATURE_INVALID',
      req,
      metadata: { request_id },
    });
    return res.status(401).json({ error: 'Cryptographic signature verification failed' });
  }

  // Handle Deny decision
  if (decision === 'deny') {
    await query(
      `UPDATE login_requests SET status = 'denied' WHERE id = $1`,
      [request_id]
    );

    await logAuditEvent({
      userId: loginReq.user_id,
      event: 'LOGIN_PUSH_DENIED_BY_USER',
      req,
      metadata: { request_id, deviceId: verifiedDevice.id },
    });

    dispatchWebhook(loginReq.user_id, 'login.denied', {
      requestId: request_id,
      status: 'denied',
      reason: 'user_denied',
      timestamp: Date.now(),
    });

    return res.json({ success: true, status: 'denied', message: 'Login denied.' });
  }

  // Handle Approve decision: check number match
  if (chosen_number !== loginReq.challenge_number) {
    await query(
      `UPDATE login_requests SET status = 'denied' WHERE id = $1`,
      [request_id]
    );

    await logAuditEvent({
      userId: loginReq.user_id,
      event: 'LOGIN_PUSH_NUMBER_MISMATCH',
      req,
      metadata: { request_id, chosen_number, expected: loginReq.challenge_number },
    });

    dispatchWebhook(loginReq.user_id, 'login.denied', {
      requestId: request_id,
      status: 'denied',
      reason: 'number_mismatch',
      timestamp: Date.now(),
    });

    return res.status(400).json({
      error: 'Selected number does not match challenge. Request denied.',
      status: 'denied',
    });
  }

  // Number matches and signature verified! Issue session token
  const userResult = await query('SELECT email FROM users WHERE id = $1', [loginReq.user_id]);
  const userEmail = userResult.rows[0]?.email || '';

  const sessionToken = createSessionToken({ userId: loginReq.user_id, email: userEmail });

  // Update login request with approved status & session token
  await query(
    `UPDATE login_requests SET status = 'approved', session_token = $1 WHERE id = $2`,
    [sessionToken, request_id]
  );

  // Update device last_used
  await query(`UPDATE devices SET last_used = NOW() WHERE id = $1`, [verifiedDevice.id]);

  await logAuditEvent({
    userId: loginReq.user_id,
    event: 'LOGIN_PUSH_APPROVED',
    req,
    metadata: { request_id, deviceId: verifiedDevice.id },
  });

  dispatchWebhook(loginReq.user_id, 'login.approved', {
    requestId: request_id,
    userId: loginReq.user_id,
    email: userEmail,
    deviceId: verifiedDevice.id,
    status: 'approved',
    sessionToken,
    timestamp: Date.now(),
  });

  return res.json({
    success: true,
    status: 'approved',
    message: 'Login approved successfully',
  });
});

// POST /api/login/verify-totp (Fallback 1)
router.post('/verify-totp', authLimiter, async (req, res) => {
  const { userId, code } = req.body;
  if (!userId || !code) {
    return res.status(400).json({ error: 'User ID and TOTP code are required' });
  }

  const userRes = await query('SELECT id, email, two_factor_enabled FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  const user = userRes.rows[0];
  const secretResult = await query('SELECT encrypted_secret, iv, tag FROM totp_secrets WHERE user_id = $1', [userId]);
  if (secretResult.rows.length === 0) {
    return res.status(400).json({ error: 'TOTP is not configured for this account' });
  }

  const { encrypted_secret, iv, tag } = secretResult.rows[0];
  const plainSecret = decryptAesGcm(encrypted_secret, iv, tag);

  const verifyResult = await verifyTotpTokenWithAntiReplay(userId, code, plainSecret);
  if (!verifyResult.valid) {
    return res.status(400).json({ error: verifyResult.error || 'Invalid TOTP code' });
  }

  const token = createSessionToken({ userId: user.id, email: user.email });
  res.cookie('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 86400 * 1000,
  });

  await logAuditEvent({
    userId: user.id,
    event: 'LOGIN_TOTP_SUCCESS',
    req,
  });

  return res.json({
    success: true,
    token,
    user: { id: user.id, email: user.email },
  });
});

// POST /api/login/recovery (Fallback 2)
router.post('/recovery', recoveryLimiter, async (req, res) => {
  const { userId, code } = req.body;
  if (!userId || !code) {
    return res.status(400).json({ error: 'User ID and recovery code are required' });
  }

  const userRes = await query('SELECT id, email FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  const user = userRes.rows[0];
  const codeHash = hashRecoveryCode(code);

  const codeResult = await query(
    `SELECT id FROM recovery_codes 
     WHERE user_id = $1 AND code_hash = $2 AND used = false`,
    [userId, codeHash]
  );

  if (codeResult.rows.length === 0) {
    await logAuditEvent({
      userId,
      event: 'LOGIN_RECOVERY_CODE_FAILED',
      req,
    });
    return res.status(400).json({ error: 'Invalid or already used recovery code' });
  }

  // Mark code as used
  await query(`UPDATE recovery_codes SET used = true WHERE id = $1`, [codeResult.rows[0].id]);

  const token = createSessionToken({ userId: user.id, email: user.email });
  res.cookie('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 86400 * 1000,
  });

  await logAuditEvent({
    userId,
    event: 'LOGIN_RECOVERY_CODE_SUCCESS',
    req,
  });

  return res.json({
    success: true,
    token,
    user: { id: user.id, email: user.email },
  });
});

export default router;

