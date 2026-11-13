import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { logAuditEvent } from '../services/auditService.js';

const router = Router();

// GET /api/devices
// List user's registered devices
router.get('/', requireAuth, async (req, res) => {
  const result = await query(
    `SELECT id, device_name, status, last_used, created_at 
     FROM devices 
     WHERE user_id = $1 
     ORDER BY created_at DESC`,
    [req.user.id]
  );

  return res.json({ devices: result.rows });
});

// DELETE /api/devices/:id
// Revoke a device
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const result = await query(
    `SELECT id, device_name FROM devices WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Device not found' });
  }

  const device = result.rows[0];

  await query(
    `UPDATE devices SET status = 'revoked' WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  await logAuditEvent({
    userId,
    event: 'DEVICE_REVOKED',
    req,
    metadata: { deviceId: id, deviceName: device.device_name },
  });

  return res.json({ success: true, message: 'Device has been revoked' });
});

export default router;

