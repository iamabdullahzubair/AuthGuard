import crypto from 'node:crypto';
import { query } from '../db/index.js';

/**
 * Dispatch webhook notification to all active webhooks for a user
 * Signs the payload with HMAC-SHA256 using the webhook's secret.
 *
 * @param {string} userId - User identifier
 * @param {string} event - Event name: 'login.approved', 'login.denied', 'ping'
 * @param {object} eventData - Associated data payload
 */
export async function dispatchWebhook(userId, event, eventData) {
  try {
    const webhooksRes = await query(
      `SELECT id, url, secret FROM webhooks WHERE user_id = $1 AND is_active = true`,
      [userId]
    );

    const webhooks = webhooksRes.rows;
    if (webhooks.length === 0) {
      return;
    }

    const payloadObj = {
      id: crypto.randomUUID(),
      event,
      timestamp: Date.now(),
      data: eventData,
    };

    const payloadString = JSON.stringify(payloadObj);

    for (const hook of webhooks) {
      // Background async delivery so it doesn't block the auth flow
      deliverWebhook(hook, event, payloadString).catch((err) => {
        console.error(`[Webhook Error] Delivery to ${hook.url} failed:`, err.message);
      });
    }
  } catch (err) {
    console.error('[Webhook Dispatch Error]:', err.message);
  }
}

async function deliverWebhook(hook, event, payloadString) {
  const deliveryId = crypto.randomUUID();
  const signature = crypto
    .createHmac('sha256', hook.secret)
    .update(payloadString)
    .digest('hex');

  let statusCode = null;
  let responseText = null;
  let isSuccess = false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const res = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AuthGuard-Event': event,
        'X-AuthGuard-Signature': `sha256=${signature}`,
        'User-Agent': 'AuthGuard-Webhook-Service/1.0',
      },
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    statusCode = res.status;
    responseText = await res.text().catch(() => '');
    isSuccess = res.ok;
  } catch (err) {
    responseText = err.message || 'Connection error';
  }

  // Record delivery history
  await query(
    `INSERT INTO webhook_deliveries (id, webhook_id, event, payload, response_status, response_body, success)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      deliveryId,
      hook.id,
      event,
      payloadString,
      statusCode,
      (responseText || '').slice(0, 1000), // Cap response size
      isSuccess,
    ]
  );

  return { success: isSuccess, statusCode };
}

