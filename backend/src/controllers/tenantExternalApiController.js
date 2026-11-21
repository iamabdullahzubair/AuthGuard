import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from '../db/index.js';
import { config } from '../config/index.js';
import { encryptAesGcm, decryptAesGcm } from '../services/cryptoService.js';
import { generateTotpSecret, generateQrCodeDataUrl, verifyTotpTokenWithAntiReplay } from '../services/totpService.js';
import { sendPushToUser } from '../services/pushService.js';
import { logAuditEvent } from '../services/auditService.js';
import { dispatchTenantWebhook } from '../services/tenantWebhookService.js';
import { storeEnrollToken, storeChallenge, getChallenge } from '../services/redisService.js';

const enrollSchema = z
  .object({
    username: z.string().min(2, 'Username or identifier must be at least 2 characters').max(128).optional(),
    email: z.string().min(2, 'Email or identifier must be at least 2 characters').max(128).optional(),
    identifier: z.string().min(2, 'Identifier must be at least 2 characters').max(128).optional(),
    issuer: z.string().optional(),
  })
  .refine((data) => data.username || data.email || data.identifier, {
    message: 'Username, email or identifier is required',
  });

const pushChallengeSchema = z
  .object({
    username: z.string().min(2, 'Username or identifier must be at least 2 characters').max(128).optional(),
    email: z.string().min(2, 'Email or identifier must be at least 2 characters').max(128).optional(),
    identifier: z.string().min(2, 'Identifier must be at least 2 characters').max(128).optional(),
    issuer: z.string().optional(),
    title: z.string().optional(),
    message: z.string().optional(),
  })
  .refine((data) => data.username || data.email || data.identifier, {
    message: 'Username, email or identifier is required',
  });

export const tenantExternalApiController = {
  /**
   * GET /api/tenant/:tenantId/users/status?username=user or ?email=user@example.com
   * Checks whether a user is enrolled and what 2FA factors are ready
   */
  async getUserStatus(req, res) {
    const rawId = req.query.username || req.query.email || req.query.identifier || req.body?.username || req.body?.email || req.body?.identifier;
    if (!rawId || typeof rawId !== 'string') {
      return res.status(400).json({ error: 'Username, email or user identifier required' });
    }

    const normalizedEmail = rawId.toLowerCase().trim();
    const tenantId = req.tenant.id;

    try {
      const userRes = await query(
        `SELECT u.id, u.email, u.two_factor_enabled,
                COUNT(d.id) FILTER (WHERE d.status = 'active') as active_devices
         FROM end_users u
         LEFT JOIN end_user_devices d ON u.id = d.end_user_id
         WHERE u.tenant_id = $1 AND u.email = $2
         GROUP BY u.id`,
        [tenantId, normalizedEmail]
      );

      if (userRes.rows.length === 0) {
        return res.json({
          enrolled: false,
          username: normalizedEmail,
          tenantId,
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
        username: normalizedEmail,
        tenantId,
        factors,
        activeDevices,
        twoFactorEnabled: Boolean(user.two_factor_enabled),
      });
    } catch (err) {
      console.error('[External API User Status Error]:', err);
      return res.status(500).json({ error: 'Failed to check user enrollment status' });
    }
  },

  /**
   * POST /api/tenant/:tenantId/push/challenge
   * Triggers a 2FA Push notification to user's enrolled devices, stored in Redis
   */
  async triggerPushChallenge(req, res) {
    const parseResult = pushChallengeSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0].message });
    }

    const { issuer, title, message } = parseResult.data;
    const rawId = parseResult.data.username || parseResult.data.email || parseResult.data.identifier;
    const normalizedEmail = rawId.toLowerCase().trim();
    const tenantId = req.tenant.id;
    const resolvedIssuer = issuer || req.tenant.branding?.issuerName || req.tenant.name || 'AuthGuard';

    try {
      // 1. Find user in end_users
      const userRes = await query(
        `SELECT id, email, two_factor_enabled FROM end_users WHERE tenant_id = $1 AND email = $2`,
        [tenantId, normalizedEmail]
      );

      if (userRes.rows.length === 0) {
        return res.status(404).json({ error: 'User not found for this tenant. Please enroll this user first.' });
      }
      const user = userRes.rows[0];

      // 2. Check active devices in end_user_devices
      const devRes = await query(
        `SELECT COUNT(*) as count FROM end_user_devices WHERE tenant_id = $1 AND end_user_id = $2 AND status = 'active'`,
        [tenantId, user.id]
      );

      const activeDevicesCount = parseInt(devRes.rows[0]?.count || 0, 10);

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

      // Store ephemeral challenge in Redis (120s TTL)
      await storeChallenge(requestId, {
        id: requestId,
        tenantId,
        endUserId: user.id,
        challengeNumber,
        decoys: shuffledOptions,
        status: 'pending',
        nonce,
        ipAddress: req.ip || null,
        expiresAt: expiresAt.toISOString(),
        createdAt: new Date().toISOString(),
        account: normalizedEmail,
      }, 120);

      // 4. Send Web Push
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

      const pushResult = await sendPushToUser(user.id, pushPayload, tenantId);

      await logAuditEvent({
        tenantId,
        userId: user.id,
        event: 'API_PUSH_CHALLENGE_INITIATED',
        req,
        metadata: {
          requestId,
          challengeNumber,
          email: normalizedEmail,
          devicesSent: pushResult.sent,
          issuer: resolvedIssuer,
          tenantId,
        },
      });

      const tenantParam = req.params.tenantId || tenantId;
      const statusUrl = `/api/tenant/${tenantParam}/push/status/${requestId}`;

      return res.status(200).json({
        success: true,
        requestId,
        challengeNumber,
        devicesNotified: pushResult.sent,
        expiresAt: expiresAt.toISOString(),
        statusUrl,
        message: `Push notification sent! Present number ${challengeNumber} to the user to approve on their Authenticator app.`,
      });
    } catch (err) {
      console.error('[External API Push Challenge Error]:', err);
      return res.status(500).json({ error: 'Failed to initiate push challenge' });
    }
  },

  /**
   * GET /api/tenant/:tenantId/push/status/:requestId
   * Checks status of an initiated push challenge from Redis
   */
  async getPushStatus(req, res) {
    const { requestId } = req.params;

    try {
      const challenge = await getChallenge(requestId);

      if (!challenge) {
        return res.status(404).json({ error: 'Push request not found or expired' });
      }

      // Cross-tenant verification: Ensure challenge belongs to current tenant
      if (req.tenant?.id && challenge.tenantId !== req.tenant.id) {
        return res.status(403).json({ error: 'Forbidden: Request does not belong to this tenant workspace' });
      }

      const isExpired = new Date(challenge.expiresAt) < new Date();
      const finalStatus = (challenge.status === 'pending' && isExpired) ? 'expired' : challenge.status;

      return res.json({
        requestId: challenge.id,
        status: finalStatus,
        isApproved: finalStatus === 'approved',
        expiresAt: challenge.expiresAt,
      });
    } catch (err) {
      console.error('[External API Push Status Error]:', err);
      return res.status(500).json({ error: 'Failed to check status' });
    }
  },

  /**
   * POST /api/tenant/:tenantId/totp/verify
   * Verifies 6-digit TOTP passcode for user strictly against end_user_totp with Redis anti-replay
   */
  async verifyTotp(req, res) {
    const rawId = req.body.username || req.body.email || req.body.identifier;
    const { code } = req.body;
    if (!rawId || !code) {
      return res.status(400).json({ error: 'Username/email and 6-digit TOTP code required' });
    }

    const normalizedEmail = rawId.toLowerCase().trim();
    const cleanCode = String(code).trim().replace(/\s+/g, '');
    const tenantId = req.tenant.id;

    try {
      // Look up secret in end_user_totp
      const tenantUser = await query(
        `SELECT u.id, ut.encrypted_secret, ut.iv, ut.tag
         FROM end_users u
         JOIN end_user_totp ut ON u.id = ut.end_user_id
         WHERE u.tenant_id = $1 AND u.email = $2`,
        [tenantId, normalizedEmail]
      );

      if (tenantUser.rows.length === 0 || !tenantUser.rows[0].encrypted_secret) {
        return res.status(404).json({ error: 'User not found in this tenant or TOTP not enrolled' });
      }

      const row = tenantUser.rows[0];
      const userId = row.id;
      const secret = decryptAesGcm(row.encrypted_secret, row.iv, row.tag);

      const verifyResult = await verifyTotpTokenWithAntiReplay(userId, cleanCode, secret);
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
        username: normalizedEmail,
        message: 'TOTP verified successfully',
      });
    } catch (err) {
      console.error('[External API TOTP Verify Error]:', err);
      return res.status(500).json({ error: 'Failed to verify TOTP code' });
    }
  },

  /**
   * POST /api/tenant/:tenantId/enroll
   * External client creates enrollment for user and receives QR code payload
   */
  async enrollUserExternal(req, res) {
    const parseResult = enrollSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0].message });
    }

    const { issuer } = parseResult.data;
    const rawId = parseResult.data.username || parseResult.data.email || parseResult.data.identifier;
    const normalizedEmail = rawId.toLowerCase().trim();
    const tenantId = req.tenant.id;
    const resolvedIssuer = issuer || req.tenant.branding?.issuerName || req.tenant.name || 'AuthGuard';

    try {
      // 1. Create or find in end_users
      let endUserId;
      const existingEndUser = await query(
        `SELECT id FROM end_users WHERE tenant_id = $1 AND email = $2`,
        [tenantId, normalizedEmail]
      );

      if (existingEndUser.rows.length > 0) {
        endUserId = existingEndUser.rows[0].id;
      } else {
        endUserId = crypto.randomUUID();
        await query(
          `INSERT INTO end_users (id, tenant_id, email, two_factor_enabled)
           VALUES ($1, $2, $3, false)`,
          [endUserId, tenantId, normalizedEmail]
        );
      }

      // 2. Generate TOTP secret and temporary enroll_token (stored in Redis with 15 mins TTL)
      const secret = generateTotpSecret();
      const encryptedSecret = encryptAesGcm(secret);
      const enrollToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

      await storeEnrollToken(enrollToken, {
        endUserId,
        tenantId,
        username: normalizedEmail,
        encSecretObj: encryptedSecret,
        expiresAt: expiresAt.toISOString(),
      }, 900);

      // Save to end_user_totp
      await query(
        `INSERT INTO end_user_totp (id, tenant_id, end_user_id, encrypted_secret, iv, tag)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (end_user_id)
         DO UPDATE SET
           encrypted_secret = EXCLUDED.encrypted_secret,
           iv = EXCLUDED.iv,
           tag = EXCLUDED.tag`,
        [crypto.randomUUID(), tenantId, endUserId, encryptedSecret.ciphertext, encryptedSecret.iv, encryptedSecret.tag]
      );

      // Trigger organization webhook
      dispatchTenantWebhook(tenantId, 'user.enrolled', {
        email: normalizedEmail,
        userId: endUserId,
        timestamp: Date.now(),
      }).catch(() => {});

      // 3. Resolve Server URL
      const forwardedProto = req.headers['x-forwarded-proto'];
      const forwardedHost = req.headers['x-forwarded-host'];
      const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
      const host = forwardedHost ? forwardedHost.split(',')[0].trim() : req.get('host');
      const serverUrl = host ? `${protocol}://${host}` : config.APP_URL;

      const qrPayload = {
        server: serverUrl,
        enroll_token: enrollToken,
        secret,
        account: normalizedEmail,
        issuer: resolvedIssuer,
        tenant_id: tenantId,
      };

      const qrCodeDataUrl = await generateQrCodeDataUrl(qrPayload);

      return res.status(200).json({
        success: true,
        userId: endUserId,
        username: normalizedEmail,
        tenantId,
        issuer: resolvedIssuer,
        enrollToken,
        totpSecret: secret,
        qrCodeDataUrl,
        qrPayload,
        expiresAt: expiresAt.toISOString(),
        message: 'Scan this QR code with AuthGuard app to complete registration.',
      });
    } catch (err) {
      console.error('[External API Enroll Error]:', err);
      return res.status(500).json({ error: 'Failed to generate user enrollment' });
    }
  },
};
