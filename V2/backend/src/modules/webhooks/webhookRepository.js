import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';

const MAX_OUTBOX_ATTEMPTS = 12;

export async function enqueueWebhookEvent(client, { tenantId, event, data }) {
  const id = crypto.randomUUID();
  await client.query(
    `INSERT INTO webhook_outbox (id, tenant_id, event, payload)
     VALUES ($1, $2, $3, $4)`,
    [id, tenantId, event, JSON.stringify({ data })]
  );
  return id;
}

export async function claimOutboxEvent() {
  const result = await pool.query(`
    WITH candidate AS (
      SELECT id FROM webhook_outbox
      WHERE (status = 'pending' AND available_at <= NOW())
         OR (status = 'processing' AND locked_until < NOW())
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE webhook_outbox AS event
       SET status = 'processing', locked_until = NOW() + INTERVAL '60 seconds'
      FROM candidate
     WHERE event.id = candidate.id
    RETURNING event.*
  `);
  return result.rows[0] || null;
}

export async function fanOutOutboxEvent(eventRow) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hooks = await client.query(
      `SELECT id FROM tenant_webhooks
       WHERE tenant_id = $1 AND is_active = true AND events @> $2::jsonb`,
      [eventRow.tenant_id, JSON.stringify([eventRow.event])]
    );
    for (const hook of hooks.rows) {
      await client.query(
        `INSERT INTO webhook_delivery_jobs (id, outbox_id, webhook_id)
         VALUES ($1, $2, $3) ON CONFLICT (outbox_id, webhook_id) DO NOTHING`,
        [crypto.randomUUID(), eventRow.id, hook.id]
      );
    }
    await client.query(
      `UPDATE webhook_outbox SET status = 'completed', locked_until = NULL,
         processed_at = NOW(), last_error = NULL WHERE id = $1`,
      [eventRow.id]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function failOutboxEvent(eventRow, error) {
  const attempts = eventRow.attempts + 1;
  const dead = attempts >= MAX_OUTBOX_ATTEMPTS;
  const delaySeconds = Math.min(2 ** attempts, 3600);
  await pool.query(
    `UPDATE webhook_outbox
        SET attempts = $2, status = $3, locked_until = NULL,
            available_at = NOW() + ($4 * INTERVAL '1 second'), last_error = $5
      WHERE id = $1`,
    [eventRow.id, attempts, dead ? 'dead' : 'pending', delaySeconds, String(error.message).slice(0, 500)]
  );
}

export async function claimDeliveryJobForQueue() {
  const result = await pool.query(`
    WITH candidate AS (
      SELECT id FROM webhook_delivery_jobs
      WHERE (status = 'pending' AND available_at <= NOW())
         OR (status = 'publishing' AND locked_until < NOW())
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE webhook_delivery_jobs AS job
       SET status = 'publishing', locked_until = NOW() + INTERVAL '60 seconds', updated_at = NOW()
      FROM candidate
     WHERE job.id = candidate.id
    RETURNING job.*
  `);
  return result.rows[0] || null;
}

export async function markDeliveryQueued(id) {
  await pool.query(
    `UPDATE webhook_delivery_jobs SET status = 'queued', locked_until = NULL,
       last_error = NULL, updated_at = NOW() WHERE id = $1 AND status = 'publishing'`, [id]
  );
}

export async function releaseDeliveryForRepublish(id, error) {
  await pool.query(
    `UPDATE webhook_delivery_jobs SET status = 'pending', locked_until = NULL,
       available_at = NOW() + INTERVAL '5 seconds', last_error = $2, updated_at = NOW()
      WHERE id = $1 AND status = 'publishing'`,
    [id, String(error.message).slice(0, 500)]
  );
}

export async function findStaleQueuedDeliveries() {
  const result = await pool.query(
    `SELECT id FROM webhook_delivery_jobs
      WHERE status IN ('queued', 'processing', 'retrying')
        AND updated_at < NOW() - INTERVAL '2 minutes'
      ORDER BY updated_at LIMIT 100`
  );
  return result.rows;
}

export async function returnMissingQueueJobToPending(id) {
  await pool.query(
    `UPDATE webhook_delivery_jobs SET status = 'pending', updated_at = NOW(),
       last_error = 'Queue job was missing; scheduled for republish'
      WHERE id = $1 AND status IN ('queued', 'processing', 'retrying')`, [id]
  );
}

export async function loadDeliveryContext(id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const claimed = await client.query(
      `UPDATE webhook_delivery_jobs SET status = 'processing', attempts = attempts + 1,
         updated_at = NOW() WHERE id = $1 AND status NOT IN ('completed', 'dead') RETURNING *`, [id]
    );
    if (!claimed.rows[0]) {
      await client.query('COMMIT');
      return null;
    }
    const result = await client.query(
      `SELECT job.*, event.tenant_id, event.event, event.payload,
              hook.url, hook.secret_ciphertext, hook.secret_iv, hook.secret_tag,
              hook.custom_headers_ciphertext, hook.custom_headers_iv, hook.custom_headers_tag
         FROM webhook_delivery_jobs job
         JOIN webhook_outbox event ON event.id = job.outbox_id
         JOIN tenant_webhooks hook ON hook.id = job.webhook_id
        WHERE job.id = $1 AND hook.is_active = true`, [id]
    );
    await client.query('COMMIT');
    return result.rows[0] || null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function markDeliverySkipped(id) {
  await pool.query(
    `UPDATE webhook_delivery_jobs SET status = 'completed', locked_until = NULL,
       last_error = NULL, updated_at = NOW() WHERE id = $1 AND status = 'processing'`, [id]
  );
}

async function recordAttempt(client, context, response, error = null) {
  await client.query(
    `INSERT INTO tenant_webhook_deliveries
       (id, outbox_id, webhook_id, attempt, response_status, response_body, duration_ms, error_code, success)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (outbox_id, webhook_id, attempt) DO NOTHING`,
    [crypto.randomUUID(), context.outbox_id, context.webhook_id, context.attempts,
      response?.status ?? null, response?.body?.slice(0, 4096) ?? null,
      response?.durationMs ?? null, error ? String(error.message).slice(0, 100) : null, !error]
  );
}

export async function recordSuccessfulDelivery(context, response) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await recordAttempt(client, context, response);
    await client.query(
      `UPDATE webhook_delivery_jobs SET status = 'completed', locked_until = NULL,
         last_error = NULL, updated_at = NOW() WHERE id = $1`, [context.id]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function recordFailedDelivery(context, error, response, terminal) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await recordAttempt(client, context, response, error);
    await client.query(
      `UPDATE webhook_delivery_jobs SET status = $2, locked_until = NULL,
         last_error = $3, updated_at = NOW() WHERE id = $1`,
      [context.id, terminal ? 'dead' : 'retrying', String(error.message).slice(0, 500)]
    );
    await client.query('COMMIT');
  } catch (dbError) {
    await client.query('ROLLBACK');
    throw dbError;
  } finally {
    client.release();
  }
}

export async function markDeliveryDead(id, error) {
  await pool.query(
    `UPDATE webhook_delivery_jobs SET status = 'dead', locked_until = NULL,
       last_error = $2, updated_at = NOW() WHERE id = $1 AND status <> 'completed'`,
    [id, String(error.message).slice(0, 500)]
  );
}
