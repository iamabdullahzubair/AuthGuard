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
import { dispatchTenantWebhook } from '../services/tenantWebhookService.js';
import { verifyMemberToken } from '../middleware/tenantSessionAuth.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router({ mergeParams: true });

/**
 * Middleware: Authentication, Tenant Resolution & URL Path Cross-Verification
 * Supports both:
 * 1. Explicit tenant URLs: /api/v1/tenants/:tenantId/...
 * 2. Header-driven URLs:   /api/v1/...
 */
router.use(async (req, res, next) => {
  let rawKey = req.headers['x-api-key'];
  let isBearer = false;

  if (!rawKey && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      rawKey = parts[1];
      isBearer = true;
    }
  }

  // 1. Resolve API Key if present
  if (rawKey && (rawKey.startsWith('ag_live_') || rawKey.startsWith('ag_test_'))) {
    const auth = await verifyApiKey(rawKey).catch(() => null);
    if (!auth || auth.error) {
      return res.status(401).json({ error: 'Invalid or revoked API key' });
    }
    req.tenant = auth.tenant;
    req.apiKey = { id: auth.keyId, name: auth.keyName, environment: auth.environment };
  }
  // 2. Resolve Member Session JWT if present
  else if (rawKey && isBearer) {
    const member = verifyMemberToken(rawKey);
    if (member) {
      req.user = member;
      if (member.tenantId) {
        const tenantRes = await query(`SELECT * FROM tenants WHERE id = $1`, [member.tenantId]);
        if (tenantRes.rows.length > 0) {
          req.tenant = tenantRes.rows[0];
        }
      }
    }
  }

  // 3. Cross-verify Tenant Context if tenantId parameter is present in URL
  const pathTenantId = req.params.tenantId;
  if (pathTenantId) {
    if (req.tenant) {
      const isMatch = req.tenant.id === pathTenantId || req.tenant.slug === pathTenantId;
      const isSuper = Boolean(req.user?.is_super_admin);
      if (!isMatch && !isSuper) {
        return res.status(403).json({
          error: `Forbidden: Tenant '${pathTenantId}' in URL does not match authenticated credentials`,
        });
      }
    } else {
      // If pathTenantId provided but no auth header, look up tenant by ID or slug
      const tenantRes = await query(
        `SELECT * FROM tenants WHERE id = $1 OR slug = $1`,
        [pathTenantId]
      );
      if (tenantRes.rows.length === 0) {
        return res.status(404).json({ error: `Tenant '${pathTenantId}' not found` });
      }
      req.tenant = tenantRes.rows[0];
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
 * POST /api/v1/enroll or /api/v1/tenants/:tenantId/enroll
 * Client application enrolls a user and receives setup QR code payload
 */
router.post('/enroll', async (req, res) => {
  const parseResult = enrollUserSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.errors[0].message });
  }

  const { email, issuer, webhookUrl } = parseResult.data;
  const normalizedEmail = email.toLowerCase().trim();
  const resolvedTenantId = req.tenant?.id || 'tenant_system_default';
  const resolvedIssuer = req.tenant?.branding?.issuerName || req.tenant?.name || issuer || 'AuthGuard';

  try {
    // 1. Find or create in end_users (tenant-scoped)
    let endUserId;
    if (req.tenant) {
      const existingEndUser = await query(
        `SELECT id FROM end_users WHERE tenant_id = $1 AND email = $2`,
        [resolvedTenantId, normalizedEmail]
      );

      if (existingEndUser.rows.length > 0) {
        endUserId = existingEndUser.rows[0].id;
      } else {
        endUserId = crypto.randomUUID();
        await query(
          `INSERT INTO end_users (id, tenant_id, email, two_factor_enabled)
           VALUES ($1, $2, $3, false)`,
          [endUserId, resolvedTenantId, normalizedEmail]
        );
      }
    }

    // 2. Also ensure existence in legacy users table for global device/token routing
    let mainUserId;
    const userRes = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (userRes.rows.length > 0) {
      mainUserId = userRes.rows[0].id;
    } else {
      mainUserId = crypto.randomUUID();
      const randomInitialPassword = crypto.randomBytes(24).toString('base64');
      const passwordHash = await hashPassword(randomInitialPassword);

      await query(
        `INSERT INTO users (id, email, password_hash, two_factor_enabled)
         VALUES ($1, $2, $3, false)`,
        [mainUserId, normalizedEmail, passwordHash]
      );
    }

    // 3. Register legacy user-specific webhook ONLY if explicitly passed
    let registeredWebhookId = null;
    if (webhookUrl) {
      const webhookSecret = crypto.randomBytes(24).toString('hex');
      const webhookId = crypto.randomUUID();

      await query(
        `INSERT INTO webhooks (id, user_id, url, secret, is_active, updated_at)
         VALUES ($1, $2, $3, $4, true, NOW())`,
        [webhookId, mainUserId, webhookUrl, webhookSecret]
      );
      registeredWebhookId = webhookId;
    }

    // 4. Generate TOTP secret and one-time enroll_token
    const secret = generateTotpSecret();
    const encryptedSecret = encryptAesGcm(secret);

    const enrollToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Invalidate previous tokens
    await query(`UPDATE enroll_tokens SET used = true WHERE user_id = $1 AND used = false`, [mainUserId]);

    await query(
      `INSERT INTO enroll_tokens (id, user_id, token, totp_secret_temp, expires_at, used)
       VALUES ($1, $2, $3, $4, $5, false)`,
      [
        crypto.randomUUID(),
        mainUserId,
        enrollToken,
        JSON.stringify(encryptedSecret),
        expiresAt,
      ]
    );

    // Save temporary secret to end_user_totp if in tenant context
    if (req.tenant && endUserId) {
      await query(
        `INSERT INTO end_user_totp (id, tenant_id, end_user_id, encrypted_secret, iv, tag)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (end_user_id)
         DO UPDATE SET
           encrypted_secret = EXCLUDED.encrypted_secret,
           iv = EXCLUDED.iv,
           tag = EXCLUDED.tag`,
        [crypto.randomUUID(), resolvedTenantId, endUserId, encryptedSecret.ciphertext, encryptedSecret.iv, encryptedSecret.tag]
      );

      // Trigger organization webhook configured in dashboard
      dispatchTenantWebhook(req.tenant.id, 'user.enrolled', {
        email: normalizedEmail,
        userId: endUserId,
        timestamp: Date.now(),
      }).catch(() => {});
    }

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
      tenant_id: req.tenant?.id || null,
    };

    const qrCodeDataUrl = await generateQrCodeDataUrl(qrPayload);

    return res.status(200).json({
      success: true,
      userId: endUserId || mainUserId,
      email: normalizedEmail,
      tenantId: req.tenant?.id || null,
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
 * POST /api/v1/push/challenge or /api/v1/tenants/:tenantId/push/challenge
 * Triggers a 2FA Push notification to user's enrolled devices
 */
router.post('/push/challenge', authLimiter, async (req, res) => {
  const parseResult = pushChallengeSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.errors[0].message });
  }

  const { email, issuer, title, message } = parseResult.data;
  const normalizedEmail = email.toLowerCase().trim();
  const resolvedIssuer = req.tenant?.branding?.issuerName || req.tenant?.name || issuer || 'AuthGuard';

  try {
    // 1. Find user (priority: tenant end_users, fallback: users)
    let user = null;
    let endUserId = null;

    if (req.tenant) {
      const tenantUserRes = await query(
        `SELECT id, email, two_factor_enabled FROM end_users WHERE tenant_id = $1 AND email = $2`,
        [req.tenant.id, normalizedEmail]
      );
      if (tenantUserRes.rows.length > 0) {
        user = tenantUserRes.rows[0];
        endUserId = user.id;
      }
    }

    let legacyUser = null;
    const legacyUserRes = await query('SELECT id, email, two_factor_enabled FROM users WHERE email = $1', [normalizedEmail]);
    if (legacyUserRes.rows.length > 0) {
      legacyUser = legacyUserRes.rows[0];
      if (!user) user = legacyUser;
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found. Please enroll this user first.' });
    }

    // 2. Check active devices across end_user_devices & devices
    let activeDevicesCount = 0;
    if (req.tenant && endUserId) {
      const devRes = await query(
        `SELECT COUNT(*) as count FROM end_user_devices WHERE tenant_id = $1 AND end_user_id = $2 AND status = 'active'`,
        [req.tenant.id, endUserId]
      );
      activeDevicesCount += parseInt(devRes.rows[0]?.count || 0, 10);
    }
    if (legacyUser) {
      const legacyDevRes = await query(
        `SELECT COUNT(*) as count FROM devices WHERE user_id = $1 AND status = 'active'`,
        [legacyUser.id]
      );
      activeDevicesCount += parseInt(legacyDevRes.rows[0]?.count || 0, 10);
    }

    if (activeDevicesCount === 0) {
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
    const targetUserId = legacyUser?.id || user.id;

    // Invalidate any older pending requests for this user
    await query(
      `UPDATE login_requests SET status = 'expired' WHERE user_id = $1 AND status = 'pending'`,
      [targetUserId]
    );

    // 4. Store login request in both login_requests & auth_challenges
    await query(
      `INSERT INTO login_requests (id, user_id, challenge_number, decoys, status, nonce, expires_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
      [requestId, targetUserId, challengeNumber, JSON.stringify(shuffledOptions), nonce, expiresAt]
    );

    if (req.tenant && endUserId) {
      await query(
        `INSERT INTO auth_challenges (id, tenant_id, end_user_id, challenge_number, decoys, status, nonce, expires_at)
         VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
        [requestId, req.tenant.id, endUserId, challengeNumber, JSON.stringify(shuffledOptions), nonce, expiresAt]
      ).catch(() => {});
    }

    // 5. Send Web Push
    const pushPayload = {
      title: title || `${resolvedIssuer} - Login Approval`,
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

    const pushResult = await sendPushToUser(targetUserId, pushPayload, req.tenant?.id);

    await logAuditEvent({
      userId: targetUserId,
      event: 'API_PUSH_CHALLENGE_INITIATED',
      req,
      metadata: { requestId, devicesSent: pushResult.sent, issuer: resolvedIssuer, tenantId: req.tenant?.id },
    });

    const statusUrl = req.params.tenantId
      ? `/api/v1/tenants/${req.params.tenantId}/push/status/${requestId}`
      : `/api/v1/push/status/${requestId}`;

    return res.status(200).json({
      success: true,
      requestId,
      challengeNumber,
      devicesNotified: pushResult.sent,
      expiresAt: expiresAt.toISOString(),
      statusUrl,
      message: `Push notification sent! Present number ${challengeNumber} to the user to approve on their Authenticator PWA.`,
    });
  } catch (err) {
    console.error('[API v1 Push Challenge Error]:', err);
    return res.status(500).json({ error: 'Failed to initiate push challenge' });
  }
});

/**
 * GET /api/v1/push/status/:requestId or /api/v1/tenants/:tenantId/push/status/:requestId
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
 * GET & POST /api/v1/users/status or /api/v1/tenants/:tenantId/users/status?email=user@example.com
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
        tenantId: req.tenant?.id || null,
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
      tenantId: req.tenant?.id || null,
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
 * POST /api/v1/totp/verify or /api/v1/tenants/:tenantId/totp/verify
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
        `SELECT u.id, t.encrypted_secret, t.iv, t.tag, u.two_factor_enabled 
         FROM users u
         LEFT JOIN totp_secrets t ON u.id = t.user_id
         WHERE u.email = $1`,
        [normalizedEmail]
      );
      if (legacyUser.rows.length > 0 && legacyUser.rows[0].encrypted_secret) {
        userId = legacyUser.rows[0].id;
        const row = legacyUser.rows[0];
        secret = decryptAesGcm(row.encrypted_secret, row.iv, row.tag);
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
