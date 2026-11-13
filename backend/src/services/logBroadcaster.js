import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import EventEmitter from 'node:events';
import { fileURLToPath } from 'node:url';
import { publishEvent, subscribeEvent, isRedisReady } from './redisService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.resolve(__dirname, '../../logs');
const logFilePath = path.join(logsDir, 'app.log');

const logEmitter = new EventEmitter();
const MAX_IN_MEMORY_LOGS = 200;
const logBuffer = [];

// Initialize persistent log file stream
let fileStream = null;
try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  fileStream = fs.createWriteStream(logFilePath, { flags: 'a', encoding: 'utf8' });
} catch (err) {
  // Graceful fallback if filesystem is read-only
  console.warn(`[LogBroadcaster] File logging disabled: ${err.message}`);
}

// ANSI colors for clean backend console logs
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
};

function formatConsoleLog(entry) {
  const time = entry.timestamp.replace('T', ' ').slice(0, 19);
  let color = colors.cyan;
  if (entry.level === 'AUTH') color = colors.green;
  else if (entry.level === 'PUSH') color = colors.magenta;
  else if (entry.level === 'SECURITY') color = colors.yellow;
  else if (entry.level === 'WARN') color = colors.yellow;
  else if (entry.level === 'ERROR') color = colors.red + colors.bold;

  const lvl = entry.level.padEnd(8);
  const cat = `[${entry.category}]`.padEnd(9);
  return `${colors.dim}[${time}]${colors.reset} ${color}${lvl}${colors.reset} ${colors.dim}${cat}${colors.reset} ${entry.message}`;
}

// Subscribe to distributed Redis events if Redis is active
subscribeEvent('authguard:logs', (entry) => {
  if (entry && entry.id) {
    const exists = logBuffer.some(l => l.id === entry.id);
    if (!exists) {
      logBuffer.push(entry);
      if (logBuffer.length > MAX_IN_MEMORY_LOGS) {
        logBuffer.shift();
      }
      logEmitter.emit('log', entry);
    }
  }
});

/**
 * Broadcast a live system log to Super Admin dashboard, write to persistent disk file, and format console
 * @param {object} param0
 * @param {'INFO'|'WARN'|'ERROR'|'AUTH'|'PUSH'|'SECURITY'} [param0.level='INFO']
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
    delete cleanMeta.signature;
  }

  const entry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    level: String(level).toUpperCase(),
    category: String(category).toLowerCase(),
    message: String(message),
    metadata: cleanMeta,
  };

  // 1. In-memory circular buffer for instant Super Admin UI retrieval
  logBuffer.push(entry);
  if (logBuffer.length > MAX_IN_MEMORY_LOGS) {
    logBuffer.shift();
  }

  // 2. Persistent file logging (app.log)
  if (fileStream) {
    try {
      fileStream.write(JSON.stringify(entry) + '\n');
    } catch {
      // Ignored
    }
  }

  // 3. Clean, informative console log for docker compose logs / npm dev
  if (process.env.NODE_ENV !== 'test') {
    console.log(formatConsoleLog(entry));
  }

  // 4. SSE real-time broadcast to connected Super Admin browsers
  logEmitter.emit('log', entry);

  // 5. Distributed Redis Pub/Sub broadcast across cluster instances
  publishEvent('authguard:logs', entry).catch(() => {});

  return entry;
}

/**
 * Get recent logs from in-memory circular buffer
 * @param {number} [limit=100]
 * @returns {Array<object>}
 */
export function getRecentLogs(limit = 100) {
  return logBuffer.slice(-Math.min(limit, MAX_IN_MEMORY_LOGS));
}

/**
 * Subscribe to new logs via EventEmitter
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
    logFilePath,
  };
}
