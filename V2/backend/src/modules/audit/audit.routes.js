import { Router } from 'express';
import { requirePasswordChangeComplete, requireSession, requireSuperAdmin, requireTenantOwner } from '../auth/auth.middleware.js';
import { auditController } from './audit.controller.js';

const router = Router();
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use(requireSession, requirePasswordChangeComplete);
router.get('/platform', requireSuperAdmin, wrap(auditController.listPlatform));
router.get('/tenant', requireTenantOwner, wrap(auditController.listTenant));

export default router;
