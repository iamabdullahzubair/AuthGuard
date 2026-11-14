import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from '../db/index.js';
import { config } from '../config/index.js';
import { verifyEcdsaSignature } from '../services/cryptoService.js';
import { logAuditEvent } from '../services/auditService.js';
import { dispatchTenantWebhook } from '../services/tenantWebhookService.js';

const enrollCompleteSchema = z.object({
  enroll_token: z.string().min(32),
  push_subscription: z.record(z.any()),
  public_key: z.record(z.any()),
  device_name: z.string().optional().default('Web Authenticator'),
});

const respondSchema = z.object({
  request_id: z.string().uuid(),
  chosen_number: z.number().int(),
  decision: z.enum(['approve', 'deny']),
  timestamp: z.number().int(),
  signature: z.string().min(10),
  device_id: z.string().optional(),
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
   */
  async completeEnrollment(req, res) {
    const parseResult = enrollCompleteSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid enrollment data', details: parseResult.error.errors });
    }

    const { enroll_token, push_subscription, public_key, device_name } = parseResult.data;

    // Validate enroll_token
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
    const encSecretObj = JSON.parse(tokenRecord.totp_secret_temp);

    // Save to totp_secrets
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

    // Save device with status = 'active'
    const deviceId = crypto.randomUUID();
    await query(
      `INSERT INTO devices (id, user_id, device_name, push_subscription, public_key, status)
       VALUES ($1, $2, $3, $4, $5, 'active')`,
      [
        deviceId,
        userId,
        device_name || 'Authenticator App',
        JSON.stringify(push_subscription),
        JSON.stringify(public_key),
      ]
    );

    await query(`UPDATE users SET two_factor_enabled = true WHERE id = $1`, [userId]);

    // Resolve user email and bind multi-tenant end_user_devices
    const userCheck = await query(`SELECT email FROM users WHERE id = $1`, [userId]);
    const userEmail = userCheck.rows[0]?.email;

    if (userEmail) {
      const endUsersRes = await query(
        `SELECT id, tenant_id FROM end_users WHERE email = $1`,
        [userEmail]
      );

      for (const eu of endUsersRes.rows) {
        await query(
          `INSERT INTO end_user_devices (id, tenant_id, end_user_id, device_name, device_type, push_subscription, public_key, status)
           VALUES ($1, $2, $3, $4, 'pwa', $5, $6, 'active')`,
          [
            crypto.randomUUID(),
            eu.tenant_id,
            eu.id,
            device_name || 'Authenticator App',
            JSON.stringify(push_subscription),
            JSON.stringify(public_key),
          ]
        );

        await query(
          `UPDATE end_users SET two_factor_enabled = true, updated_at = NOW() WHERE id = $1`,
          [eu.id]
        );
      }
    }

    // Mark token as used
    await query(`UPDATE enroll_tokens SET used = true WHERE id = $1`, [tokenRecord.id]);

    await logAuditEvent({
      userId,
      event: 'ENROLL_DEVICE_REGISTERED',
      req,
      metadata: { deviceId, deviceName: device_name, userEmail },
    });

    return res.json({
      success: true,
      deviceId,
      message: 'Device enrolled and 2FA activated successfully.',
    });
  },

  /**
   * GET /api/auth/login/request/:id (PWA endpoint)
   */
  async getLoginRequest(req, res) {
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
  },

  /**
   * POST /api/auth/login/respond (PWA, signed)
   */
  async respondLogin(req, res) {
    const parseResult = respondSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid response payload', details: parseResult.error.errors });
    }

    const { request_id, chosen_number, decision, timestamp, signature, device_id } = parseResult.data;

    // Check freshness (120s window)
    const now = Date.now();
    if (Math.abs(now - timestamp) > 120 * 1000) {
      return res.status(400).json({ error: 'Timestamp is outside acceptable window (replay protection)' });
    }

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

    const canonicalPayload = JSON.stringify({
      request_id,
      chosen_number,
      decision,
      timestamp,
    });

    // Check candidate devices across devices & end_user_devices
    let candidateDevices = [];
    let deviceQuery = `SELECT id, user_id, public_key, status, 'devices' as source_table FROM devices WHERE user_id = $1 AND status = 'active'`;
    const deviceParams = [loginReq.user_id];
    if (device_id) {
      deviceQuery += ` AND id = $2`;
      deviceParams.push(device_id);
    }
    const devicesResult = await query(deviceQuery, deviceParams);
    candidateDevices.push(...devicesResult.rows);

    let endUserDevQuery = `
      SELECT d.id, d.end_user_id as user_id, d.public_key, d.status, 'end_user_devices' as source_table
      FROM end_user_devices d
      JOIN end_users eu ON d.end_user_id = eu.id
      WHERE (d.end_user_id = $1 OR eu.email = (SELECT email FROM users WHERE id = $1))
        AND d.status = 'active'
    `;
    const endUserDevParams = [loginReq.user_id];
    if (device_id) {
      endUserDevQuery += ` AND d.id = $2`;
      endUserDevParams.push(device_id);
    }
    const endUserDevResult = await query(endUserDevQuery, endUserDevParams).catch(() => ({ rows: [] }));
    candidateDevices.push(...endUserDevResult.rows);

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
        userId: loginReq.user_id,
        event: 'LOGIN_PUSH_SIGNATURE_INVALID',
        req,
        metadata: { request_id },
      });
      return res.status(401).json({ error: 'Cryptographic signature verification failed' });
    }

    // Handle Deny
    if (decision === 'deny') {
      await query(`UPDATE login_requests SET status = 'denied' WHERE id = $1`, [request_id]);

      const challengeCheck = await query(`SELECT tenant_id FROM auth_challenges WHERE id = $1`, [request_id]).catch(() => ({ rows: [] }));
      if (challengeCheck.rows.length > 0) {
        const tenantId = challengeCheck.rows[0].tenant_id;
        await query(`UPDATE auth_challenges SET status = 'denied' WHERE id = $1`, [request_id]).catch(() => {});
        dispatchTenantWebhook(tenantId, 'login.denied', {
          requestId: request_id,
          status: 'denied',
          reason: 'user_denied',
          timestamp: Date.now(),
        }).catch(() => {});
      }

      await logAuditEvent({
        userId: loginReq.user_id,
        event: 'LOGIN_PUSH_DENIED_BY_USER',
        req,
        metadata: { request_id, deviceId: verifiedDevice.id },
      });

      return res.json({ success: true, status: 'denied', message: 'Login denied.' });
    }

    // Handle Approve: check number match
    if (chosen_number !== loginReq.challenge_number) {
      await query(`UPDATE login_requests SET status = 'denied' WHERE id = $1`, [request_id]);

      const challengeCheck = await query(`SELECT tenant_id FROM auth_challenges WHERE id = $1`, [request_id]).catch(() => ({ rows: [] }));
      if (challengeCheck.rows.length > 0) {
        const tenantId = challengeCheck.rows[0].tenant_id;
        await query(`UPDATE auth_challenges SET status = 'denied' WHERE id = $1`, [request_id]).catch(() => {});
        dispatchTenantWebhook(tenantId, 'login.denied', {
          requestId: request_id,
          status: 'denied',
          reason: 'number_mismatch',
          timestamp: Date.now(),
        }).catch(() => {});
      }

      await logAuditEvent({
        userId: loginReq.user_id,
        event: 'LOGIN_PUSH_NUMBER_MISMATCH',
        req,
        metadata: { request_id, chosen_number, expected: loginReq.challenge_number },
      });

      return res.status(400).json({
        error: 'Selected number does not match challenge. Request denied.',
        status: 'denied',
      });
    }

    // Successful Approval
    const userResult = await query('SELECT email FROM users WHERE id = $1', [loginReq.user_id]);
    const userEmail = userResult.rows[0]?.email || '';

    await query(`UPDATE login_requests SET status = 'approved' WHERE id = $1`, [request_id]);

    if (verifiedDevice.source_table === 'end_user_devices') {
      await query(`UPDATE end_user_devices SET last_used_at = NOW() WHERE id = $1`, [verifiedDevice.id]).catch(() => {});
    } else {
      await query(`UPDATE devices SET last_used = NOW() WHERE id = $1`, [verifiedDevice.id]).catch(() => {});
    }

    await logAuditEvent({
      userId: loginReq.user_id,
      event: 'LOGIN_PUSH_APPROVED',
      req,
      metadata: { request_id, deviceId: verifiedDevice.id },
    });

    // Dispatch to tenant webhook
    const challengeCheck = await query(`SELECT tenant_id FROM auth_challenges WHERE id = $1`, [request_id]).catch(() => ({ rows: [] }));
    if (challengeCheck.rows.length > 0) {
      const tenantId = challengeCheck.rows[0].tenant_id;
      await query(`UPDATE auth_challenges SET status = 'approved' WHERE id = $1`, [request_id]).catch(() => {});
      dispatchTenantWebhook(tenantId, 'login.approved', {
        requestId: request_id,
        userId: loginReq.user_id,
        email: userEmail,
        deviceId: verifiedDevice.id,
        status: 'approved',
        timestamp: Date.now(),
      }).catch(() => {});
    }

    return res.json({
      success: true,
      status: 'approved',
      message: 'Login approved successfully',
    });
  },
};
