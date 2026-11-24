import { createRedisClient } from '../../infra/redis/redisClient.js';

export const webhookQueueName = 'authguard-webhook-delivery-v2';

export const createRedisConnection = () => createRedisClient({ bullMq: true });

export const webhookJobOptions = (deliveryId) => ({
  jobId: deliveryId,
  attempts: 12,
  backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: { age: 86_400, count: 5_000 },
  removeOnFail: { age: 604_800, count: 10_000 },
});
