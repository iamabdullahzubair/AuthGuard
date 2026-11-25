import { z } from 'zod';
import { APIResponse } from '../../common/APIResponse.js';
import { getAuditLogs } from './audit.service.js';

export class AuditError extends Error {
  constructor(status, message, code = 'AUDIT_ERROR') { super(message); this.status = status; this.code = code; }
}

const querySchema = z.object({
  search: z.string().trim().max(120).default(''),
  event: z.string().trim().max(120).default(''),
  tenantId: z.string().trim().max(64).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

function parseQuery(query) {
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) throw new AuditError(400, parsed.error.issues[0]?.message || 'Invalid audit log filters', 'INVALID_QUERY');
  for (const value of [parsed.data.startDate, parsed.data.endDate].filter(Boolean)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
      throw new AuditError(400, 'Enter a valid calendar date', 'INVALID_DATE');
    }
  }
  if (parsed.data.startDate && parsed.data.endDate && parsed.data.startDate > parsed.data.endDate) {
    throw new AuditError(400, 'Start date must be before or equal to end date', 'INVALID_DATE_RANGE');
  }
  return parsed.data;
}

export const auditController = {
  async listPlatform(req, res) {
    return APIResponse.success(res, await getAuditLogs(parseQuery(req.query)));
  },
  async listTenant(req, res) {
    const filters = parseQuery(req.query);
    return APIResponse.success(res, await getAuditLogs({ ...filters, tenantId: req.tenant.id }));
  },
};
