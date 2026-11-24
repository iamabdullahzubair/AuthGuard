import { z } from 'zod';
import { APIResponse } from '../../common/APIResponse.js';
import {
  changeTenantMemberRole,
  createTenantMember,
  getTenantMembers,
  removeTenantMember,
  TenantMemberError,
} from './tenantMembers.service.js';

const memberSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  role: z.string().trim().min(2).max(50),
});
const roleSchema = z.object({ role: z.string().trim().min(2).max(50) });

function parseBody(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new TenantMemberError(400, parsed.error.issues[0]?.message || 'Invalid request');
  return parsed.data;
}

export const tenantMembersController = {
  async list(req, res) {
    return APIResponse.success(res, await getTenantMembers(req.tenant.id));
  },

  async create(req, res) {
    const input = parseBody(memberSchema, req.body);
    return APIResponse.success(res, await createTenantMember({ tenantId: req.tenant.id, ...input }), {
      statusCode: 201,
      message: 'Tenant member created',
    });
  },

  async updateRole(req, res) {
    const { role } = parseBody(roleSchema, req.body);
    return APIResponse.success(res, await changeTenantMemberRole({
      tenantId: req.tenant.id,
      memberId: req.params.memberId,
      role,
    }), { message: 'Tenant member role updated' });
  },

  async remove(req, res) {
    return APIResponse.success(res, await removeTenantMember({
      tenantId: req.tenant.id,
      memberId: req.params.memberId,
    }), { message: 'Tenant member removed' });
  },
};
