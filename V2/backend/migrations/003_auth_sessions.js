export async function up(client) {
  await client.query(`
    CREATE UNIQUE INDEX uq_tenant_members_one_super_admin
      ON tenant_members (is_super_admin) WHERE is_super_admin = true;

    CREATE UNIQUE INDEX uq_tenant_members_email_lower
      ON tenant_members (lower(email));

    CREATE UNIQUE INDEX uq_tenants_slug_lower
      ON tenants (lower(slug));

    CREATE TABLE auth_sessions (
      id VARCHAR(64) PRIMARY KEY,
      member_id VARCHAR(64) NOT NULL REFERENCES tenant_members(id) ON DELETE CASCADE,
      token_hash CHAR(64) NOT NULL UNIQUE,
      impersonation_tenant_id VARCHAR(64) REFERENCES tenants(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ,
      ip_address INET,
      user_agent TEXT
    );

    CREATE INDEX idx_auth_sessions_member_active
      ON auth_sessions(member_id, expires_at DESC) WHERE revoked_at IS NULL;

  `);
}
