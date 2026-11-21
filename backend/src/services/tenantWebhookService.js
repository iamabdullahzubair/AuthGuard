import crypto from 'node:crypto';
import { query } from '../db/index.js';

/**
 * Dispatches an event to all active webhooks configured for a specific tenant
 * Supports custom client headers, HMAC-SHA256 signature, and delivery logging.
 *
 * @param {string} tenantId
 * @param {string} event e.g. 'login.approved', 'login.denied', 'ping'
 * @param {object} data
 */
export async function dispatchTenantWebhook(tenantId, event, data) {
  try {
    const res = await query(
      `SELECT id, url, secret, custom_headers, events
       FROM tenant_webhooks
       WHERE tenant_id = $1 AND is_active = true`,
      [tenantId]
    );

    if (res.rows.length === 0) return;

    for (const hook of res.rows) {
      // Check if this webhook subscribes to this event
      const subscribedEvents = Array.isArray(hook.events)
        ? hook.events
        : typeof hook.events === 'string'
        ? JSON.parse(hook.events)
        : [];

      // STRICT FILTER: Never fire an event unless the user explicitly selected/subscribed to it!
      // (Exception: explicit 'test.ping' manual test triggers bypass filter for debugging)
      if (!subscribedEvents.includes(event) && event !== 'test.ping') {
        continue;
      }

      // Fire asynchronously so it doesn't block request loop
      deliverToWebhook(tenantId, hook, event, data).catch((err) => {
        console.error(`[Webhook Dispatch Error] Hook ${hook.id}:`, err.message);
      });
    }
  } catch (err) {
    console.error('[dispatchTenantWebhook Error]:', err.message);
  }
}

/**
 * Deliver payload to a single webhook endpoint
 */
export async function deliverToWebhook(tenantId, hook, event, data) {
  const timestamp = Date.now();
  const payloadObj = {
    id: crypto.randomUUID(),
    event,
    tenantId,
    timestamp,
    data,
  };

  const payloadString = JSON.stringify(payloadObj);
  const signature = crypto
    .createHmac('sha256', hook.secret)
    .update(payloadString)
    .digest('hex');

  // Parse custom headers
  let customHeaders = {};
  if (hook.custom_headers) {
    customHeaders = typeof hook.custom_headers === 'string'
      ? JSON.parse(hook.custom_headers)
      : hook.custom_headers;
  }

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'AuthGuard-Webhook-Dispatcher/2.0',
    'X-AuthGuard-Signature': signature,
    'X-AuthGuard-Event': event,
    'X-AuthGuard-Tenant': tenantId,
    'X-AuthGuard-Timestamp': String(timestamp),
    ...customHeaders, // Merge client custom headers (API keys, Authorization, etc.)
  };

  const startTime = Date.now();
  let success = false;
  let responseStatus = null;
  let responseBody = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const resp = await fetch(hook.url, {
      method: 'POST',
      headers,
      body: payloadString,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    responseStatus = resp.status;
    const text = await resp.text();
    responseBody = text.slice(0, 1000); // save up to 1000 chars for diagnostics
    success = resp.ok;
  } catch (err) {
    responseBody = `Error: ${err.message}`;
    success = false;
  }

  const durationMs = Date.now() - startTime;

  // Log delivery attempt
  await query(
    `INSERT INTO tenant_webhook_logs (id, tenant_id, webhook_id, event, payload, response_status, response_body, duration_ms, success)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      crypto.randomUUID(),
      tenantId,
      hook.id,
      event,
      payloadObj,
      responseStatus,
      responseBody,
      durationMs,
      success,
    ]
  ).catch((e) => console.error('[Webhook Log Insert Error]:', e.message));

  return {
    success,
    status: responseStatus,
    durationMs,
    responseBody,
    sentHeaders: headers,
    sentPayload: payloadObj,
  };
}
