import { webpush } from '../config/index.js';
import { query } from '../db/index.js';
import { broadcastLog } from './logBroadcaster.js';

/**
 * Send Web Push notification to user devices
 * Automatically prunes/revokes invalid or expired subscriptions (410 Gone / 404 Not Found)
 * Queries multi-tenant end_user_devices table.
 *
 * @param {string} userId - end_user_id
 * @param {object} payload
 * @param {string} [tenantId]
 * @returns {Promise<{ sent: number, failed: number }>}
 */
export async function sendPushToUser(userId, payload, tenantId = null) {
  let queryText;
  let params;

  if (tenantId) {
    queryText = `
      SELECT id, device_name, push_subscription
      FROM end_user_devices 
      WHERE tenant_id = $1 AND end_user_id = $2 AND status = 'active'
    `;
    params = [tenantId, userId];
  } else {
    queryText = `
      SELECT id, device_name, push_subscription
      FROM end_user_devices 
      WHERE end_user_id = $1 AND status = 'active'
    `;
    params = [userId];
  }

  const results = await query(queryText, params);
  const rawDevices = results.rows || [];

  // Deduplicate subscriptions by endpoint
  const seenEndpoints = new Set();
  const devices = [];
  for (const dev of rawDevices) {
    try {
      const sub = typeof dev.push_subscription === 'string'
        ? JSON.parse(dev.push_subscription)
        : dev.push_subscription;
      if (sub?.endpoint) {
        if (!seenEndpoints.has(sub.endpoint)) {
          seenEndpoints.add(sub.endpoint);
          devices.push({ ...dev, subscription: sub });
        }
      } else {
        devices.push({ ...dev, subscription: sub });
      }
    } catch {
      devices.push(dev);
    }
  }

  if (devices.length === 0) {
    console.warn(`[Push] No active devices found for user ${userId}${tenantId ? ` (tenant: ${tenantId})` : ''}`);
    return { sent: 0, failed: 0 };
  }

  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

  let sent = 0;
  let failed = 0;

  for (const dev of devices) {
    try {
      const subscription = dev.subscription || (
        typeof dev.push_subscription === 'string'
          ? JSON.parse(dev.push_subscription)
          : dev.push_subscription
      );

      await webpush.sendNotification(subscription, payloadString, {
        TTL: 60, // 60 seconds matching challenge lifetime
        urgency: 'high',
      });
      sent++;
    } catch (err) {
      failed++;
      console.warn(`[Push Error] Device ${dev.id} (${dev.device_name}): ${err.statusCode || err.message}`);

      // Requirement: Remove expired or invalid (410/404) push subscriptions automatically
      if (err.statusCode === 410 || err.statusCode === 404) {
        console.log(`[Push] Automatically pruning expired subscription for device ${dev.id}`);
        await query(
          `UPDATE end_user_devices SET status = 'revoked' WHERE id = $1`,
          [dev.id]
        );
      }
    }
  }

  broadcastLog({
    level: sent > 0 ? 'PUSH' : 'WARN',
    category: 'push',
    message: `Web Push dispatch: sent to ${sent} device(s), ${failed} failed for user ${userId.slice(0, 8)}...`,
    metadata: { userId, tenantId, sent, failed },
  });

  return { sent, failed };
}
