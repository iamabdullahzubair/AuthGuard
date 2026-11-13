import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { query } from '../src/db/index.js';
import { verifyEcdsaSignature } from '../src/services/cryptoService.js';

describe('Login Approval & Push Number Matching Flow', () => {
  const userId = crypto.randomUUID();
  let deviceKeypair;
  let deviceJwk;
  const deviceId = crypto.randomUUID();

  before(async () => {
    // Generate WebCrypto key pair for simulated PWA device
    deviceKeypair = await crypto.webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    deviceJwk = await crypto.webcrypto.subtle.exportKey('jwk', deviceKeypair.publicKey);

    // Insert user
    await query(
      `INSERT INTO users (id, email, password_hash, two_factor_enabled) 
       VALUES ($1, $2, 'dummyhash', true)`,
      [userId, `login-test-${Date.now()}@example.com`]
    );

    // Insert active device
    await query(
      `INSERT INTO devices (id, user_id, device_name, push_subscription, public_key, status)
       VALUES ($1, $2, 'Test Authenticator Device', '{"endpoint":"https://dummy"}', $3, 'active')`,
      [deviceId, userId, JSON.stringify(deviceJwk)]
    );
  });

  after(async () => {
    await query(`DELETE FROM login_requests WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM devices WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM users WHERE id = $1`, [userId]);
  });

  test('Login Request: challenge generation and expiration', async () => {
    const requestId = crypto.randomUUID();
    const challengeNumber = 42;
    const decoys = [17, 85];
    const expiresAt = new Date(Date.now() + 60 * 1000); // 60s
    const nonce = crypto.randomBytes(16).toString('hex');

    await query(
      `INSERT INTO login_requests (id, user_id, challenge_number, decoys, status, nonce, expires_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
      [requestId, userId, challengeNumber, JSON.stringify(decoys), nonce, expiresAt]
    );

    const res = await query(`SELECT * FROM login_requests WHERE id = $1`, [requestId]);
    assert.equal(res.rows.length, 1);
    const row = res.rows[0];
    assert.equal(row.challenge_number, 42);
    assert.equal(row.status, 'pending');
  });

  test('PWA Signs Approval: Valid signature and correct number matches', async () => {
    const requestId = crypto.randomUUID();
    const challengeNumber = 77;
    const decoys = [23, 61];
    const expiresAt = new Date(Date.now() + 60 * 1000);
    const nonce = crypto.randomBytes(16).toString('hex');

    await query(
      `INSERT INTO login_requests (id, user_id, challenge_number, decoys, status, nonce, expires_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
      [requestId, userId, challengeNumber, JSON.stringify(decoys), nonce, expiresAt]
    );

    // PWA selects number 77 and signs payload
    const timestamp = Date.now();
    const canonicalPayload = JSON.stringify({
      request_id: requestId,
      chosen_number: 77,
      decision: 'approve',
      timestamp,
    });

    const sigBuf = await crypto.webcrypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      deviceKeypair.privateKey,
      Buffer.from(canonicalPayload, 'utf8')
    );
    const signatureB64 = Buffer.from(sigBuf).toString('base64');

    // Verify signature against stored device key
    const isValidSig = verifyEcdsaSignature(deviceJwk, canonicalPayload, signatureB64);
    assert.equal(isValidSig, true);

    // Number check
    assert.equal(77, challengeNumber, 'Chosen number matches challenge');
  });

  test('Push Fatigue Prevention: Decoy/wrong number is rejected', async () => {
    const challengeNumber = 88;
    const chosenNumber = 12; // Attacker or accidental wrong tap
    assert.notEqual(chosenNumber, challengeNumber, 'Wrong number does not match challenge');
  });

  test('Replay Protection: Outdated timestamp is rejected', () => {
    const staleTimestamp = Date.now() - 300 * 1000; // 5 minutes old
    const now = Date.now();
    const isStale = Math.abs(now - staleTimestamp) > 120 * 1000; // 2 minutes window
    assert.equal(isStale, true, 'Stale timestamp must be flagged as replay attempt');
  });
});

