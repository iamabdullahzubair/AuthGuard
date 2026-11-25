import argon2 from 'argon2';
import crypto from 'node:crypto';
import { listTenants, createTenant as insertTenant, updateTenant as persistTenantUpdate, resetTenantOwnerPassword as persistPasswordReset } from './superAdmin.repository.js';

const passwordOptions = { type: argon2.argon2id, memoryCost: 65_536, timeCost: 3, parallelism: 1 };
const tiers = new Set(['developer', 'pro', 'enterprise']);

export class SuperAdminError extends Error {
  constructor(status, message, code = 'SUPER_ADMIN_ERROR') { super(message); this.status = status; this.code = code; }
}

export async function getTenantDirectory({ search = '', limit = 20, offset = 0 }) {
  const result = await listTenants({ search: search.trim(), limit, offset });
  return {
    tenants: result.tenants,
    pagination: {
      total: result.total,
      limit,
      offset,
      hasMore: offset + result.tenants.length < result.total,
    },
  };
}

export async function onboardTenant({ name, slug, ownerEmail, initialPassword, tier, actor, req }) {
  const cleanName = name.trim();
  const cleanSlug = slug.trim().toLowerCase();
  const cleanEmail = ownerEmail.trim().toLowerCase();
  if (!tiers.has(tier)) throw new SuperAdminError(400, 'Choose a valid tenant tier', 'INVALID_TIER');
  if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(cleanSlug)) throw new SuperAdminError(400, 'Slug must use lowercase letters, numbers, and internal hyphens', 'INVALID_SLUG');
  const passwordHash = await argon2.hash(initialPassword, passwordOptions);
  try {
    await insertTenant({ id: crypto.randomUUID(), name: cleanName, slug: cleanSlug, tier, ownerId: crypto.randomUUID(), ownerEmail: cleanEmail, passwordHash, actor, ipAddress: req.ip, userAgent: req.get('user-agent') });
  } catch (error) {
    if (error.code === '23505') throw new SuperAdminError(409, 'Tenant slug or owner email is already in use', 'ALREADY_EXISTS');
    throw error;
  }
  return { name: cleanName, slug: cleanSlug, ownerEmail: cleanEmail, tier };
}

export async function changeTenant(tenantId, input, actor, req) {
  const changes = {};
  if (input.name !== undefined) changes.name = input.name.trim();
  if (input.status !== undefined) changes.status = input.status;
  if (input.tier !== undefined) changes.tier = input.tier;
  if (!Object.keys(changes).length) throw new SuperAdminError(400, 'Provide a tenant name, status, or tier to update', 'EMPTY_UPDATE');
  if (changes.status !== undefined && !['active', 'suspended'].includes(changes.status)) throw new SuperAdminError(400, 'Status must be active or suspended', 'INVALID_STATUS');
  if (changes.tier !== undefined && !tiers.has(changes.tier)) throw new SuperAdminError(400, 'Choose a valid tenant tier', 'INVALID_TIER');
  const tenant = await persistTenantUpdate({ tenantId, changes, actor, ipAddress: req.ip, userAgent: req.get('user-agent') });
  if (!tenant) throw new SuperAdminError(404, 'Tenant not found', 'TENANT_NOT_FOUND');
  return tenant;
}

export async function resetTenantOwnerPassword(tenantId, newPassword, actor, req) {
  const passwordHash = await argon2.hash(newPassword, passwordOptions);
  const result = await persistPasswordReset({ tenantId, passwordHash, actor, ipAddress: req.ip, userAgent: req.get('user-agent') });
  if (!result) throw new SuperAdminError(404, 'Tenant owner account not found', 'TENANT_OWNER_NOT_FOUND');
  return { ownerEmail: result.email, mustChangePassword: true };
}
