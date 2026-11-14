import { Router } from 'express';
import { tenantSessionAuth, requireSuperAdmin } from '../middleware/tenantSessionAuth.js';
import { superAdminController } from '../controllers/superAdminController.js';

const router = Router();

// Strictly protect ALL routes in this router with Super Admin privileges
router.use(tenantSessionAuth, requireSuperAdmin);

// Platform Analytics & Management
router.get('/stats', superAdminController.getStats);
router.get('/tenants', superAdminController.listTenants);
router.post('/tenants', superAdminController.createTenant);
router.patch('/tenants/:id', superAdminController.updateTenant);
router.post('/impersonate/:tenantId', superAdminController.impersonateTenant);

// Telemetry & Live Log Streams
router.get('/logs/stream', superAdminController.streamLogs);
router.get('/logs', superAdminController.getLogs);
router.get('/system/status', superAdminController.getSystemStatus);

export default router;
