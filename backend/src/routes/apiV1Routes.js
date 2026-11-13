import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from '../db/index.js';
import { config } from '../config/index.js';
import { encryptAesGcm, hashPassword } from '../services/cryptoService.js';
import { generateTotpSecret, generateQrCodeDataUrl } from '../services/totpService.js';
import { sendPushToUser } from '../services/pushService.js';
import { logAuditEvent } from '../services/auditService.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

const enrollUserSchema = z.object({
  email: z.string().email('Valid email address required'),
  issuer: z.string().optional().default('AuthGuard'),
  webhookUrl: z.string().url('Invalid webhook URL').optional(),
});

const pushChallengeSchema = z.object({
  email: z.string().email('Valid email address required'),
  issuer: z.string().optional().default('AuthGuard'),
  title: z.string().optional(),
  message: z.string().optional(),
});

/**
 * POST /api/v1/enroll
 * External API for client applications to enroll a user and receive a setup QR code
 */
router.post('/enroll', async (req, res) => {
  const parseResult = enrollUserSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.errors[0].message });
  }

  const { email, issuer, webhookUrl } = parseResult.data;
  const normalizedEmail = email.toLowerCase().trim();

  try {
    // 1. Find or create user
    let userId;
    const userRes = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);

    if (userRes.rows.length > 0) {
      userId = userRes.rows[0].id;
    } else {
      userId = crypto.randomUUID();
      const randomInitialPassword = crypto.randomBytes(24).toString('base64');
      const passwordHash = await hashPassword(randomInitialPassword);

      await query(
        `INSERT INTO users (id, email, password_hash, two_factor_enabled)
         VALUES ($1, $2, $3, false)`,
        [userId, normalizedEmail, passwordHash]
      );
    }

    // 2. Register Webhook if requested
    let registeredWebhookId = null;
    if (webhookUrl) {
      const webhookSecret = crypto.randomBytes(24).toString('hex');
      const webhookId = crypto.randomUUID();

      await query(
        `INSERT INTO webhooks (id, user_id, url, secret, is_active, updated_at)
         VALUES ($1, $2, $3, $4, true, NOW())`,
        [webhookId, userId, webhookUrl, webhookSecret]
      );
      registeredWebhookId = webhookId;
    }

    // 3. Generate TOTP secret and one-time enroll_token
    const secret = generateTotpSecret();
    const encryptedSecret = encryptAesGcm(secret);

    const enrollToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Invalidate previous tokens
    await query(`UPDATE enroll_tokens SET used = true WHERE user_id = $1 AND used = false`, [userId]);

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

    // 4. Resolve Server URL dynamically from request
    const forwardedProto = req.headers['x-forwarded-proto'];
    const forwardedHost = req.headers['x-forwarded-host'];
    const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
    const host = forwardedHost ? forwardedHost.split(',')[0].trim() : req.get('host');
    const serverUrl = host ? `${protocol}://${host}` : config.APP_URL;

    // 5. Construct QR payload
    const qrPayload = {
      server: serverUrl,
      enroll_token: enrollToken,
      secret,
      account: normalizedEmail,
      issuer: issuer || 'AuthGuard',
    };

    const qrCodeDataUrl = await generateQrCodeDataUrl(qrPayload);

    return res.status(200).json({
      success: true,
      userId,
      email: normalizedEmail,
      issuer: issuer || 'AuthGuard',
      enrollToken,
      totpSecret: secret,
      qrCodeDataUrl,
      qrPayload,
      expiresAt: expiresAt.toISOString(),
      webhookId: registeredWebhookId,
      message: 'Scan this QR code with AuthGuard Authenticator PWA to complete registration.',
    });
  } catch (err) {
    console.error('[API v1 Enroll Error]:', err);
    return res.status(500).json({ error: 'Failed to generate user enrollment' });
  }
});

/**
 * POST /api/v1/push/challenge
 * Triggers a 2FA Push notification to user's enrolled devices
 */
router.post('/push/challenge', authLimiter, async (req, res) => {
  const parseResult = pushChallengeSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.errors[0].message });
  }

  const { email, issuer, title, message } = parseResult.data;
  const normalizedEmail = email.toLowerCase().trim();

  try {
    // 1. Find user
    const userRes = await query('SELECT id, email FROM users WHERE email = $1', [normalizedEmail]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found. Please enroll this user first.' });
    }
    const user = userRes.rows[0];

    // 2. Check active devices
    const deviceRes = await query(
      `SELECT id FROM devices WHERE user_id = $1 AND status = 'active'`,
      [user.id]
    );

    if (deviceRes.rows.length === 0) {
      return res.status(400).json({
        error: 'No active 2FA devices found for this user. The user must enroll via QR code first.',
      });
    }

    // 3. Generate challenge number and decoys
    const challengeNumber = crypto.randomInt(10, 100);
    const decoys = new Set([challengeNumber]);
    while (decoys.size < 3) {
      decoys.add(crypto.randomInt(10, 100));
    }
    const shuffledOptions = Array.from(decoys).sort(() => Math.random() - 0.5);

    const requestId = crypto.randomUUID();
    const nonce = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 1000); // 60s lifetime

    // Invalidate any older pending requests for this user
    await query(
      `UPDATE login_requests SET status = 'expired' WHERE user_id = $1 AND status = 'pending'`,
      [user.id]
    );

    // 4. Store login request
    await query(
      `INSERT INTO login_requests (id, user_id, challenge_number, decoys, status, nonce, expires_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
      [requestId, user.id, challengeNumber, JSON.stringify(shuffledOptions), nonce, expiresAt]
    );

    // 5. Send Web Push
    const pushPayload = {
      title: title || `${issuer} - Login Approval`,
      body: message || `Login attempted. Confirm number ${challengeNumber} on your device to approve.`,
      icon: '/pwa/icons/icon-192.png',
      data: {
        type: 'LOGIN_APPROVAL',
        requestId,
        options: shuffledOptions,
        expiresAt: expiresAt.toISOString(),
        url: `/pwa/?request_id=${requestId}`,
      },
    };

    const pushResult = await sendPushToUser(user.id, pushPayload);

    await logAuditEvent({
      userId: user.id,
      event: 'API_PUSH_CHALLENGE_INITIATED',
      req,
      metadata: { requestId, devicesSent: pushResult.sent, issuer },
    });

    return res.status(200).json({
      success: true,
      requestId,
      challengeNumber,
      devicesNotified: pushResult.sent,
      expiresAt: expiresAt.toISOString(),
      statusUrl: `/api/v1/push/status/${requestId}`,
      message: `Push notification sent! Present number ${challengeNumber} to the user to approve on their Authenticator PWA.`,
    });
  } catch (err) {
    console.error('[API v1 Push Challenge Error]:', err);
    return res.status(500).json({ error: 'Failed to initiate push challenge' });
  }
});

/**
 * GET /api/v1/push/status/:requestId
 * Checks status of an initiated push challenge (pending, approved, denied, expired)
 */
router.get('/push/status/:requestId', async (req, res) => {
  const { requestId } = req.params;

  try {
    const result = await query(
      `SELECT id, status, expires_at, created_at FROM login_requests WHERE id = $1`,
      [requestId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Push request not found' });
    }

    const row = result.rows[0];
    const isExpired = new Date(row.expires_at) < new Date();
    const finalStatus = (row.status === 'pending' && isExpired) ? 'expired' : row.status;

    return res.json({
      requestId: row.id,
      status: finalStatus,
      isApproved: finalStatus === 'approved',
      expiresAt: row.expires_at,
    });
  } catch (err) {
    console.error('[API v1 Push Status Error]:', err);
    return res.status(500).json({ error: 'Failed to check status' });
  }
});

export default router;

