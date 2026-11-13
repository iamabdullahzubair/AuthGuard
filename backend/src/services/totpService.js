import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import crypto from 'node:crypto';
import { query } from '../db/index.js';

// Configure authenticator according to RFC 6238 standard: 6 digits, 30 seconds step, SHA-1
authenticator.options = {
  step: 30,
  digits: 6,
  window: 1, // allow ±1 window (30s before or after)
};

/**
 * Generate a new base32 TOTP secret
 */
export function generateTotpSecret() {
  return authenticator.generateSecret();
}

/**
 * Generate standard TOTP token for a secret
 */
export function generateTotpToken(secret) {
  return authenticator.generate(secret);
}

/**
 * Verify a TOTP token, enforcing window ±1 and anti-replay (cannot reuse code in same window)
 * @param {string} userId
 * @param {string} token
 * @param {string} secret
 * @returns {Promise<{ valid: boolean, error?: string }>}
 */
export async function verifyTotpTokenWithAntiReplay(userId, token, secret) {
  const cleanToken = token.trim().replace(/\s+/g, '');
  if (!cleanToken || cleanToken.length !== 6) {
    return { valid: false, error: 'Invalid token format' };
  }

  // Check validity with otplib (window = 1 means [-1, 0, +1])
  const isValid = authenticator.check(cleanToken, secret);
  if (!isValid) {
    return { valid: false, error: 'Incorrect TOTP code' };
  }

  // Determine which window step matched to prevent reuse
  const currentStep = Math.floor(Date.now() / 1000 / 30);
  const candidateSteps = [currentStep, currentStep - 1, currentStep + 1];

  let matchedStep = null;
  for (const step of candidateSteps) {
    // Check if token matches this specific step
    // otplib time-based generator:
    const expected = authenticator.generate(secret); // current
    // We can verify against step by checking used_totp_codes
    matchedStep = step;
  }

  // Check if code was already used for this user in recent steps
  const existing = await query(
    `SELECT id FROM used_totp_codes 
     WHERE user_id = $1 AND code = $2 AND window_step >= $3`,
    [userId, cleanToken, currentStep - 2]
  );

  if (existing.rows.length > 0) {
    return { valid: false, error: 'TOTP code has already been used. Please wait for the next code.' };
  }

  // Record this code as used
  await query(
    `INSERT INTO used_totp_codes (id, user_id, code, window_step) 
     VALUES ($1, $2, $3, $4)`,
    [crypto.randomUUID(), userId, cleanToken, currentStep]
  );

  return { valid: true };
}

/**
 * Generate QR code data URL from enrollment payload JSON
 */
export async function generateQrCodeDataUrl(enrollmentPayload) {
  const jsonString = typeof enrollmentPayload === 'string'
    ? enrollmentPayload
    : JSON.stringify(enrollmentPayload);

  return QRCode.toDataURL(jsonString, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 300,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}

