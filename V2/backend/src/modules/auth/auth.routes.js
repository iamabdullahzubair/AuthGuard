import { Router } from 'express';
import { authController } from './auth.controller.js';
import { requirePasswordChangeComplete, requireSession, requireSuperAdmin } from './auth.middleware.js';

const router = Router();
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  return next();
});

router.post('/register', wrap(authController.register));
router.post('/login', wrap(authController.login));

router.use(requireSession);
router.get('/me', authController.me);
router.post('/logout', wrap(authController.logout));
router.post('/logout-all', wrap(authController.logoutAll));
router.post('/change-password', wrap(authController.changePassword));

router.use(requirePasswordChangeComplete);
router.get('/sessions', wrap(authController.listSessions));
router.delete('/sessions/:sessionId', wrap(authController.revokeSession));
router.post('/impersonate/:tenantId', requireSuperAdmin, wrap(authController.impersonate));
router.post('/exit-impersonation', requireSuperAdmin, wrap(authController.exitImpersonation));

export default router;
