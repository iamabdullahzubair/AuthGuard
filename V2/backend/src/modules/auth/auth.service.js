import argon2 from 'argon2';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { auditRequest, recordAuditEvent } from '../audit/audit.service.js';
import {
  clearRateLimit,
  consumeAttempt,
  isRateLimited,
  makeRateLimitKey,
  recordFailedAttempt,
} from './authRateLimitStore.js';
import {
  changeMemberPassword,
  clearImpersonationTenant,
  createSession,
  findMemberForLogin,
  findActiveTenantBySlug,
  findTenantById,
  getMemberPassword,
  listActiveMemberSessions,
  registerTenantMember,
  revokeAllMemberSessions,
  revokeMemberSession,
  revokeSession,
  setImpersonationTenant,
} from './auth.repository.js';

export class AuthError extends Error {
  constructor(status, message, code = 'AUTH_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const passwordOptions = { type: argon2.argon2id, memoryCost: 65_536, timeCost: 3, parallelism: 1 };
let dummyHashPromise;

function getDummyPasswordHash() {
  dummyHashPromise ??= argon2.hash(crypto.randomBytes(32).toString('hex'), passwordOptions);
  return dummyHashPromise;
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function makeSession({ memberId, req, deviceName, deviceType = 'web' }) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + env.V2_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const defaults = { web: 'Browser', pwa: 'Authenticator PWA', mobile: 'Mobile device' };
  const resolvedDeviceName = deviceName?.trim() || defaults[deviceType];
  return {
    token,
    expiresAt,
    record: {
      id: crypto.randomUUID(),
      memberId,
      tokenHash: tokenHash(token),
      expiresAt,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      deviceName: resolvedDeviceName,
      deviceType,
    },
  };
}

function loginAttemptKey(email, ip) {
  return makeRateLimitKey(`login-account\0${email}\0${ip || 'unknown'}`);
}

function loginIpAttemptKey(ip) {
  return makeRateLimitKey(`login-ip\0${ip || 'unknown'}`);
}

function memberResponse(member) {
  return {
    id: member.id,
    email: member.email,
    role: member.role,
    isSuperAdmin: Boolean(member.is_super_admin),
    mustChangePassword: Boolean(member.must_change_password),
  };
}

function tenantResponse(tenant) {
  if (!tenant) return null;
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    tier: tenant.tier,
    branding: tenant.branding,
  };
}

function responseForMember(member) {
  return {
    member: memberResponse(member),
    tenant: member.tenant_id ? tenantResponse({
      id: member.tenant_id,
      name: member.tenant_name,
      slug: member.tenant_slug,
      tier: member.tier,
      branding: member.branding,
    }) : null,
  };
}

export async function registerTenantOwner({ companyName, slug, email, password, deviceName, deviceType, req }) {
  const normalizedEmail = email.trim().toLowerCase();
  const registrationKey = makeRateLimitKey(`registration\0${req.ip || 'unknown'}`);
  const registrationAttempts = await consumeAttempt(registrationKey, env.V2_LOGIN_WINDOW_SECONDS);
  if (registrationAttempts > env.V2_REGISTER_MAX_ATTEMPTS) {
    throw new AuthError(429, 'Too many registration attempts. Try again later.', 'REGISTRATION_THROTTLED');
  }
  const baseSlug = (slug || companyName)
    .trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'workspace';
  const tenantSlug = slug ? baseSlug : `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;
  const tenant = { id: crypto.randomUUID(), name: companyName.trim(), slug: tenantSlug };
  const member = {
    id: crypto.randomUUID(),
    tenant_id: tenant.id,
    email: normalizedEmail,
    role: 'owner',
    is_super_admin: false,
    passwordHash: await argon2.hash(password, passwordOptions),
  };
  const session = makeSession({ memberId: member.id, req, deviceName, deviceType });
  try {
    await registerTenantMember({ tenant, member, session: session.record });
  } catch (error) {
    if (error.code === '23505') {
      throw new AuthError(409, 'Email or workspace slug is already in use', 'ALREADY_EXISTS');
    }
    throw error;
  }
  await recordAuditEvent({
    tenantId: tenant.id, actorId: member.id, actorEmail: member.email, actorRole: 'owner',
    event: 'TENANT_OWNER_REGISTERED', sessionId: session.record.id, ipAddress: req.ip,
    userAgent: req.get('user-agent'), metadata: { tenantName: tenant.name, tenantSlug: tenant.slug },
  });

  return {
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
    member: memberResponse(member),
    tenant: { ...tenant, tier: 'developer' },
  };
}

export async function loginMember({ email, password, deviceName, deviceType, req }) {
  const normalizedEmail = email.trim().toLowerCase();
  const attemptKey = loginAttemptKey(normalizedEmail, req.ip);
  const ipAttemptKey = loginIpAttemptKey(req.ip);
  if (await isRateLimited(attemptKey, env.V2_LOGIN_MAX_ATTEMPTS) ||
      await isRateLimited(ipAttemptKey, env.V2_LOGIN_IP_MAX_ATTEMPTS)) {
    throw new AuthError(429, 'Too many login attempts. Try again later.', 'LOGIN_THROTTLED');
  }

  const member = await findMemberForLogin(normalizedEmail);
  const passwordValid = member
    ? await argon2.verify(member.password_hash, password).catch(() => false)
    : await argon2.verify(await getDummyPasswordHash(), password).catch(() => false);

  if (!member || !passwordValid) {
    await recordAuditEvent({ tenantId: member?.tenant_id, actorEmail: normalizedEmail, event: 'AUTH_LOGIN_FAILED', outcome: 'failure', ipAddress: req.ip, userAgent: req.get('user-agent'), metadata: { reason: 'invalid_credentials' } });
    await Promise.all([
      recordFailedAttempt(attemptKey, env.V2_LOGIN_WINDOW_SECONDS),
      recordFailedAttempt(ipAttemptKey, env.V2_LOGIN_WINDOW_SECONDS),
    ]);
    throw new AuthError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  if (member.tenant_status && member.tenant_status !== 'active' && !member.is_super_admin) {
    await recordAuditEvent({ tenantId: member.tenant_id, actorId: member.id, actorEmail: member.email, actorRole: member.role, event: 'AUTH_LOGIN_BLOCKED', outcome: 'failure', ipAddress: req.ip, userAgent: req.get('user-agent'), metadata: { reason: 'tenant_suspended' } });
    throw new AuthError(403, 'Tenant workspace is suspended', 'TENANT_SUSPENDED');
  }

  await clearRateLimit(attemptKey);
  const session = makeSession({ memberId: member.id, req, deviceName, deviceType });
  const sessionId = await createSession({
    memberId: member.id,
    token: session.token,
    expiresAt: session.expiresAt,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    deviceName: session.record.deviceName,
    deviceType: session.record.deviceType,
  });
  await recordAuditEvent({ tenantId: member.tenant_id, actorId: member.id, actorEmail: member.email, actorRole: member.is_super_admin ? 'super_admin' : member.role, actorIsSuperAdmin: Boolean(member.is_super_admin), event: 'AUTH_LOGIN_SUCCEEDED', sessionId, ipAddress: req.ip, userAgent: req.get('user-agent'), metadata: { deviceType: session.record.deviceType, deviceName: session.record.deviceName } });
  return {
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
    ...responseForMember(member),
  };
}

export async function resolveTenantLoginContext(slug) {
  const tenant = await findActiveTenantBySlug(slug.trim());
  return tenant ? { tenant } : { tenant: null };
}

export async function logout(sessionId, req) {
  await revokeSession(sessionId);
  await auditRequest(req, { event: 'AUTH_LOGOUT' });
  return null;
}

export async function logoutEverywhere(memberId, req) {
  const revokedSessions = await revokeAllMemberSessions(memberId);
  await auditRequest(req, { event: 'AUTH_LOGOUT_ALL', metadata: { revokedSessions } });
  return { revokedSessions };
}

export async function getActiveSessions(memberId, currentSessionId) {
  const sessions = await listActiveMemberSessions(memberId, currentSessionId);
  return {
    sessions: sessions.map((session) => ({
      id: session.id,
      deviceName: session.device_name,
      deviceType: session.device_type,
      createdAt: session.created_at,
      lastSeenAt: session.last_seen_at,
      expiresAt: session.expires_at,
      ipAddress: session.ip_address,
      userAgent: session.user_agent,
      current: session.is_current,
    })),
  };
}

export async function revokeOneSession(memberId, currentSessionId, targetSessionId, req) {
  const revoked = await revokeMemberSession(memberId, targetSessionId);
  if (!revoked) throw new AuthError(404, 'Active session not found', 'SESSION_NOT_FOUND');
  await auditRequest(req, { event: 'AUTH_SESSION_REVOKED', metadata: { revokedSessionId: targetSessionId } });
  return { currentSession: targetSessionId === currentSessionId };
}

export async function changePassword({ memberId, sessionId, currentPassword, newPassword, req }) {
  const member = await getMemberPassword(memberId);
  if (!member) throw new AuthError(401, 'Account is unavailable', 'ACCOUNT_MISSING');
  const valid = await argon2.verify(member.password_hash, currentPassword).catch(() => false);
  if (!valid) throw new AuthError(400, 'Current password is incorrect', 'INVALID_CURRENT_PASSWORD');
  if (currentPassword === newPassword) {
    throw new AuthError(400, 'New password must differ from the current password', 'PASSWORD_UNCHANGED');
  }
  const passwordHash = await argon2.hash(newPassword, passwordOptions);
  await changeMemberPassword({ memberId, currentSessionId: sessionId, passwordHash });
  await auditRequest(req, { event: 'AUTH_PASSWORD_CHANGED' });
  return null;
}

export async function impersonateTenant(sessionId, tenantId, req) {
  const tenant = await findTenantById(tenantId);
  if (!tenant) throw new AuthError(404, 'Tenant not found', 'TENANT_NOT_FOUND');
  const token = crypto.randomBytes(32).toString('base64url');
  const updated = await setImpersonationTenant(sessionId, tenantId, tokenHash(token));
  if (!updated) throw new AuthError(401, 'Session is no longer valid', 'SESSION_INVALID');
  await auditRequest(req, { event: 'SUPER_ADMIN_IMPERSONATION_STARTED', tenantId: tenant.id, impersonatedTenantId: tenant.id, metadata: { tenantName: tenant.name, tenantSlug: tenant.slug } });
  return { token, tenant: tenantResponse(tenant) };
}

export async function exitTenantImpersonation(sessionId, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  const updated = await clearImpersonationTenant(sessionId, tokenHash(token));
  if (!updated) throw new AuthError(401, 'Session is no longer valid', 'SESSION_INVALID');
  await auditRequest(req, { event: 'SUPER_ADMIN_IMPERSONATION_ENDED', tenantId: req.tenant?.id, impersonatedTenantId: req.tenant?.id, metadata: { tenantName: req.tenant?.name, tenantSlug: req.tenant?.slug } });
  return { token, tenant: null };
}
