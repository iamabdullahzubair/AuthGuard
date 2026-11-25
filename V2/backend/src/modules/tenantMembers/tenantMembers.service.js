import argon2 from 'argon2';
import { auditRequest } from '../audit/audit.service.js';
import {
  deleteTenantMember,
  insertTenantMember,
  listTenantMembers,
  updateTenantMemberRole,
} from './tenantMembers.repository.js';

const passwordOptions = { type: argon2.argon2id, memoryCost: 65_536, timeCost: 3, parallelism: 1 };
const reservedRoles = new Set(['owner', 'admin', 'super admin', 'super_admin']);

export class TenantMemberError extends Error {
  constructor(status, message, code = 'TENANT_MEMBER_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function normalizeRole(role) {
  const value = role.trim();
  if (reservedRoles.has(value.toLowerCase())) {
    throw new TenantMemberError(400, 'Choose a custom role name; reserved roles cannot be assigned here', 'RESERVED_ROLE');
  }
  return value;
}

export async function getTenantMembers(tenantId) {
  return { members: await listTenantMembers(tenantId) };
}

export async function createTenantMember({ tenantId, email, password, role, req }) {
  try {
    const member = await insertTenantMember({
      tenantId,
      email: email.trim().toLowerCase(),
      passwordHash: await argon2.hash(password, passwordOptions),
      role: normalizeRole(role),
    });
    await auditRequest(req, { event: 'TENANT_MEMBER_CREATED', tenantId, targetMemberId: member.id, targetEmail: member.email, metadata: { role: member.role, mustChangePassword: true } });
    return { member };
  } catch (error) {
    if (error.code === '23505') {
      throw new TenantMemberError(409, 'This email is already registered', 'EMAIL_ALREADY_EXISTS');
    }
    throw error;
  }
}

export async function changeTenantMemberRole({ tenantId, memberId, role, req }) {
  const result = await updateTenantMemberRole({ tenantId, memberId, role: normalizeRole(role) });
  if (!result) throw new TenantMemberError(404, 'Member not found or cannot be changed', 'MEMBER_NOT_FOUND');
  await auditRequest(req, { event: 'TENANT_MEMBER_ROLE_CHANGED', tenantId, targetMemberId: result.member.id, targetEmail: result.member.email, metadata: { previousRole: result.previousRole, role: result.member.role } });
  return { member: result.member };
}

export async function removeTenantMember({ tenantId, memberId, req }) {
  const removed = await deleteTenantMember({ tenantId, memberId });
  if (!removed) throw new TenantMemberError(404, 'Member not found or cannot be removed', 'MEMBER_NOT_FOUND');
  await auditRequest(req, { event: 'TENANT_MEMBER_REMOVED', tenantId, targetMemberId: removed.id, targetEmail: removed.email, metadata: { role: removed.role } });
  return null;
}
