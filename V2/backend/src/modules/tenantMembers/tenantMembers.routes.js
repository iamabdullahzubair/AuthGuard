import { Router } from 'express';
import { requireSession, requireTenantOwner } from '../auth/auth.middleware.js';
import { tenantMembersController } from './tenantMembers.controller.js';

const router = Router();
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use(requireSession, requireTenantOwner);
router.get('/', wrap(tenantMembersController.list));
router.post('/', wrap(tenantMembersController.create));
router.patch('/:memberId/role', wrap(tenantMembersController.updateRole));
router.delete('/:memberId', wrap(tenantMembersController.remove));

export default router;
