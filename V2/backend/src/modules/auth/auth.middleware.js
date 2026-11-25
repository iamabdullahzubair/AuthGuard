import crypto from 'node:crypto';
import { APIResponse } from '../../common/APIResponse.js';
import { findSession, touchSession } from './auth.repository.js';

export async function requireSession(req, res, next) {
  const header = req.get('authorization') || '';
  const match = /^Bearer\s+([A-Za-z0-9_-]{40,100})$/i.exec(header);
  if (!match) return APIResponse.error(res, { statusCode: 401, code: 'AUTHENTICATION_REQUIRED', message: 'Authentication required' });

  const token = match[1];
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  try {
    const session = await findSession(tokenHash);
    if (!session) return APIResponse.error(res, { statusCode: 401, code: 'SESSION_INVALID', message: 'Session is invalid or expired' });

    const isSuperAdmin = Boolean(session.is_super_admin);
    if (session.home_tenant_status && session.home_tenant_status !== 'active' && !isSuperAdmin) {
      return APIResponse.error(res, { statusCode: 403, code: 'TENANT_SUSPENDED', message: 'Tenant workspace is suspended' });
    }

    if (session.impersonation_tenant_id && !isSuperAdmin) {
      return APIResponse.error(res, { statusCode: 403, code: 'INVALID_SESSION_SCOPE', message: 'Invalid session scope' });
    }

    const impersonating = Boolean(session.impersonation_tenant_id && session.target_id);
    const tenant = impersonating
      ? {
          id: session.target_id,
          name: session.target_name,
          slug: session.target_slug,
          status: session.target_status,
          tier: session.target_tier,
          branding: session.target_branding,
        }
      : session.home_tenant_id
        ? {
            id: session.home_tenant_id,
            name: session.home_tenant_name,
            slug: session.home_tenant_slug,
            status: session.home_tenant_status,
            tier: session.home_tier,
            branding: session.home_branding,
          }
        : null;

    req.member = {
      id: session.member_id,
      email: session.email,
      role: impersonating ? 'owner' : session.role,
      isSuperAdmin,
      mustChangePassword: Boolean(session.must_change_password),
    };
    req.tenant = tenant;
    req.authSession = { id: session.session_id };
    req.authToken = token;
    await touchSession(session.session_id);
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requirePasswordChangeComplete(req, res, next) {
  if (req.member?.mustChangePassword) {
    return APIResponse.error(res, {
      statusCode: 403,
      code: 'PASSWORD_CHANGE_REQUIRED',
      message: 'Change your password before using this endpoint',
    });
  }
  return next();
}

export function requireSuperAdmin(req, res, next) {
  if (!req.member?.isSuperAdmin) return APIResponse.error(res, { statusCode: 403, code: 'SUPER_ADMIN_REQUIRED', message: 'Super Admin access required' });
  return next();
}

export function requireTenantOwner(req, res, next) {
  if (req.member?.isSuperAdmin || req.member?.role !== 'owner' || !req.tenant?.id) {
    return APIResponse.error(res, { statusCode: 403, code: 'TENANT_OWNER_REQUIRED', message: 'Tenant owner access required' });
  }
  return next();
}
