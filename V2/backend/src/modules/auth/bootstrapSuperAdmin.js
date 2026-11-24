import argon2 from 'argon2';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { pool } from '../../db/pool.js';

async function bootstrap() {
  if (!env.V2_SUPER_ADMIN_EMAIL || !env.V2_SUPER_ADMIN_PASSWORD) {
    throw new Error('Set V2_SUPER_ADMIN_EMAIL and V2_SUPER_ADMIN_PASSWORD before bootstrapping.');
  }

  const email = env.V2_SUPER_ADMIN_EMAIL.trim().toLowerCase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [2_026_112_502]);
    const existing = await client.query(
      `SELECT id, email FROM tenant_members WHERE is_super_admin = true FOR UPDATE`
    );

    if (existing.rows.length) {
      if (existing.rows[0].email.toLowerCase() !== email) {
        throw new Error(`A Super Admin already exists (${existing.rows[0].email}); refusing to create a second one.`);
      }
      await client.query('COMMIT');
      console.log(`Super Admin already bootstrapped: ${email}`);
      return;
    }

    const passwordHash = await argon2.hash(env.V2_SUPER_ADMIN_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
    });
    await client.query(
      `INSERT INTO tenant_members (id, tenant_id, email, password_hash, role, is_super_admin)
       VALUES ($1, NULL, $2, $3, 'super_admin', true)`,
      [crypto.randomUUID(), email, passwordHash]
    );
    await client.query('COMMIT');
    console.log(`Bootstrapped the single Super Admin: ${email}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

bootstrap()
  .catch((error) => {
    console.error(`[v2 auth bootstrap] ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
