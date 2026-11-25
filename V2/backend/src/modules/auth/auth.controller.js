import { z } from 'zod';
import { APIResponse } from '../../common/APIResponse.js';
import {
  changePassword,
  exitTenantImpersonation,
  getActiveSessions,
  impersonateTenant,
  loginMember,
  logout,
  logoutEverywhere,
  registerTenantOwner,
  resolveTenantLoginContext,
  revokeOneSession,
} from './auth.service.js';
import { AuthError } from './auth.service.js';

const emailSchema = z.string().trim().email().max(254);
const registerSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(48).regex(/^[a-z0-9-]+$/).optional(),
  email: emailSchema,
  password: z.string().min(8).max(128),
  deviceName: z.string().trim().min(1).max(80).optional(),
  deviceType: z.enum(['web', 'pwa', 'mobile']).optional(),
});
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(1024),
  deviceName: z.string().trim().min(1).max(80).optional(),
  deviceType: z.enum(['web', 'pwa', 'mobile']).optional(),
});
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(8).max(128),
});

function parseBody(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AuthError(400, parsed.error.issues[0]?.message || 'Invalid request');
  return parsed.data;
}

export const authController = {
  async register(req, res) {
    const input = parseBody(registerSchema, req.body);
    const data = await registerTenantOwner({ ...input, req });
    return APIResponse.success(res, data, { statusCode: 201, message: 'Tenant registered' });
  },

  async login(req, res) {
    const input = parseBody(loginSchema, req.body);
    return APIResponse.success(res, await loginMember({ ...input, req }), { message: 'Login successful' });
  },

  async resolveTenant(req, res) {
    const slug = z.string().trim().min(1).max(48).safeParse(req.params.slug);
    if (!slug.success) throw new AuthError(400, 'Invalid tenant slug', 'INVALID_TENANT_SLUG');
    return APIResponse.success(res, await resolveTenantLoginContext(slug.data));
  },

  async logout(req, res) {
    return APIResponse.success(res, await logout(req.authSession.id), { message: 'Logged out' });
  },

  async logoutAll(req, res) {
    return APIResponse.success(res, await logoutEverywhere(req.member.id), { message: 'Logged out from all devices' });
  },

  async listSessions(req, res) {
    return APIResponse.success(res, await getActiveSessions(req.member.id, req.authSession.id));
  },

  async revokeSession(req, res) {
    return APIResponse.success(res, await revokeOneSession(req.member.id, req.authSession.id, req.params.sessionId), { message: 'Session revoked' });
  },

  me(req, res) {
    return APIResponse.success(res, {
      member: req.member,
      tenant: req.tenant,
      session: { id: req.authSession.id },
    });
  },

  async changePassword(req, res) {
    const input = parseBody(changePasswordSchema, req.body);
    return APIResponse.success(res, await changePassword({
      memberId: req.member.id,
      sessionId: req.authSession.id,
      ...input,
    }), { message: 'Password changed' });
  },

  async impersonate(req, res) {
    return APIResponse.success(res, await impersonateTenant(req.authSession.id, req.params.tenantId), { message: 'Tenant impersonation started' });
  },

  async exitImpersonation(req, res) {
    return APIResponse.success(res, await exitTenantImpersonation(req.authSession.id), { message: 'Tenant impersonation ended' });
  },
};
