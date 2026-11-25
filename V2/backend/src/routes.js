import { Router } from 'express';
import { requirePasswordChangeComplete, requireSession } from './modules/auth/auth.middleware.js';
import authRoutes from './modules/auth/auth.routes.js';
import superAdminRoutes from './modules/superAdmin/superAdmin.routes.js';
import tenantMembersRoutes from './modules/tenantMembers/tenantMembers.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/super-admin', superAdminRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/tenant-members', requireSession, requirePasswordChangeComplete, tenantMembersRoutes);

export default router;
