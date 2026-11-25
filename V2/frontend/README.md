# AuthGuard V2 Portal

This is the V2 Next.js portal, isolated from the existing `frontend/` application. It currently covers the V2 API surface: tenant registration and sign-in, workspace overview, owner-only member management, forced first-login password change, active sessions, password changes, and Super Admin tenant directory/search and impersonation.

## Run locally

1. Copy `.env.example` to `.env.local`.
2. Set `V2_API_BASE_URL` to the V2 API address (default `http://127.0.0.1:3100`). This value is used by Next.js server code only.
3. Keep `V2_SESSION_TTL_DAYS` aligned with the backend value if you customize the session TTL.
4. Install dependencies with `npm ci` and run `npm run dev`.

The portal uses a same-origin Next.js route handler as a backend-for-frontend proxy. The opaque API session token is stored in an `HttpOnly`, `SameSite=Lax` cookie, never in browser storage or a JavaScript response. Server Components use that cookie to fetch protected page data from the V2 API with caching disabled. Set `Secure` cookies automatically by running production behind HTTPS.

Keep V1 and V2 independently deployable. The V2 portal does not call V1 endpoints. New screens should only be added when their corresponding V2 API exists; V1 API-key, webhook, end-user, and branding screens are intentionally not copied because their V2 management APIs are not available yet.

Most routes and page shells are Server Components. Client Components are limited to forms, navigation state, and actions that need browser interaction.
