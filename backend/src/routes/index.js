import { Router } from 'express';
import superAdminRoutes from './superAdminRoutes.js';
import tenantRoutes from './tenantRoutes.js';
import authRoutes from './authRoutes.js';

const router = Router();

// 1. Super Admin Fortress (/api/super-admin) - Strictly protected by requireSuperAdmin
router.use('/super-admin', superAdminRoutes);

// 2. Tenant Organization Platform (/api/tenant)
//    - Public: /api/tenant/register, /api/tenant/login, /api/tenant/resolve/:slug
//    - Portal: /api/tenant/me, /api/tenant/stats, /api/tenant/users, /api/tenant/api-keys, /api/tenant/webhooks
//    - External Client APIs: /api/tenant/:tenantId/* (Protected by apiKeyAuth)
router.use('/tenant', tenantRoutes);

// 3. Authenticator Core (/api/auth)
router.use('/auth', authRoutes);

// Aliases for Authenticator PWA client convenience
router.get('/vapid-public-key', (req, res, next) => {
  req.url = '/vapid-public-key';
  authRoutes(req, res, next);
});
router.use('/enroll', authRoutes);
router.use('/login', authRoutes);

export default router;
