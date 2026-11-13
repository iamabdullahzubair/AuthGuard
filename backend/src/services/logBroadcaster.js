import crypto from 'node:crypto';
import EventEmitter from 'node:events';
import { publishEvent, subscribeEvent, isRedisReady } from './redisService.js';

const logEmitter = new EventEmitter();
const MAX_LOGS = 200;
const logBuffer = [];

// Subscribe to distributed Redis events if Redis is active
subscribeEvent('authguard:logs', (entry) => {
  // If entry came from another instance, add to local buffer and notify SSE listeners
  if (entry && entry.id) {
    const exists = logBuffer.some(l => l.id === entry.id);
    if (!exists) {
      logBuffer.push(entry);
      if (logBuffer.length > MAX_LOGS) {
        logBuffer.shift();
      }
      logEmitter.emit('log', entry);
    }
  }
});

/**
 * Broadcast a live system log to Super Admin dashboard
 * @param {object} param0
 * @param {'INFO'|'WARN'|'ERROR'|'AUTH'|'PUSH'|'SECURITY'} param0.level
 * @param {'api'|'auth'|'push'|'tenant'|'audit'|'system'} [param0.category='system']
 * @param {string} param0.message
 * @param {object} [param0.metadata]
 */
export function broadcastLog({ level = 'INFO', category = 'system', message, metadata = null }) {
  const cleanMeta = metadata ? { ...metadata } : null;
  if (cleanMeta) {
    delete cleanMeta.password;
    delete cleanMeta.secret;
    delete cleanMeta.token;
    delete cleanMeta.privateKey;
  }

  const entry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    level: String(level).toUpperCase(),
    category: String(category).toLowerCase(),
    message: String(message),
    metadata: cleanMeta,
  };

  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOGS) {
    logBuffer.shift();
  }

  // Emit to local SSE listeners
  logEmitter.emit('log', entry);

  // Broadcast to other cluster nodes via Redis Pub/Sub
  publishEvent('authguard:logs', entry).catch(() => {});

  return entry;
}

/**
 * Get recent logs from buffer
 * @param {number} [limit=100]
 * @returns {Array<object>}
 */
export function getRecentLogs(limit = 100) {
  return logBuffer.slice(-Math.min(limit, MAX_LOGS));
}

/**
 * Subscribe to new logs
 * @param {(entry: object) => void} listener
 * @returns {() => void} Unsubscribe function
 */
export function onLog(listener) {
  logEmitter.on('log', listener);
  return () => {
    logEmitter.off('log', listener);
  };
}

/**
 * Super Admin system stats helper
 */
export function getLogStreamStats() {
  return {
    bufferedLogs: logBuffer.length,
    activeSubscribers: logEmitter.listenerCount('log'),
    redisConnected: isRedisReady(),
  };
}
