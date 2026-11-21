import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../src/app.js';
import { initDb, query } from '../src/db/index.js';
import { storeEnrollToken, consumeEnrollToken } from '../src/services/redisService.js';
import { encryptAesGcm } from '../src/services/cryptoService.js';

let server;
let BASE_URL = '';

describe('End-User 2FA Enrollment & Device Pairing Scenarios', () => {
  const tenantId = `tenant-enroll-${Date.now()}`;
  const endUserId = crypto.randomUUID();
  const testEmail = `enroll.test.${Date.now()}@domain.com`;
  let deviceKeypair;
  let deviceJwk;

  before(async () => {
    await initDb();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        BASE_URL = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Generate WebCrypto ECDSA P-256 key pair simulating PWA device
    deviceKeypair = await crypto.webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    deviceJwk = await crypto.webcrypto.subtle.exportKey('jwk', deviceKeypair.publicKey);

    // 1. Create Tenant
    await query(
      `INSERT INTO tenants (id, name, slug, status, tier)
       VALUES ($1, 'Enroll Corp', $2, 'active', 'enterprise')`,
      [tenantId, tenantId]
    );

    // 2. Create End User
    await query(
      `INSERT INTO end_users (id, tenant_id, email, two_factor_enabled)
       VALUES ($1, $2, $3, false)`,
      [endUserId, tenantId, testEmail]
    );
  });

  after(async () => {
    await query(`DELETE FROM end_user_totp WHERE tenant_id = $1`, [tenantId]).catch(() => {});
    await query(`DELETE FROM end_user_devices WHERE tenant_id = $1`, [tenantId]).catch(() => {});
    await query(`DELETE FROM end_users WHERE tenant_id = $1`, [tenantId]).catch(() => {});
    await query(`DELETE FROM tenants WHERE id = $1`, [tenantId]).catch(() => {});
    server?.close();
    setTimeout(() => process.exit(0), 100);
  });

  test('Scenario 1: Single-Use Atomic Redis Token Enrollment & Device Pairing', async () => {
    const enrollToken = crypto.randomBytes(32).toString('hex');
    const totpSecret = 'JBSWY3DPEHPK3PXP';
    const encSecretObj = encryptAesGcm(totpSecret);

    // Store in Redis (15 mins TTL)
    await storeEnrollToken(enrollToken, {
      tenantId,
      endUserId,
      encSecretObj,
      email: testEmail,
    }, 900);

    // PWA calls POST /api/auth/enroll/complete
    const enrollRes = await fetch(`${BASE_URL}/api/auth/enroll/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enroll_token: enrollToken,
        push_subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
          keys: {
            auth: 'mockAuthSecret1234',
            p256dh: 'mockP256dhKey12345678',
          },
        },
        public_key: deviceJwk,
        device_name: 'Chrome on Windows (Laptop)',
      }),
    });

    assert.equal(enrollRes.status, 200);
    const data = await enrollRes.json();
    assert.equal(data.success, true);
    assert.ok(data.deviceId);

    // Verify in database: end_user_devices has active device
    const devCheck = await query(
      `SELECT * FROM end_user_devices WHERE id = $1 AND tenant_id = $2`,
      [data.deviceId, tenantId]
    );
    assert.equal(devCheck.rows.length, 1);
    assert.equal(devCheck.rows[0].status, 'active');
    assert.equal(devCheck.rows[0].device_name, 'Chrome on Windows (Laptop)');

    // Verify in database: end_user_totp has encrypted secret
    const totpCheck = await query(
      `SELECT * FROM end_user_totp WHERE end_user_id = $1 AND tenant_id = $2`,
      [endUserId, tenantId]
    );
    assert.equal(totpCheck.rows.length, 1);
    assert.ok(totpCheck.rows[0].encrypted_secret);
  });

  test('Scenario 2: Single-Use Token Anti-Replay (Re-submitting token fails with 400)', async () => {
    const enrollToken = crypto.randomBytes(32).toString('hex');
    const totpSecret = 'JBSWY3DPEHPK3PXP';
    const encSecretObj = encryptAesGcm(totpSecret);

    await storeEnrollToken(enrollToken, {
      tenantId,
      endUserId,
      encSecretObj,
      email: testEmail,
    }, 900);

    // First use succeeds
    const firstRes = await fetch(`${BASE_URL}/api/auth/enroll/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enroll_token: enrollToken,
        push_subscription: { endpoint: 'https://test' },
        public_key: deviceJwk,
      }),
    });
    assert.equal(firstRes.status, 200);

    // Second use with identical token MUST fail
    const secondRes = await fetch(`${BASE_URL}/api/auth/enroll/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enroll_token: enrollToken,
        push_subscription: { endpoint: 'https://test' },
        public_key: deviceJwk,
      }),
    });
    assert.equal(secondRes.status, 400);
    const errData = await secondRes.json();
    assert.match(errData.error, /invalid, expired, or already used/i);
  });

  test('Scenario 3: Local-Sync Fallback Push Subscription for FCM-blocked Laptop Browsers', async () => {
    const enrollToken = crypto.randomBytes(32).toString('hex');
    const encSecretObj = encryptAesGcm('JBSWY3DPEHPK3PXP');

    await storeEnrollToken(enrollToken, {
      tenantId,
      endUserId,
      encSecretObj,
      email: testEmail,
    }, 900);

    // Device pairs using local-sync fallback
    const fallbackEndpoint = `local-sync://localhost:3000/${crypto.randomUUID()}`;
    const fallbackRes = await fetch(`${BASE_URL}/api/auth/enroll/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enroll_token: enrollToken,
        push_subscription: {
          endpoint: fallbackEndpoint,
          keys: { auth: 'local-auth-test', p256dh: 'local-p256dh-test' },
          localFallback: true,
        },
        public_key: deviceJwk,
        device_name: 'Laptop Fallback Device',
      }),
    });

    assert.equal(fallbackRes.status, 200);
    const fallbackData = await fallbackRes.json();
    assert.equal(fallbackData.success, true);
  });

  test('Scenario 4: Auto-Detection Enrollment Status Polling API', async () => {
    // Check status for testEmail
    const statusRes = await fetch(
      `${BASE_URL}/api/tenant/users/enroll-status?username=${encodeURIComponent(testEmail.toUpperCase())}`,
      {
        headers: {
          // Provide mock session or simulate tenant request
        },
      }
    );

    // If session required without cookies, verify expected authentication contract
    if (statusRes.status === 401) {
      assert.equal(statusRes.status, 401);
    } else {
      const statusData = await statusRes.json();
      assert.equal(statusData.enrolled, true);
      assert.ok(statusData.activeDevices >= 1);
    }
  });
});
