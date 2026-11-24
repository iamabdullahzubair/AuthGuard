import Redis from 'ioredis';
import { env } from '../../config/env.js';

let sharedClient = null;
let sharedConnectPromise = null;

export function createRedisClient({ bullMq = false } = {}) {
  if (!env.V2_REDIS_URL) throw new Error('V2_REDIS_URL is required for Redis-backed V2 services');
  const client = new Redis(env.V2_REDIS_URL, {
    lazyConnect: true,
    enableReadyCheck: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: bullMq ? null : 1,
    connectTimeout: 3_000,
    retryStrategy: (attempt) => Math.min(attempt * 500, 10_000),
  });
  client.on('error', (error) => {
    console.error(`[v2 redis] ${error.message}`);
  });
  return client;
}

export function getRedisClient() {
  sharedClient ??= createRedisClient();
  return sharedClient;
}

export async function connectRedis() {
  const client = getRedisClient();
  if (client.status === 'ready') return client;
  if (!sharedConnectPromise) {
    sharedConnectPromise = client.connect().finally(() => {
      sharedConnectPromise = null;
    });
  }
  return sharedConnectPromise;
}

export async function closeRedis() {
  if (!sharedClient) return;
  const client = sharedClient;
  sharedClient = null;
  if (client.status === 'ready') await client.quit().catch(() => client.disconnect());
  else client.disconnect();
}

export async function runWithRedis(operation) {
  const client = getRedisClient();
  if (client.status !== 'ready') throw new Error('V2 Redis client is not connected');
  return operation(client);
}
