import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from '../db/index.js';
import { hashPassword, verifyPassword, encryptAesGcm } from '../services/cryptoService.js';
import { generateApiKey, listApiKeys, revokeApiKey } from '../services/apiKeyService.js';
import { generateTotpSecret, generateQrCodeDataUrl } from '../services/totpService.js';
import { deliverToWebhook } from '../services/tenantWebhookService.js';
import { storeEnrollToken } from '../services/redisService.js';
import { createMemberToken } from '../middleware/tenantSessionAuth.js';
import { logAuditEvent } from '../services/auditService.js';
import { config } from '../config/index.js';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

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

export const tenantPortalController = {
  /**
   * POST /api/tenant/register
   */
  async register(req, res) {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const { email, password, companyName, slug } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();
    const tenantSlug = slug || companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + crypto.randomBytes(3).toString('hex');

    try {
      const existingMember = await query(`SELECT id FROM tenant_members WHERE email = $1`, [normalizedEmail]);
      if (existingMember.rows.length > 0) {
        return res.status(409).json({ error: 'Email already registered. Please log in.' });
      }

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
  },

  /**
   * POST /api/tenant/login
   */
  async login(req, res) {
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
  },

  /**
   * GET /api/tenant/resolve/:slug
   */
  async resolveSlug(req, res) {
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
  },

  /**
   * GET /api/tenant/me
   */
  getMe(req, res) {
    return res.json({
      member: req.member,
      tenant: req.tenant,
    });
  },

  /**
   * POST /api/tenant/exit-impersonation
   */
  async exitImpersonation(req, res) {
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
  },

  /**
   * POST /api/tenant/change-password
   * Allows tenant member or super admin to change their own password
   */
  async changePassword(req, res) {
    const parseResult = changePasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0].message });
    }

    const { currentPassword, newPassword } = parseResult.data;

    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password cannot be the same as your current password' });
    }

    try {
      const memberRes = await query(
        `SELECT id, email, password_hash, is_super_admin, tenant_id FROM tenant_members WHERE id = $1`,
        [req.member.id]
      );

      if (memberRes.rows.length === 0) {
        return res.status(404).json({ error: 'Account not found' });
      }

      const member = memberRes.rows[0];

      const isCurrentValid = await verifyPassword(member.password_hash, currentPassword);
      if (!isCurrentValid) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      const newPasswordHash = await hashPassword(newPassword);

      await query(
        `UPDATE tenant_members SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [newPasswordHash, member.id]
      );

      await logAuditEvent({
        tenantId: member.tenant_id || req.tenant?.id || null,
        userId: member.id,
        event: 'MEMBER_PASSWORD_CHANGED',
        req,
        metadata: {
          email: member.email,
          isSuperAdmin: Boolean(member.is_super_admin),
        },
      });

      return res.json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (err) {
      console.error('[Change Password Error]:', err);
      return res.status(500).json({ error: 'Failed to change password. Please try again.' });
    }
  },

  /**
   * GET /api/tenant/stats
   */
  async getStats(req, res) {
    const tenantId = req.tenant.id;

    try {
      const usersCount = await query(`SELECT COUNT(*) as count FROM end_users WHERE tenant_id = $1`, [tenantId]);
      const devicesCount = await query(`SELECT COUNT(*) as count FROM end_user_devices WHERE tenant_id = $1 AND status = 'active'`, [tenantId]);

      // Calculate challenges from audit_logs
      const totalChallengesRes = await query(
        `SELECT COUNT(*) as count FROM audit_logs 
         WHERE tenant_id = $1 AND event = 'API_PUSH_CHALLENGE_INITIATED'`,
        [tenantId]
      );
      const approvedChallengesRes = await query(
        `SELECT COUNT(*) as count FROM audit_logs 
         WHERE tenant_id = $1 AND event = 'LOGIN_PUSH_APPROVED'`,
        [tenantId]
      );

      // Recent 10 challenge activity logs
      const recentLogs = await query(
        `SELECT al.id, 
                COALESCE((al.metadata->>'challengeNumber')::int, (al.metadata->>'chosen_number')::int, 0) as challenge_number,
                CASE 
                  WHEN al.event = 'LOGIN_PUSH_APPROVED' THEN 'approved'
                  WHEN al.event = 'LOGIN_PUSH_DENIED_BY_USER' THEN 'denied'
                  WHEN al.event = 'LOGIN_PUSH_NUMBER_MISMATCH' THEN 'denied'
                  ELSE 'pending'
                END as status,
                al.ip_address, 
                al.created_at, 
                COALESCE(al.metadata->>'email', u.email, 'User') as email
         FROM audit_logs al
         LEFT JOIN end_users u ON al.user_id = u.id
         WHERE al.tenant_id = $1 AND al.event IN ('LOGIN_PUSH_APPROVED', 'LOGIN_PUSH_DENIED_BY_USER', 'LOGIN_PUSH_NUMBER_MISMATCH', 'API_PUSH_CHALLENGE_INITIATED')
         ORDER BY al.created_at DESC LIMIT 10`,
        [tenantId]
      );

      const total = parseInt(totalChallengesRes.rows[0].count, 10);
      const approved = parseInt(approvedChallengesRes.rows[0].count, 10);
      const verificationRate = total > 0 ? Math.min(100, Math.round((approved / total) * 100)) : 100;

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
  },

  /**
   * PATCH /api/tenant/branding
   */
  async updateBranding(req, res) {
    const { issuerName, primaryColor, logoUrl, verificationMode } = req.body;
    const currentBranding = req.tenant.branding || {};
    const updatedBranding = {
      ...currentBranding,
      ...(issuerName ? { issuerName } : {}),
      ...(primaryColor ? { primaryColor } : {}),
      ...(logoUrl !== undefined ? { logoUrl } : {}),
    };

    const validModes = ['number_choice', 'one_click', 'word_input'];
    const newVerificationMode = validModes.includes(verificationMode)
      ? verificationMode
      : (req.tenant.verification_mode || 'number_choice');

    try {
      await query(
        `UPDATE tenants SET branding = $1, verification_mode = $2, updated_at = NOW() WHERE id = $3`,
        [JSON.stringify(updatedBranding), newVerificationMode, req.tenant.id]
      );

      return res.json({
        success: true,
        branding: updatedBranding,
        verificationMode: newVerificationMode,
      });
    } catch (err) {
      console.error('[Update Branding Error]:', err);
      return res.status(500).json({ error: 'Failed to update branding & verification mode' });
    }
  },

  /**
   * GET /api/tenant/api-keys
   */
  async listApiKeys(req, res) {
    const keys = await listApiKeys(req.tenant.id);
    return res.json({ keys });
  },

  /**
   * POST /api/tenant/api-keys
   */
  async createApiKey(req, res) {
    const { name, environment } = req.body;
    const newKey = await generateApiKey(req.tenant.id, name, environment || 'live');
    return res.status(201).json({ key: newKey });
  },

  /**
   * DELETE /api/tenant/api-keys/:id
   */
  async revokeApiKey(req, res) {
    const revoked = await revokeApiKey(req.tenant.id, req.params.id);
    if (!revoked) return res.status(404).json({ error: 'API key not found' });
    return res.json({ success: true, message: 'API key revoked' });
  },

  /**
   * GET /api/tenant/webhooks (Strictly tenant_id based)
   */
  async listWebhooks(req, res) {
    const webhooks = await query(
      `SELECT id, url, secret, custom_headers, events, is_active, created_at, updated_at
       FROM tenant_webhooks
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [req.tenant.id]
    );

    const deliveries = await query(
      `SELECT twl.*, COALESCE(tw.url, '(Deleted Webhook)') as url
       FROM tenant_webhook_logs twl
       LEFT JOIN tenant_webhooks tw ON twl.webhook_id = tw.id
       WHERE twl.tenant_id = $1
       ORDER BY twl.created_at DESC LIMIT 100`,
      [req.tenant.id]
    );

    return res.json({
      webhooks: webhooks.rows,
      deliveries: deliveries.rows,
    });
  },

  /**
   * POST /api/tenant/webhooks
   */
  async createWebhook(req, res) {
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
  },

  /**
   * DELETE /api/tenant/webhooks/:id
   */
  async deleteWebhook(req, res) {
    const result = await query(
      `DELETE FROM tenant_webhooks WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [req.params.id, req.tenant.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Webhook not found' });
    return res.json({ success: true, message: 'Webhook deleted' });
  },

  /**
   * PATCH /api/tenant/webhooks/:id
   */
  async updateWebhook(req, res) {
    const { url, customHeaders, events, is_active } = req.body;
    const updates = [];
    const values = [req.params.id, req.tenant.id];
    let idx = 3;

    if (url && typeof url === 'string') {
      updates.push(`url = $${idx++}`);
      values.push(url.trim());
    }
    if (customHeaders !== undefined && customHeaders !== null && typeof customHeaders === 'object') {
      updates.push(`custom_headers = $${idx++}`);
      values.push(JSON.stringify(customHeaders));
    }
    if (events && Array.isArray(events)) {
      updates.push(`events = $${idx++}`);
      values.push(JSON.stringify(events));
    }
    if (typeof is_active === 'boolean') {
      updates.push(`is_active = $${idx++}`);
      values.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No update fields provided' });
    }

    updates.push(`updated_at = NOW()`);
    const sql = `UPDATE tenant_webhooks SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *`;
    const result = await query(sql, values);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Webhook not found' });
    return res.json({ success: true, webhook: result.rows[0] });
  },

  /**
   * POST /api/tenant/webhooks/:id/test
   * Live Webhook Playground Runner: fires real HTTP call to webhook with chosen event & payload
   */
  async testWebhook(req, res) {
    const check = await query(
      `SELECT * FROM tenant_webhooks WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenant.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Webhook not found' });

    const hook = check.rows[0];
    const event = req.body.event || 'test.ping';

    // Mock data templates matching production event payloads
    let testData = req.body.data;
    if (!testData || typeof testData !== 'object') {
      const dummyId = crypto.randomUUID();
      const now = Date.now();
      if (event === 'login.approved') {
        testData = {
          challengeId: dummyId,
          requestId: dummyId,
          userId: 'usr_c299db73-45f8-4177-8fa2-0391d4e022cc',
          email: 'alex.developer@example.com',
          deviceId: 'dev_8f19da52-9b04-4b53-93d1-f81d1982f6e9',
          status: 'approved',
          timestamp: now,
        };
      } else if (event === 'login.denied') {
        testData = {
          challengeId: dummyId,
          requestId: dummyId,
          userId: 'usr_c299db73-45f8-4177-8fa2-0391d4e022cc',
          email: 'alex.developer@example.com',
          deviceId: 'dev_8f19da52-9b04-4b53-93d1-f81d1982f6e9',
          status: 'denied',
          reason: 'user_denied',
          timestamp: now,
        };
      } else if (event === 'user.enrolled') {
        testData = {
          email: 'new.member@example.com',
          userId: 'usr_c299db73-45f8-4177-8fa2-0391d4e022cc',
          timestamp: now,
        };
      } else {
        testData = {
          message: 'AuthGuard webhook playground test ping',
          timestamp: now,
          system: 'AuthGuard 2.0 Webhook Engine',
        };
      }
    }

    const deliveryResult = await deliverToWebhook(req.tenant.id, hook, event, testData);

    return res.json({
      success: deliveryResult.success,
      status: deliveryResult.status,
      durationMs: deliveryResult.durationMs,
      responseBody: deliveryResult.responseBody,
      sentHeaders: deliveryResult.sentHeaders,
      sentPayload: deliveryResult.sentPayload,
    });
  },

  /**
   * POST /api/tenant/webhooks/deliveries/:deliveryId/retry
   * Re-dispatches a past webhook delivery log to the associated webhook endpoint
   */
  async retryDelivery(req, res) {
    const logRes = await query(
      `SELECT * FROM tenant_webhook_logs WHERE id = $1 AND tenant_id = $2`,
      [req.params.deliveryId, req.tenant.id]
    );
    if (logRes.rows.length === 0) return res.status(404).json({ error: 'Delivery log not found' });
    const log = logRes.rows[0];

    const hookRes = await query(
      `SELECT * FROM tenant_webhooks WHERE id = $1 AND tenant_id = $2`,
      [log.webhook_id, req.tenant.id]
    );
    if (hookRes.rows.length === 0) {
      return res.status(404).json({ error: 'The webhook endpoint associated with this delivery no longer exists' });
    }
    const hook = hookRes.rows[0];

    const payloadData = log.payload?.data !== undefined ? log.payload.data : log.payload;
    const result = await deliverToWebhook(req.tenant.id, hook, log.event, payloadData);
    return res.json({ success: true, result });
  },

  /**
   * GET /api/tenant/users
   */
  async listUsers(req, res) {
    const tenantId = req.tenant?.id || 'tenant_system_default';
    const q = req.query.q ? String(req.query.q).trim().toLowerCase() : '';

    let sql = `
      SELECT u.id, u.email, u.two_factor_enabled, u.created_at,
             COUNT(d.id) FILTER (WHERE d.status = 'active') as active_devices_count
      FROM end_users u
      LEFT JOIN end_user_devices d ON u.id = d.end_user_id
      WHERE u.tenant_id = $1
    `;
    const params = [tenantId];

    if (q) {
      params.push(`%${q}%`);
      sql += ` AND LOWER(u.email) LIKE $2 `;
    }

    sql += `
      GROUP BY u.id
      ORDER BY u.created_at DESC LIMIT 100
    `;

    const result = await query(sql, params);
    const users = result.rows.map(u => ({
      id: u.id,
      username: u.email,
      two_factor_enabled: u.two_factor_enabled,
      active_devices_count: u.active_devices_count,
      created_at: u.created_at,
    }));

    return res.json({ users });
  },

  /**
   * GET /api/tenant/users/enroll-status
   */
  async getUserEnrollStatus(req, res) {
    const rawId = req.query.username || req.query.email || req.query.identifier;
    if (!rawId || typeof rawId !== 'string') {
      return res.status(400).json({ error: 'Username or identifier parameter required' });
    }

    const normalizedId = rawId.toLowerCase().trim();
    const tenantId = req.tenant?.id || 'tenant_system_default';
    const check = await query(
      `SELECT u.id, u.email, u.two_factor_enabled,
              COUNT(d.id) FILTER (WHERE d.status = 'active') as active_devices_count
       FROM end_users u
       LEFT JOIN end_user_devices d ON u.id = d.end_user_id
       WHERE u.tenant_id = $1 AND u.email = $2
       GROUP BY u.id`,
      [tenantId, normalizedId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const row = check.rows[0];
    const activeDevices = parseInt(row.active_devices_count, 10);
    const enrolled = Boolean(row.two_factor_enabled && activeDevices > 0);

    return res.json({
      enrolled,
      twoFactorEnabled: Boolean(row.two_factor_enabled),
      activeDevices,
      userId: row.id,
      username: normalizedId,
    });
  },

  /**
   * PATCH /api/tenant/users/:id
   */
  async updateUser(req, res) {
    const targetUsername = typeof req.body.username === 'string'
      ? req.body.username
      : (typeof req.body.email === 'string'
        ? req.body.email
        : (typeof req.body.identifier === 'string' ? req.body.identifier : null));

    const { two_factor_enabled } = req.body;
    const tenantId = req.tenant?.id || 'tenant_system_default';
    const updates = [];
    const values = [req.params.id, tenantId];
    let idx = 3;

    if (targetUsername && targetUsername.trim().length >= 2) {
      updates.push(`email = $${idx++}`);
      values.push(targetUsername.toLowerCase().trim());
    }
    if (typeof two_factor_enabled === 'boolean') {
      updates.push(`two_factor_enabled = $${idx++}`);
      values.push(two_factor_enabled);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No update fields provided' });
    }

    updates.push(`updated_at = NOW()`);
    const sql = `UPDATE end_users SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING id, email, two_factor_enabled, updated_at`;
    const result = await query(sql, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const row = result.rows[0];
    const user = {
      id: row.id,
      username: row.email,
      two_factor_enabled: row.two_factor_enabled,
      updated_at: row.updated_at,
    };

    return res.json({ success: true, user });
  },

  /**
   * DELETE /api/tenant/users/:id
   */
  async deleteUser(req, res) {
    const tenantId = req.tenant?.id || 'tenant_system_default';
    const result = await query(
      `DELETE FROM end_users WHERE id = $1 AND tenant_id = $2 RETURNING id, email`,
      [req.params.id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      success: true,
      message: `User ${result.rows[0].email} deleted successfully`,
    });
  },

  /**
   * POST /api/tenant/users/:id/reset-2fa
   */
  async resetUser2fa(req, res) {
    const tenantId = req.tenant?.id || 'tenant_system_default';
    const userRes = await query(
      `SELECT id, email FROM end_users WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userRes.rows[0];

    // Revoke devices and delete TOTP secret
    await query(`DELETE FROM end_user_devices WHERE end_user_id = $1`, [user.id]);
    await query(`DELETE FROM end_user_totp WHERE end_user_id = $1`, [user.id]);
    await query(`UPDATE end_users SET two_factor_enabled = false, updated_at = NOW() WHERE id = $1`, [user.id]);

    return res.json({
      success: true,
      message: `2FA reset for ${user.email}. User can now be re-enrolled.`,
    });
  },

  /**
   * POST /api/tenant/users/enroll
   * Dashboard admin generates 2FA enrollment QR code for an end-user
   */
  async enrollUser(req, res) {
    const rawId = req.body.username || req.body.email || req.body.identifier;
    if (!rawId || typeof rawId !== 'string' || rawId.trim().length < 2) {
      return res.status(400).json({ error: 'Valid username or identifier required (min 2 characters)' });
    }

    const normalizedEmail = rawId.toLowerCase().trim();
    const tenantId = req.tenant?.id || 'tenant_system_default';
    const issuer = req.tenant?.branding?.issuerName || req.tenant?.name || 'AuthGuard';

    try {
      // 1. Find or create in end_users
      let endUserId;
      const existing = await query(
        `SELECT id FROM end_users WHERE tenant_id = $1 AND email = $2`,
        [tenantId, normalizedEmail]
      );

      if (existing.rows.length > 0) {
        endUserId = existing.rows[0].id;
      } else {
        endUserId = crypto.randomUUID();
        await query(
          `INSERT INTO end_users (id, tenant_id, email, two_factor_enabled)
           VALUES ($1, $2, $3, false)`,
          [endUserId, tenantId, normalizedEmail]
        );
      }

      // 2. Generate TOTP secret & temporary enroll_token (Stored in Redis with 15 mins TTL)
      const secret = generateTotpSecret();
      const encryptedSecret = encryptAesGcm(secret);
      const enrollToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

      await storeEnrollToken(enrollToken, {
        endUserId,
        tenantId,
        username: normalizedEmail,
        encSecretObj: encryptedSecret,
        expiresAt: expiresAt.toISOString(),
      }, 900);

      // Save temporary secret to end_user_totp as well (with correct columns: tenant_id, iv, tag)
      await query(
        `INSERT INTO end_user_totp (id, tenant_id, end_user_id, encrypted_secret, iv, tag)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (end_user_id) 
         DO UPDATE SET 
           encrypted_secret = EXCLUDED.encrypted_secret,
           iv = EXCLUDED.iv,
           tag = EXCLUDED.tag`,
        [crypto.randomUUID(), tenantId, endUserId, encryptedSecret.ciphertext, encryptedSecret.iv, encryptedSecret.tag]
      );

      // 4. Resolve Server URL dynamically from request
      const forwardedProto = req.headers['x-forwarded-proto'];
      const forwardedHost = req.headers['x-forwarded-host'];
      const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
      const host = forwardedHost ? forwardedHost.split(',')[0].trim() : req.get('host');
      const serverUrl = host ? `${protocol}://${host}` : config.APP_URL;

      const qrPayload = {
        server: serverUrl,
        enroll_token: enrollToken,
        secret,
        account: normalizedEmail,
        issuer,
        tenant_id: tenantId,
      };

      const qrDataUrl = await generateQrCodeDataUrl(qrPayload);

      return res.json({
        success: true,
        userId: endUserId,
        username: normalizedEmail,
        issuer,
        enrollToken,
        totpSecret: secret,
        qrCodeDataUrl: qrDataUrl,
        qrPayload,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (err) {
      console.error('[Tenant Enroll User Error]:', err);
      return res.status(500).json({ error: 'Failed to generate user enrollment' });
    }
  },
};
