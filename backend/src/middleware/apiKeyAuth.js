import { verifyApiKey } from '../services/apiKeyService.js';
import { verifyMemberToken } from './tenantSessionAuth.js';
import { query } from '../db/index.js';

/**
 * Middleware: Authenticate external requests using API Key (ag_live_... or ag_test_...)
 * Enforces dual-check cross verification:
 * If the route includes `:tenantId`, it ensures that the API Key belongs to that specific tenant!
 * Also supports Dashboard Session tokens for interactive Docs Live Playground testing.
 */
export async function apiKeyAuth(req, res, next) {
  let rawKey = req.headers['x-api-key'];

  if (!rawKey && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      rawKey = parts[1];
    }
  }

  // 1. Authenticate via Raw API Key (ag_live_... or ag_test_...)
  if (rawKey && (rawKey.startsWith('ag_live_') || rawKey.startsWith('ag_test_'))) {
    try {
      const authResult = await verifyApiKey(rawKey);

      if (!authResult || authResult.error === 'INVALID_KEY') {
        return res.status(401).json({ error: 'Invalid or revoked API key' });
      }

      if (authResult.error === 'TENANT_SUSPENDED') {
        return res.status(403).json({
          error: 'Tenant account is suspended. Please contact support.',
        });
      }

      // Cross-verify with URL path tenantId parameter if present
      const pathTenantId = req.params.tenantId;
      if (pathTenantId) {
        const isMatch = authResult.tenant.id === pathTenantId || authResult.tenant.slug === pathTenantId;
        if (!isMatch) {
          return res.status(403).json({
            error: `Forbidden: Tenant '${pathTenantId}' in URL does not match authenticated API Key credentials`,
          });
        }
      }

      req.tenant = authResult.tenant;
      req.apiKey = {
        id: authResult.keyId,
        name: authResult.keyName,
        environment: authResult.environment,
      };

      return next();
    } catch (err) {
      console.error('[apiKeyAuth error]:', err);
      return res.status(500).json({ error: 'Internal security authentication error' });
    }
  }

  // 2. Convenience Fallback for Dashboard Docs Interactive Playground:
  // If no raw API key, but valid admin session exists for this tenant
  const sessionToken = (rawKey && !rawKey.startsWith('ag_')) ? rawKey : (req.cookies?.ag_token || null);
  if (sessionToken) {
    try {
      const decoded = verifyMemberToken(sessionToken);
      if (decoded && decoded.tenantId) {
        const tenantCheck = await query(
          `SELECT id, name, slug, status, tier, branding FROM tenants WHERE id = $1`,
          [decoded.tenantId]
        );
        if (tenantCheck.rows.length > 0) {
          const tenant = tenantCheck.rows[0];
          const pathTenantId = req.params.tenantId;
          if (!pathTenantId || pathTenantId === tenant.id || pathTenantId === tenant.slug) {
            req.tenant = tenant;
            req.apiKey = { id: 'dashboard_playground', name: 'Dashboard Live Playground', environment: 'live' };
            return next();
          }
        }
      }
    } catch (e) {
      // Ignore and proceed to 401
    }
  }

  return res.status(401).json({
    error: 'Missing or invalid API key. Provide via X-Api-Key header or Authorization: Bearer <key>',
  });
}
