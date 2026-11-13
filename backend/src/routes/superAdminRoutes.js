import { Router } from 'express';
import crypto from 'node:crypto';
import { query } from '../db/index.js';
import { tenantSessionAuth, requireSuperAdmin } from '../middleware/tenantSessionAuth.js';
import { generateApiKey } from '../services/apiKeyService.js';
import { hashPassword } from '../services/cryptoService.js';

const router = Router();

// Strictly protect all Super Admin routes
router.use(tenantSessionAuth, requireSuperAdmin);

/**
 * GET /api/super-admin/stats
 * Global platform overview for Super Admin
 */
router.get('/stats', async (req, res) => {
  try {
    const tenantsCount = await query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active FROM tenants`);
    const usersCount = await query(`SELECT COUNT(*) as total FROM end_users`);
    const devicesCount = await query(`SELECT COUNT(*) as total FROM end_user_devices WHERE status = 'active'`);
    const challengesCount = await query(
      `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'approved') as approved FROM auth_challenges`
    );
    const webhooksCount = await query(`SELECT COUNT(*) as total FROM tenant_webhooks WHERE is_active = true`);

    const totalChallenges = parseInt(challengesCount.rows[0].total, 10);
    const approvedChallenges = parseInt(challengesCount.rows[0].approved, 10);

    return res.json({
      tenants: {
        total: parseInt(tenantsCount.rows[0].total, 10),
        active: parseInt(tenantsCount.rows[0].active, 10),
      },
      endUsers: parseInt(usersCount.rows[0].total, 10),
      activeDevices: parseInt(devicesCount.rows[0].total, 10),
      challenges: {
        total: totalChallenges,
        approved: approvedChallenges,
        rate: totalChallenges > 0 ? Math.round((approvedChallenges / totalChallenges) * 100) : 100,
      },
      webhooks: parseInt(webhooksCount.rows[0].total, 10),
      adminUser: req.member.email,
    });
  } catch (err) {
    console.error('[Super Admin Stats Error]:', err);
    return res.status(500).json({ error: 'Failed to fetch platform metrics' });
  }
});

/**
 * GET /api/super-admin/tenants
 * List all organizations / tenants
 */
router.get('/tenants', async (req, res) => {
  try {
    const result = await query(
      `SELECT t.id, t.name, t.slug, t.status, t.tier, t.branding, t.created_at,
              COUNT(DISTINCT tm.id) as members_count,
              COUNT(DISTINCT u.id) as end_users_count,
              COUNT(DISTINCT ak.id) as api_keys_count
       FROM tenants t
       LEFT JOIN tenant_members tm ON t.id = tm.tenant_id
       LEFT JOIN end_users u ON t.id = u.tenant_id
       LEFT JOIN api_keys ak ON t.id = ak.tenant_id AND ak.is_active = true
       GROUP BY t.id
       ORDER BY t.created_at DESC`
    );

    return res.json({ tenants: result.rows });
  } catch (err) {
    console.error('[Super Admin Tenants Error]:', err);
    return res.status(500).json({ error: 'Failed to list tenants' });
  }
});

/**
 * POST /api/super-admin/tenants
 * Create an enterprise tenant manually
 */
router.post('/tenants', async (req, res) => {
  const { name, slug, ownerEmail, initialPassword, tier } = req.body;
  if (!name || !ownerEmail) {
    return res.status(400).json({ error: 'Name and owner email required' });
  }

  const tenantSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + crypto.randomBytes(3).toString('hex');
  const tenantId = crypto.randomUUID();
  const memberId = crypto.randomUUID();

  try {
    await query(
      `INSERT INTO tenants (id, name, slug, status, tier, branding)
       VALUES ($1, $2, $3, 'active', $4, $5)`,
      [
        tenantId,
        name,
        tenantSlug,
        tier || 'enterprise',
        JSON.stringify({ issuerName: name, primaryColor: '#3b82f6' }),
      ]
    );

    const passwordHash = await hashPassword(initialPassword || 'Welcome123!Secure');
    await query(
      `INSERT INTO tenant_members (id, tenant_id, email, password_hash, role, is_super_admin)
       VALUES ($1, $2, $3, $4, 'owner', false)`,
      [memberId, tenantId, ownerEmail.toLowerCase().trim(), passwordHash]
    );

    const liveKey = await generateApiKey(tenantId, 'Primary Live Key', 'live');

    return res.status(201).json({
      success: true,
      tenantId,
      name,
      slug: tenantSlug,
      ownerEmail,
      apiKey: liveKey.rawKey,
    });
  } catch (err) {
    console.error('[Super Admin Create Tenant Error]:', err);
    return res.status(500).json({ error: err.message || 'Failed to create tenant' });
  }
});

/**
 * PATCH /api/super-admin/tenants/:id
 * Suspend, activate or change tier of a tenant
 */
router.patch('/tenants/:id', async (req, res) => {
  const { status, tier, name } = req.body;
  const updates = [];
  const values = [req.params.id];
  let idx = 2;

  if (status) {
    updates.push(`status = $${idx++}`);
    values.push(status);
  }
  if (tier) {
    updates.push(`tier = $${idx++}`);
    values.push(tier);
  }
  if (name) {
    updates.push(`name = $${idx++}`);
    values.push(name);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No update fields provided' });
  }

  updates.push(`updated_at = NOW()`);

  const sql = `UPDATE tenants SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
  const result = await query(sql, values);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  return res.json({ success: true, tenant: result.rows[0] });
});

/**
 * GET /api/super-admin/audit-logs
 * Platform-wide security audit log
 */
router.get('/audit-logs', async (req, res) => {
  const result = await query(
    `SELECT al.*, t.name as tenant_name
     FROM audit_logs al
     LEFT JOIN tenants t ON al.metadata->>'tenant_id' = t.id
     ORDER BY al.created_at DESC LIMIT 50`
  );
  return res.json({ logs: result.rows });
});

export default router;
