import pg from 'pg';
import { config } from '../config/index.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (config.NODE_ENV === 'development' && duration > 500) {
    console.warn(`[DB Slow Query] ${duration}ms: ${text.slice(0, 80)}...`);
  }
  return res;
};

export const initDb = async () => {
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Users table
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(64) PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          two_factor_enabled BOOLEAN DEFAULT FALSE,
          failed_attempts INTEGER DEFAULT 0,
          locked_until TIMESTAMPTZ NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // 2. TOTP Secrets table (encrypted at rest with AES-256-GCM)
      await client.query(`
        CREATE TABLE IF NOT EXISTS totp_secrets (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64) UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          encrypted_secret TEXT NOT NULL,
          iv TEXT NOT NULL,
          tag TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // 3. Devices table (push subscription, public key, status)
      await client.query(`
        CREATE TABLE IF NOT EXISTS devices (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
          device_name TEXT NOT NULL,
          push_subscription JSONB NOT NULL,
          public_key JSONB NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'pending_verification',
          last_used TIMESTAMPTZ NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // 4. Enroll Tokens (single use, expires in 5 min)
      await client.query(`
        CREATE TABLE IF NOT EXISTS enroll_tokens (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
          token VARCHAR(128) UNIQUE NOT NULL,
          totp_secret_temp TEXT NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          used BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // 5. Login Requests (push approval, 2-digit match, 60s expiry, replay protected)
      await client.query(`
        CREATE TABLE IF NOT EXISTS login_requests (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
          challenge_number INTEGER NOT NULL,
          decoys JSONB NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'pending',
          nonce VARCHAR(64) NOT NULL,
          session_token TEXT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // 6. Used TOTP Codes (prevents code reuse within the same time window)
      await client.query(`
        CREATE TABLE IF NOT EXISTS used_totp_codes (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
          code VARCHAR(10) NOT NULL,
          window_step BIGINT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // 7. Recovery Codes (hashed, single use)
      await client.query(`
        CREATE TABLE IF NOT EXISTS recovery_codes (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
          code_hash TEXT NOT NULL,
          used BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // 8. Audit Logs (security event logging)
      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64) NULL,
          event VARCHAR(64) NOT NULL,
          ip_address VARCHAR(64) NULL,
          user_agent TEXT NULL,
          metadata JSONB NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // Create helpful indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_enroll_tokens_token ON enroll_tokens(token);
        CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
        CREATE INDEX IF NOT EXISTS idx_login_requests_user_id ON login_requests(user_id);
        CREATE INDEX IF NOT EXISTS idx_used_totp_codes_user_step ON used_totp_codes(user_id, window_step);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
      `);

      await client.query('COMMIT');
      console.log('PostgreSQL database schema initialized successfully');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Failed to initialize PostgreSQL schema:', err.message);
    throw err;
  }
};

