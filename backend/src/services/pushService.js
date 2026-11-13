import { webpush } from '../config/index.js';
import { query } from '../db/index.js';

/**
 * Send Web Push notification to user devices
 * Automatically prunes/revokes invalid or expired subscriptions (410 Gone / 404 Not Found)
 *
 * @param {string} userId
 * @param {object} payload
 * @returns {Promise<{ sent: number, failed: number }>}
 */
export async function sendPushToUser(userId, payload) {
  const result = await query(
    `SELECT id, device_name, push_subscription 
     FROM devices 
     WHERE user_id = $1 AND status = 'active'`,
    [userId]
  );

  const devices = result.rows;
  if (devices.length === 0) {
    console.warn(`[Push] No active devices found for user ${userId}`);
    return { sent: 0, failed: 0 };
  }

  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

  let sent = 0;
  let failed = 0;

  for (const dev of devices) {
    try {
      const subscription = typeof dev.push_subscription === 'string'
        ? JSON.parse(dev.push_subscription)
        : dev.push_subscription;

      await webpush.sendNotification(subscription, payloadString, {
        TTL: 60, // 60 seconds matching login request lifetime
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
          `UPDATE devices SET status = 'revoked', updated_at = NOW() WHERE id = $1`,
          [dev.id]
        );
      }
    }
  }

  return { sent, failed };
}

