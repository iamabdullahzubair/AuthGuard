export async function up(client) {
  await client.query(`
    ALTER TABLE audit_logs
      ADD COLUMN IF NOT EXISTS actor_email TEXT,
      ADD COLUMN IF NOT EXISTS actor_role TEXT,
      ADD COLUMN IF NOT EXISTS actor_is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS target_member_id VARCHAR(64),
      ADD COLUMN IF NOT EXISTS target_email TEXT,
      ADD COLUMN IF NOT EXISTS session_id VARCHAR(64),
      ADD COLUMN IF NOT EXISTS request_id TEXT,
      ADD COLUMN IF NOT EXISTS impersonated_tenant_id VARCHAR(64),
      ADD COLUMN IF NOT EXISTS outcome TEXT NOT NULL DEFAULT 'success';

    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_actor_created ON audit_logs(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_target_created ON audit_logs(target_member_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_event_created ON audit_logs(event, created_at DESC);
  `);
}
