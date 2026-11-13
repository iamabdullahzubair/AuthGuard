import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { dispatchWebhook } from '../services/webhookService.js';

const router = Router();

const webhookSchema = z.object({
  url: z.string().url('A valid HTTP or HTTPS URL is required'),
  secret: z.string().optional(),
  is_active: z.boolean().optional().default(true),
});

// GET /api/webhooks - List webhooks for current user
router.get('/', requireAuth, async (req, res) => {
  const hooksRes = await query(
    `SELECT id, url, secret, is_active, created_at, updated_at 
     FROM webhooks 
     WHERE user_id = $1 
     ORDER BY created_at DESC`,
    [req.user.id]
  );

  const deliveriesRes = await query(
    `SELECT wd.id, wd.webhook_id, wd.event, wd.response_status, wd.success, wd.created_at, w.url
     FROM webhook_deliveries wd
     JOIN webhooks w ON wd.webhook_id = w.id
     WHERE w.user_id = $1
     ORDER BY wd.created_at DESC
     LIMIT 20`,
    [req.user.id]
  );

  return res.json({
    webhooks: hooksRes.rows,
    deliveries: deliveriesRes.rows,
  });
});

// POST /api/webhooks - Create or update webhook
router.post('/', requireAuth, async (req, res) => {
  const parseResult = webhookSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.errors[0].message });
  }

  const { url, secret, is_active } = parseResult.data;
  const webhookSecret = secret && secret.trim().length >= 16
    ? secret.trim()
    : crypto.randomBytes(24).toString('hex'); // 48-char secure hex secret

  const id = crypto.randomUUID();

  await query(
    `INSERT INTO webhooks (id, user_id, url, secret, is_active, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [id, req.user.id, url, webhookSecret, is_active]
  );

  return res.status(201).json({
    success: true,
    webhook: {
      id,
      url,
      secret: webhookSecret,
      is_active,
    },
  });
});

// DELETE /api/webhooks/:id - Delete webhook
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const result = await query(
    `DELETE FROM webhooks WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, req.user.id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Webhook not found' });
  }

  return res.json({ success: true, message: 'Webhook deleted' });
});

// POST /api/webhooks/:id/test - Send test ping to webhook
router.post('/:id/test', requireAuth, async (req, res) => {
  const { id } = req.params;
  const hookRes = await query(
    `SELECT id, url, secret FROM webhooks WHERE id = $1 AND user_id = $2`,
    [id, req.user.id]
  );

  if (hookRes.rows.length === 0) {
    return res.status(404).json({ error: 'Webhook not found' });
  }

  await dispatchWebhook(req.user.id, 'ping', {
    message: 'AuthGuard test webhook ping',
    user: req.user.email,
    timestamp: Date.now(),
  });

  return res.json({ success: true, message: 'Test ping dispatched to webhook' });
});

export default router;

