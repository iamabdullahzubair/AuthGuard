import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { query } from '../db/index.js';

const JWT_SECRET = config.SESSION_SECRET || 'authguard_super_secret_jwt_key_2026';

/**
 * Base64url helper
 */
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Lightweight, zero-dependency signed token creation
 */
export function createMemberToken(payload, expiresInMs = 7 * 24 * 60 * 60 * 1000) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Date.now() + expiresInMs;
  const fullPayload = { ...payload, exp };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Verify and decode member token
 */
export function verifyMemberToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signature] = parts;

  const expectedSig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  if (signature !== expectedSig) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64));
    if (payload.exp && Date.now() > payload.exp) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Middleware: Authenticate Tenant Member / Dashboard Session
 */
export async function tenantSessionAuth(req, res, next) {
  let token = null;

  if (req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      token = parts[1];
    }
  }

  if (!token && req.cookies && req.cookies.ag_token) {
    token = req.cookies.ag_token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Session required' });
  }

  const decoded = verifyMemberToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  // Fetch fresh member & tenant state
  const memberRes = await query(
    `SELECT tm.id as member_id, tm.tenant_id, tm.email, tm.role, tm.is_super_admin,
            t.name as tenant_name, t.slug as tenant_slug, t.status as tenant_status, t.branding, t.tier
     FROM tenant_members tm
     LEFT JOIN tenants t ON tm.tenant_id = t.id
     WHERE tm.id = $1`,
    [decoded.memberId]
  );

  if (memberRes.rows.length === 0) {
    return res.status(401).json({ error: 'User no longer exists' });
  }

  const row = memberRes.rows[0];

  if (row.tenant_status && row.tenant_status !== 'active' && !row.is_super_admin) {
    return res.status(403).json({ error: 'Tenant workspace is suspended' });
  }

  req.member = {
    id: row.member_id,
    email: row.email,
    role: row.role,
    isSuperAdmin: Boolean(row.is_super_admin),
  };

  req.tenant = row.tenant_id ? {
    id: row.tenant_id,
    name: row.tenant_name,
    slug: row.tenant_slug,
    tier: row.tier,
    branding: typeof row.branding === 'string' ? JSON.parse(row.branding) : row.branding,
  } : null;

  next();
}

/**
 * Middleware: Strictly require Super Admin privilege (iamabdullahzubair@gmail.com)
 */
export function requireSuperAdmin(req, res, next) {
  if (!req.member || !req.member.isSuperAdmin) {
    return res.status(403).json({ error: 'Forbidden: Super Admin access required' });
  }
  next();
}
