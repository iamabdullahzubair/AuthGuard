import { z } from 'zod';
import { APIResponse } from '../../common/APIResponse.js';
import { getTenantDirectory } from './superAdmin.service.js';

const querySchema = z.object({
  search: z.string().trim().max(120).default(''),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export class SuperAdminError extends Error {
  constructor(status, message, code = 'SUPER_ADMIN_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const superAdminController = {
  async listTenants(req, res) {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new SuperAdminError(400, parsed.error.issues[0]?.message || 'Invalid query parameters', 'INVALID_QUERY');
    }
    return APIResponse.success(res, await getTenantDirectory(parsed.data));
  },
};
