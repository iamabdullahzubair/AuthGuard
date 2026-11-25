import { Router } from 'express';
import { requirePasswordChangeComplete, requireSession, requireSuperAdmin } from '../auth/auth.middleware.js';
import { superAdminController } from './superAdmin.controller.js';

const router = Router();
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use(requireSession, requirePasswordChangeComplete, requireSuperAdmin);
router.get('/tenants', wrap(superAdminController.listTenants));
router.post('/tenants', wrap(superAdminController.createTenant));
router.patch('/tenants/:id', wrap(superAdminController.updateTenant));
router.post('/tenants/:id/reset-owner-password', wrap(superAdminController.resetTenantOwnerPassword));

export default router;
