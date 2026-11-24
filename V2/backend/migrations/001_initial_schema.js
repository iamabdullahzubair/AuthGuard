export async function up(client) {
  await client.query(`
    CREATE TABLE tenants (
      id VARCHAR(64) PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
      tier TEXT NOT NULL DEFAULT 'enterprise',
      verification_mode TEXT NOT NULL DEFAULT 'number_choice',
      branding JSONB NOT NULL DEFAULT '{"issuerName":"AuthGuard","primaryColor":"#3b82f6"}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE tenant_members (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) REFERENCES tenants(id) ON DELETE CASCADE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE api_keys (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash CHAR(64) NOT NULL UNIQUE,
      environment TEXT NOT NULL DEFAULT 'live' CHECK (environment IN ('live', 'test')),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE tenant_webhooks (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      secret_ciphertext TEXT NOT NULL,
      secret_iv TEXT NOT NULL,
      secret_tag TEXT NOT NULL,
      custom_headers_ciphertext TEXT NOT NULL,
      custom_headers_iv TEXT NOT NULL,
      custom_headers_tag TEXT NOT NULL,
      events JSONB NOT NULL DEFAULT '["login.approved", "login.denied"]'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE end_users (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      external_id VARCHAR(128),
      email TEXT NOT NULL,
      two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, email)
    );

    CREATE TABLE end_user_totp (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      end_user_id VARCHAR(64) NOT NULL UNIQUE REFERENCES end_users(id) ON DELETE CASCADE,
      encrypted_secret TEXT NOT NULL,
      iv TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE end_user_devices (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      end_user_id VARCHAR(64) NOT NULL REFERENCES end_users(id) ON DELETE CASCADE,
      device_name TEXT NOT NULL,
      device_type TEXT NOT NULL DEFAULT 'pwa',
      push_subscription JSONB NOT NULL,
      public_key JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE audit_logs (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) REFERENCES tenants(id) ON DELETE SET NULL,
      user_id VARCHAR(64),
      event TEXT NOT NULL,
      ip_address INET,
      user_agent TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE webhook_outbox (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      event TEXT NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'dead')),
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ
    );

    CREATE TABLE tenant_webhook_deliveries (
      id VARCHAR(64) PRIMARY KEY,
      outbox_id VARCHAR(64) NOT NULL REFERENCES webhook_outbox(id) ON DELETE CASCADE,
      webhook_id VARCHAR(64) NOT NULL REFERENCES tenant_webhooks(id) ON DELETE CASCADE,
      attempt INTEGER NOT NULL CHECK (attempt > 0),
      response_status INTEGER,
      response_body TEXT,
      duration_ms INTEGER,
      error_code TEXT,
      success BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (outbox_id, webhook_id, attempt)
    );

    CREATE INDEX idx_members_tenant ON tenant_members(tenant_id);
    CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id);
    CREATE INDEX idx_webhooks_tenant_active ON tenant_webhooks(tenant_id, is_active);
    CREATE INDEX idx_end_users_tenant ON end_users(tenant_id);
    CREATE INDEX idx_devices_user_status ON end_user_devices(end_user_id, status);
    CREATE INDEX idx_audit_tenant_created ON audit_logs(tenant_id, created_at DESC);
    CREATE INDEX idx_outbox_ready ON webhook_outbox(available_at, created_at) WHERE status IN ('pending', 'processing');
    CREATE INDEX idx_deliveries_outbox ON tenant_webhook_deliveries(outbox_id, created_at DESC);
  `);
}
