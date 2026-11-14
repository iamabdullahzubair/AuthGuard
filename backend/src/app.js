import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { globalLimiter } from './middleware/rateLimiter.js';
import authRoutes from './routes/authRoutes.js';
import enrollRoutes from './routes/enrollRoutes.js';
import loginRoutes from './routes/loginRoutes.js';
import deviceRoutes from './routes/deviceRoutes.js';
import vapidRoutes from './routes/vapidRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import apiV1Routes from './routes/apiV1Routes.js';
import tenantRoutes from './routes/tenantRoutes.js';
import superAdminRoutes from './routes/superAdminRoutes.js';
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

// High-Fidelity Request Logger (Dispatches to Console, Disk File, and Super Admin Live Stream)
app.use((req, res, next) => {
  // Ignore noisy health checks and the SSE log stream itself from logging loops
  if (req.path === '/api/health' || req.path === '/api/super-admin/logs/stream') {
    return next();
  }

  const start = Date.now();
  const clientIp =
    req.headers['cf-connecting-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket.remoteAddress ||
    '127.0.0.1';

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

    broadcastLog({
      level,
      category,
      message: `${req.method.padEnd(6)} ${fullPath} -> ${statusCode} (${duration}ms) [ip: ${clientIp}]`,
      metadata: {
        method: req.method,
        path: req.path,
        query: req.query,
        statusCode,
        durationMs: duration,
        ip: clientIp,
        userAgent: req.headers['user-agent']?.slice(0, 150) || null,
      },
    });
  });

  next();
});

// REST API Routes
app.use('/api/auth', authRoutes);
app.use('/api/enroll', enrollRoutes);
app.use('/api/login', loginRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/vapid-public-key', vapidRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/v1/tenants/:tenantId', apiV1Routes);
app.use('/api/v1', apiV1Routes);
app.use('/api/tenant', tenantRoutes);
app.use('/api/super-admin', superAdminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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
