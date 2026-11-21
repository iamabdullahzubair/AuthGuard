import { Router } from 'express';
import { authController } from '../controllers/authController.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// VAPID Public Key for Web Push Subscription
router.get('/vapid-public-key', authController.getVapidPublicKey);

// PWA Device Pairing (Single-use QR code token activation)
router.post('/enroll/complete', authLimiter, authController.completeEnrollment);

// Clean RESTful Challenge Endpoints
router.get('/challenge/:id', authController.getLoginRequest);
router.post('/challenge/respond', authLimiter, authController.respondLogin);

export default router;
