import { Router } from 'express';
import { requirePasswordChangeComplete, requireSession, requireSuperAdmin } from '../auth/auth.middleware.js';
import { superAdminController } from './superAdmin.controller.js';

const router = Router();
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use(requireSession, requirePasswordChangeComplete, requireSuperAdmin);
router.get('/tenants', wrap(superAdminController.listTenants));

export default router;
