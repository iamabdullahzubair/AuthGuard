import crypto from 'node:crypto';
import { query } from '../db/index.js';
import { cacheGet, cacheSet, cacheDel } from './redisService.js';

/**
 * Hash raw API key using SHA-256
 * @param {string} rawKey 
 * @returns {string} 64-char hex hash
 */
export function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Generate a new API Key for a tenant
 * @param {string} tenantId 
 * @param {string} name 
 * @param {'live'|'test'} environment 
 * @returns {Promise<{ id: string, rawKey: string, name: string, environment: string, createdAt: Date }>}
 */
export async function generateApiKey(tenantId, name, environment = 'live') {
  const prefix = environment === 'test' ? 'ag_test_' : 'ag_live_';
  const randomSecret = crypto.randomBytes(24).toString('base64url');
  const rawKey = `${prefix}${randomSecret}`;
  const keyHash = hashApiKey(rawKey);
  const id = crypto.randomUUID();

  await query(
    `INSERT INTO api_keys (id, tenant_id, name, key_prefix, key_hash, environment, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, true)`,
    [id, tenantId, name || `${environment} Key`, prefix, keyHash, environment]
  );

  return {
    id,
    rawKey, // returned only once at creation!
    name: name || `${environment} Key`,
    keyPrefix: prefix,
    environment,
    createdAt: new Date(),
  };
}

/**
 * Verify raw API key and resolve the associated tenant
 * @param {string} rawKey 
 * @returns {Promise<object|null>} Tenant and Key data if valid
 */
export async function verifyApiKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') return null;

  const keyHash = hashApiKey(rawKey.trim());
  const cacheKey = `apikey:${keyHash}`;

  // Check Redis cache first (sub-millisecond resolution)
  const cached = await cacheGet(cacheKey);
  if (cached) {
    if (cached.error) return cached;
    // Async update last_used_at without awaiting
    query(`UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`, [cached.keyId]).catch(() => {});
    return cached;
  }

  const res = await query(
    `SELECT ak.id as key_id, ak.name as key_name, ak.environment, ak.is_active,
            t.id as tenant_id, t.name as tenant_name, t.slug as tenant_slug,
            t.status as tenant_status, t.tier as tenant_tier, t.verification_mode, t.branding
     FROM api_keys ak
     JOIN tenants t ON ak.tenant_id = t.id
     WHERE ak.key_hash = $1 AND ak.is_active = true`,
    [keyHash]
  );

  if (res.rows.length === 0) return null;
  const row = res.rows[0];

  if (row.tenant_status !== 'active') {
    const errorPayload = { error: 'TENANT_SUSPENDED' };
    await cacheSet(cacheKey, errorPayload, 60);
    return errorPayload;
  }

  // Update last_used_at asynchronously
  query(`UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`, [row.key_id]).catch(() => {});

  const payload = {
    keyId: row.key_id,
    keyName: row.key_name,
    environment: row.environment,
    tenant: {
      id: row.tenant_id,
      name: row.tenant_name,
      slug: row.tenant_slug,
      tier: row.tenant_tier,
      verification_mode: row.verification_mode || 'number_choice',
      branding: typeof row.branding === 'string' ? JSON.parse(row.branding) : row.branding,
    },
  };

  // Cache in Redis for 5 minutes
  await cacheSet(cacheKey, payload, 300);

  return payload;
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(tenantId, keyId) {
  const res = await query(
    `UPDATE api_keys SET is_active = false WHERE id = $1 AND tenant_id = $2 RETURNING id, key_hash`,
    [keyId, tenantId]
  );
  if (res.rows.length > 0) {
    // Purge from Redis cache immediately
    await cacheDel(`apikey:${res.rows[0].key_hash}`);
    return true;
  }
  return false;
}

/**
 * List API keys for a tenant
 */
export async function listApiKeys(tenantId) {
  const res = await query(
    `SELECT id, name, key_prefix, environment, is_active, last_used_at, created_at
     FROM api_keys
     WHERE tenant_id = $1
     ORDER BY created_at DESC`,
    [tenantId]
  );
  return res.rows;
}
