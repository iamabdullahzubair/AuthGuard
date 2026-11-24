import crypto from 'node:crypto';
import { UnrecoverableError, Worker } from 'bullmq';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { decryptWebhookValue } from '../modules/webhooks/webhookCrypto.js';
import { createRedisConnection, webhookQueueName } from '../modules/webhooks/webhookQueue.js';
import {
  loadDeliveryContext,
  markDeliveryDead,
  markDeliverySkipped,
  recordFailedDelivery,
  recordSuccessfulDelivery,
} from '../modules/webhooks/webhookRepository.js';
import { postWebhook } from '../modules/webhooks/webhookTransport.js';

function buildHeaders(customHeaders, secret, payload, event, tenantId, timestamp, eventId) {
  const reserved = new Set([
    'content-type', 'user-agent', 'x-authguard-signature', 'x-authguard-event',
    'x-authguard-tenant', 'x-authguard-timestamp', 'x-authguard-event-id', 'idempotency-key',
    'host', 'content-length', 'connection', 'transfer-encoding',
  ]);
  const safeCustomHeaders = Object.fromEntries(
    Object.entries(customHeaders).filter(([name]) => !reserved.has(name.toLowerCase()))
  );
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return {
    ...safeCustomHeaders,
    'Content-Type': 'application/json',
    'User-Agent': 'AuthGuard-Webhook-Dispatcher/2.0',
    'X-AuthGuard-Signature': `sha256=${signature}`,
    'X-AuthGuard-Event': event,
    'X-AuthGuard-Tenant': tenantId,
    'X-AuthGuard-Timestamp': timestamp,
    'X-AuthGuard-Event-Id': eventId,
    'Idempotency-Key': eventId,
  };
}

async function deliver(job) {
  const context = await loadDeliveryContext(job.data.deliveryId);
  if (!context) {
    await markDeliverySkipped(job.data.deliveryId);
    return;
  }

  const startedAt = Date.now();
  let response;
  try {
    const secret = decryptWebhookValue({
      ciphertext: context.secret_ciphertext,
      iv: context.secret_iv,
      tag: context.secret_tag,
    });
    const customHeadersText = decryptWebhookValue({
      ciphertext: context.custom_headers_ciphertext,
      iv: context.custom_headers_iv,
      tag: context.custom_headers_tag,
    });
    const timestamp = new Date().toISOString();
    const payload = JSON.stringify({
      id: context.outbox_id,
      event: context.event,
      tenantId: context.tenant_id,
      timestamp,
      data: context.payload.data,
    });
    const headers = buildHeaders(
      JSON.parse(customHeadersText), secret, payload, context.event, context.tenant_id, timestamp, context.outbox_id
    );
    response = await postWebhook(context.url, headers, payload);
    response.durationMs = Date.now() - startedAt;
    if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
  } catch (caught) {
    const error = caught instanceof Error ? caught : new Error(String(caught));
    response ??= { durationMs: Date.now() - startedAt };
    const retryable = response.status == null || [408, 425, 429].includes(response.status) || response.status >= 500;
    const configuredAttempts = Number(job.opts.attempts || 1);
    const terminal = !retryable || context.attempts >= configuredAttempts;
    await recordFailedDelivery(context, error, response, terminal);
    console.error(`[v2 webhook worker] delivery failed (${context.id}, attempt ${context.attempts}): ${error.message}`);
    if (terminal) throw new UnrecoverableError(error.message);
    throw error;
  }
  await recordSuccessfulDelivery(context, response);
}

const redis = createRedisConnection();
const worker = new Worker(webhookQueueName, deliver, {
  connection: redis,
  concurrency: env.V2_WEBHOOK_WORKER_CONCURRENCY,
  maxStalledCount: 2,
});
let stopping = false;

worker.on('ready', () => console.log(`[v2 webhook worker] ready with concurrency ${env.V2_WEBHOOK_WORKER_CONCURRENCY}`));
worker.on('error', (error) => console.error('[v2 webhook worker] queue error', error));
worker.on('failed', async (job, error) => {
  if (!job) return;
  console.error(`[v2 webhook worker] BullMQ job failed (${job.id}): ${error.message}`);
  if (job.attemptsMade >= Number(job.opts.attempts || 1)) {
    await markDeliveryDead(job.data.deliveryId, error).catch((dbError) => {
      console.error('[v2 webhook worker] could not mark final failure', dbError.message);
    });
  }
});

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[v2 webhook worker] received ${signal}; draining active jobs`);
  await worker.close();
  await redis.quit();
  await pool.end();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

worker.waitUntilReady().catch(async (error) => {
  console.error('[v2 webhook worker] failed to connect', error);
  process.exitCode = 1;
  await worker.close().catch(() => {});
  await redis.quit().catch(() => {});
  await pool.end();
});
