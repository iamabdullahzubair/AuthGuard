import crypto from 'node:crypto';
import { query } from '../db/index.js';
import { broadcastLog } from './logBroadcaster.js';

/**
 * Log a security-critical audit event without logging secrets or credentials
 * 
 * @param {object} params
 * @param {string} [params.userId]
 * @param {string} params.event - e.g. 'ENROLL_START', 'ENROLL_COMPLETE', 'LOGIN_PASSWORD_SUCCESS', 'LOGIN_PUSH_APPROVED', 'DEVICE_REVOKED'
 * @param {import('express').Request} [params.req]
 * @param {object} [params.metadata]
 */
export async function logAuditEvent({ userId = null, event, req = null, metadata = null }) {
  try {
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip) : null;
    const userAgent = req ? req.headers['user-agent'] : null;

    // Sanitize metadata to ensure no secrets/passwords/tokens are logged
    const cleanMeta = metadata ? { ...metadata } : {};
    delete cleanMeta.password;
    delete cleanMeta.secret;
    delete cleanMeta.token;
    delete cleanMeta.enroll_token;
    delete cleanMeta.privateKey;
    delete cleanMeta.signature;

    await query(
      `INSERT INTO audit_logs (id, user_id, event, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        crypto.randomUUID(),
        userId,
        event,
        ip ? String(ip).slice(0, 64) : null,
        userAgent ? String(userAgent).slice(0, 500) : null,
        JSON.stringify(cleanMeta),
      ]
    );

    // Broadcast in real-time to Super Admin live logs
    const isSecurity = event.includes('FAIL') || event.includes('REVOKE') || event.includes('LOCKOUT');
    broadcastLog({
      level: isSecurity ? 'SECURITY' : 'AUTH',
      category: 'audit',
      message: `Audit Event: ${event}${userId ? ` (user: ${userId.slice(0, 8)}...)` : ''}`,
      metadata: { event, userId, ip, ...cleanMeta },
    });
  } catch (err) {
    console.error('[Audit Log Error]', err.message);
  }
}

