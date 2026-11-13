import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  encryptAesGcm,
  decryptAesGcm,
  hashPassword,
  verifyPassword,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyEcdsaSignature,
  createSessionToken,
  verifySessionToken,
} from '../src/services/cryptoService.js';

describe('Cryptographic Services', () => {
  test('AES-256-GCM encrypts and decrypts secret correctly', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const encrypted = encryptAesGcm(secret);

    assert.ok(encrypted.ciphertext);
    assert.ok(encrypted.iv);
    assert.ok(encrypted.tag);
    assert.notEqual(encrypted.ciphertext, secret);

    const decrypted = decryptAesGcm(encrypted.ciphertext, encrypted.iv, encrypted.tag);
    assert.equal(decrypted, secret);
  });

  test('AES-256-GCM fails with tampered ciphertext or tag', () => {
    const secret = 'TOP_SECRET_TOTP_KEY';
    const encrypted = encryptAesGcm(secret);

    // Tamper with ciphertext
    const tamperedCiphertext = encrypted.ciphertext.slice(0, -2) + 'ff';
    assert.throws(() => {
      decryptAesGcm(tamperedCiphertext, encrypted.iv, encrypted.tag);
    });
  });

  test('Argon2 password hashing and verification', async () => {
    const password = 'SuperSecurePassword123!';
    const hash = await hashPassword(password);

    assert.ok(hash.startsWith('$argon2id$'));
    const isValid = await verifyPassword(hash, password);
    assert.equal(isValid, true);

    const isInvalid = await verifyPassword(hash, 'WrongPassword!');
    assert.equal(isInvalid, false);
  });

  test('Recovery codes generation and normalization', () => {
    const codes = generateRecoveryCodes(10);
    assert.equal(codes.length, 10);

    for (const code of codes) {
      assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      const hash1 = hashRecoveryCode(code);
      const hash2 = hashRecoveryCode(code.toLowerCase()); // case-insensitive
      assert.equal(hash1, hash2);
    }
  });

  test('WebCrypto ECDSA P-256 signature verification (IEEE P1363)', async () => {
    // Generate WebCrypto ECDSA key pair
    const keyPair = await crypto.webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );

    const jwk = await crypto.webcrypto.subtle.exportKey('jwk', keyPair.publicKey);

    const payload = JSON.stringify({
      request_id: '123e4567-e89b-12d3-a456-426614174000',
      chosen_number: 42,
      decision: 'approve',
      timestamp: 1700000000000,
    });

    // PWA WebCrypto signs payload: produces IEEE P1363 64-byte signature
    const signatureBuffer = await crypto.webcrypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      keyPair.privateKey,
      Buffer.from(payload, 'utf8')
    );

    const signatureB64 = Buffer.from(signatureBuffer).toString('base64');

    // Backend verifies signature using Node's crypto.verify with dsaEncoding: 'ieee-p1363'
    const valid = verifyEcdsaSignature(jwk, payload, signatureB64);
    assert.equal(valid, true, 'Valid signature should verify true');

    // Tampered payload fails
    const tamperedPayload = JSON.stringify({
      request_id: '123e4567-e89b-12d3-a456-426614174000',
      chosen_number: 99, // tampered number!
      decision: 'approve',
      timestamp: 1700000000000,
    });

    const invalid = verifyEcdsaSignature(jwk, tamperedPayload, signatureB64);
    assert.equal(invalid, false, 'Tampered payload should fail verification');
  });

  test('Session token creation, verification, and expiration', () => {
    const token = createSessionToken({ userId: 'u123', email: 'test@example.com' }, 3600);
    assert.ok(token);

    const payload = verifySessionToken(token);
    assert.ok(payload);
    assert.equal(payload.userId, 'u123');
    assert.equal(payload.email, 'test@example.com');

    // Expired token test
    const expiredToken = createSessionToken({ userId: 'u123' }, -10);
    const expiredPayload = verifySessionToken(expiredToken);
    assert.equal(expiredPayload, null);

    // Tampered token test
    const tamperedToken = token.slice(0, -4) + 'abcd';
    const tamperedPayload = verifySessionToken(tamperedToken);
    assert.equal(tamperedPayload, null);
  });
});

