import { Queue } from 'bullmq';
import { pool } from '../db/pool.js';
import { createRedisConnection, webhookJobOptions, webhookQueueName } from '../modules/webhooks/webhookQueue.js';
import {
  claimDeliveryJobForQueue,
  claimOutboxEvent,
  failOutboxEvent,
  fanOutOutboxEvent,
  findStaleQueuedDeliveries,
  markDeliveryQueued,
  releaseDeliveryForRepublish,
  returnMissingQueueJobToPending,
} from '../modules/webhooks/webhookRepository.js';

const redis = createRedisConnection();
const queue = new Queue(webhookQueueName, { connection: redis });
let stopping = false;

async function relayOutbox() {
  const event = await claimOutboxEvent();
  if (!event) return false;
  try {
    await fanOutOutboxEvent(event);
  } catch (error) {
    console.error(`[v2 webhook relay] event fan-out failed (${event.id}): ${error.message}`);
    await failOutboxEvent(event, error);
  }
  return true;
}

async function publishDelivery() {
  const delivery = await claimDeliveryJobForQueue();
  if (!delivery) return false;
  try {
    await queue.add('deliver-webhook', { deliveryId: delivery.id }, webhookJobOptions(delivery.id));
    await markDeliveryQueued(delivery.id);
  } catch (error) {
    console.error(`[v2 webhook relay] queue publish failed (${delivery.id}): ${error.message}`);
    await releaseDeliveryForRepublish(delivery.id, error);
  }
  return true;
}

async function reconcileMissingJobs() {
  const stale = await findStaleQueuedDeliveries();
  for (const { id } of stale) {
    const job = await queue.getJob(id);
    if (!job) await returnMissingQueueJobToPending(id);
  }
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[v2 webhook relay] received ${signal}; stopping`);
  await queue.close();
  await redis.quit();
  await pool.end();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

let lastReconcile = 0;
try {
  console.log(`[v2 webhook relay] started for queue ${webhookQueueName}`);
  while (!stopping) {
    const fannedOut = await relayOutbox();
    const published = await publishDelivery();
    if (Date.now() - lastReconcile > 30_000) {
      await reconcileMissingJobs();
      lastReconcile = Date.now();
    }
    if (!fannedOut && !published) await new Promise((resolve) => setTimeout(resolve, 750));
  }
} catch (error) {
  console.error('[v2 webhook relay] stopped after an error', error);
  process.exitCode = 1;
  await queue.close().catch(() => {});
  await redis.quit().catch(() => {});
  await pool.end();
}
