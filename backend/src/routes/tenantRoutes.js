import { Router } from 'express';
import { tenantPortalController } from '../controllers/tenantPortalController.js';
import { tenantExternalApiController } from '../controllers/tenantExternalApiController.js';
import { tenantSessionAuth } from '../middleware/tenantSessionAuth.js';
import { apiKeyAuth } from '../middleware/apiKeyAuth.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// ===============================================================
// 1. PUBLIC ONBOARDING & TENANT RESOLUTION
// ===============================================================
router.post('/register', authLimiter, tenantPortalController.register);
router.post('/login', authLimiter, tenantPortalController.login);
router.get('/resolve/:slug', tenantPortalController.resolveSlug);

// ===============================================================
// 2. TENANT PORTAL & DASHBOARD (Protected by Member Session JWT)
//    CRITICAL: Fixed routes (/me, /stats, /users, etc.) MUST be
//    mounted BEFORE parameterized /:tenantId routes to prevent
//    path interception and 401 logout issues.
// ===============================================================
const portalRouter = Router();
portalRouter.use(tenantSessionAuth);

// Identity & Impersonation
portalRouter.get('/me', tenantPortalController.getMe);
portalRouter.post('/change-password', tenantPortalController.changePassword);
portalRouter.post('/exit-impersonation', tenantPortalController.exitImpersonation);

// Analytics & Branding
portalRouter.get('/stats', tenantPortalController.getStats);
portalRouter.patch('/branding', tenantPortalController.updateBranding);

// API Keys Management
portalRouter.get('/api-keys', tenantPortalController.listApiKeys);
portalRouter.post('/api-keys', tenantPortalController.createApiKey);
portalRouter.delete('/api-keys/:id', tenantPortalController.revokeApiKey);

// Webhook Management (Strictly tenant_id based)
portalRouter.get('/webhooks', tenantPortalController.listWebhooks);
portalRouter.post('/webhooks', tenantPortalController.createWebhook);
portalRouter.patch('/webhooks/:id', tenantPortalController.updateWebhook);
portalRouter.delete('/webhooks/:id', tenantPortalController.deleteWebhook);
portalRouter.post('/webhooks/:id/test', tenantPortalController.testWebhook);

// End-User Management & Enrollment
portalRouter.get('/users', tenantPortalController.listUsers);
portalRouter.get('/users/enroll-status', tenantPortalController.getUserEnrollStatus);
portalRouter.post('/users/enroll', tenantPortalController.enrollUser);
portalRouter.patch('/users/:id', tenantPortalController.updateUser);
portalRouter.delete('/users/:id', tenantPortalController.deleteUser);
portalRouter.post('/users/:id/reset-2fa', tenantPortalController.resetUser2fa);

// Push Simulator & Status polling for Dashboard Session
portalRouter.post('/test-push', async (req, res) => {
  req.body.issuer = req.tenant.branding?.issuerName || req.tenant.name;
  return tenantExternalApiController.triggerPushChallenge(req, res);
});
portalRouter.get('/push/status/:requestId', tenantExternalApiController.getPushStatus);

router.use('/', portalRouter);

// ===============================================================
// 3. EXPOSED EXTERNAL CLIENT APIS (Protected by API Key & Tenant)
//    Path: /api/tenant/:tenantId/*
//    NOTE: Mounted AFTER fixed portal routes so that /stats, /me, /users
//    are never intercepted by /:tenantId.
// ===============================================================
const externalRouter = Router({ mergeParams: true });
externalRouter.use(apiKeyAuth);

externalRouter.get('/users/status', tenantExternalApiController.getUserStatus);
externalRouter.post('/push/challenge', authLimiter, tenantExternalApiController.triggerPushChallenge);
externalRouter.get('/push/status/:requestId', tenantExternalApiController.getPushStatus);
externalRouter.post('/totp/verify', authLimiter, tenantExternalApiController.verifyTotp);
externalRouter.post('/enroll', tenantExternalApiController.enrollUserExternal);

router.use('/:tenantId', externalRouter);

export default router;
