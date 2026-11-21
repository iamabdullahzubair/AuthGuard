import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';

// General API rate limiter
export const globalLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.NODE_ENV === 'test' ? 10000 : config.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { error: 'Too many requests, please try again later.' },
});

// Strict rate limiter for auth / login / TOTP verification endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.NODE_ENV === 'development' || config.NODE_ENV === 'test' ? 1000 : config.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { error: 'Too many attempts on authentication endpoints. Please wait 15 minutes.' },
});

// Strict limiter for recovery code entry
export const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.NODE_ENV === 'test' ? 10000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { error: 'Too many recovery attempts. Account recovery locked for 15 minutes.' },
});

