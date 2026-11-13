import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust reverse proxy headers (localtunnel, ngrok, cloudflare)
app.set('trust proxy', true);

// Security Headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'http:', 'https:', 'ws:', 'wss:'],
        workerSrc: ["'self'", 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration
app.use(
  cors({
    origin: true, // Allow requesting origin (localhost, tunnel, etc.)
    credentials: true,
  })
);

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(globalLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/enroll', enrollRoutes);
app.use('/api/login', loginRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/vapid-public-key', vapidRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/v1', apiV1Routes);
app.use('/api/tenant', tenantRoutes);
app.use('/api/super-admin', superAdminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Centralized 404 handler for API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error',
  });
});

export default app;

