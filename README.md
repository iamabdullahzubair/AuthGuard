# AuthGuard: Custom Authenticator PWA with Dual TOTP + Web Push Approval

A full-stack, enterprise-grade authentication system featuring a custom **Authenticator Progressive Web App (PWA)** that registers for **BOTH** standard **RFC 6238 TOTP** codes and **Web Push login approvals with 2-digit number matching** from a single QR code scan.

---

## 🌟 Key Features

1. **Single QR Code Dual-Enrollment**:
   - Scanning one QR code simultaneously configures:
     - Standard **RFC 6238 TOTP** (6-digit, 30s rotating window, SHA-1).
     - **Web Push login approval** with VAPID subscription and hardware-backed ECDSA P-256 keys.
2. **Push Fatigue Protection (Number Matching)**:
   - Login prompts generate a random 2-digit number (e.g. `42`) on the website.
   - The push notification presents 3 randomized options (1 correct, 2 decoys).
   - The user must match the number to prevent accidental or fatigue-induced approvals.
3. **Hardware-Backed WebCrypto Signatures**:
   - The PWA generates an **ECDSA P-256 key pair** (`extractable: false`).
   - Approval payloads are cryptographically signed on the device (IEEE P1363 raw signature) and verified on the backend using Node.js `crypto.verify`.
4. **Encrypted Secret Storage**:
   - Backend encrypts TOTP secrets at rest with **AES-256-GCM** using a 256-bit key.
   - PWA encrypts the local TOTP secret in IndexedDB with a local non-extractable **AES-GCM** key.
5. **Anti-Replay & Code Burning**:
   - TOTP codes cannot be reused within the same time window.
   - Login requests are single-use, protected with nonces, and expire in 60 seconds.
   - Enroll tokens are single-use and expire in 5 minutes.
6. **Graceful Fallbacks**:
   - If push notifications are delayed or unavailable, the user can type the rotating 6-digit TOTP code or enter one of 10 hashed recovery backup codes.
7. **Production Security**:
   - Rate limiting on authentication and recovery endpoints with account lockout.
   - Automatic removal and revocation of expired or invalid (`410/404`) push subscriptions.
   - Security headers with `helmet`, restricted CORS, and sanitized audit logging.

---

## 🏗️ Project Architecture

```
.
├── backend/
│   ├── src/
│   │   ├── config/          # Environment validation (Zod) and WebPush VAPID setup
│   │   ├── db/              # PostgreSQL pool & automated schema initialization
│   │   ├── middleware/      # Rate limiters (strict for auth/recovery), Helmet, Auth
│   │   ├── routes/          # auth, enroll, login, devices, vapid
│   │   ├── services/        # AES-256-GCM, Argon2id, ECDSA verification, otplib, WebPush, Audit
│   │   ├── app.js           # Express application setup & static hosting
│   │   └── server.js        # Server entrypoint
│   └── tests/               # Automated unit & integration tests
├── pwa/                     # Authenticator PWA (Offline shell, dark mode)
│   ├── public/              # manifest.json, sw.js, and app icons
│   ├── src/                 # WebCrypto ECDSA, IndexedDB store, Web Push, TOTP engine, Scanner
│   └── index.html           # PWA application layout
├── website/                 # Demo Website Portal
│   ├── src/                 # Dashboard, 2FA QR modal, 2-digit number challenge & polling
│   └── index.html           # Website layout
├── docker-compose.yml       # PostgreSQL 16 container definition
├── ARCHITECTURE.md          # Visual architecture and sequence flow diagrams
├── LIMITATIONS.md           # Known limitations and enterprise hardening roadmap
└── README.md
```

---

## 🚀 Quick Start (Localhost)

### 1. Prerequisites
- **Node.js**: v18+ (tested on v24)
- **Docker & Docker Compose**: For running PostgreSQL

### 2. Start PostgreSQL
```bash
docker compose up -d
```
*PostgreSQL 16 will start on `localhost:5432` with user `postgres` and database `authenticator_db`.*

### 3. Install Backend Dependencies
```bash
cd backend
npm install
```

### 4. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(Pre-configured VAPID keys and a random 32-byte AES key are already provided in `backend/.env` for immediate local testing).*

#### How to Generate New VAPID Keys:
If you want to generate fresh VAPID keys:
```bash
node -e "import('web-push').then(wp => console.log(wp.default.generateVAPIDKeys()))"
```

#### How to Generate a New AES-256 Key:
```bash
node -e "console.log(crypto.randomBytes(32).toString('hex'))"
```

### 5. Start the Server
```bash
npm start
```

The unified server will launch on port `3001`:
- 🌐 **Demo Website**: [http://localhost:3001](http://localhost:3001)
- 📱 **Authenticator PWA**: [http://localhost:3001/pwa/](http://localhost:3001/pwa/)
- 🩺 **Health Check API**: [http://localhost:3001/api/health](http://localhost:3001/api/health)

---

## 🧪 Running Automated Tests

Run the full automated test suite (Unit tests + End-to-End integration tests):

```bash
cd backend
npm test
```

### Tests Covered:
- **TOTP Service (RFC 6238)**: Secret generation, token verification ($\pm 1$ window), and anti-replay code burning.
- **Cryptographic Services**: AES-256-GCM encryption/decryption at rest, Argon2id password hashing, WebCrypto ECDSA P-256 IEEE P1363 signature verification, and tamper detection.
- **Enrollment Service**: 32-byte enroll token generation, single-use enforcement, and 5-minute expiration.
- **Login & Number Matching**: Push request creation, challenge and decoy verification, number match validation, and replay timestamp freshness.
- **End-to-End HTTP Integration**: Full simulated flow from user registration $\rightarrow$ QR enrollment $\rightarrow$ TOTP activation $\rightarrow$ Push approval $\rightarrow$ Recovery fallback $\rightarrow$ Device revocation.

---

## 📱 Testing with a Real Phone over HTTPS

Browsers require **HTTPS** for camera access (QR scanning) and Web Push notifications. To test on a real phone:

### Option A: Using Cloudflare Tunnel (Recommended, Zero Signup)
```bash
cloudflared tunnel --url http://localhost:3001
```

### Option B: Using ngrok
```bash
ngrok http 3001
```

### Testing Steps on Mobile:
1. Update `APP_URL` in `backend/.env` to your HTTPS tunnel URL (e.g. `https://xxxx.ngrok-free.app`), then restart the backend.
2. On your **Desktop computer**, open `https://xxxx.ngrok-free.app/`.
3. Register an account and click **Enable 2FA** to display the QR code.
4. On your **Mobile Phone**:
   - Open `https://xxxx.ngrok-free.app/pwa/`.
   - **For iOS (iOS 16.4+)**: Tap the Share button in Safari $\rightarrow$ **Add to Home Screen**, then launch it from the Home Screen (Apple requires this for Web Push).
   - **For Android**: Tap **Install** or Add to Home Screen in Chrome.
5. In the PWA, navigate to the **Scan** tab, grant camera permission, and scan the QR code displayed on your desktop screen.
6. The PWA will register push, generate non-extractable keys, and display your rotating 6-digit TOTP code.
7. Type the 6-digit code on the desktop website to confirm setup and save your 10 recovery codes.
8. **Test Push Approval**:
   - On the desktop, log out and sign back in.
   - The desktop displays a 2-digit number (e.g., `58`).
   - Your phone receives a push notification! Tap it or open the PWA: select `58` from the 3 choices and tap **Approve**.
   - The desktop automatically logs in and unlocks the dashboard!

---

## 🔒 Security Summary

| Feature | Implementation Details |
|---|---|
| **Secret Encryption at Rest** | AES-256-GCM with 96-bit random IV and 128-bit authentication tag |
| **Password Hashing** | Argon2id (`m=64MB, t=3, p=1`) |
| **Key Pair Generation** | WebCrypto ECDSA P-256 (`extractable: false`) |
| **Digital Signatures** | WebCrypto ECDSA IEEE P1363 raw signature verified via Node `crypto.verify` |
| **Push Fatigue Defense** | 2-digit challenge number with 2 decoys (user must pick correct match) |
| **Rate Limiting** | Stricter tier for auth endpoints, lockout for 15 minutes after 5 failed attempts |
| **Audit Logging** | Security events logged to `audit_logs` without credentials or secrets |

