export async function up(client) {
  await client.query(`
    ALTER TABLE webhook_outbox
      ADD COLUMN locked_until TIMESTAMPTZ,
      ADD COLUMN last_error TEXT;

    CREATE TABLE webhook_delivery_jobs (
      id VARCHAR(64) PRIMARY KEY,
      outbox_id VARCHAR(64) NOT NULL REFERENCES webhook_outbox(id) ON DELETE CASCADE,
      webhook_id VARCHAR(64) NOT NULL REFERENCES tenant_webhooks(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'publishing', 'queued', 'processing', 'retrying', 'completed', 'dead')),
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      locked_until TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (outbox_id, webhook_id)
    );

    CREATE INDEX idx_webhook_jobs_ready
      ON webhook_delivery_jobs(available_at, created_at)
      WHERE status IN ('pending', 'publishing', 'queued', 'processing', 'retrying');
  `);
}
