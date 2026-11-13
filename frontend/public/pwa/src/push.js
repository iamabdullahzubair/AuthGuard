import { urlBase64ToUint8Array } from './crypto.js';

let swRegistration = null;

/**
 * Register Service Worker for PWA
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Workers are not supported in this browser.');
  }

  try {
    swRegistration = await navigator.serviceWorker.register('/pwa/sw.js', {
      scope: '/pwa/',
    });
    console.log('[SW] Service Worker registered with scope:', swRegistration.scope);
    return swRegistration;
  } catch (err) {
    console.error('[SW] Service Worker registration failed:', err);
    throw err;
  }
}

/**
 * Get current active Service Worker registration
 */
export async function getSwRegistration() {
  if (swRegistration) return swRegistration;
  return await registerServiceWorker();
}

/**
 * Request notification permission from user
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    throw new Error('Push notifications are not supported in this browser.');
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission === 'denied') {
    throw new Error('Notification permission was blocked in browser settings. Please enable them to receive login approvals.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }
  return true;
}

/**
 * Subscribe to PushManager with VAPID Public Key
 * @param {string} [serverBaseUrl]
 * @returns {Promise<PushSubscriptionJSON>}
 */
export async function subscribeToPush(serverBaseUrl = '') {
  await requestNotificationPermission();
  const reg = await getSwRegistration();

  // Wait until service worker is active
  if (!reg.active) {
    await new Promise((resolve) => {
      const check = () => {
        if (reg.active) resolve();
        else setTimeout(check, 50);
      };
      check();
    });
  }

  // Check if existing subscription exists
  let subscription = await reg.pushManager.getSubscription();

  if (!subscription) {
    // Fetch VAPID public key from backend
    const vapidEndpoint = `${serverBaseUrl}/api/vapid-public-key`;
    const res = await fetch(vapidEndpoint);
    if (!res.ok) {
      throw new Error('Failed to fetch VAPID public key from ' + vapidEndpoint);
    }
    const data = await res.json();
    const vapidPublicKey = data.publicKey;

    const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedVapidKey,
    });
  }

  return subscription.toJSON();
}

