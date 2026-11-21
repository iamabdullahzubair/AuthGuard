import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../src/app.js';
import { initDb, query } from '../src/db/index.js';
import { storeChallenge, getChallenge, getPendingChallengeForAccount } from '../src/services/redisService.js';
import { generateApiKey } from '../src/services/apiKeyService.js';

let server;
let BASE_URL = '';

// Helper to sign payload using Node's crypto.webcrypto subtle
async function signPayload(privateKey, payloadString) {
  const enc = new TextEncoder();
  const data = enc.encode(payloadString);
  const signatureBuffer = await crypto.webcrypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    privateKey,
    data
  );
  return Buffer.from(signatureBuffer).toString('base64');
}

describe('Push Challenge Modes & Hardware Key Signature Verification Scenarios', () => {
  const tenantId = `tenant-challenge-${Date.now()}`;
  const endUserId = crypto.randomUUID();
  const deviceId = crypto.randomUUID();
  const testEmail = `user.challenge.${Date.now()}@domain.com`;
  let deviceKeypair;
  let deviceJwk;
  let apiKeyRaw = '';

  before(async () => {
    await initDb();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        BASE_URL = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // 1. Generate WebCrypto ECDSA P-256 Keypair
    deviceKeypair = await crypto.webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    deviceJwk = await crypto.webcrypto.subtle.exportKey('jwk', deviceKeypair.publicKey);

    // 2. Create Tenant
    await query(
      `INSERT INTO tenants (id, name, slug, status, tier, verification_mode)
       VALUES ($1, 'Challenge Corp', $2, 'active', 'enterprise', 'number_choice')`,
      [tenantId, tenantId]
    );

    // 3. Create API Key
    const keyData = await generateApiKey(tenantId, 'Challenge Test Key', 'live');
    apiKeyRaw = keyData.rawKey;

    // 4. Create End User
    await query(
      `INSERT INTO end_users (id, tenant_id, email, two_factor_enabled)
       VALUES ($1, $2, $3, true)`,
      [endUserId, tenantId, testEmail]
    );

    // 5. Create Active Device with PWA Public Key
    await query(
      `INSERT INTO end_user_devices (id, tenant_id, end_user_id, device_name, push_subscription, public_key, status)
       VALUES ($1, $2, $3, 'Test Phone Device', '{"endpoint":"local-sync://localhost"}', $4, 'active')`,
      [deviceId, tenantId, endUserId, JSON.stringify(deviceJwk)]
    );
  });

  after(async () => {
    await query(`DELETE FROM end_user_devices WHERE tenant_id = $1`, [tenantId]).catch(() => {});
    await query(`DELETE FROM end_users WHERE tenant_id = $1`, [tenantId]).catch(() => {});
    await query(`DELETE FROM api_keys WHERE tenant_id = $1`, [tenantId]).catch(() => {});
    await query(`DELETE FROM tenants WHERE id = $1`, [tenantId]).catch(() => {});
    server?.close();
    setTimeout(() => process.exit(0), 100);
  });

  test('Scenario 1: Mode A: number_choice (Correct Number Match -> Approved)', async () => {
    const requestId = crypto.randomUUID();
    const challengeNumber = 42;
    const decoys = [18, 42, 95];
    const expiresAt = new Date(Date.now() + 60 * 1000);

    // Store challenge in Redis
    await storeChallenge(requestId, {
      id: requestId,
      tenantId,
      endUserId,
      mode: 'number_choice',
      challengeNumber,
      decoys,
      status: 'pending',
      expiresAt: expiresAt.toISOString(),
      account: testEmail,
    }, 120);

    // PWA fetches challenge via GET /api/auth/challenge/:id
    const challengeRes = await fetch(`${BASE_URL}/api/auth/challenge/${requestId}`);
    assert.equal(challengeRes.status, 200);
    const challengeData = await challengeRes.json();
    assert.equal(challengeData.mode, 'number_choice');
    assert.deepEqual(challengeData.options, decoys);

    // PWA signs canonical approval response
    const timestamp = Date.now();
    const canonicalPayload = JSON.stringify({
      request_id: requestId,
      chosen_number: challengeNumber,
      decision: 'approve',
      timestamp,
    });
    const signature = await signPayload(deviceKeypair.privateKey, canonicalPayload);

    // PWA posts response to POST /api/auth/challenge/respond
    const respondRes = await fetch(`${BASE_URL}/api/auth/challenge/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: requestId,
        request_id: requestId,
        chosen_number: challengeNumber,
        decision: 'approve',
        timestamp,
        signature,
      }),
    });

    assert.equal(respondRes.status, 200);
    const respondData = await respondRes.json();
    assert.equal(respondData.success, true);
    assert.equal(respondData.status, 'approved');

    // Verify Redis status updated
    const updated = await getChallenge(requestId);
    assert.equal(updated.status, 'approved');
  });

  test('Scenario 2: Mode A: number_choice (Wrong Number Picked -> Denied)', async () => {
    const requestId = crypto.randomUUID();
    const challengeNumber = 77;
    const decoys = [77, 12, 34];
    const expiresAt = new Date(Date.now() + 60 * 1000);

    await storeChallenge(requestId, {
      id: requestId,
      tenantId,
      endUserId,
      mode: 'number_choice',
      challengeNumber,
      decoys,
      status: 'pending',
      expiresAt: expiresAt.toISOString(),
      account: testEmail,
    }, 120);

    const timestamp = Date.now();
    const wrongNumber = 12;
    const canonicalPayload = JSON.stringify({
      request_id: requestId,
      chosen_number: wrongNumber,
      decision: 'approve',
      timestamp,
    });
    const signature = await signPayload(deviceKeypair.privateKey, canonicalPayload);

    const respondRes = await fetch(`${BASE_URL}/api/auth/challenge/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: requestId,
        request_id: requestId,
        chosen_number: wrongNumber,
        decision: 'approve',
        timestamp,
        signature,
      }),
    });

    const respondData = await respondRes.json();
    assert.equal(respondData.status, 'denied');
  });

  test('Scenario 3: Mode B: one_click (1-Tap Instant Approve)', async () => {
    const requestId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 1000);

    await storeChallenge(requestId, {
      id: requestId,
      tenantId,
      endUserId,
      mode: 'one_click',
      status: 'pending',
      expiresAt: expiresAt.toISOString(),
      account: testEmail,
    }, 120);

    const timestamp = Date.now();
    const canonicalPayload = JSON.stringify({
      request_id: requestId,
      chosen_number: 0,
      decision: 'approve',
      timestamp,
    });
    const signature = await signPayload(deviceKeypair.privateKey, canonicalPayload);

    const respondRes = await fetch(`${BASE_URL}/api/auth/challenge/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: requestId,
        request_id: requestId,
        chosen_number: 0,
        decision: 'approve',
        timestamp,
        signature,
      }),
    });

    assert.equal(respondRes.status, 200);
    const respondData = await respondRes.json();
    assert.equal(respondData.status, 'approved');
  });

  test('Scenario 4: Mode C: word_input (Verification Word Matching)', async () => {
    const requestId = crypto.randomUUID();
    const challengeWord = 'HAWK';
    const expiresAt = new Date(Date.now() + 60 * 1000);

    await storeChallenge(requestId, {
      id: requestId,
      tenantId,
      endUserId,
      mode: 'word_input',
      challengeWord,
      status: 'pending',
      expiresAt: expiresAt.toISOString(),
      account: testEmail,
    }, 120);

    const timestamp = Date.now();
    const canonicalPayload = JSON.stringify({
      request_id: requestId,
      chosen_number: 0,
      decision: 'approve',
      timestamp,
    });
    const signature = await signPayload(deviceKeypair.privateKey, canonicalPayload);

    // Submit with matching word
    const respondRes = await fetch(`${BASE_URL}/api/auth/challenge/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: requestId,
        request_id: requestId,
        chosen_word: 'hawk', // case-insensitive check
        decision: 'approve',
        timestamp,
        signature,
      }),
    });

    assert.equal(respondRes.status, 200);
    const respondData = await respondRes.json();
    assert.equal(respondData.status, 'approved');
  });

  test('Scenario 5: In-App Pending Challenge Polling API (/api/auth/challenge/pending)', async () => {
    const requestId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 1000);

    await storeChallenge(requestId, {
      id: requestId,
      tenantId,
      endUserId,
      mode: 'number_choice',
      challengeNumber: 88,
      decoys: [22, 55, 88],
      status: 'pending',
      expiresAt: expiresAt.toISOString(),
      account: testEmail,
    }, 120);

    // Poll endpoint for testEmail
    const pendingRes = await fetch(
      `${BASE_URL}/api/auth/challenge/pending?account=${encodeURIComponent(testEmail)}`
    );
    assert.equal(pendingRes.status, 200);
    const pendingData = await pendingRes.json();
    assert.equal(pendingData.pending, true);
    assert.equal(pendingData.id, requestId);
    assert.equal(pendingData.challengeNumber, 88);
  });

  test('Scenario 6: Cryptographic Signature Tamper Rejection (Zero-Trust Security)', async () => {
    const requestId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 1000);

    await storeChallenge(requestId, {
      id: requestId,
      tenantId,
      endUserId,
      mode: 'one_click',
      status: 'pending',
      expiresAt: expiresAt.toISOString(),
      account: testEmail,
    }, 120);

    const timestamp = Date.now();
    // Valid signature for canonical payload
    const canonicalPayload = JSON.stringify({
      request_id: requestId,
      chosen_number: 0,
      decision: 'approve',
      timestamp,
    });
    const signature = await signPayload(deviceKeypair.privateKey, canonicalPayload);

    // Attacker tampers with decision to 'deny' or changes timestamp
    const tamperedRes = await fetch(`${BASE_URL}/api/auth/challenge/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: requestId,
        request_id: requestId,
        chosen_number: 0,
        decision: 'deny', // TAMPERED!
        timestamp,
        signature, // Signature won't match tampered payload
      }),
    });

    assert.equal(tamperedRes.status, 401);
    const tamperedData = await tamperedRes.json();
    assert.match(tamperedData.error, /signature verification failed/i);
  });
});
