import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../src/app.js';
import { initDb, query } from '../src/db/index.js';
import { generateTotp } from '../../pwa/src/totp.js';

let server;
let BASE_URL = '';

// Polyfill window.crypto for PWA functions in node
if (!globalThis.window) {
  globalThis.window = { crypto: globalThis.crypto };
}

describe('End-to-End System Flow', () => {
  const testEmail = `e2e-user-${Date.now()}@example.com`;
  const testPassword = 'Password123!Secure';
  let sessionCookie = '';
  let userId = '';
  let enrollToken = '';
  let totpSecret = '';
  let deviceKeypair;
  let deviceJwk;
  let recoveryCodes = [];

  before(async () => {
    await initDb();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        BASE_URL = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (userId) {
      await query(`DELETE FROM used_totp_codes WHERE user_id = $1`, [userId]).catch(() => {});
      await query(`DELETE FROM login_requests WHERE user_id = $1`, [userId]).catch(() => {});
      await query(`DELETE FROM recovery_codes WHERE user_id = $1`, [userId]).catch(() => {});
      await query(`DELETE FROM devices WHERE user_id = $1`, [userId]).catch(() => {});
      await query(`DELETE FROM totp_secrets WHERE user_id = $1`, [userId]).catch(() => {});
      await query(`DELETE FROM enroll_tokens WHERE user_id = $1`, [userId]).catch(() => {});
      await query(`DELETE FROM users WHERE id = $1`, [userId]).catch(() => {});
    }
    server?.close();
  });

  test('1. User Registration on Website', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.token);
    assert.equal(data.user.email, testEmail);
    assert.equal(data.user.two_factor_enabled, false);

    userId = data.user.id;
    const cookieHeader = res.headers.get('set-cookie');
    if (cookieHeader) {
      sessionCookie = cookieHeader.split(';')[0];
    }
  });

  test('2. Start 2FA Enrollment (Website generates Single QR Payload)', async () => {
    const res = await fetch(`${BASE_URL}/api/enroll/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.enroll_token);
    assert.ok(data.secret);
    assert.ok(data.qr_data_url);
    assert.equal(data.qr_payload.issuer, 'MyApp');
    assert.equal(data.qr_payload.account, testEmail);

    enrollToken = data.enroll_token;
    totpSecret = data.secret;
  });

  test('3. PWA Scans QR & Enrolls Device (WebCrypto ECDSA Key + Push)', async () => {
    // PWA generates ECDSA P-256 keypair
    deviceKeypair = await crypto.webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    deviceJwk = await crypto.webcrypto.subtle.exportKey('jwk', deviceKeypair.publicKey);

    const mockPushSubscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/dummy-sub',
      keys: {
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9AcUbVYO2-0U0wa30L3UFm4nFx55xQgoAc8VQ9womD',
        auth: 'tBHItJI5svbpez7KI4CCXg',
      },
    };

    const res = await fetch(`${BASE_URL}/api/enroll/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enroll_token: enrollToken,
        push_subscription: mockPushSubscription,
        public_key: deviceJwk,
        device_name: 'Test iPhone PWA',
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.deviceId);
  });

  test('4. Confirm 2FA Activation with Live TOTP Code', async () => {
    // PWA generates live 6-digit TOTP code
    const liveTotp = await generateTotp(totpSecret);
    assert.equal(liveTotp.length, 6);

    // User types code into website
    const res = await fetch(`${BASE_URL}/api/enroll/verify-totp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify({ code: liveTotp }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.recovery_codes.length, 10);
    recoveryCodes = data.recovery_codes;
  });

  test('5. Login Step 1: Password prompts for 2FA', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.twoFactorRequired, true);
    assert.equal(data.userId, userId);
  });

  test('6. Login Step 2: Push Approval Flow with Number Matching', async () => {
    // Website initiates push login
    const startRes = await fetch(`${BASE_URL}/api/login/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });

    assert.equal(startRes.status, 200);
    const startData = await startRes.json();
    assert.ok(startData.requestId);
    assert.ok(startData.challengeNumber);

    const requestId = startData.requestId;
    const challengeNumber = startData.challengeNumber;

    // Check status is currently pending
    const status1Res = await fetch(`${BASE_URL}/api/login/status/${requestId}`);
    const status1 = await status1Res.json();
    assert.equal(status1.status, 'pending');

    // PWA signs approval payload with correct number
    const timestamp = Date.now();
    const canonicalPayload = JSON.stringify({
      request_id: requestId,
      chosen_number: challengeNumber,
      decision: 'approve',
      timestamp,
    });

    const sigBuf = await crypto.webcrypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      deviceKeypair.privateKey,
      Buffer.from(canonicalPayload, 'utf8')
    );
    const signatureB64 = Buffer.from(sigBuf).toString('base64');

    // PWA sends signed approval to /api/login/respond
    const respondRes = await fetch(`${BASE_URL}/api/login/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: requestId,
        chosen_number: challengeNumber,
        decision: 'approve',
        timestamp,
        signature: signatureB64,
      }),
    });

    assert.equal(respondRes.status, 200);
    const respondData = await respondRes.json();
    assert.equal(respondData.status, 'approved');

    // Website polling discovers approved status and receives session
    const status2Res = await fetch(`${BASE_URL}/api/login/status/${requestId}`);
    const status2 = await status2Res.json();
    assert.equal(status2.status, 'approved');
    assert.ok(status2.token);
  });

  test('7. Fallback: Login via Recovery Code', async () => {
    const recoveryCode = recoveryCodes[0];
    const res = await fetch(`${BASE_URL}/api/login/recovery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, code: recoveryCode }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.token);

    // Reusing the same recovery code must fail
    const reuseRes = await fetch(`${BASE_URL}/api/login/recovery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, code: recoveryCode }),
    });
    assert.equal(reuseRes.status, 400);
  });

  test('8. Device Management: List and Revoke Device', async () => {
    // List devices
    const listRes = await fetch(`${BASE_URL}/api/devices`, {
      headers: { 'Cookie': sessionCookie },
    });
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.ok(listData.devices.length >= 1);
    const devId = listData.devices[0].id;

    // Revoke device
    const revokeRes = await fetch(`${BASE_URL}/api/devices/${devId}`, {
      method: 'DELETE',
      headers: { 'Cookie': sessionCookie },
    });
    assert.equal(revokeRes.status, 200);

    // Verify revoked status
    const listRes2 = await fetch(`${BASE_URL}/api/devices`, {
      headers: { 'Cookie': sessionCookie },
    });
    const listData2 = await listRes2.json();
    const revokedDev = listData2.devices.find((d) => d.id === devId);
    assert.equal(revokedDev.status, 'revoked');
  });
});
