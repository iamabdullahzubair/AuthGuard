import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../src/app.js';
import { initDb, query } from '../src/db/index.js';

let server;
let BASE_URL = '';

describe('Webhooks & External Client Enrollment API', () => {
  const userId = crypto.randomUUID();
  const testEmail = `api-test-${Date.now()}@example.com`;

  before(async () => {
    await initDb();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        BASE_URL = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    await query(
      `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'dummyhash')`,
      [userId, testEmail]
    );
  });

  after(async () => {
    await query(`DELETE FROM webhooks WHERE user_id = $1`, [userId]).catch(() => {});
    await query(`DELETE FROM users WHERE id = $1`, [userId]).catch(() => {});
    server?.close();
  });

  test('Webhook creation and secret HMAC generation', async () => {
    const webhookId = crypto.randomUUID();
    const webhookSecret = crypto.randomBytes(24).toString('hex');
    const webhookUrl = 'https://httpbin.org/post';

    await query(
      `INSERT INTO webhooks (id, user_id, url, secret, is_active)
       VALUES ($1, $2, $3, $4, true)`,
      [webhookId, userId, webhookUrl, webhookSecret]
    );

    const check = await query(`SELECT * FROM webhooks WHERE id = $1`, [webhookId]);
    assert.equal(check.rows.length, 1);
    assert.equal(check.rows[0].url, webhookUrl);

    // Verify HMAC signature calculation
    const payload = JSON.stringify({ event: 'login.approved', timestamp: Date.now() });
    const signature = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');
    assert.ok(signature);
    assert.equal(signature.length, 64);
  });

  test('External Enrollment API creates user and returns valid QR code payload', async () => {
    const newClientEmail = `external-client-${Date.now()}@client.com`;
    const res = await fetch(`${BASE_URL}/api/v1/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: newClientEmail,
        issuer: 'PartnerApp',
        webhookUrl: 'https://client.com/webhook',
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.email, newClientEmail);
    assert.equal(data.issuer, 'PartnerApp');
    assert.ok(data.qrCodeDataUrl.startsWith('data:image/png;base64,'));
    assert.ok(data.enrollToken);
    assert.ok(data.totpSecret);
  });
});
