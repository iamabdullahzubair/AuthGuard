import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from '../db/index.js';
import { config } from '../config/index.js';
import { encryptAesGcm, decryptAesGcm, hashPassword } from '../services/cryptoService.js';
import { generateTotpSecret, generateQrCodeDataUrl, verifyTotpTokenWithAntiReplay } from '../services/totpService.js';
import { sendPushToUser } from '../services/pushService.js';
import { logAuditEvent } from '../services/auditService.js';
import { verifyApiKey } from '../services/apiKeyService.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Middleware: Optional API Key Context Resolution
router.use(async (req, res, next) => {
  let rawKey = req.headers['x-api-key'];
  if (!rawKey && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      rawKey = parts[1];
    }
  }

  if (rawKey && (rawKey.startsWith('ag_live_') || rawKey.startsWith('ag_test_'))) {
    const auth = await verifyApiKey(rawKey).catch(() => null);
    if (auth && !auth.error) {
      req.tenant = auth.tenant;
      req.apiKey = { id: auth.keyId, name: auth.keyName, environment: auth.environment };
    }
  }
  next();
});

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
  const resolvedIssuer = issuer || req.tenant?.branding?.issuerName || req.tenant?.name || 'AuthGuard';

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

    // 2. Link to tenant organization if API key is provided
    if (req.tenant) {
      await query(
        `INSERT INTO end_users (id, tenant_id, email, two_factor_enabled)
         VALUES ($1, $2, $3, false)
         ON CONFLICT (tenant_id, email) DO NOTHING`,
        [crypto.randomUUID(), req.tenant.id, normalizedEmail]
      );

      // Trigger organization webhook configured in dashboard
      dispatchTenantWebhook(req.tenant.id, 'user.enrolled', {
        email: normalizedEmail,
        userId,
        timestamp: Date.now(),
      }).catch(() => {});
    }

    // 3. Register legacy user-specific webhook ONLY if explicitly passed
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

    // 4. Generate TOTP secret and one-time enroll_token
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

    // 5. Resolve Server URL dynamically from request
    const forwardedProto = req.headers['x-forwarded-proto'];
    const forwardedHost = req.headers['x-forwarded-host'];
    const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
    const host = forwardedHost ? forwardedHost.split(',')[0].trim() : req.get('host');
    const serverUrl = host ? `${protocol}://${host}` : config.APP_URL;

    // 6. Construct QR payload
    const qrPayload = {
      server: serverUrl,
      enroll_token: enrollToken,
      secret,
      account: normalizedEmail,
      issuer: resolvedIssuer,
    };

    const qrCodeDataUrl = await generateQrCodeDataUrl(qrPayload);

    return res.status(200).json({
      success: true,
      userId,
      email: normalizedEmail,
      issuer: resolvedIssuer,
      enrollToken,
      totpSecret: secret,
      qrCodeDataUrl,
      qrPayload,
      expiresAt: expiresAt.toISOString(),
      ...(registeredWebhookId ? { webhookId: registeredWebhookId } : {}),
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

/**
 * GET & POST /api/v1/users/status?email=user@example.com
 * Client checks whether an end-user is enrolled and what 2FA factors are ready
 */
const checkUserStatusHandler = async (req, res) => {
  const email = req.query.email || req.body?.email;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'User email parameter required' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    let userRes;
    if (req.tenant) {
      userRes = await query(
        `SELECT u.id, u.email, u.two_factor_enabled,
                COUNT(d.id) FILTER (WHERE d.status = 'active') as active_devices
         FROM end_users u
         LEFT JOIN end_user_devices d ON u.id = d.end_user_id
         WHERE u.tenant_id = $1 AND u.email = $2
         GROUP BY u.id`,
        [req.tenant.id, normalizedEmail]
      );
    } else {
      userRes = await query(
        `SELECT u.id, u.email, u.two_factor_enabled,
                COUNT(d.id) FILTER (WHERE d.status = 'active') as active_devices
         FROM users u
         LEFT JOIN devices d ON u.id = d.user_id
         WHERE u.email = $1
         GROUP BY u.id`,
        [normalizedEmail]
      );
    }

    if (userRes.rows.length === 0) {
      return res.json({
        enrolled: false,
        email: normalizedEmail,
        factors: [],
        activeDevices: 0,
        twoFactorEnabled: false,
      });
    }

    const user = userRes.rows[0];
    const activeDevices = parseInt(user.active_devices, 10);
    const factors = [];
    if (user.two_factor_enabled) factors.push('totp');
    if (activeDevices > 0) factors.push('push');

    return res.json({
      enrolled: factors.length > 0,
      email: normalizedEmail,
      factors,
      activeDevices,
      twoFactorEnabled: Boolean(user.two_factor_enabled),
    });
  } catch (err) {
    console.error('[API v1 User Status Error]:', err);
    return res.status(500).json({ error: 'Failed to check user enrollment status' });
  }
};

router.get('/users/status', checkUserStatusHandler);
router.post('/users/status', checkUserStatusHandler);

/**
 * POST /api/v1/totp/verify
 * Client application verifies a 6-digit TOTP code for a user
 */
router.post('/totp/verify', authLimiter, async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and 6-digit TOTP code required' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const cleanCode = String(code).trim().replace(/\s+/g, '');

  try {
    let secret = null;
    let userId = null;

    if (req.tenant) {
      const tenantUser = await query(
        `SELECT u.id, ut.encrypted_secret, ut.iv, ut.tag
         FROM end_users u
         JOIN end_user_totp ut ON u.id = ut.end_user_id
         WHERE u.tenant_id = $1 AND u.email = $2`,
        [req.tenant.id, normalizedEmail]
      );
      if (tenantUser.rows.length > 0 && tenantUser.rows[0].encrypted_secret) {
        userId = tenantUser.rows[0].id;
        const row = tenantUser.rows[0];
        secret = decryptAesGcm(row.encrypted_secret, row.iv, row.tag);
      }
    }

    if (!secret) {
      const legacyUser = await query(
        `SELECT id, totp_secret, two_factor_enabled FROM users WHERE email = $1`,
        [normalizedEmail]
      );
      if (legacyUser.rows.length > 0 && legacyUser.rows[0].totp_secret) {
        userId = legacyUser.rows[0].id;
        const enc = typeof legacyUser.rows[0].totp_secret === 'string'
          ? JSON.parse(legacyUser.rows[0].totp_secret)
          : legacyUser.rows[0].totp_secret;
        secret = decryptAesGcm(enc);
      }
    }

    if (!secret || !userId) {
      return res.status(404).json({ error: 'User not found or TOTP not enrolled' });
    }

    const verifyResult = await verifyTotpTokenWithAntiReplay(userId, secret, cleanCode);
    if (!verifyResult.valid) {
      return res.status(400).json({
        success: false,
        valid: false,
        error: verifyResult.error || 'Invalid or expired TOTP code',
      });
    }

    return res.json({
      success: true,
      valid: true,
      email: normalizedEmail,
      message: 'TOTP verified successfully',
    });
  } catch (err) {
    console.error('[API v1 TOTP Verify Error]:', err);
    return res.status(500).json({ error: 'Failed to verify TOTP code' });
  }
});

export default router;

