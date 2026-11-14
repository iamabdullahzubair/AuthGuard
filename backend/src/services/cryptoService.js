import crypto from 'node:crypto';
import argon2 from 'argon2';
import { config } from '../config/index.js';

const AES_KEY = Buffer.from(config.AES_SECRET_KEY, 'hex');

/**
 * Encrypt plaintext using AES-256-GCM
 * @param {string} plaintext 
 * @returns {{ ciphertext: string, iv: string, tag: string }}
 */
export function encryptAesGcm(plaintext) {
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', AES_KEY, iv);
  
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return {
    ciphertext,
    iv: iv.toString('hex'),
    tag,
  };
}

/**
 * Decrypt ciphertext using AES-256-GCM (Supports both (ciphertext, iv, tag) and ({ ciphertext, iv, tag }) object)
 * @param {string|{ ciphertext: string, iv: string, tag: string }} ciphertextOrObj 
 * @param {string} [ivHex] 
 * @param {string} [tagHex] 
 * @returns {string} plaintext
 */
export function decryptAesGcm(ciphertextOrObj, ivHex, tagHex) {
  let ciphertext = ciphertextOrObj;
  let iv = ivHex;
  let tag = tagHex;

  if (typeof ciphertextOrObj === 'object' && ciphertextOrObj !== null) {
    ciphertext = ciphertextOrObj.ciphertext;
    iv = ciphertextOrObj.iv;
    tag = ciphertextOrObj.tag;
  } else if (typeof ciphertextOrObj === 'string' && ciphertextOrObj.startsWith('{')) {
    try {
      const parsed = JSON.parse(ciphertextOrObj);
      if (parsed.ciphertext && parsed.iv && parsed.tag) {
        ciphertext = parsed.ciphertext;
        iv = parsed.iv;
        tag = parsed.tag;
      }
    } catch {}
  }

  const ivBuf = Buffer.from(iv, 'hex');
  const tagBuf = Buffer.from(tag, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', AES_KEY, ivBuf);
  
  decipher.setAuthTag(tagBuf);
  let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');
  return plaintext;
}

/**
 * Hash password with Argon2id
 */
export async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16, // 64 MB
    timeCost: 3,
    parallelism: 1,
  });
}

/**
 * Verify password with Argon2id
 */
export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Generate 10 secure random recovery codes (format: ABCD-1234)
 */
export function generateRecoveryCodes(count = 10) {
  const codes = [];
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // base32-ish, no ambiguous chars (0/O, 1/I)
  for (let i = 0; i < count; i++) {
    let code = '';
    const bytes = crypto.randomBytes(8);
    for (let j = 0; j < 8; j++) {
      if (j === 4) code += '-';
      code += chars[bytes[j] % chars.length];
    }
    codes.push(code);
  }
  return codes;
}

/**
 * Hash a recovery code with SHA-256
 */
export function hashRecoveryCode(code) {
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Verify WebCrypto ECDSA P-256 signature
 * Note: WebCrypto ECDSA signatures are IEEE P1363 (64 bytes: r || s).
 * Node's crypto.verify supports dsaEncoding: 'ieee-p1363'.
 *
 * @param {object} jwk - Public key in JWK format
 * @param {string|Buffer} data - Exact string or buffer that was signed
 * @param {string} signatureBase64 - Base64 encoded signature
 * @returns {boolean}
 */
export function verifyEcdsaSignature(jwk, data, signatureBase64) {
  try {
    const keyObject = crypto.createPublicKey({
      key: jwk,
      format: 'jwk',
    });

    const sigBuffer = Buffer.from(signatureBase64, 'base64');
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');

    return crypto.verify(
      'sha256',
      dataBuffer,
      {
        key: keyObject,
        dsaEncoding: 'ieee-p1363',
      },
      sigBuffer
    );
  } catch (err) {
    console.error('ECDSA verification error:', err.message);
    return false;
  }
}

/**
 * Create a simple tamper-proof HMAC session token
 */
export function createSessionToken(payload, expiresInSeconds = 86400) {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const data = JSON.stringify({ ...payload, exp });
  const b64Data = Buffer.from(data).toString('base64url');
  const signature = crypto.createHmac('sha256', config.SESSION_SECRET).update(b64Data).digest('base64url');
  return `${b64Data}.${signature}`;
}

/**
 * Verify and decode session token
 */
export function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [b64Data, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', config.SESSION_SECRET).update(b64Data).digest('base64url');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(b64Data, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}

