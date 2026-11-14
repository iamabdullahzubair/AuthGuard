import { verifyApiKey } from '../services/apiKeyService.js';

/**
 * Middleware: Authenticate external requests using API Key (ag_live_... or ag_test_...)
 * Enforces dual-check cross verification:
 * If the route includes `:tenantId`, it ensures that the API Key belongs to that specific tenant!
 */
export async function apiKeyAuth(req, res, next) {
  let rawKey = req.headers['x-api-key'];

  if (!rawKey && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      rawKey = parts[1];
    }
  }

  if (!rawKey) {
    return res.status(401).json({
      error: 'Missing API key. Provide via X-Api-Key header or Authorization: Bearer <key>',
    });
  }

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

    next();
  } catch (err) {
    console.error('[apiKeyAuth error]:', err);
    return res.status(500).json({ error: 'Internal security authentication error' });
  }
}
