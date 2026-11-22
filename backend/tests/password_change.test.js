import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/services/cryptoService.js';
import { tenantPortalController } from '../src/controllers/tenantPortalController.js';
import { superAdminController } from '../src/controllers/superAdminController.js';

describe('Password Change & Reset Security', () => {
  test('Password hashing produces distinct hashes and verifies correctly', async () => {
    const initialPass = 'OldPass123!Secure';
    const newPass = 'NewPass456!Secure';

    const oldHash = await hashPassword(initialPass);
    const newHash = await hashPassword(newPass);

    assert.notEqual(oldHash, newHash);
    assert.equal(await verifyPassword(oldHash, initialPass), true);
    assert.equal(await verifyPassword(oldHash, newPass), false);
    assert.equal(await verifyPassword(newHash, newPass), true);
    assert.equal(await verifyPassword(newHash, initialPass), false);
  });

  test('tenantPortalController.changePassword rejects missing or short passwords', async () => {
    let responseStatus = 200;
    let responseBody = null;

    const mockRes = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      },
    };

    // Test short new password (< 8 chars)
    const mockReqShort = {
      member: { id: 'm-123', email: 'user@example.com', isSuperAdmin: false },
      body: {
        currentPassword: 'ValidOldPassword123!',
        newPassword: 'short',
      },
    };

    await tenantPortalController.changePassword(mockReqShort, mockRes);
    assert.equal(responseStatus, 400);
    assert.match(responseBody.error, /8 characters/i);

    // Test identical password
    const mockReqIdentical = {
      member: { id: 'm-123', email: 'user@example.com', isSuperAdmin: false },
      body: {
        currentPassword: 'SamePassword123!',
        newPassword: 'SamePassword123!',
      },
    };

    await tenantPortalController.changePassword(mockReqIdentical, mockRes);
    assert.equal(responseStatus, 400);
    assert.match(responseBody.error, /cannot be the same/i);
  });

  test('superAdminController.changePassword validates inputs correctly', async () => {
    let responseStatus = 200;
    let responseBody = null;

    const mockRes = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      },
    };

    // Test missing currentPassword
    const mockReqMissing = {
      member: { id: 'admin-1', email: 'admin@example.com', isSuperAdmin: true },
      body: {
        newPassword: 'ValidNewPassword123!',
      },
    };

    await superAdminController.changePassword(mockReqMissing, mockRes);
    assert.equal(responseStatus, 400);
    assert.match(responseBody.error, /required/i);

    // Test identical password
    const mockReqSame = {
      member: { id: 'admin-1', email: 'admin@example.com', isSuperAdmin: true },
      body: {
        currentPassword: 'AdminPass123!',
        newPassword: 'AdminPass123!',
      },
    };

    await superAdminController.changePassword(mockReqSame, mockRes);
    assert.equal(responseStatus, 400);
    assert.match(responseBody.error, /cannot be the same/i);
  });

  test('superAdminController.resetTenantPassword requires min 8 characters', async () => {
    let responseStatus = 200;
    let responseBody = null;

    const mockRes = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      },
    };

    const mockReq = {
      params: { id: 'tenant-123' },
      member: { id: 'admin-1', email: 'admin@example.com', isSuperAdmin: true },
      body: {
        newPassword: 'short',
      },
    };

    await superAdminController.resetTenantPassword(mockReq, mockRes);
    assert.equal(responseStatus, 400);
    assert.match(responseBody.error, /8 characters/i);
  });
});
