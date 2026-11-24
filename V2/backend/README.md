# Authenticator Backend V2

V2 is developed and deployed independently from the existing `backend/` service. It has its own environment file, server entry point, and PostgreSQL database. Do not point `V2_DATABASE_URL` at the v1 database.

## Local setup

1. Create a dedicated PostgreSQL database named `authenticator_v2` (or choose another name).
2. Copy `.env.example` to `.env` and set `V2_DATABASE_URL` to that database.
3. Set `V2_REDIS_URL` to the Redis endpoint. Generate a dedicated encryption key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and set `V2_ENCRYPTION_KEY` for the API and webhook worker processes that encrypt or decrypt webhook secrets. Keep the key out of git and do not reuse the v1 key.
4. Install dependencies with `npm install`.
5. Review pending migrations with `npm run db:status`.
6. Apply them explicitly with `npm run db:migrate`.
7. Set `V2_SUPER_ADMIN_EMAIL` and `V2_SUPER_ADMIN_PASSWORD` in the environment, then run `npm run auth:bootstrap-super-admin` once. This command creates the single platform administrator and refuses to create another.
8. Start the API with `npm run dev`.

The application does not apply schema changes during startup. Migrations are an explicit deployment step and are serialized with a PostgreSQL advisory lock. Applied migration files are immutable; schema changes go into a new migration. These initial migrations establish the v2 baseline and are not a v1 data migration.

## Migration conventions

- Keep each migration small and focused; name files with an increasing numeric prefix.
- Export `up(client)` from each migration. V2 uses forward-only migrations: fixes and schema changes are added as a new migration instead of automatically reversing a change that may already contain data.
- Never edit a migration after it has been applied. Add a forward migration instead.
- Back up production before applying migrations and apply them once as a release job, before starting new application instances.
- Use expand, backfill, verify, contract when changing structures that deployed code or data already uses.
- Keep seed data in separate idempotent scripts; do not put environment-specific credentials in migrations.

## Current scope

This is the v2 foundation plus a BullMQ-based webhook delivery slice. Domain code inserts an event through `recordWebhookEvent(client, ...)` using the same PostgreSQL transaction client as its business update. Run the API, `npm run relay:webhooks`, and `npm run worker:webhooks` as separate processes. They may run on separate hosts: configure the API and relay with the V2 PostgreSQL endpoint; configure the relay and delivery workers with the V2 Redis endpoint; configure workers with PostgreSQL too for delivery records. Use private network endpoints and TLS/authentication for remote PostgreSQL and Redis connections. The relay fans out durable outbox events and publishes stable delivery job IDs to BullMQ; the worker pins outbound HTTPS requests to validated public DNS addresses, signs payloads, and records each attempt. BullMQ retries transient errors with exponential backoff; non-retryable HTTP 4xx responses and redirects are recorded as permanent failures. Event IDs are sent as idempotency headers; receivers should deduplicate them because delivery is at least once. Redis persistence and `noeviction` are required for the queue in production, with failed-job monitoring and graceful worker shutdown.

Redis connection construction lives in `src/infra/redis/redisClient.js`. The API creates and connects its shared Redis client during startup, then closes it during shutdown. The relay and worker use the same module's BullMQ connection factory because they run as separate processes and need their own connections to the same Redis service.

### Authentication

V2 HTTP responses use the common envelope `{ "success": true, "message": "...", "data": ... }`; errors use `{ "success": false, "message": "...", "error": { "code": "..." } }`. HTTP status codes remain authoritative. The shared implementation is `src/common/APIResponse.js`.

- `POST /api/v2/auth/register` creates a tenant and its first owner account; it cannot create a Super Admin.
- `POST /api/v2/auth/login` signs in either a tenant member or the single bootstrapped Super Admin. Login/registration may include `deviceName` and `deviceType` (`web`, `pwa`, or `mobile`) to label the session.
- Authenticated routes: `GET /api/v2/auth/me`, `GET /api/v2/auth/sessions`, `DELETE /api/v2/auth/sessions/:sessionId`, `POST /api/v2/auth/logout`, `POST /api/v2/auth/logout-all`, `POST /api/v2/auth/change-password`.
- Tenant member management has its own `/api/v2/tenant-members` module and is owner-only: `GET /` lists members, `POST /` creates a member, `PATCH /:memberId/role` changes a member's role label, and `DELETE /:memberId` removes a member and cascades its sessions. Create accepts `{ "email": "member@example.com", "password": "initial-password", "role": "Support" }`. Role is a tenant-defined label only; it does not grant permissions. Reserved roles (`owner`, `admin`, `super_admin`) cannot be assigned, changed to, or removed through these routes. The member must sign in with the provided initial password and can then change it. Email is currently unique across the V2 platform.
- Example login body: `{ "email": "owner@example.com", "password": "…", "deviceName": "Work laptop", "deviceType": "web" }`. The sessions endpoint returns each active session with its ID, label, type, last-seen time, IP, user agent, expiry, and whether it is the current session.
- Super Admin only: `POST /api/v2/auth/impersonate/:tenantId` and `POST /api/v2/auth/exit-impersonation`.
- Sessions are random bearer tokens. Only their SHA-256 hashes are stored in PostgreSQL; sessions have a server-enforced expiry and can be revoked. Login and registration counters use atomic Redis increments with TTL, shared across API instances; the API requires the V2 Redis endpoint at startup.
- Set `V2_TRUST_PROXY_HOPS` to the exact number of trusted reverse-proxy hops when the API is behind a proxy. Leave it at `0` when directly exposed through the network boundary.

### Follow-up optimization

- Before scaling relay volume, reduce idle PostgreSQL polling. Consider adaptive backoff or PostgreSQL `LISTEN/NOTIFY` to wake the relay, while keeping a periodic outbox scan as recovery. PostgreSQL remains the source of truth so a missed notification cannot lose an event.
- Consider a short-lived Redis cache for active-session verification only after metrics show PostgreSQL session lookups are a bottleneck. Keep PostgreSQL authoritative, fall back to it on cache misses/Redis errors, and invalidate cached sessions on logout, password change, impersonation, and session revocation.
- When the end-user/MFA module is implemented, link each tenant's registering owner to an `end_users` identity so the owner's MFA enrollment and policy can use the same end-user flow.
- Add frontend controls for multi-device sessions. The backend supports parallel sessions per member, identifies each session by device name/type, lists active sessions, and revokes one session without affecting the others.

Feature API modules, a v1 data import plan, and realtime challenge updates are still later milestones. The frontend remains on v1 until the v2 API contract and cutover plan are ready.
