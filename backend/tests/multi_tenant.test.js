import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../src/app.js';
import { initDb, query } from '../src/db/index.js';
import { generateApiKey, verifyApiKey, revokeApiKey } from '../src/services/apiKeyService.js';
import { createMemberToken, verifyMemberToken } from '../src/middleware/tenantSessionAuth.js';

let server;
let BASE_URL = '';

describe('Enterprise Multi-Tenant Engine & Security', () => {
  const testTenantSlug = `test-tenant-${Date.now()}`;
  const testOwnerEmail = `owner-${Date.now()}@tenantcorp.com`;
  const testPassword = 'SecurePassword123!';
  let tenantId = '';
  let tenantToken = '';
  let superAdminToken = '';
  let liveApiKey = '';

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
    if (tenantId) {
      await query(`DELETE FROM api_keys WHERE tenant_id = $1`, [tenantId]).catch(() => {});
      await query(`DELETE FROM tenant_webhooks WHERE tenant_id = $1`, [tenantId]).catch(() => {});
      await query(`DELETE FROM tenant_members WHERE tenant_id = $1`, [tenantId]).catch(() => {});
      await query(`DELETE FROM tenants WHERE id = $1`, [tenantId]).catch(() => {});
    }
    server?.close();
  });

  test('1. API Key Generation, Hashing & Verification', async () => {
    const dummyTenantId = crypto.randomUUID();
    await query(
      `INSERT INTO tenants (id, name, slug, status, tier) VALUES ($1, 'Acme Corp', $2, 'active', 'enterprise')`,
      [dummyTenantId, `acme-${Date.now()}`]
    );

    const generated = await generateApiKey(dummyTenantId, 'Live Backend Key', 'live');
    assert.ok(generated.rawKey.startsWith('ag_live_'));
    assert.equal(generated.environment, 'live');

    // Verify key works
    const verified = await verifyApiKey(generated.rawKey);
    assert.ok(verified);
    assert.equal(verified.tenant.id, dummyTenantId);
    assert.equal(verified.tenant.name, 'Acme Corp');

    // Revocation check
    await revokeApiKey(dummyTenantId, generated.id);
    const afterRevoke = await verifyApiKey(generated.rawKey);
    assert.equal(afterRevoke, null);

    // Clean up dummy
    await query(`DELETE FROM api_keys WHERE tenant_id = $1`, [dummyTenantId]);
    await query(`DELETE FROM tenants WHERE id = $1`, [dummyTenantId]);
  });

  test('2. Tenant Self-Service Registration (POST /api/tenant/register)', async () => {
    const res = await fetch(`${BASE_URL}/api/tenant/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testOwnerEmail,
        password: testPassword,
        companyName: 'FinTech Cloud Inc',
        slug: testTenantSlug,
      }),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.token);
    assert.equal(data.member.email, testOwnerEmail);
    assert.equal(data.tenant.slug, testTenantSlug);
    assert.ok(data.initialKeys.liveKey.startsWith('ag_live_'));
    assert.ok(data.initialKeys.testKey.startsWith('ag_test_'));

    tenantId = data.tenant.id;
    tenantToken = data.token;
    liveApiKey = data.initialKeys.liveKey;
  });

  test('3. Tenant Member Login (POST /api/tenant/login)', async () => {
    const res = await fetch(`${BASE_URL}/api/tenant/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testOwnerEmail,
        password: testPassword,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.member.email, testOwnerEmail);
    assert.equal(data.member.isSuperAdmin, false);
  });

  test('4. Tenant Webhook Configuration with Custom Headers', async () => {
    const res = await fetch(`${BASE_URL}/api/tenant/webhooks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantToken}`,
      },
      body: JSON.stringify({
        url: 'https://httpbin.org/post',
        customHeaders: {
          'X-Client-Api-Key': 'client_secret_xyz123',
          Authorization: 'Bearer external_token_987',
        },
        events: ['login.approved', 'login.denied'],
      }),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.webhook.customHeaders['X-Client-Api-Key'], 'client_secret_xyz123');
  });

  test('5. Tenant Member Forbidden from Super Admin endpoints', async () => {
    const res = await fetch(`${BASE_URL}/api/super-admin/stats`, {
      headers: { Authorization: `Bearer ${tenantToken}` },
    });
    assert.equal(res.status, 403);
  });

  test('6. Super Admin Access (iamabdullahzubair@gmail.com)', async () => {
    // Log in as Super Admin with default seed password
    const loginRes = await fetch(`${BASE_URL}/api/tenant/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'iamabdullahzubair@gmail.com',
        password: 'Admin123!Secure',
      }),
    });

    assert.equal(loginRes.status, 200);
    const loginData = await loginRes.json();
    assert.equal(loginData.member.isSuperAdmin, true);
    superAdminToken = loginData.token;

    // Super Admin stats
    const statsRes = await fetch(`${BASE_URL}/api/super-admin/stats`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(statsRes.status, 200);
    const stats = await statsRes.json();
    assert.ok(stats.tenants.total >= 1);
    assert.equal(stats.adminUser, 'iamabdullahzubair@gmail.com');

    // Super Admin list tenants
    const tenantsRes = await fetch(`${BASE_URL}/api/super-admin/tenants`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(tenantsRes.status, 200);
    const tenantsData = await tenantsRes.json();
    assert.ok(Array.isArray(tenantsData.tenants));
    assert.ok(tenantsData.tenants.some((t) => t.id === tenantId));
  });
});
