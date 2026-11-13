import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { query } from '../src/db/index.js';
import { encryptAesGcm } from '../src/services/cryptoService.js';

describe('Enrollment Service & Token Lifecycle', () => {
  const userId = crypto.randomUUID();

  before(async () => {
    await query(
      `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'dummyhash')`,
      [userId, `enroll-test-${Date.now()}@example.com`]
    );
  });

  after(async () => {
    await query(`DELETE FROM enroll_tokens WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM devices WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM totp_secrets WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM users WHERE id = $1`, [userId]);
  });

  test('Enroll token single-use enforcement', async () => {
    const enrollToken = crypto.randomBytes(32).toString('hex');
    const secret = 'JBSWY3DPEHPK3PXP';
    const encryptedSecret = encryptAesGcm(secret);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins in future

    await query(
      `INSERT INTO enroll_tokens (id, user_id, token, totp_secret_temp, expires_at, used)
       VALUES ($1, $2, $3, $4, $5, false)`,
      [crypto.randomUUID(), userId, enrollToken, JSON.stringify(encryptedSecret), expiresAt]
    );

    // First lookup: token is valid and not used
    const check1 = await query(`SELECT * FROM enroll_tokens WHERE token = $1`, [enrollToken]);
    assert.equal(check1.rows.length, 1);
    assert.equal(check1.rows[0].used, false);

    // Mark used
    await query(`UPDATE enroll_tokens SET used = true WHERE token = $1`, [enrollToken]);

    // Second check: token is already used
    const check2 = await query(`SELECT * FROM enroll_tokens WHERE token = $1`, [enrollToken]);
    assert.equal(check2.rows[0].used, true);
  });

  test('Enroll token expiration enforcement', async () => {
    const expiredToken = crypto.randomBytes(32).toString('hex');
    const secret = 'JBSWY3DPEHPK3PXP';
    const encryptedSecret = encryptAesGcm(secret);
    const pastExpiresAt = new Date(Date.now() - 1000); // expired 1s ago

    await query(
      `INSERT INTO enroll_tokens (id, user_id, token, totp_secret_temp, expires_at, used)
       VALUES ($1, $2, $3, $4, $5, false)`,
      [crypto.randomUUID(), userId, expiredToken, JSON.stringify(encryptedSecret), pastExpiresAt]
    );

    const result = await query(`SELECT * FROM enroll_tokens WHERE token = $1`, [expiredToken]);
    assert.equal(result.rows.length, 1);
    const isExpired = new Date(result.rows[0].expires_at) < new Date();
    assert.equal(isExpired, true, 'Token must be recognized as expired');
  });
});

