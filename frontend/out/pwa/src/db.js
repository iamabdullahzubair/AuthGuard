import { generateEcdsaKeyPair, generateAesKey } from './crypto.js';

const DB_NAME = 'AuthenticatorPwaDB';
const DB_VERSION = 1;

let dbInstance = null;

export async function openDb() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('keys')) {
        db.createObjectStore('keys', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('accounts')) {
        db.createObjectStore('accounts', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(new Error('Failed to open IndexedDB: ' + event.target.error));
    };
  });
}

/**
 * Get or create the device ECDSA P-256 key pair
 * Stores non-extractable CryptoKey directly in IndexedDB
 */
export async function getOrCreateEcdsaKeyPair() {
  const db = await openDb();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction('keys', 'readwrite');
    const store = tx.objectStore('keys');
    const getReq = store.get('ecdsa_keypair');

    getReq.onsuccess = async () => {
      if (getReq.result) {
        resolve(getReq.result);
      } else {
        try {
          // Generate key pair
          // Note: In WebCrypto, to export the public key as JWK,
          // the public key MUST be generated or exported.
          // In standard WebCrypto generateKey(alg, extractable, usages):
          // If extractable=true, both are extractable.
          // To make ONLY privateKey non-extractable while exporting publicKey:
          // In WebCrypto API, generateKey creates a CryptoKeyPair:
          // publicKey is always extractable=true, while privateKey takes the second param (extractable)!
          // Let's verify by generating with extractable=false:
          const keyPair = await window.crypto.subtle.generateKey(
            { name: 'ECDSA', namedCurve: 'P-256' },
            false, // privateKey will be extractable=false!
            ['sign', 'verify']
          );

          // Export public key as JWK
          const jwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);

          const record = {
            id: 'ecdsa_keypair',
            publicKey: keyPair.publicKey,
            privateKey: keyPair.privateKey,
            jwk,
            createdAt: Date.now(),
          };

          const putReq = store.put(record);
          putReq.onsuccess = () => resolve(record);
          putReq.onerror = (e) => reject(e.target.error);
        } catch (err) {
          reject(err);
        }
      }
    };

    getReq.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Get or create the non-extractable AES-GCM wrapping key for local secrets
 */
export async function getOrCreateAesKey() {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('keys', 'readwrite');
    const store = tx.objectStore('keys');
    const getReq = store.get('aes_wrapping_key');

    getReq.onsuccess = async () => {
      if (getReq.result) {
        resolve(getReq.result.key);
      } else {
        try {
          const aesKey = await generateAesKey();
          const record = {
            id: 'aes_wrapping_key',
            key: aesKey,
            createdAt: Date.now(),
          };
          const putReq = store.put(record);
          putReq.onsuccess = () => resolve(aesKey);
          putReq.onerror = (e) => reject(e.target.error);
        } catch (err) {
          reject(err);
        }
      }
    };

    getReq.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Save an enrolled account
 */
export async function saveAccount(account) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('accounts', 'readwrite');
    const store = tx.objectStore('accounts');
    const req = store.put(account);
    req.onsuccess = () => resolve(account);
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Get all enrolled accounts
 */
export async function getAccounts() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('accounts', 'readonly');
    const store = tx.objectStore('accounts');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Delete an account
 */
export async function deleteAccount(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('accounts', 'readwrite');
    const store = tx.objectStore('accounts');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

