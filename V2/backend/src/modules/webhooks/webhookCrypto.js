import crypto from 'node:crypto';
import { env } from '../../config/env.js';

if (!env.V2_ENCRYPTION_KEY) {
  throw new Error('V2_ENCRYPTION_KEY is required by the webhook worker; generate a dedicated 32-byte key');
}
const key = Buffer.from(env.V2_ENCRYPTION_KEY, 'hex');

export function encryptWebhookValue(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptWebhookValue({ ciphertext, iv, tag }) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
