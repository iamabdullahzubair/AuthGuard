import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from '../db/index.js';
import { hashPassword, verifyPassword } from '../services/cryptoService.js';
import { generateApiKey, listApiKeys, revokeApiKey } from '../services/apiKeyService.js';
import { deliverToWebhook } from '../services/tenantWebhookService.js';
import { createMemberToken, tenantSessionAuth } from '../middleware/tenantSessionAuth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { sendPushToUser } from '../services/pushService.js';

const router = Router();

// Validation Schemas
const registerSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  companyName: z.string().min(2, 'Company name required'),
  slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens').optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const webhookCreateSchema = z.object({
  url: z.string().url('Valid webhook URL required'),
  customHeaders: z.record(z.string()).optional().default({}),
  events: z.array(z.string()).optional().default(['login.approved', 'login.denied']),
});

/**
 * POST /api/tenant/register
 * Client / Organization self-service onboarding
 */
router.post('/register', authLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  const { email, password, companyName, slug } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();
  const tenantSlug = slug || companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + crypto.randomBytes(3).toString('hex');

  try {
    // Check if email already registered
    const existingMember = await query(`SELECT id FROM tenant_members WHERE email = $1`, [normalizedEmail]);
    if (existingMember.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered. Please log in.' });
    }

    // Check slug collision
    const existingSlug = await query(`SELECT id FROM tenants WHERE slug = $1`, [tenantSlug]);
    if (existingSlug.rows.length > 0) {
      return res.status(409).json({ error: 'Company slug already in use. Please choose another.' });
    }

    const tenantId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    // 1. Create Tenant
    await query(
      `INSERT INTO tenants (id, name, slug, status, tier, branding)
       VALUES ($1, $2, $3, 'active', 'developer', $4)`,
      [
        tenantId,
        companyName,
        tenantSlug,
        JSON.stringify({ issuerName: companyName, primaryColor: '#3b82f6' }),
      ]
    );

    // 2. Create Owner Member
    await query(
      `INSERT INTO tenant_members (id, tenant_id, email, password_hash, role, is_super_admin)
       VALUES ($1, $2, $3, $4, 'owner', false)`,
      [memberId, tenantId, normalizedEmail, passwordHash]
    );

    const token = createMemberToken({
      memberId,
      tenantId,
      email: normalizedEmail,
      role: 'owner',
      isSuperAdmin: false,
    });

    return res.status(201).json({
      success: true,
      token,
      member: { id: memberId, email: normalizedEmail, role: 'owner', isSuperAdmin: false },
      tenant: { id: tenantId, name: companyName, slug: tenantSlug, tier: 'developer' },
    });
  } catch (err) {
    console.error('[Tenant Register Error]:', err);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

/**
 * GET /api/tenant/resolve/:slug
 * Public lookup for tenant white-label login screen
 */
router.get('/resolve/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const result = await query(
      `SELECT id, name, slug, status, tier, branding FROM tenants WHERE slug = $1`,
      [slug.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant organization not found' });
    }

    const tenant = result.rows[0];
    return res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        tier: tenant.tier,
        branding: typeof tenant.branding === 'string' ? JSON.parse(tenant.branding) : tenant.branding,
      },
    });
  } catch (err) {
    console.error('[Tenant Resolve Error]:', err);
    return res.status(500).json({ error: 'Failed to resolve organization' });
  }
});

/**
 * POST /api/tenant/login
 * Client Tenant & Super Admin Login
 */
router.post('/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  try {
    const memberRes = await query(
      `SELECT tm.id as member_id, tm.tenant_id, tm.email, tm.password_hash, tm.role, tm.is_super_admin,
              t.name as tenant_name, t.slug as tenant_slug, t.status as tenant_status, t.tier, t.branding
       FROM tenant_members tm
       LEFT JOIN tenants t ON tm.tenant_id = t.id
       WHERE tm.email = $1`,
      [normalizedEmail]
    );

    if (memberRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const member = memberRes.rows[0];

    const passwordValid = await verifyPassword(member.password_hash, password);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (member.tenant_status && member.tenant_status !== 'active' && !member.is_super_admin) {
      return res.status(403).json({ error: 'Your tenant workspace is currently suspended' });
    }

    const token = createMemberToken({
      memberId: member.member_id,
      tenantId: member.tenant_id,
      email: member.email,
      role: member.role,
      isSuperAdmin: Boolean(member.is_super_admin),
    });

    return res.json({
      success: true,
      token,
      member: {
        id: member.member_id,
        email: member.email,
        role: member.role,
        isSuperAdmin: Boolean(member.is_super_admin),
      },
      tenant: member.tenant_id ? {
        id: member.tenant_id,
        name: member.tenant_name,
        slug: member.tenant_slug,
        tier: member.tier,
        branding: typeof member.branding === 'string' ? JSON.parse(member.branding) : member.branding,
      } : null,
    });
  } catch (err) {
    console.error('[Tenant Login Error]:', err);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// All routes below require active tenant member session
router.use(tenantSessionAuth);

/**
 * GET /api/tenant/me
 */
router.get('/me', (req, res) => {
  return res.json({
    member: req.member,
    tenant: req.tenant,
  });
});

/**
 * POST /api/tenant/exit-impersonation
 * Reverts Super Admin session back to Super Admin global panel
 */
router.post('/exit-impersonation', async (req, res) => {
  if (!req.member.isSuperAdmin) {
    return res.status(403).json({ error: 'Only Super Admin can exit impersonation mode' });
  }

  const token = createMemberToken({
    memberId: req.member.id,
    tenantId: 'tenant_system_default',
    email: req.member.email,
    role: 'super_admin',
    isSuperAdmin: true,
  });

  return res.json({
    success: true,
    token,
    member: {
      id: req.member.id,
      email: req.member.email,
      role: 'super_admin',
      isSuperAdmin: true,
    },
    tenant: null,
  });
});

/**
 * GET /api/tenant/stats
 * Real-time analytics for the current tenant
 */
router.get('/stats', async (req, res) => {
  const tenantId = req.tenant.id;

  try {
    const usersCount = await query(`SELECT COUNT(*) as count FROM end_users WHERE tenant_id = $1`, [tenantId]);
    const devicesCount = await query(`SELECT COUNT(*) as count FROM end_user_devices WHERE tenant_id = $1 AND status = 'active'`, [tenantId]);
    const totalChallenges = await query(`SELECT COUNT(*) as count FROM auth_challenges WHERE tenant_id = $1`, [tenantId]);
    const approvedChallenges = await query(`SELECT COUNT(*) as count FROM auth_challenges WHERE tenant_id = $1 AND status = 'approved'`, [tenantId]);
    const recentLogs = await query(
      `SELECT ac.id, ac.challenge_number, ac.status, ac.ip_address, ac.created_at, u.email
       FROM auth_challenges ac
       JOIN end_users u ON ac.end_user_id = u.id
       WHERE ac.tenant_id = $1
       ORDER BY ac.created_at DESC LIMIT 10`,
      [tenantId]
    );

    const total = parseInt(totalChallenges.rows[0].count, 10);
    const approved = parseInt(approvedChallenges.rows[0].count, 10);
    const verificationRate = total > 0 ? Math.round((approved / total) * 100) : 100;

    return res.json({
      totalUsers: parseInt(usersCount.rows[0].count, 10),
      activeDevices: parseInt(devicesCount.rows[0].count, 10),
      totalChallenges: total,
      approvedChallenges: approved,
      verificationRate,
      recentActivity: recentLogs.rows,
    });
  } catch (err) {
    console.error('[Tenant Stats Error]:', err);
    return res.status(500).json({ error: 'Failed to fetch tenant analytics' });
  }
});

/**
 * API Key Management
 */
router.get('/api-keys', async (req, res) => {
  const keys = await listApiKeys(req.tenant.id);
  return res.json({ keys });
});

router.post('/api-keys', async (req, res) => {
  const { name, environment } = req.body;
  const newKey = await generateApiKey(req.tenant.id, name, environment || 'live');
  return res.status(201).json({ key: newKey });
});

router.delete('/api-keys/:id', async (req, res) => {
  const revoked = await revokeApiKey(req.tenant.id, req.params.id);
  if (!revoked) return res.status(404).json({ error: 'API key not found' });
  return res.json({ success: true, message: 'API key revoked' });
});

/**
 * Webhook Management (With Custom Headers)
 */
router.get('/webhooks', async (req, res) => {
  const webhooks = await query(
    `SELECT id, url, secret, custom_headers, events, is_active, created_at, updated_at
     FROM tenant_webhooks
     WHERE tenant_id = $1
     ORDER BY created_at DESC`,
    [req.tenant.id]
  );

  const deliveries = await query(
    `SELECT twl.*, tw.url
     FROM tenant_webhook_logs twl
     JOIN tenant_webhooks tw ON twl.webhook_id = tw.id
     WHERE twl.tenant_id = $1
     ORDER BY twl.created_at DESC LIMIT 20`,
    [req.tenant.id]
  );

  return res.json({
    webhooks: webhooks.rows,
    deliveries: deliveries.rows,
  });
});

router.post('/webhooks', async (req, res) => {
  const parsed = webhookCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  const { url, customHeaders, events } = parsed.data;
  const webhookId = crypto.randomUUID();
  const secret = crypto.randomBytes(24).toString('hex');

  await query(
    `INSERT INTO tenant_webhooks (id, tenant_id, url, secret, custom_headers, events, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, true)`,
    [webhookId, req.tenant.id, url, secret, JSON.stringify(customHeaders), JSON.stringify(events)]
  );

  return res.status(201).json({
    success: true,
    webhook: {
      id: webhookId,
      url,
      secret,
      customHeaders,
      events,
    },
  });
});

router.delete('/webhooks/:id', async (req, res) => {
  const result = await query(
    `DELETE FROM tenant_webhooks WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [req.params.id, req.tenant.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Webhook not found' });
  return res.json({ success: true, message: 'Webhook deleted' });
});

router.post('/webhooks/:id/test', async (req, res) => {
  const check = await query(
    `SELECT * FROM tenant_webhooks WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenant.id]
  );
  if (check.rows.length === 0) return res.status(404).json({ error: 'Webhook not found' });

  const hook = check.rows[0];
  const testData = { message: 'AuthGuard test ping', time: new Date().toISOString() };
  const deliveryResult = await deliverToWebhook(req.tenant.id, hook, 'test.ping', testData);

  return res.json({ success: deliveryResult.success, status: deliveryResult.status, durationMs: deliveryResult.durationMs });
});

/**
 * End-Users Management
 */
router.get('/users', async (req, res) => {
  const result = await query(
    `SELECT u.id, u.email, u.two_factor_enabled, u.created_at,
            COUNT(d.id) FILTER (WHERE d.status = 'active') as active_devices_count
     FROM end_users u
     LEFT JOIN end_user_devices d ON u.id = d.end_user_id
     WHERE u.tenant_id = $1
     GROUP BY u.id
     ORDER BY u.created_at DESC LIMIT 100`,
    [req.tenant.id]
  );

  return res.json({ users: result.rows });
});

/**
 * Update Tenant Branding
 */
router.patch('/branding', async (req, res) => {
  const { issuerName, primaryColor, logoUrl } = req.body;
  const currentBranding = req.tenant.branding || {};
  const updatedBranding = {
    ...currentBranding,
    issuerName: issuerName || currentBranding.issuerName || req.tenant.name,
    primaryColor: primaryColor || currentBranding.primaryColor || '#3b82f6',
    logoUrl: logoUrl !== undefined ? logoUrl : currentBranding.logoUrl,
  };

  await query(
    `UPDATE tenants SET branding = $1, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(updatedBranding), req.tenant.id]
  );

  return res.json({ success: true, branding: updatedBranding });
});

export default router;
