import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { globalLimiter } from './middleware/rateLimiter.js';
import apiRoutes from './routes/index.js';
import { broadcastLog } from './services/logBroadcaster.js';

const app = express();

// Trust reverse proxy headers (Nginx, AWS ALB, Cloudflare)
app.set('trust proxy', true);

// Standard API Security Headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS configuration (Allows frontend, local dev, and customer portals)
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Body and Cookie Parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(globalLimiter);

// Helper to recursively sanitize sensitive keys before logging or broadcasting
function sanitizeData(data, depth = 0) {
  if (!data || depth > 3) return data;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(item => sanitizeData(item, depth + 1));
  
  const sanitized = {};
  const sensitiveKeys = ['password', 'secret', 'token', 'privatekey', 'signature', 'authorization', 'cookie'];
  for (const [key, value] of Object.entries(data)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      sanitized[key] = '***';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeData(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// High-Fidelity Request Logger (Dispatches to Console, Disk File, and Super Admin Live Stream)
app.use((req, res, next) => {
  // Ignore noisy health checks and any /logs endpoints (stream and REST polling) to prevent self-logging feedback loops
  if (
    req.path === '/api/health' ||
    req.path?.includes('/logs') ||
    req.originalUrl?.includes('/logs')
  ) {
    return next();
  }

  const start = Date.now();
  const clientIp =
    req.headers['cf-connecting-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket.remoteAddress ||
    '127.0.0.1';

  // Intercept response payload to capture error messages and responses
  let capturedBody = null;
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    capturedBody = body;
    return originalJson(body);
  };

  const originalSend = res.send.bind(res);
  res.send = (body) => {
    if (!capturedBody && typeof body === 'string') {
      try {
        capturedBody = JSON.parse(body);
      } catch {
        capturedBody = body.length > 500 ? body.slice(0, 500) + '...' : body;
      }
    }
    return originalSend(body);
  };

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const isError = statusCode >= 400;
    const isAuth =
      req.path.includes('/auth') ||
      req.path.includes('/login') ||
      req.path.includes('/enroll') ||
      req.path.includes('/tenant');

    const level = statusCode >= 500 ? 'ERROR' : isError ? 'WARN' : isAuth ? 'AUTH' : 'INFO';
    const category = isAuth ? 'auth' : 'api';
    const queryStr = Object.keys(req.query).length > 0 ? `?${new URLSearchParams(req.query).toString()}` : '';
    const fullPath = `${req.path}${queryStr}`;

    // Extract human-readable failure reason if returned in response payload
    let errorReason = null;
    if (isError && capturedBody) {
      if (typeof capturedBody === 'object' && capturedBody !== null) {
        errorReason = capturedBody.error || capturedBody.message || capturedBody.detail || null;
      } else if (typeof capturedBody === 'string') {
        errorReason = capturedBody;
      }
    }

    const errorSuffix = errorReason ? ` [Failure: ${errorReason}]` : '';
    const message = `${req.method.padEnd(6)} ${fullPath} -> ${statusCode}${errorSuffix} (${duration}ms) [ip: ${clientIp}]`;

    broadcastLog({
      level,
      category,
      message,
      metadata: {
        method: req.method,
        path: req.path,
        query: req.query,
        statusCode,
        durationMs: duration,
        ip: clientIp,
        userAgent: req.headers['user-agent']?.slice(0, 150) || null,
        errorReason: errorReason || null,
        requestBody: req.body ? sanitizeData(req.body) : null,
        responseBody: capturedBody ? sanitizeData(capturedBody) : null,
      },
    });
  });

  next();
});

// Health check endpoint (Mounted before apiRoutes so wildcard /:id does not intercept it)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Central API Router (All modular routes aggregated under /api)
app.use('/api', apiRoutes);

// Centralized 404 handler for unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err);

  broadcastLog({
    level: 'ERROR',
    category: 'system',
    message: `Unhandled Error: ${err.message || 'Internal Server Error'} on ${req.method} ${req.path}`,
    metadata: { error: err.message, stack: err.stack, path: req.path },
  });

  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error',
  });
});

export default app;
