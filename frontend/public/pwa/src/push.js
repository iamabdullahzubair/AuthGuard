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
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Workers are not supported in this browser.');
  }
  if (!swRegistration) {
    swRegistration = await navigator.serviceWorker.register('/pwa/sw.js', {
      scope: '/pwa/',
    });
  }
  // Guarantee service worker is ready before PushManager operations
  return await navigator.serviceWorker.ready;
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
    throw new Error('Notifications are blocked! Click the 🔒/🎚️ icon in your browser address bar and set Notifications to Allow.');
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

  // Check if existing subscription exists
  let subscription = null;
  try {
    subscription = await reg.pushManager.getSubscription();
  } catch (err) {
    console.warn('[Push] Error checking existing subscription:', err);
  }

  if (!subscription) {
    // Fetch VAPID public key from backend
    const vapidEndpoint = `${serverBaseUrl}/api/vapid-public-key`;
    const res = await fetch(vapidEndpoint);
    if (!res.ok) {
      throw new Error('Failed to fetch VAPID public key from ' + vapidEndpoint);
    }
    const data = await res.json();
    const vapidPublicKey = data.publicKey;
    if (!vapidPublicKey) {
      throw new Error('VAPID public key missing from server response');
    }

    const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

    try {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey,
      });
    } catch (err) {
      console.warn('[Push] Browser PushManager subscribe failed (FCM unavailable/blocked on this browser/network):', err);
      // Graceful fallback for local development / laptop testing / FCM-blocked environments
      const fallbackId = (typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2);

      return {
        endpoint: `local-sync://${window.location.host}/${fallbackId}`,
        keys: {
          auth: 'local-auth-' + fallbackId.slice(0, 8),
          p256dh: 'local-p256dh-' + fallbackId.slice(0, 8),
        },
        localFallback: true,
        fallbackReason: err.message,
      };
    }
  }

  return subscription.toJSON ? subscription.toJSON() : subscription;
}

