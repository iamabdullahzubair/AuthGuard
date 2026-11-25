import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';

export async function insertAuditLog(entry, db = pool) {
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO audit_logs
       (id, tenant_id, user_id, event, ip_address, user_agent, metadata,
        actor_email, actor_role, actor_is_super_admin, target_member_id, target_email,
        session_id, request_id, impersonated_tenant_id, outcome)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [id, entry.tenantId, entry.actorId, entry.event, entry.ipAddress, entry.userAgent,
      JSON.stringify(entry.metadata), entry.actorEmail, entry.actorRole, entry.actorIsSuperAdmin,
      entry.targetMemberId, entry.targetEmail, entry.sessionId, entry.requestId,
      entry.impersonatedTenantId, entry.outcome]
  );
  return id;
}

const filtersSql = ({ tenantId, search, event, startDate, endDate }) => {
  const params = [];
  const where = [];
  const add = (value) => { params.push(value); return `$${params.length}`; };
  if (tenantId) where.push(`a.tenant_id = ${add(tenantId)}`);
  if (search) {
    const p = add(`%${search}%`);
    where.push(`(a.event ILIKE ${p} OR COALESCE(a.actor_email, '') ILIKE ${p}
      OR COALESCE(a.target_email, '') ILIKE ${p} OR COALESCE(t.name, '') ILIKE ${p}
      OR COALESCE(t.slug, '') ILIKE ${p})`);
  }
  if (event) where.push(`a.event = ${add(event)}`);
  if (startDate) where.push(`a.created_at >= ${add(startDate)}::date`);
  if (endDate) where.push(`a.created_at < (${add(endDate)}::date + INTERVAL '1 day')`);
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
};

export async function queryAuditLogs(filters) {
  const { where, params } = filtersSql(filters);
  const listParams = [...params, filters.limit, filters.offset];
  const limitParam = `$${params.length + 1}`;
  const offsetParam = `$${params.length + 2}`;
  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT a.id, a.tenant_id, a.user_id AS actor_id, a.actor_email, a.actor_role,
              a.actor_is_super_admin, a.event, a.target_member_id, a.target_email,
              a.session_id, a.request_id, a.impersonated_tenant_id, a.outcome,
              a.ip_address, a.user_agent, a.metadata, a.created_at,
              t.name AS tenant_name, t.slug AS tenant_slug
         FROM audit_logs a LEFT JOIN tenants t ON t.id = a.tenant_id
         ${where}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}`,
      listParams
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total
         FROM audit_logs a LEFT JOIN tenants t ON t.id = a.tenant_id
         ${where}`,
      params
    ),
  ]);
  return { logs: rows.rows, total: count.rows[0]?.total ?? 0 };
}
