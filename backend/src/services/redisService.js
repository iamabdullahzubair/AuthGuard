import Redis from 'ioredis';
import EventEmitter from 'node:events';
import { config } from '../config/index.js';

const localEmitter = new EventEmitter();
const memoryCache = new Map();

let redisClient = null;
let redisPub = null;
let redisSub = null;
let isRedisAvailable = false;
let hasLoggedFailure = false;

// Initialize Redis if REDIS_URL is provided
if (config.REDIS_URL && process.env.NODE_ENV !== 'test') {
  try {
    const opts = {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 3) {
          return null; // Stop retrying after 3 attempts
        }
        return Math.min(times * 200, 2000);
      },
    };

    redisClient = new Redis(config.REDIS_URL, opts);
    redisPub = new Redis(config.REDIS_URL, opts);
    redisSub = new Redis(config.REDIS_URL, opts);

    const errorHandler = (err) => {
      isRedisAvailable = false;
      if (!hasLoggedFailure) {
        console.warn(`⚠️ [Redis] Unavailable (${err.message}). Using high-speed in-memory fallback.`);
        hasLoggedFailure = true;
      }
    };

    redisClient.on('error', errorHandler);
    redisPub.on('error', () => {});
    redisSub.on('error', () => {});

    redisClient.on('connect', () => {
      isRedisAvailable = true;
      hasLoggedFailure = false;
      console.log('⚡ [Redis] Connected successfully to Redis Cache');
    });

    // Attempt non-blocking connection
    redisClient.connect().catch(() => {
      isRedisAvailable = false;
    });
    redisPub.connect().catch(() => {});
    redisSub.connect().catch(() => {});

    // Setup Redis Pub/Sub dispatch to local EventEmitter
    redisSub.on('message', (channel, message) => {
      try {
        const parsed = JSON.parse(message);
        localEmitter.emit(channel, parsed);
      } catch {
        localEmitter.emit(channel, message);
      }
    });
  } catch (err) {
    isRedisAvailable = false;
    console.warn(`⚠️ [Redis] Initialization failed. Using in-memory fallback: ${err.message}`);
  }
}

/**
 * Check if Redis is connected and available
 * @returns {boolean}
 */
export function isRedisReady() {
  return isRedisAvailable && redisClient?.status === 'ready';
}

/**
 * Get cached value (from Redis or memory fallback)
 * @param {string} key
 * @returns {Promise<any|null>}
 */
export async function cacheGet(key) {
  if (isRedisReady()) {
    try {
      const data = await redisClient.get(key);
      if (data) {
        try {
          return JSON.parse(data);
        } catch {
          return data;
        }
      }
      return null;
    } catch {
      // Fallback on error
    }
  }

  // Memory fallback
  const item = memoryCache.get(key);
  if (!item) return null;
  if (item.expiresAt && Date.now() > item.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return item.value;
}

/**
 * Store value in cache with TTL in seconds
 * @param {string} key
 * @param {any} value
 * @param {number} [ttlSeconds=300]
 */
export async function cacheSet(key, value, ttlSeconds = 300) {
  if (isRedisReady()) {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await redisClient.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await redisClient.set(key, serialized);
      }
      return;
    } catch {
      // Fallback on error
    }
  }

  // Memory fallback
  memoryCache.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
}

/**
 * Delete cached key
 * @param {string} key
 */
export async function cacheDel(key) {
  if (isRedisReady()) {
    try {
      await redisClient.del(key);
    } catch {
      // Fallback on error
    }
  }
  memoryCache.delete(key);
}

/**
 * Publish an event to a channel
 * @param {string} channel
 * @param {any} data
 */
export async function publishEvent(channel, data) {
  // Always emit to local subscribers immediately
  localEmitter.emit(channel, data);

  // If Redis pub is available, also broadcast across nodes
  if (redisPub && redisPub.status === 'ready') {
    try {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      await redisPub.publish(channel, payload);
    } catch {
      // Ignored
    }
  }
}

/**
 * Subscribe to an event channel
 * @param {string} channel
 * @param {(data: any) => void} callback
 */
export function subscribeEvent(channel, callback) {
  localEmitter.on(channel, callback);

  if (redisSub && redisSub.status === 'ready') {
    redisSub.subscribe(channel).catch(() => {});
  }

  return () => {
    localEmitter.off(channel, callback);
  };
}

/**
 * Check and record a TOTP code as used (Anti-Replay Protection).
 * Returns true if fresh (allowed), false if already used (replay attack).
 * Uses Redis atomic SET NX with TTL (default 90s).
 * @param {string} userId
 * @param {string} code
 * @param {number} [ttlSeconds=90]
 * @returns {Promise<boolean>}
 */
export async function setAntiReplayCode(userId, code, ttlSeconds = 90) {
  const key = `used_totp:${userId}:${code}`;
  if (isRedisReady()) {
    try {
      const res = await redisClient.set(key, '1', 'EX', ttlSeconds, 'NX');
      return res === 'OK';
    } catch {
      // Fallback on connection error
    }
  }

  // High-speed In-Memory fallback
  const item = memoryCache.get(key);
  if (item && (!item.expiresAt || item.expiresAt > Date.now())) {
    return false;
  }
  memoryCache.set(key, { value: '1', expiresAt: Date.now() + ttlSeconds * 1000 });
  return true;
}

/**
 * Stores single-use temporary enrollment token in Redis with TTL (default 15 minutes / 900s)
 * @param {string} token
 * @param {object} data
 * @param {number} [ttlSeconds=900]
 */
export async function storeEnrollToken(token, data, ttlSeconds = 900) {
  const key = `enroll_token:${token}`;
  await cacheSet(key, data, ttlSeconds);
}

/**
 * Atomically retrieves and deletes a temporary enrollment token (Single-Use consumption)
 * @param {string} token
 * @returns {Promise<any|null>}
 */
export async function consumeEnrollToken(token) {
  const key = `enroll_token:${token}`;
  if (isRedisReady()) {
    try {
      if (typeof redisClient.getdel === 'function') {
        const raw = await redisClient.getdel(key);
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return raw; }
      }
      const raw = await redisClient.get(key);
      if (!raw) return null;
      await redisClient.del(key);
      try { return JSON.parse(raw); } catch { return raw; }
    } catch {
      // Fallback on error
    }
  }

  // In-Memory fallback
  const item = memoryCache.get(key);
  if (!item) return null;
  if (item.expiresAt && Date.now() > item.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  memoryCache.delete(key);
  return item.value;
}

/**
 * Stores an auth push challenge in Redis with a TTL (default 120s)
 * @param {string} challengeId
 * @param {object} data - { id, tenantId, endUserId, challengeNumber, decoys, status: 'pending', nonce, ipAddress, expiresAt, account }
 * @param {number} [ttlSeconds=120]
 */
export async function storeChallenge(challengeId, data, ttlSeconds = 120) {
  const key = `challenge:${challengeId}`;
  await cacheSet(key, data, ttlSeconds);
}

/**
 * Retrieves an auth push challenge from Redis
 * @param {string} challengeId
 * @returns {Promise<any|null>}
 */
export async function getChallenge(challengeId) {
  const key = `challenge:${challengeId}`;
  return await cacheGet(key);
}

/**
 * Updates status of an auth push challenge in Redis
 * Keeps key cached for an extra 60s so status pollers see final state
 * @param {string} challengeId
 * @param {string} status - 'approved' | 'denied' | 'expired'
 * @param {object} [extra] - extra fields (e.g. deviceId)
 * @returns {Promise<any|null>}
 */
export async function updateChallengeStatus(challengeId, status, extra = {}) {
  const key = `challenge:${challengeId}`;
  const existing = await cacheGet(key);
  if (!existing) return null;
  const updated = { ...existing, status, ...extra, updatedAt: new Date().toISOString() };
  await cacheSet(key, updated, 60);
  return updated;
}

export { redisClient };
