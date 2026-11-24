import { Router } from 'express';
import authRoutes from './modules/auth/auth.routes.js';
import tenantMembersRoutes from './modules/tenantMembers/tenantMembers.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/tenant-members', tenantMembersRoutes);

export default router;
