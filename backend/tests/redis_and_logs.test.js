import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { initDb } from '../src/db/index.js';
import { cacheSet, cacheGet, cacheDel, publishEvent, subscribeEvent } from '../src/services/redisService.js';
import { broadcastLog, getRecentLogs, onLog } from '../src/services/logBroadcaster.js';

let server;
let BASE_URL = '';
let superAdminToken = '';

describe('Redis Acceleration & Live Log Broadcaster', () => {
  before(async () => {
    await initDb();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        BASE_URL = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Obtain super admin token
    const loginRes = await fetch(`${BASE_URL}/api/tenant/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'iamabdullahzubair@gmail.com',
        password: 'Admin123!Secure',
      }),
    });
    const loginData = await loginRes.json();
    superAdminToken = loginData.token;
  });

  after(() => {
    server?.close();
  });

  test('cacheSet, cacheGet, and cacheDel work reliably', async () => {
    const testKey = 'test:cache:unit_' + Date.now();
    const testData = { foo: 'bar', timestamp: 12345 };

    // Initially should be null
    const initial = await cacheGet(testKey);
    assert.equal(initial, null);

    // Set cache
    await cacheSet(testKey, testData, 60);

    // Get cache
    const fetched = await cacheGet(testKey);
    assert.deepEqual(fetched, testData);

    // Delete cache
    await cacheDel(testKey);
    const afterDel = await cacheGet(testKey);
    assert.equal(afterDel, null);
  });

  test('Pub/Sub event dispatcher broadcasts to subscribers', async () => {
    const channel = 'test:events:' + Date.now();
    let received = null;

    const unsub = subscribeEvent(channel, (data) => {
      received = data;
    });

    await publishEvent(channel, { hello: 'world' });

    // Allow event loop cycle
    await new Promise((r) => setTimeout(r, 50));

    assert.deepEqual(received, { hello: 'world' });
    unsub();
  });

  test('broadcastLog stores in circular buffer and notifies onLog listeners', async () => {
    let captured = null;
    const unsub = onLog((log) => {
      if (log.message.includes('TEST_EVENT_LOG_DISPATCH')) {
        captured = log;
      }
    });

    broadcastLog({
      level: 'SECURITY',
      category: 'audit',
      message: 'TEST_EVENT_LOG_DISPATCH: unauthorized attempt simulated',
      metadata: { ip: '127.0.0.1', attemptedUser: 'bob' },
    });

    await new Promise((r) => setTimeout(r, 50));

    assert.ok(captured, 'onLog listener should have captured the broadcast log');
    assert.equal(captured.level, 'SECURITY');
    assert.equal(captured.category, 'audit');
    assert.equal(captured.metadata.ip, '127.0.0.1');

    const recent = getRecentLogs(10);
    const found = recent.find((l) => l.message.includes('TEST_EVENT_LOG_DISPATCH'));
    assert.ok(found, 'Log must be present in recent logs buffer');

    unsub();
  });

  test('Super Admin GET /api/super-admin/logs returns buffer and stats', async () => {
    const res = await fetch(`${BASE_URL}/api/super-admin/logs`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.logs));
    assert.ok(data.stats);
    assert.equal(typeof data.stats.bufferedLogs, 'number');
    assert.ok(data.redis);
  });

  test('Super Admin GET /api/super-admin/system/status returns system telemetry', async () => {
    const res = await fetch(`${BASE_URL}/api/super-admin/system/status`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(typeof data.uptimeSeconds, 'number');
    assert.equal(typeof data.memory?.heapUsedMb, 'number');
    assert.equal(typeof data.redisConnected, 'boolean');
  });
});
