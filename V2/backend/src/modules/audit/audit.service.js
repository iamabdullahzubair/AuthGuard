import { insertAuditLog, queryAuditLogs } from './audit.repository.js';

export async function recordAuditEvent(entry, db) {
  try {
    return await insertAuditLog({
      tenantId: entry.tenantId || null,
      actorId: entry.actorId || null,
      actorEmail: entry.actorEmail?.trim().toLowerCase() || null,
      actorRole: entry.actorRole || null,
      actorIsSuperAdmin: Boolean(entry.actorIsSuperAdmin),
      event: entry.event,
      targetMemberId: entry.targetMemberId || null,
      targetEmail: entry.targetEmail?.trim().toLowerCase() || null,
      sessionId: entry.sessionId || null,
      requestId: entry.requestId || null,
      impersonatedTenantId: entry.impersonatedTenantId || null,
      ipAddress: entry.ipAddress || null,
      userAgent: entry.userAgent?.slice(0, 500) || null,
      outcome: entry.outcome || 'success',
      metadata: entry.metadata || {},
    }, db);
  } catch (error) {
    // Audit persistence must not make an already-completed user operation look unsuccessful.
    if (db) throw error;
    console.error('[v2 audit] event could not be persisted', { event: entry.event, message: error.message });
    return null;
  }
}

export function auditRequest(req, { event, tenantId, targetMemberId, targetEmail, impersonatedTenantId, outcome, metadata = {}, actorEmail, actorRole } = {}, db) {
  const isSuperAdmin = Boolean(req.member?.isSuperAdmin);
  return recordAuditEvent({
    tenantId: tenantId ?? req.tenant?.id ?? null,
    actorId: req.member?.id || null,
    actorEmail: actorEmail ?? req.member?.email,
    actorRole: actorRole ?? (isSuperAdmin ? 'super_admin' : req.member?.role),
    actorIsSuperAdmin: isSuperAdmin,
    event,
    targetMemberId,
    targetEmail,
    sessionId: req.authSession?.id,
    requestId: req.get?.('x-request-id')?.slice(0, 128),
    impersonatedTenantId: impersonatedTenantId ?? (req.isImpersonating ? req.tenant?.id : null),
    ipAddress: req.ip,
    userAgent: req.get?.('user-agent'),
    outcome,
    metadata,
  }, db);
}

export async function getAuditLogs(filters) {
  const result = await queryAuditLogs(filters);
  return {
    logs: result.logs.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      tenantSlug: row.tenant_slug,
      actorId: row.actor_id,
      actorEmail: row.actor_email,
      actorRole: row.actor_role,
      actorIsSuperAdmin: row.actor_is_super_admin,
      event: row.event,
      targetMemberId: row.target_member_id,
      targetEmail: row.target_email,
      sessionId: row.session_id,
      requestId: row.request_id,
      impersonatedTenantId: row.impersonated_tenant_id,
      outcome: row.outcome,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      metadata: row.metadata,
      createdAt: row.created_at,
    })),
    pagination: { total: result.total, limit: filters.limit, offset: filters.offset, hasMore: filters.offset + result.logs.length < result.total },
  };
}
