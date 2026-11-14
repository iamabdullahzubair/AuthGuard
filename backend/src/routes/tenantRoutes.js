import { Router } from 'express';
import { tenantPortalController } from '../controllers/tenantPortalController.js';
import { tenantExternalApiController } from '../controllers/tenantExternalApiController.js';
import { tenantSessionAuth } from '../middleware/tenantSessionAuth.js';
import { apiKeyAuth } from '../middleware/apiKeyAuth.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// ==========================================
// 1. PUBLIC ONBOARDING & TENANT RESOLUTION
// ==========================================
router.post('/register', authLimiter, tenantPortalController.register);
router.post('/login', authLimiter, tenantPortalController.login);
router.get('/resolve/:slug', tenantPortalController.resolveSlug);

// ===============================================================
// 2. EXPOSED EXTERNAL CLIENT APIS (Protected by API Key & Tenant)
//    Path: /api/tenant/:tenantId/*
// ===============================================================
const externalRouter = Router({ mergeParams: true });
externalRouter.use(apiKeyAuth);

externalRouter.get('/users/status', tenantExternalApiController.getUserStatus);
externalRouter.post('/push/challenge', authLimiter, tenantExternalApiController.triggerPushChallenge);
externalRouter.get('/push/status/:requestId', tenantExternalApiController.getPushStatus);
externalRouter.post('/totp/verify', authLimiter, tenantExternalApiController.verifyTotp);
externalRouter.post('/enroll', tenantExternalApiController.enrollUserExternal);

router.use('/:tenantId', externalRouter);

// ===============================================================
// 3. TENANT PORTAL & DASHBOARD (Protected by Member Session JWT)
// ===============================================================
router.use(tenantSessionAuth);

// Identity & Impersonation
router.get('/me', tenantPortalController.getMe);
router.post('/exit-impersonation', tenantPortalController.exitImpersonation);

// Analytics & Branding
router.get('/stats', tenantPortalController.getStats);
router.patch('/branding', tenantPortalController.updateBranding);

// API Keys Management
router.get('/api-keys', tenantPortalController.listApiKeys);
router.post('/api-keys', tenantPortalController.createApiKey);
router.delete('/api-keys/:id', tenantPortalController.revokeApiKey);

// Webhook Management (Strictly tenant_id based)
router.get('/webhooks', tenantPortalController.listWebhooks);
router.post('/webhooks', tenantPortalController.createWebhook);
router.delete('/webhooks/:id', tenantPortalController.deleteWebhook);
router.post('/webhooks/:id/test', tenantPortalController.testWebhook);

// End-User Management & Enrollment
router.get('/users', tenantPortalController.listUsers);
router.get('/users/enroll-status', tenantPortalController.getUserEnrollStatus);
router.post('/users/enroll', tenantPortalController.enrollUser);
router.patch('/users/:id', tenantPortalController.updateUser);
router.delete('/users/:id', tenantPortalController.deleteUser);
router.post('/users/:id/reset-2fa', tenantPortalController.resetUser2fa);

export default router;
