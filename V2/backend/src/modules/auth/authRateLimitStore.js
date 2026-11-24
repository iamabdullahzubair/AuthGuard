import crypto from 'node:crypto';
import { runWithRedis } from '../../infra/redis/redisClient.js';

const incrementWithExpiry = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
  return count
`;

export class AuthRateLimitStoreError extends Error {
  constructor(cause) {
    super('Authentication rate limiting is temporarily unavailable');
    this.status = 503;
    this.cause = cause;
  }
}

async function runRedis(operation) {
  try {
    return await runWithRedis(operation);
  } catch (error) {
    if (error instanceof AuthRateLimitStoreError) throw error;
    throw new AuthRateLimitStoreError(error);
  }
}

function redisKey(keyHash) {
  return `auth:v2:rate-limit:${keyHash}`;
}

export function makeRateLimitKey(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function isRateLimited(keyHash, limit) {
  return runRedis(async (redis) => {
    const count = Number(await redis.get(redisKey(keyHash)) || 0);
    return count >= limit;
  });
}

export async function recordFailedAttempt(keyHash, windowSeconds) {
  return runRedis((redis) => redis.eval(incrementWithExpiry, 1, redisKey(keyHash), windowSeconds));
}

export async function consumeAttempt(keyHash, windowSeconds) {
  return runRedis((redis) => redis.eval(incrementWithExpiry, 1, redisKey(keyHash), windowSeconds));
}

export async function clearRateLimit(keyHash) {
  return runRedis((redis) => redis.del(redisKey(keyHash)));
}

