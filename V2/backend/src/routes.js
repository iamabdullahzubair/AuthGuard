import { Router } from 'express';
import { requirePasswordChangeComplete, requireSession } from './modules/auth/auth.middleware.js';
import authRoutes from './modules/auth/auth.routes.js';
import tenantMembersRoutes from './modules/tenantMembers/tenantMembers.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/tenant-members', requireSession, requirePasswordChangeComplete, tenantMembersRoutes);

export default router;
