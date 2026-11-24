import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  V2_TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  V2_SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  V2_LOGIN_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
  V2_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(50).default(10),
  V2_LOGIN_IP_MAX_ATTEMPTS: z.coerce.number().int().min(10).max(500).default(60),
  V2_REGISTER_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(50).default(10),
  V2_SUPER_ADMIN_EMAIL: z.preprocess((value) => value === '' ? undefined : value, z.string().email().max(254).optional()),
  V2_SUPER_ADMIN_PASSWORD: z.preprocess((value) => value === '' ? undefined : value, z.string().min(12).max(128).optional()),
  V2_DATABASE_URL: z.string().min(1, 'V2_DATABASE_URL is required'),
  V2_REDIS_URL: z.string().url().optional(),
  V2_WEBHOOK_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
  V2_ENCRYPTION_KEY: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.string().regex(/^[a-f0-9]{64}$/i, 'V2_ENCRYPTION_KEY must be 64 hex characters').optional()
  ),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid v2 environment: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
}

export const env = Object.freeze(parsed.data);
