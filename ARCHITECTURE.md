# Architecture & Flow Specification

This document details the architectural design and cryptographic workflows of the unified Authenticator PWA with dual TOTP and Web Push approval.

---

## 1. High-Level Architecture

```mermaid
graph TB
  subgraph Client_Devices ["Client Devices"]
    subgraph Browser ["Desktop Browser"]
      WebPortal["Demo Website UI"]
    end
    subgraph MobileDevice ["Mobile Device / PWA"]
      PWA["Authenticator PWA"]
      WebCrypto["WebCrypto Engine<br/>(ECDSA P-256 + AES-GCM)"]
      IDB[("IndexedDB<br/>(Encrypted Secrets)")]
      SW["Service Worker<br/>(Push Handler)"]
      PWA --> WebCrypto
      PWA --> IDB
      SW --> PWA
    end
  end

  subgraph BackendServer ["Node.js + Express Backend"]
    API["REST API & Static Server"]
    CryptoService["Crypto Service<br/>(AES-GCM, Argon2, IEEE P1363 Verify)"]
    TOTPService["TOTP Engine<br/>(RFC 6238 + Anti-Replay)"]
    PushService["Web Push Engine<br/>(VAPID / web-push)"]
    AuditService["Audit Logger"]
    
    API --> CryptoService
    API --> TOTPService
    API --> PushService
    API --> AuditService
  end

  subgraph PushNetwork ["Push Service Providers"]
    FCM_APNs["Apple Push / WebPush / Google FCM"]
  end

  subgraph DatabaseLayer ["PostgreSQL 16"]
    PG[(PostgreSQL Database)]
  end

  WebPortal -->|HTTP API| API
  PWA -->|Signed HTTP API| API
  PushService -->|Push Notification| FCM_APNs
  FCM_APNs -->|Encrypted Payload| SW
  CryptoService --> PG
  TOTPService --> PG
  AuditService --> PG
```

---

## 2. Unified Enrollment Flow (Single QR Code)

When a user enables 2FA, scanning **ONE** QR code registers the device for both RFC 6238 TOTP and Web Push approval.

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant Web as Demo Website
  participant API as Backend API
  participant PWA as Authenticator PWA
  participant Push as Web Push Service
  participant DB as PostgreSQL DB

  User->>Web: Clicks "Enable 2FA"
  Web->>API: POST /api/enroll/start (auth cookie)
  API->>API: 1. Generate base32 TOTP secret<br/>2. Generate 32-byte enroll_token (5 min exp)
  API->>DB: Store enroll_token + encrypted temp secret
  API-->>Web: Return JSON QR data URL
  Web->>User: Displays single QR code

  User->>PWA: Scans QR code with camera
  PWA->>Push: PushManager.subscribe(VAPID public key)
  Push-->>PWA: PushSubscription object
  PWA->>PWA: 1. Generate WebCrypto ECDSA P-256 keypair (private non-extractable)<br/>2. Generate AES-GCM key in IndexedDB<br/>3. Encrypt TOTP secret with AES-GCM
  PWA->>API: POST /api/enroll/complete { enroll_token, push_sub, public_key (JWK), device_name }
  API->>DB: Validate token, save device (status: pending_verification), save encrypted TOTP secret
  API-->>PWA: 200 OK (Device enrolled)

  PWA->>PWA: Starts 30s TOTP timer & displays live 6-digit code
  User->>Web: Types 6-digit TOTP code from PWA
  Web->>API: POST /api/enroll/verify-totp { code }
  API->>API: Verify TOTP code (±1 window) & anti-replay
  API->>DB: Mark 2FA enabled, activate device, generate 10 recovery codes
  API-->>Web: 200 OK + 10 Recovery Codes
  Web->>User: Confirms 2FA is Active & shows backup codes
```

---

## 3. Login Flow with Number Matching (Push Fatigue Defense)

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant Web as Demo Website
  participant API as Backend API
  participant Push as Web Push Service
  participant SW as Service Worker
  participant PWA as Authenticator PWA
  participant DB as PostgreSQL DB

  User->>Web: Enters Email & Password
  Web->>API: POST /api/auth/login { email, password }
  API->>API: Verify password with Argon2id
  API-->>Web: 200 OK { twoFactorRequired: true, userId }

  Web->>API: POST /api/login/start { userId }
  API->>API: 1. Generate 2-digit challenge number (e.g. 42)<br/>2. Generate 2 decoys (e.g. 17, 85)<br/>3. Create login_request (60s expiry)
  API->>DB: Store login_request with nonce & status='pending'
  API->>Push: Send push notification with options to active devices
  Push->>SW: Deliver push notification
  API-->>Web: Return { requestId, challengeNumber: 42, expiresAt }

  par Web Polling
    Web->>Web: Displays large number "42" with 60s countdown
    loop Every 1.5 seconds
      Web->>API: GET /api/login/status/:requestId
      API-->>Web: { status: 'pending' }
    end
  and Push Approval on Mobile
    SW->>PWA: Opens PWA to approval screen
    PWA->>PWA: Shows 3 touch buttons: [17, 42, 85]
    User->>PWA: Selects "42" and taps "Approve"
    PWA->>PWA: Constructs canonical payload:<br/>{ request_id, chosen_number: 42, decision: 'approve', timestamp }
    PWA->>PWA: Signs payload with private ECDSA key (IEEE P1363 output)
    PWA->>API: POST /api/login/respond { request_id, chosen_number, decision, timestamp, signature }
  end

  API->>API: 1. Verify timestamp freshness (±120s)<br/>2. Verify ECDSA signature against saved JWK<br/>3. Check number match (42 == 42)
  API->>DB: Update login_request SET status='approved', session_token=token
  API-->>PWA: 200 OK (Approved)

  Web->>API: GET /api/login/status/:requestId
  API-->>Web: { status: 'approved', token: session_token }
  Web->>Web: Stores session cookie & redirects to Dashboard
```

---

## 4. Fallback Login Workflows

If the user does not have push connectivity or loses their phone:

```mermaid
graph TD
  Start["User enters password"] --> TwoFactorPrompt["2FA Challenge Screen"]
  TwoFactorPrompt -->|Primary Path| PushApproval["Push Approval with Number Matching"]
  TwoFactorPrompt -->|Fallback 1| TOTPInput["Enter 6-Digit Live TOTP Code"]
  TwoFactorPrompt -->|Fallback 2| RecoveryInput["Enter 8-Character Recovery Code"]

  PushApproval -->|PWA Signs Request| BackendVerify["Backend Cryptographic Verification"]
  TOTPInput -->|POST /api/login/verify-totp| VerifyTOTP["Verify with otplib + Anti-Replay Check"]
  RecoveryInput -->|POST /api/login/recovery| VerifyRecovery["Match SHA-256 Hash in recovery_codes"]

  BackendVerify -->|Success| Dashboard["Dashboard Access Granted"]
  VerifyTOTP -->|Success| Dashboard
  VerifyRecovery -->|Success & Code Burned| Dashboard
```

---

## 5. Security & Cryptographic Invariants

| Layer | Implementation | Security Properties |
|---|---|---|
| **TOTP Secret At Rest** | AES-256-GCM with 96-bit random IV & 128-bit authentication tag | Confidentiality & integrity; ciphertext cannot be read if DB is compromised. |
| **Password Hashing** | Argon2id (`m=65536, t=3, p=1`) | Memory-hard defense against GPU/ASIC brute force attacks. |
| **PWA Private Keys** | WebCrypto `SubtleCrypto.generateKey` (`extractable: false`) | Key material is hardware-bound in the browser and cannot be extracted via JavaScript inspection. |
| **PWA Secret Storage** | IndexedDB with local non-extractable AES-GCM key | Stored secrets are encrypted even within client browser storage. |
| **Push Approval Signatures** | ECDSA with curve P-256 and SHA-256 (IEEE P1363 raw signature) | Cryptographically authenticates the physical device that approved the request. |
| **Push Fatigue Defense** | 2-digit number challenge matching | Prevents users from mindlessly approving unsolicited push prompts. |
| **Anti-Replay Protection** | Timestamp freshness check (120s) + Single-use token tracking in database | Prevents interception and resubmission of approved payloads. |

