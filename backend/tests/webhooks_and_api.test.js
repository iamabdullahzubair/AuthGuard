import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../src/app.js';
import { initDb, query } from '../src/db/index.js';
import { generateApiKey } from '../src/services/apiKeyService.js';

let server;
let BASE_URL = '';

describe('Tenant Webhooks & External Client Tenant API', () => {
  const tenantId = `test-tenant-${Date.now()}`;
  const endUserId = crypto.randomUUID();
  const testEmail = `tenant-api-${Date.now()}@example.com`;
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

    // 1. Create Tenant
    await query(
      `INSERT INTO tenants (id, name, slug, status, tier, branding)
       VALUES ($1, 'Test Corp', $2, 'active', 'enterprise', '{"issuerName":"TestCorp"}')`,
      [tenantId, tenantId]
    );

    // 2. Generate API Key
    const keyData = await generateApiKey(tenantId, 'Test Key', 'live');
    apiKeyRaw = keyData.rawKey || keyData.key;

    // 3. Create End User
    await query(
      `INSERT INTO end_users (id, tenant_id, email, two_factor_enabled)
       VALUES ($1, $2, $3, false)`,
      [endUserId, tenantId, testEmail]
    );
  });

  after(async () => {
    await query(`DELETE FROM tenant_webhooks WHERE tenant_id = $1`, [tenantId]).catch(() => {});
    await query(`DELETE FROM api_keys WHERE tenant_id = $1`, [tenantId]).catch(() => {});
    await query(`DELETE FROM end_users WHERE tenant_id = $1`, [tenantId]).catch(() => {});
    await query(`DELETE FROM tenants WHERE id = $1`, [tenantId]).catch(() => {});
    server?.close();
  });

  test('Tenant Webhook creation and HMAC signature verification', async () => {
    const webhookId = crypto.randomUUID();
    const webhookSecret = crypto.randomBytes(24).toString('hex');
    const webhookUrl = 'https://httpbin.org/post';

    await query(
      `INSERT INTO tenant_webhooks (id, tenant_id, url, secret, is_active, custom_headers, events)
       VALUES ($1, $2, $3, $4, true, '{}', '["login.approved"]')`,
      [webhookId, tenantId, webhookUrl, webhookSecret]
    );

    const check = await query(`SELECT * FROM tenant_webhooks WHERE id = $1`, [webhookId]);
    assert.equal(check.rows.length, 1);
    assert.equal(check.rows[0].url, webhookUrl);

    // Verify HMAC-SHA256 signature
    const payload = JSON.stringify({ event: 'login.approved', timestamp: Date.now() });
    const signature = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');
    assert.ok(signature);
    assert.equal(signature.length, 64);
  });

  test('External API rejects calls without API Key or with wrong tenant ID (Zero-Trust IDOR check)', async () => {
    // 1. Missing API Key
    const noKeyRes = await fetch(`${BASE_URL}/api/tenant/${tenantId}/users/status?email=${testEmail}`);
    assert.equal(noKeyRes.status, 401);

    // 2. Wrong tenant in URL
    const wrongTenantRes = await fetch(`${BASE_URL}/api/tenant/wrong-tenant-id/users/status?email=${testEmail}`, {
      headers: { 'X-Api-Key': apiKeyRaw },
    });
    assert.equal(wrongTenantRes.status, 403);
  });

  test('External Enrollment API creates end user and returns valid QR code payload', async () => {
    const newClientEmail = `external-client-${Date.now()}@client.com`;
    const res = await fetch(`${BASE_URL}/api/tenant/${tenantId}/enroll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKeyRaw,
      },
      body: JSON.stringify({
        email: newClientEmail,
        issuer: 'PartnerApp',
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.email, newClientEmail);
    assert.ok(data.qrCodeDataUrl.startsWith('data:image/png;base64,'));
    assert.ok(data.enrollToken);
    assert.ok(data.totpSecret);
  });

  test('External Client Push Challenge API flow', async () => {
    // 1. User with no devices returns 400
    const failRes = await fetch(`${BASE_URL}/api/tenant/${tenantId}/push/challenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKeyRaw,
      },
      body: JSON.stringify({ email: testEmail }),
    });
    assert.equal(failRes.status, 400);

    // 2. Add an active end_user_device
    const deviceId = crypto.randomUUID();
    await query(
      `INSERT INTO end_user_devices (id, tenant_id, end_user_id, device_name, push_subscription, public_key, status)
       VALUES ($1, $2, $3, 'Test Phone', '{"endpoint":"https://fcm.googleapis.com/test","keys":{"auth":"auth","p256dh":"BLPtAvw5yivoAEZShN6auQ1GwcBfGvoNLjNCIHw64y0dYPTrP5strzCMwp_z84X0pgFww8n3FRzBj-LpOusWjf4"}}', '{"crv":"P-256","kty":"EC","x":"test","y":"test"}', 'active')`,
      [deviceId, tenantId, endUserId]
    );

    // 3. Initiate push challenge
    const challengeRes = await fetch(`${BASE_URL}/api/tenant/${tenantId}/push/challenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKeyRaw,
      },
      body: JSON.stringify({
        email: testEmail,
        issuer: 'BankClient',
      }),
    });

    assert.equal(challengeRes.status, 200);
    const challengeData = await challengeRes.json();
    assert.equal(challengeData.success, true);
    assert.ok(challengeData.requestId);
    assert.ok(challengeData.challengeNumber >= 10 && challengeData.challengeNumber <= 99);

    // 4. Poll status endpoint
    const statusRes = await fetch(`${BASE_URL}${challengeData.statusUrl}`);
    assert.equal(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.equal(statusData.requestId, challengeData.requestId);
    assert.equal(statusData.status, 'pending');
    assert.equal(statusData.isApproved, false);
  });
});
