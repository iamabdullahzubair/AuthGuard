import { Router } from 'express';
import { config } from '../config/index.js';

const router = Router();

// GET /api/vapid-public-key
router.get('/', (req, res) => {
  return res.json({
    publicKey: config.VAPID_PUBLIC_KEY,
  });
});

export default router;

