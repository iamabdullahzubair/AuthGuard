# Known Limitations & Production Hardening Guide

While this architecture demonstrates an end-to-end, cryptographically robust dual TOTP and Web Push approval system, enterprise production deployments should address several platform and architectural considerations.

---

## 1. PWA & Mobile Platform Limitations

### iOS Web Push Constraints (Apple WebKit)
- **Home Screen Requirement**: On iOS (iOS 16.4+), Web Push notifications **only** work if the user explicitly installs the PWA to their Home Screen via Safari (*Share -> Add to Home Screen*). Web Push does not trigger in regular Safari browser tabs.
- **Background Wakeup**: PWAs cannot execute background tasks when closed in the same way native apps (via APNs silent push / VoIP push) can. If a user swipes away the PWA, incoming notifications still arrive via the system notification tray, but JavaScript code cannot execute until the user taps the notification.

### Native Biometric Authentication (Touch ID / Face ID)
- In a web browser / PWA context, accessing the device's Secure Enclave for biometric authentication requires the **WebAuthn API** (`navigator.credentials.create / get`).
- *Production Improvement*: Integrate WebAuthn as a gate prior to signing the ECDSA login approval payload, ensuring the user confirms their biometric identity before the private key executes `crypto.subtle.sign`.

---

## 2. Key Management & Secret Storage

### Current Architecture
- The TOTP master encryption key is configured via `AES_SECRET_KEY` in environment variables.

### Production Hardening with HSM / Cloud KMS
- **Envelope Encryption**: Rather than storing a static symmetric key in process memory, production systems should use a Hardware Security Module (HSM) or Cloud Key Management Service (AWS KMS, Google Cloud KMS, or Azure Key Vault).
- **Key Rotation**: Implement automated data key rotation (DEK / KEK pattern). When secrets are written, encrypt with a unique data key wrapped by the KMS key.
- **Zero-Knowledge Architecture**: Consider encrypting TOTP secrets on the server such that only the user's password-derived key can decrypt it, or rely primarily on client-side WebCrypto keys.

---

## 3. Web Push Delivery & Reliability

### Push Service Latency & Network Filtering
- Web Push depends on third-party cloud gateways (Google FCM, Apple APNs, Mozilla Push Service). Network congestion, captive portals, or battery savers can introduce delays (1–15 seconds).
- **Auto-Pruning**: The backend automatically flags subscriptions returning `410 Gone` or `404 Not Found` as `revoked`. In production, store the last error timestamp and trigger automated email alerts when all of a user's devices are unreachable.
- **SSE / WebSockets Fallback**: For active browser sessions, a direct Server-Sent Events (SSE) or WebSocket channel provides lower-latency updates compared to standard HTTP polling.

---

## 4. Clock Drift & Time Synchronization

- RFC 6238 TOTP relies on synchronized clocks between client and server.
- While the backend accepts a $\pm 1$ step ($\pm 30$ seconds) drift window, mobile devices with manual or unsynchronized clocks may produce failed verifications.
- *Production Improvement*: Include the server's current timestamp in enrollment and login status payloads so client apps can measure and compensate for local device clock skew.

---

## 5. High Availability & Distributed State

- **Distributed Rate Limiting**: In multi-instance cluster deployments, in-memory rate limiters must be backed by a distributed Redis store (`rate-limit-redis`) to prevent attackers from bypassing thresholds across round-robin load balancers.
- **Push De-duplication**: When multiple servers process login approvals, use atomic database locks (`SELECT ... FOR UPDATE`) or Redis distributed mutexes (`Redlock`) to ensure single-use guarantees under concurrent access.

---

## 6. Comparison: Custom PWA vs Native App vs WebAuthn / Passkeys

| Dimension | Custom PWA (This Project) | Native App (iOS/Android) | WebAuthn / Passkeys |
|---|---|---|---|
| **Installation** | Zero App Store barrier (1-click via browser) | Requires App Store / Play Store distribution | Native browser prompt, no installation |
| **Push Notification** | Standard Web Push (VAPID) | Native APNs / FCM with silent push | N/A (Requires user to be on site) |
| **Key Storage** | WebCrypto / IndexedDB (non-extractable) | iOS Keychain / Android Keystore (Secure Enclave) | Platform Authenticator / Cloud Keychain |
| **Biometric Integration** | Via WebAuthn API | Direct LocalAuthentication / BiometricPrompt APIs | Built-in biometric prompt |
| **Offline TOTP** | Full offline support via Service Worker | Full offline support | Device-bound |

