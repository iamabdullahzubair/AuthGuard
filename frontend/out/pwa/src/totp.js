/**
 * Browser-side RFC 6238 TOTP Engine
 * Standard: 6 digits, 30 seconds period, SHA-1 HMAC via WebCrypto
 */

// Base32 RFC 4648 alphabet
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Decode Base32 string to Uint8Array
 */
export function base32Decode(base32) {
  const cleaned = base32.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  let index = 0;
  const output = new Uint8Array(Math.floor((cleaned.length * 5) / 8));

  for (let i = 0; i < cleaned.length; i++) {
    const val = BASE32_CHARS.indexOf(cleaned[i]);
    if (val === -1) {
      throw new Error(`Invalid base32 character: ${cleaned[i]}`);
    }

    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      output[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }

  return output;
}

/**
 * Generate 6-digit TOTP token using WebCrypto HMAC-SHA-1
 * @param {string} secretBase32 
 * @param {number} [timestampMs=Date.now()]
 * @returns {Promise<string>} 6-digit code
 */
export async function generateTotp(secretBase32, timestampMs = Date.now()) {
  const keyBytes = base32Decode(secretBase32);
  const timeStep = Math.floor(timestampMs / 1000 / 30);

  // 8-byte big-endian time buffer
  const timeBuffer = new ArrayBuffer(8);
  const timeView = new DataView(timeBuffer);
  // High 32 bits are 0 (unless after year 2038 / int overflow, high 32 bits fit in standard uint32)
  timeView.setUint32(0, Math.floor(timeStep / 0x100000000));
  timeView.setUint32(4, timeStep & 0xffffffff);

  // Import key for HMAC-SHA1
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  // Compute HMAC
  const hmac = await window.crypto.subtle.sign('HMAC', cryptoKey, timeBuffer);
  const hmacBytes = new Uint8Array(hmac);

  // Dynamic truncation (RFC 4226 Section 5.4)
  const offset = hmacBytes[hmacBytes.length - 1] & 0x0f;
  const binary =
    ((hmacBytes[offset] & 0x7f) << 24) |
    ((hmacBytes[offset + 1] & 0xff) << 16) |
    ((hmacBytes[offset + 2] & 0xff) << 8) |
    (hmacBytes[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

/**
 * Calculate remaining seconds in current 30s TOTP window
 */
export function getTotpRemainingSeconds() {
  const seconds = Math.floor(Date.now() / 1000);
  return 30 - (seconds % 30);
}

