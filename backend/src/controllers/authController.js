import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from '../db/index.js';
import { config } from '../config/index.js';
import { verifyEcdsaSignature } from '../services/cryptoService.js';
import { logAuditEvent } from '../services/auditService.js';
import { dispatchTenantWebhook } from '../services/tenantWebhookService.js';
import { consumeEnrollToken, getChallenge, getPendingChallengeForAccount, updateChallengeStatus } from '../services/redisService.js';

const enrollCompleteSchema = z.object({
  enroll_token: z.string().min(32),
  push_subscription: z.record(z.any()),
  public_key: z.record(z.any()),
  device_name: z.string().optional().default('Web Authenticator'),
});

const respondSchema = z.object({
  request_id: z.string().optional(),
  challenge_id: z.string().optional(),
  challengeId: z.string().optional(),
  chosen_number: z.number().int().optional().default(0),
  chosen_word: z.string().optional(),
  typed_word: z.string().optional(),
  decision: z.enum(['approve', 'deny']),
  timestamp: z.number().int(),
  signature: z.string().min(10),
  device_id: z.string().optional(),
}).refine((data) => data.request_id || data.challenge_id || data.challengeId, {
  message: 'challenge_id or request_id required',
});

export const authController = {
  /**
   * GET /api/auth/vapid-public-key
   */
  getVapidPublicKey(req, res) {
    return res.json({ publicKey: config.VAPID_PUBLIC_KEY });
  },

  /**
   * POST /api/auth/enroll/complete (PWA endpoint)
   * Consumes atomic single-use enroll token from Redis, pairs device in end_user_devices,
   * activates 2FA for the end user, and stores TOTP secret in end_user_totp.
   */
  async completeEnrollment(req, res) {
    const parseResult = enrollCompleteSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid enrollment data', details: parseResult.error.errors });
    }

    const { enroll_token, push_subscription, public_key, device_name } = parseResult.data;

    // 1. Consume from Redis (Atomic Single-Use with 15-min TTL)
    const redisTokenData = await consumeEnrollToken(enroll_token);
    if (!redisTokenData) {
      return res.status(400).json({ error: 'Enrollment token is invalid, expired, or already used' });
    }

    const resolvedEndUserId = redisTokenData.endUserId || redisTokenData.userId;
    const encSecretObj = redisTokenData.encSecretObj;

    // 2. Fetch end user to verify and resolve tenant_id
    const endUserCheck = await query(
      `SELECT id, tenant_id, email FROM end_users WHERE id = $1`,
      [resolvedEndUserId]
    );

    if (endUserCheck.rows.length === 0) {
      return res.status(404).json({ error: 'End user not found for this enrollment' });
    }

    const endUser = endUserCheck.rows[0];
    const tenantId = redisTokenData.tenantId || endUser.tenant_id;

    // 3. Register device in end_user_devices with status = 'active'
    const deviceId = crypto.randomUUID();
    await query(
      `INSERT INTO end_user_devices (id, tenant_id, end_user_id, device_name, device_type, push_subscription, public_key, status)
       VALUES ($1, $2, $3, $4, 'pwa', $5, $6, 'active')`,
      [
        deviceId,
        tenantId,
        resolvedEndUserId,
        device_name || 'Authenticator App',
        JSON.stringify(push_subscription),
        JSON.stringify(public_key),
      ]
    );

    // 4. Ensure TOTP secret is stored in end_user_totp if provided
    if (encSecretObj?.ciphertext && encSecretObj?.iv && encSecretObj?.tag) {
      await query(
        `INSERT INTO end_user_totp (id, tenant_id, end_user_id, encrypted_secret, iv, tag)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (end_user_id)
         DO UPDATE SET
           encrypted_secret = EXCLUDED.encrypted_secret,
           iv = EXCLUDED.iv,
           tag = EXCLUDED.tag`,
        [
          crypto.randomUUID(),
          tenantId,
          resolvedEndUserId,
          encSecretObj.ciphertext,
          encSecretObj.iv,
          encSecretObj.tag,
        ]
      );
    }

    // 5. Activate 2FA on end_users
    await query(
      `UPDATE end_users SET two_factor_enabled = true, updated_at = NOW() WHERE id = $1`,
      [resolvedEndUserId]
    );

    await logAuditEvent({
      tenantId,
      userId: resolvedEndUserId,
      event: 'ENROLL_DEVICE_REGISTERED',
      req,
      metadata: { deviceId, deviceName: device_name, userEmail: endUser.email, tenantId },
    });

    return res.json({
      success: true,
      deviceId,
      message: 'Device enrolled and 2FA activated successfully.',
    });
  },

  /**
   * GET /api/auth/challenge/pending (PWA endpoint)
   * Fetches the latest pending challenge for an account
   */
  async getPendingChallenge(req, res) {
    const { account } = req.query;
    if (!account) {
      return res.status(400).json({ error: 'account query parameter is required' });
    }

    const challenge = await getPendingChallengeForAccount(account);
    if (!challenge) {
      return res.json({ pending: false });
    }

    const isExpired = new Date(challenge.expiresAt) < new Date();
    if (isExpired) {
      return res.json({ pending: false });
    }

    return res.json({
      pending: true,
      id: challenge.id,
      requestId: challenge.id,
      challengeId: challenge.id,
      userId: challenge.endUserId,
      account: challenge.account,
      mode: challenge.mode || 'number_choice',
      options: challenge.decoys || [],
      challengeNumber: challenge.challengeNumber,
      status: challenge.status,
      expiresAt: challenge.expiresAt,
    });
  },

  /**
   * GET /api/auth/login/request/:id (PWA endpoint)
   * Fetches the pending auth challenge details from Redis for out-of-band PWA display
   */
  async getLoginRequest(req, res) {
    const { id } = req.params;

    const challenge = await getChallenge(id);
    if (!challenge) {
      return res.status(404).json({ error: 'Login request not found or expired' });
    }

    const isExpired = new Date(challenge.expiresAt) < new Date();

    return res.json({
      id: challenge.id,
      challengeId: challenge.id,
      userId: challenge.endUserId,
      account: challenge.account,
      mode: challenge.mode || 'number_choice',
      options: challenge.decoys || [],
      status: isExpired ? 'expired' : challenge.status,
      expiresAt: challenge.expiresAt,
    });
  },

  /**
   * POST /api/auth/login/respond (PWA signed approval/denial)
   * Verifies cryptographic ECDSA signature and updates challenge in Redis
   */
  async respondLogin(req, res) {
    const parseResult = respondSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid response payload', details: parseResult.error.errors });
    }

    const { request_id, challenge_id, challengeId, chosen_number, decision, timestamp, signature, device_id } = parseResult.data;
    const effectiveChallengeId = challenge_id || challengeId || request_id;

    // Check freshness (120s window)
    const now = Date.now();
    if (Math.abs(now - timestamp) > 120 * 1000) {
      return res.status(400).json({ error: 'Timestamp is outside acceptable window (replay protection)' });
    }

    const challenge = await getChallenge(effectiveChallengeId);
    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found or expired' });
    }

    if (challenge.status !== 'pending') {
      return res.status(400).json({ error: `Challenge is already ${challenge.status}` });
    }

    if (new Date(challenge.expiresAt) < new Date()) {
      await updateChallengeStatus(effectiveChallengeId, 'expired');
      return res.status(400).json({ error: 'Challenge has expired' });
    }

    const canonicalPayload = JSON.stringify({
      request_id: request_id || effectiveChallengeId,
      chosen_number,
      decision,
      timestamp,
    });

    // Check candidate devices from end_user_devices
    let deviceQuery = `
      SELECT id, end_user_id, public_key, status
      FROM end_user_devices
      WHERE end_user_id = $1 AND status = 'active'
    `;
    const deviceParams = [challenge.endUserId];
    if (device_id) {
      deviceQuery += ` AND id = $2`;
      deviceParams.push(device_id);
    }
    const devicesResult = await query(deviceQuery, deviceParams);
    const candidateDevices = devicesResult.rows;

    if (candidateDevices.length === 0) {
      return res.status(403).json({ error: 'No active device registered for this user' });
    }

    let verifiedDevice = null;
    for (const dev of candidateDevices) {
      const jwk = typeof dev.public_key === 'string' ? JSON.parse(dev.public_key) : dev.public_key;
      const isValid = verifyEcdsaSignature(jwk, canonicalPayload, signature);
      if (isValid) {
        verifiedDevice = dev;
        break;
      }
    }

    if (!verifiedDevice) {
      await logAuditEvent({
        tenantId: challenge.tenantId,
        userId: challenge.endUserId,
        event: 'LOGIN_PUSH_SIGNATURE_INVALID',
        req,
        metadata: { challengeId: effectiveChallengeId, tenantId: challenge.tenantId },
      });
      return res.status(401).json({ error: 'Cryptographic signature verification failed' });
    }

    // Handle Deny
    if (decision === 'deny') {
      await updateChallengeStatus(effectiveChallengeId, 'denied', { deviceId: verifiedDevice.id });

      dispatchTenantWebhook(challenge.tenantId, 'login.denied', {
        challengeId: effectiveChallengeId,
        requestId: effectiveChallengeId,
        status: 'denied',
        reason: 'user_denied',
        timestamp: Date.now(),
      }).catch(() => {});

      await logAuditEvent({
        tenantId: challenge.tenantId,
        userId: challenge.endUserId,
        event: 'LOGIN_PUSH_DENIED_BY_USER',
        req,
        metadata: {
          challengeId: effectiveChallengeId,
          requestId: effectiveChallengeId,
          challengeNumber: challenge.challengeNumber,
          email: challenge.account,
          deviceId: verifiedDevice.id,
          tenantId: challenge.tenantId,
        },
      });

      return res.json({ success: true, status: 'denied', message: 'Login denied.' });
    }

    // Handle Approve based on verification mode (number_choice, word_input, one_click)
    const mode = challenge.mode || 'number_choice';

    if (mode === 'number_choice') {
      if (chosen_number !== challenge.challengeNumber) {
        await updateChallengeStatus(effectiveChallengeId, 'denied', { deviceId: verifiedDevice.id });

        dispatchTenantWebhook(challenge.tenantId, 'login.denied', {
          challengeId: effectiveChallengeId,
          requestId: effectiveChallengeId,
          status: 'denied',
          reason: 'number_mismatch',
          timestamp: Date.now(),
        }).catch(() => {});

        await logAuditEvent({
          tenantId: challenge.tenantId,
          userId: challenge.endUserId,
          event: 'LOGIN_PUSH_NUMBER_MISMATCH',
          req,
          metadata: {
            challengeId: effectiveChallengeId,
            requestId: effectiveChallengeId,
            chosen_number,
            challengeNumber: challenge.challengeNumber,
            expected: challenge.challengeNumber,
            email: challenge.account,
            deviceId: verifiedDevice.id,
            tenantId: challenge.tenantId,
          },
        });

        return res.status(400).json({
          error: 'Selected number does not match challenge. Request denied.',
          status: 'denied',
        });
      }
    } else if (mode === 'word_input') {
      const typedWord = String(parseResult.data.chosen_word || parseResult.data.typed_word || '').trim().toUpperCase();
      const expectedWord = String(challenge.challengeWord || '').trim().toUpperCase();

      if (!typedWord || typedWord !== expectedWord) {
        await updateChallengeStatus(effectiveChallengeId, 'denied', { deviceId: verifiedDevice.id });

        dispatchTenantWebhook(challenge.tenantId, 'login.denied', {
          challengeId: effectiveChallengeId,
          requestId: effectiveChallengeId,
          status: 'denied',
          reason: 'word_mismatch',
          timestamp: Date.now(),
        }).catch(() => {});

        await logAuditEvent({
          tenantId: challenge.tenantId,
          userId: challenge.endUserId,
          event: 'LOGIN_PUSH_WORD_MISMATCH',
          req,
          metadata: {
            challengeId: effectiveChallengeId,
            requestId: effectiveChallengeId,
            typedWord,
            expectedWord,
            email: challenge.account,
            deviceId: verifiedDevice.id,
            tenantId: challenge.tenantId,
          },
        });

        return res.status(400).json({
          error: 'Verification word does not match challenge. Request denied.',
          status: 'denied',
        });
      }
    } else if (mode === 'one_click') {
      // 1-Click Tap-to-Approve: Direct approval without matching check
    }

    // Successful Approval
    await updateChallengeStatus(effectiveChallengeId, 'approved', { deviceId: verifiedDevice.id });
    await query(`UPDATE end_user_devices SET last_used_at = NOW() WHERE id = $1`, [verifiedDevice.id]).catch(() => {});

    await logAuditEvent({
      tenantId: challenge.tenantId,
      userId: challenge.endUserId,
      event: 'LOGIN_PUSH_APPROVED',
      req,
      metadata: {
        challengeId: effectiveChallengeId,
        requestId: effectiveChallengeId,
        challengeNumber: challenge.challengeNumber,
        email: challenge.account,
        deviceId: verifiedDevice.id,
        tenantId: challenge.tenantId,
      },
    });

    // Dispatch to tenant webhook
    dispatchTenantWebhook(challenge.tenantId, 'login.approved', {
      challengeId: effectiveChallengeId,
      requestId: effectiveChallengeId,
      userId: challenge.endUserId,
      email: challenge.account,
      deviceId: verifiedDevice.id,
      status: 'approved',
      timestamp: Date.now(),
    }).catch(() => {});

    return res.json({
      success: true,
      status: 'approved',
      message: 'Login approved successfully',
    });
  },
};
