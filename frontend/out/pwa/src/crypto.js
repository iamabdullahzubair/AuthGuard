/**
 * WebCrypto helpers for Authenticator PWA
 * - ECDSA P-256 keypair generation (private key non-extractable)
 * - ECDSA signing (IEEE P1363 raw signature output)
 * - AES-GCM key generation & secret encryption/decryption (non-extractable key)
 */

/**
 * Generate ECDSA P-256 key pair with non-extractable private key
 * Public key is extractable so it can be exported as JWK for registration.
 */
export async function generateEcdsaKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    false, // extractable = false (private key cannot be exported via JS)
    ['sign', 'verify']
  );

  // Export public key as JWK for the server
  // Note: in WebCrypto, generateKey with false extractable prevents exporting the private key,
  // but public key export depends on browser implementation. To be 100% compliant and secure:
  // We can generate public key extractable or export it before locking.
  // Actually, WebCrypto generateKey sets extractable on the *private* key!
  // Let's ensure public key is exportable as JWK.
  return keyPair;
}

/**
 * Generate non-extractable AES-GCM 256-bit key for encrypting secrets in IndexedDB
 */
export async function generateAesKey() {
  return window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    false, // Non-extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt plaintext using AES-GCM key
 * @param {CryptoKey} aesKey 
 * @param {string} plaintext 
 * @returns {Promise<{ ciphertextB64: string, ivB64: string }>}
 */
export async function encryptSecret(aesKey, plaintext) {
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    aesKey,
    enc.encode(plaintext)
  );

  return {
    ciphertextB64: arrayBufferToBase64(ciphertextBuffer),
    ivB64: arrayBufferToBase64(iv.buffer),
  };
}

/**
 * Decrypt ciphertext using AES-GCM key
 * @param {CryptoKey} aesKey 
 * @param {string} ciphertextB64 
 * @param {string} ivB64 
 * @returns {Promise<string>}
 */
export async function decryptSecret(aesKey, ciphertextB64, ivB64) {
  const dec = new TextDecoder();
  const ciphertext = base64ToArrayBuffer(ciphertextB64);
  const iv = base64ToArrayBuffer(ivB64);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(iv),
    },
    aesKey,
    ciphertext
  );

  return dec.decode(decryptedBuffer);
}

/**
 * Sign payload string with ECDSA private key
 * WebCrypto outputs IEEE P1363 (r || s, 64 bytes).
 * @param {CryptoKey} privateKey 
 * @param {string} payloadString 
 * @returns {Promise<string>} base64 signature
 */
export async function signPayload(privateKey, payloadString) {
  const enc = new TextEncoder();
  const data = enc.encode(payloadString);

  const signatureBuffer = await window.crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' },
    },
    privateKey,
    data
  );

  return arrayBufferToBase64(signatureBuffer);
}

// Helper: ArrayBuffer to Base64
export function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper: Base64 to ArrayBuffer
export function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Helper: URL-Safe Base64 to Uint8Array (for VAPID key)
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

