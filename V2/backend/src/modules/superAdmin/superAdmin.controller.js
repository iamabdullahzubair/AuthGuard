import { z } from 'zod';
import { APIResponse } from '../../common/APIResponse.js';
import { changeTenant, getTenantDirectory, onboardTenant, resetTenantOwnerPassword } from './superAdmin.service.js';
import { SuperAdminError } from './superAdmin.service.js';

const querySchema = z.object({
  search: z.string().trim().max(120).default(''),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

const tenantCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(1).max(48),
  ownerEmail: z.string().trim().email().max(254),
  initialPassword: z.string().min(12).max(128),
  tier: z.enum(['developer', 'pro', 'enterprise']),
});
const tenantUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  tier: z.enum(['developer', 'pro', 'enterprise']).optional(),
}).strict();
const resetPasswordSchema = z.object({ newPassword: z.string().min(12).max(128) });

function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) throw new SuperAdminError(400, result.error.issues[0]?.message || 'Invalid request', 'INVALID_INPUT');
  return result.data;
}

export const superAdminController = {
  async listTenants(req, res) {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new SuperAdminError(400, parsed.error.issues[0]?.message || 'Invalid query parameters', 'INVALID_QUERY');
    }
    return APIResponse.success(res, await getTenantDirectory(parsed.data));
  },

  async createTenant(req, res) {
    const input = parse(tenantCreateSchema, req.body);
    const tenant = await onboardTenant({ ...input, actor: req.member, req });
    return APIResponse.success(res, tenant, { statusCode: 201, message: 'Tenant onboarded' });
  },

  async updateTenant(req, res) {
    const input = parse(tenantUpdateSchema, req.body);
    return APIResponse.success(res, { tenant: await changeTenant(req.params.id, input, req.member, req) }, { message: 'Tenant updated' });
  },

  async resetTenantOwnerPassword(req, res) {
    const { newPassword } = parse(resetPasswordSchema, req.body);
    const data = await resetTenantOwnerPassword(req.params.id, newPassword, req.member, req);
    return APIResponse.success(res, data, { message: `Temporary password set for ${data.ownerEmail}; the owner must change it at next login` });
  },
};
