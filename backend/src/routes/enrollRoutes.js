import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from '../db/index.js';
import { config } from '../config/index.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import {
  encryptAesGcm,
  decryptAesGcm,
  generateRecoveryCodes,
  hashRecoveryCode,
} from '../services/cryptoService.js';
import {
  generateTotpSecret,
  verifyTotpTokenWithAntiReplay,
  generateQrCodeDataUrl,
} from '../services/totpService.js';
import { logAuditEvent } from '../services/auditService.js';

const router = Router();

// POST /api/enroll/start (Authenticated)
// Generates secret, enroll_token, and QR code payload
router.post('/start', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const userEmail = req.user.email;

  // Generate TOTP base32 secret
  const secret = generateTotpSecret();
  const encryptedSecret = encryptAesGcm(secret);

  // Generate 32-byte secure enroll token (hex)
  const enrollToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // Invalidate any older unused enroll tokens for this user
  await query(
    `UPDATE enroll_tokens SET used = true WHERE user_id = $1 AND used = false`,
    [userId]
  );

  // Store new enroll token with temporary encrypted secret
  await query(
    `INSERT INTO enroll_tokens (id, user_id, token, totp_secret_temp, expires_at, used)
     VALUES ($1, $2, $3, $4, $5, false)`,
    [
      crypto.randomUUID(),
      userId,
      enrollToken,
      JSON.stringify(encryptedSecret),
      expiresAt,
    ]
  );

  // Enrollment payload as specified in requirement:
  // { "server": "<base url>", "enroll_token": "...", "secret": "BASE32", "account": "user@email.com", "issuer": "MyApp" }
  const serverUrl = config.APP_URL;
  const qrPayload = {
    server: serverUrl,
    enroll_token: enrollToken,
    secret: secret,
    account: userEmail,
    issuer: 'MyApp',
  };

  const qrDataUrl = await generateQrCodeDataUrl(qrPayload);

  await logAuditEvent({
    userId,
    event: 'ENROLL_STARTED',
    req,
  });

  return res.json({
    enroll_token: enrollToken,
    secret,
    qr_payload: qrPayload,
    qr_data_url: qrDataUrl,
    expires_at: expiresAt.toISOString(),
  });
});

const enrollCompleteSchema = z.object({
  enroll_token: z.string().min(32),
  push_subscription: z.record(z.any()),
  public_key: z.record(z.any()),
  device_name: z.string().optional().default('Web Authenticator'),
});

// POST /api/enroll/complete (PWA endpoint)
router.post('/complete', authLimiter, async (req, res) => {
  const parseResult = enrollCompleteSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid enrollment data', details: parseResult.error.errors });
  }

  const { enroll_token, push_subscription, public_key, device_name } = parseResult.data;

  // Validate enroll_token: single use, not expired
  const tokenResult = await query(
    `SELECT id, user_id, totp_secret_temp, expires_at, used
     FROM enroll_tokens
     WHERE token = $1`,
    [enroll_token]
  );

  if (tokenResult.rows.length === 0) {
    return res.status(404).json({ error: 'Invalid enrollment token' });
  }

  const tokenRecord = tokenResult.rows[0];

  if (tokenRecord.used) {
    return res.status(400).json({ error: 'Enrollment token has already been used' });
  }

  if (new Date(tokenRecord.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Enrollment token has expired' });
  }

  const userId = tokenRecord.user_id;

  // Parse encrypted temporary secret
  const encSecretObj = JSON.parse(tokenRecord.totp_secret_temp);

  // Save to totp_secrets (upsert)
  await query(
    `INSERT INTO totp_secrets (id, user_id, encrypted_secret, iv, tag, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id) 
     DO UPDATE SET 
       encrypted_secret = EXCLUDED.encrypted_secret,
       iv = EXCLUDED.iv,
       tag = EXCLUDED.tag,
       updated_at = NOW()`,
    [
      crypto.randomUUID(),
      userId,
      encSecretObj.ciphertext,
      encSecretObj.iv,
      encSecretObj.tag,
    ]
  );

  // Save device with status = 'pending_verification'
  const deviceId = crypto.randomUUID();
  await query(
    `INSERT INTO devices (id, user_id, device_name, push_subscription, public_key, status)
     VALUES ($1, $2, $3, $4, $5, 'pending_verification')`,
    [
      deviceId,
      userId,
      device_name || 'Authenticator PWA',
      JSON.stringify(push_subscription),
      JSON.stringify(public_key),
    ]
  );

  // Mark token as used
  await query(`UPDATE enroll_tokens SET used = true WHERE id = $1`, [tokenRecord.id]);

  await logAuditEvent({
    userId,
    event: 'ENROLL_DEVICE_REGISTERED',
    req,
    metadata: { deviceId, deviceName: device_name },
  });

  return res.json({
    success: true,
    deviceId,
    message: 'Device enrolled. Please enter the current TOTP code on the website to complete 2FA setup.',
  });
});

const verifyEnrollSchema = z.object({
  code: z.string().length(6),
});

// POST /api/enroll/verify-totp (Authenticated)
// User types the live 6-digit TOTP code shown on the PWA to confirm enrollment
router.post('/verify-totp', requireAuth, authLimiter, async (req, res) => {
  const parseResult = verifyEnrollSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Code must be exactly 6 digits' });
  }

  const userId = req.user.id;
  const { code } = parseResult.data;

  // Retrieve user's encrypted secret
  const secretResult = await query(
    `SELECT encrypted_secret, iv, tag FROM totp_secrets WHERE user_id = $1`,
    [userId]
  );

  if (secretResult.rows.length === 0) {
    return res.status(400).json({ error: 'No 2FA enrollment in progress' });
  }

  const { encrypted_secret, iv, tag } = secretResult.rows[0];
  const plainSecret = decryptAesGcm(encrypted_secret, iv, tag);

  // Verify TOTP token with replay protection
  const verifyResult = await verifyTotpTokenWithAntiReplay(userId, code, plainSecret);
  if (!verifyResult.valid) {
    return res.status(400).json({ error: verifyResult.error || 'Invalid TOTP code' });
  }

  // Activate 2FA on the user
  await query(`UPDATE users SET two_factor_enabled = true WHERE id = $1`, [userId]);

  // Activate pending devices
  await query(
    `UPDATE devices SET status = 'active' WHERE user_id = $1 AND status = 'pending_verification'`,
    [userId]
  );

  // Generate 10 recovery codes
  const rawCodes = generateRecoveryCodes(10);
  
  // Clear old recovery codes if any
  await query(`DELETE FROM recovery_codes WHERE user_id = $1`, [userId]);

  // Store hashed recovery codes
  for (const rawCode of rawCodes) {
    const codeHash = hashRecoveryCode(rawCode);
    await query(
      `INSERT INTO recovery_codes (id, user_id, code_hash, used) VALUES ($1, $2, $3, false)`,
      [crypto.randomUUID(), userId, codeHash]
    );
  }

  await logAuditEvent({
    userId,
    event: '2FA_ENABLED_CONFIRMED',
    req,
  });

  return res.json({
    success: true,
    message: '2FA has been successfully enabled!',
    recovery_codes: rawCodes,
  });
});

export default router;

