import pg from 'pg';
import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { hashPassword } from '../services/cryptoService.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (config.NODE_ENV === 'development' && duration > 500) {
    console.warn(`[DB Slow Query] ${duration}ms: ${text.slice(0, 80)}...`);
  }
  return res;
};

export const initDb = async () => {
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(742914123);');

      // 1. Tenants Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS tenants (
          id VARCHAR(64) PRIMARY KEY,
          name TEXT NOT NULL,
          slug VARCHAR(64) UNIQUE NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'active',
          tier VARCHAR(32) NOT NULL DEFAULT 'enterprise',
          branding JSONB DEFAULT '{"issuerName": "AuthGuard", "primaryColor": "#3b82f6"}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // 2. Tenant Members / Admins & Super Admins
      await client.query(`
        CREATE TABLE IF NOT EXISTS tenant_members (
          id VARCHAR(64) PRIMARY KEY,
          tenant_id VARCHAR(64) NULL REFERENCES tenants(id) ON DELETE CASCADE,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role VARCHAR(32) NOT NULL DEFAULT 'owner',
          is_super_admin BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // 3. API Keys (ag_live_..., ag_test_...)
      await client.query(`
        CREATE TABLE IF NOT EXISTS api_keys (
          id VARCHAR(64) PRIMARY KEY,
          tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          key_prefix VARCHAR(16) NOT NULL,
          key_hash VARCHAR(64) UNIQUE NOT NULL,
          environment VARCHAR(16) NOT NULL DEFAULT 'live',
          is_active BOOLEAN DEFAULT TRUE,
          last_used_at TIMESTAMPTZ NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // 4. Tenant Webhooks (Supports custom headers & events)
      await client.query(`
        CREATE TABLE IF NOT EXISTS tenant_webhooks (
          id VARCHAR(64) PRIMARY KEY,
          tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          url TEXT NOT NULL,
          secret VARCHAR(64) NOT NULL,
          custom_headers JSONB DEFAULT '{}'::jsonb,
          events JSONB DEFAULT '["login.approved", "login.denied"]'::jsonb,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // 5. Tenant Webhook Deliveries / Logs
      await client.query(`
        CREATE TABLE IF NOT EXISTS tenant_webhook_logs (
          id VARCHAR(64) PRIMARY KEY,
          tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          webhook_id VARCHAR(64) NOT NULL REFERENCES tenant_webhooks(id) ON DELETE CASCADE,
          event VARCHAR(64) NOT NULL,
          payload JSONB NOT NULL,
          response_status INTEGER NULL,
          response_body TEXT NULL,
          duration_ms INTEGER NULL,
          success BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // 6. End Users (Belonging to specific tenant)
      await client.query(`
        CREATE TABLE IF NOT EXISTS end_users (
          id VARCHAR(64) PRIMARY KEY,
          tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          external_id VARCHAR(128) NULL,
          email TEXT NOT NULL,
          two_factor_enabled BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          CONSTRAINT uq_tenant_end_user UNIQUE(tenant_id, email)
        );
      `);

      // 7. End User TOTP Secrets (Encrypted at rest with AES-256-GCM)
      await client.query(`
        CREATE TABLE IF NOT EXISTS end_user_totp (
          id VARCHAR(64) PRIMARY KEY,
          tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          end_user_id VARCHAR(64) UNIQUE NOT NULL REFERENCES end_users(id) ON DELETE CASCADE,
          encrypted_secret TEXT NOT NULL,
          iv TEXT NOT NULL,
          tag TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // 8. End User Devices (PWA / Mobile Native)
      await client.query(`
        CREATE TABLE IF NOT EXISTS end_user_devices (
          id VARCHAR(64) PRIMARY KEY,
          tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          end_user_id VARCHAR(64) NOT NULL REFERENCES end_users(id) ON DELETE CASCADE,
          device_name TEXT NOT NULL,
          device_type VARCHAR(32) NOT NULL DEFAULT 'pwa',
          push_subscription JSONB NOT NULL,
          public_key JSONB NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'active',
          last_used_at TIMESTAMPTZ NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // 9. Audit Logs (Security event logging)
      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id VARCHAR(64) PRIMARY KEY,
          tenant_id VARCHAR(64) NULL REFERENCES tenants(id) ON DELETE CASCADE,
          user_id VARCHAR(64) NULL,
          event VARCHAR(64) NOT NULL,
          ip_address VARCHAR(64) NULL,
          user_agent TEXT NULL,
          metadata JSONB NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // Indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant ON tenant_members(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_tenant_members_email ON tenant_members(email);
        CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
        CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_tenant_webhooks_tenant ON tenant_webhooks(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_end_users_tenant ON end_users(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_end_user_devices_user ON end_user_devices(end_user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
      `);

      // Seed Super Admin from Environment Config
      const adminEmail = (config.SUPER_ADMIN_EMAIL || 'iamabdullahzubair@gmail.com').toLowerCase().trim();
      const adminPassword = config.SUPER_ADMIN_PASSWORD || 'Admin123!Secure';

      const superAdminCheck = await client.query(
        `SELECT id FROM tenant_members WHERE email = $1`,
        [adminEmail]
      );
      if (superAdminCheck.rows.length === 0) {
        const systemTenantId = 'tenant_system_default';
        await client.query(`
          INSERT INTO tenants (id, name, slug, status, tier, branding)
          VALUES ($1, 'AuthGuard Platform', 'authguard-admin', 'active', 'super_admin', '{"issuerName": "AuthGuard Super Admin", "primaryColor": "#6366f1"}')
          ON CONFLICT (id) DO NOTHING
        `, [systemTenantId]);

        const defaultHash = await hashPassword(adminPassword);
        await client.query(`
          INSERT INTO tenant_members (id, tenant_id, email, password_hash, role, is_super_admin)
          VALUES ($1, $2, $3, $4, 'super_admin', true)
        `, [crypto.randomUUID(), systemTenantId, adminEmail, defaultHash]);
        console.log(`[DB] Seeded Super Admin: ${adminEmail}`);
      } else if (process.env.SUPER_ADMIN_PASSWORD) {
        const updatedHash = await hashPassword(adminPassword);
        await client.query(
          `UPDATE tenant_members SET password_hash = $1 WHERE email = $2 AND is_super_admin = true`,
          [updatedHash, adminEmail]
        );
      }

      await client.query('COMMIT');
      console.log('PostgreSQL database schema initialized successfully (Multi-tenant tables active)');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Failed to initialize PostgreSQL schema:', err.message);
    throw err;
  }
};
