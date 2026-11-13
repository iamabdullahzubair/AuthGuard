import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { authenticator } from 'otplib';
import {
  generateTotpSecret,
  generateTotpToken,
  verifyTotpTokenWithAntiReplay,
} from '../src/services/totpService.js';
import { query } from '../src/db/index.js';
import crypto from 'node:crypto';

describe('TOTP Service (RFC 6238)', () => {
  const testUserId = crypto.randomUUID();

  before(async () => {
    // Insert dummy user for foreign key constraints
    await query(
      `INSERT INTO users (id, email, password_hash) 
       VALUES ($1, $2, 'dummyhash') 
       ON CONFLICT DO NOTHING`,
      [testUserId, `totp-test-${Date.now()}@example.com`]
    );
  });

  after(async () => {
    await query(`DELETE FROM used_totp_codes WHERE user_id = $1`, [testUserId]);
    await query(`DELETE FROM users WHERE id = $1`, [testUserId]);
  });

  test('generateTotpSecret generates valid base32 string', () => {
    const secret = generateTotpSecret();
    assert.equal(typeof secret, 'string');
    assert.ok(secret.length >= 16);
    assert.match(secret, /^[A-Z2-7]+$/);
  });

  test('generateTotpToken produces valid 6-digit code', () => {
    const secret = generateTotpSecret();
    const token = generateTotpToken(secret);
    assert.equal(token.length, 6);
    assert.match(token, /^\d{6}$/);
  });

  test('verifyTotpTokenWithAntiReplay accepts valid code in current window', async () => {
    const secret = generateTotpSecret();
    const token = authenticator.generate(secret);

    const result = await verifyTotpTokenWithAntiReplay(testUserId, token, secret);
    assert.equal(result.valid, true);
  });

  test('verifyTotpTokenWithAntiReplay rejects invalid code', async () => {
    const secret = generateTotpSecret();
    const result = await verifyTotpTokenWithAntiReplay(testUserId, '000000', secret);
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  test('Anti-Replay: prevents reusing the same TOTP code in the same window', async () => {
    const secret = generateTotpSecret();
    const token = authenticator.generate(secret);

    // First use: must succeed
    const firstAttempt = await verifyTotpTokenWithAntiReplay(testUserId, token, secret);
    assert.equal(firstAttempt.valid, true);

    // Second use: must be rejected due to replay
    const secondAttempt = await verifyTotpTokenWithAntiReplay(testUserId, token, secret);
    assert.equal(secondAttempt.valid, false);
    assert.match(secondAttempt.error, /already been used/i);
  });
});

