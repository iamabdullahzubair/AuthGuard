import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import webpush from 'web-push';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend directory or parent
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const envSchema = z.object({
  PORT: z.string().default('3000').transform(val => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/authenticator_db'),
  APP_URL: z.string().default('http://localhost:3000'),
  VAPID_PUBLIC_KEY: z.string().min(10, 'VAPID_PUBLIC_KEY is required'),
  VAPID_PRIVATE_KEY: z.string().min(10, 'VAPID_PRIVATE_KEY is required'),
  VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),
  AES_SECRET_KEY: z.string().length(64, 'AES_SECRET_KEY must be 64 hex characters (32 bytes)'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 chars'),
  REDIS_URL: z.string().optional().default('redis://localhost:6379'),
  SUPER_ADMIN_EMAIL: z.string().email().default('iamabdullahzubair@gmail.com'),
  SUPER_ADMIN_PASSWORD: z.string().min(8).default('Admin123!Secure'),
  RATE_LIMIT_WINDOW_MS: z.string().default('900000').transform(val => parseInt(val, 10)),
  RATE_LIMIT_MAX: z.string().default('100').transform(val => parseInt(val, 10)),
  AUTH_RATE_LIMIT_MAX: z.string().default('10').transform(val => parseInt(val, 10)),
  LOCKOUT_MINUTES: z.string().default('15').transform(val => parseInt(val, 10)),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;

// Configure web-push library
webpush.setVapidDetails(
  config.VAPID_SUBJECT,
  config.VAPID_PUBLIC_KEY,
  config.VAPID_PRIVATE_KEY
);

export * from './externalRoutes.js';
export { webpush };

