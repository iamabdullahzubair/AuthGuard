import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from '../db/index.js';
import { config } from '../config/index.js';
import { encryptAesGcm, hashPassword } from '../services/cryptoService.js';
import { generateTotpSecret, generateQrCodeDataUrl } from '../services/totpService.js';

const router = Router();

const enrollUserSchema = z.object({
  email: z.string().email('Valid email address required'),
  issuer: z.string().optional().default('AuthGuard'),
  webhookUrl: z.string().url('Invalid webhook URL').optional(),
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

export default router;

