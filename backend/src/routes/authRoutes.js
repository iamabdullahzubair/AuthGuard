import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from '../db/index.js';
import { hashPassword, verifyPassword, createSessionToken } from '../services/cryptoService.js';
import { logAuditEvent } from '../services/auditService.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res) => {
  const parseResult = registerSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.errors[0].message });
  }

  const { email, password } = parseResult.data;
  const normalizedEmail = email.toLowerCase().trim();

  // Check if user exists
  const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const passwordHash = await hashPassword(password);
  const userId = crypto.randomUUID();

  await query(
    `INSERT INTO users (id, email, password_hash, two_factor_enabled)
     VALUES ($1, $2, $3, false)`,
    [userId, normalizedEmail, passwordHash]
  );

  await logAuditEvent({
    userId,
    event: 'USER_REGISTERED',
    req,
    metadata: { email: normalizedEmail },
  });

  const token = createSessionToken({ userId, email: normalizedEmail });
  res.cookie('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 86400 * 1000,
  });

  return res.status(201).json({
    message: 'Registration successful',
    token,
    user: { id: userId, email: normalizedEmail, two_factor_enabled: false },
  });
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Valid email and password required' });
  }

  const { email, password } = parseResult.data;
  const normalizedEmail = email.toLowerCase().trim();

  const userResult = await query(
    `SELECT id, email, password_hash, two_factor_enabled, failed_attempts, locked_until
     FROM users WHERE email = $1`,
    [normalizedEmail]
  );

  if (userResult.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const user = userResult.rows[0];

  // Check lockout
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    return res.status(429).json({
      error: `Account is temporarily locked due to repeated failed logins. Try again in ${minutesLeft} minute(s).`,
    });
  }

  const passwordMatch = await verifyPassword(user.password_hash, password);
  if (!passwordMatch) {
    const attempts = (user.failed_attempts || 0) + 1;
    let lockedUntil = null;
    if (attempts >= 5) {
      lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
    }

    await query(
      `UPDATE users SET failed_attempts = $1, locked_until = $2 WHERE id = $3`,
      [attempts, lockedUntil, user.id]
    );

    await logAuditEvent({
      userId: user.id,
      event: 'LOGIN_PASSWORD_FAILED',
      req,
      metadata: { attempts },
    });

    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Reset failed attempts upon successful password
  await query(
    `UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1`,
    [user.id]
  );

  // If 2FA is enabled, require second factor step
  if (user.two_factor_enabled) {
    await logAuditEvent({
      userId: user.id,
      event: 'LOGIN_PASSWORD_PASSED_2FA_REQUIRED',
      req,
    });

    return res.json({
      twoFactorRequired: true,
      userId: user.id,
      email: user.email,
    });
  }

  // No 2FA -> Login complete
  const token = createSessionToken({ userId: user.id, email: user.email });
  res.cookie('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 86400 * 1000,
  });

  await logAuditEvent({
    userId: user.id,
    event: 'LOGIN_SUCCESS',
    req,
  });

  return res.json({
    twoFactorRequired: false,
    token,
    user: { id: user.id, email: user.email, two_factor_enabled: false },
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  return res.json({ user: req.user });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('session');
  return res.json({ message: 'Logged out successfully' });
});

export default router;

