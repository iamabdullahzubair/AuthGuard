import { pool } from '../../db/pool.js';
import { recordAuditEvent } from '../audit/audit.service.js';

function tenantSearchSql() {
  return `($1 = '' OR t.name ILIKE '%' || $1 || '%'
          OR t.slug ILIKE '%' || $1 || '%'
          OR t.id ILIKE '%' || $1 || '%'
          OR EXISTS (
            SELECT 1 FROM tenant_members owner
             WHERE owner.tenant_id = t.id AND owner.role = 'owner'
               AND owner.email ILIKE '%' || $1 || '%'
          ))`;
}
export async function listTenants({ search, limit, offset }) {
  const [tenantsResult, countResult] = await Promise.all([
    pool.query(
      `SELECT t.id, t.name, t.slug, t.status, t.tier, t.created_at,
              COUNT(m.id)::int AS member_count,
              MAX(m.email) FILTER (WHERE m.role = 'owner') AS owner_email
         FROM tenants t
         LEFT JOIN tenant_members m ON m.tenant_id = t.id AND m.is_super_admin = false
        WHERE ${tenantSearchSql()}
        GROUP BY t.id
        ORDER BY t.created_at DESC, t.name ASC
        LIMIT $2 OFFSET $3`,
      [search, limit, offset]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total
         FROM tenants t
        WHERE ${tenantSearchSql()}`,
      [search]
    ),
  ]);

  return {
    tenants: tenantsResult.rows.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      tier: tenant.tier,
      createdAt: tenant.created_at,
      memberCount: tenant.member_count,
      ownerEmail: tenant.owner_email,
    })),
    total: countResult.rows[0]?.total ?? 0,
  };
}

export async function createTenant({ id, name, slug, tier, ownerId, ownerEmail, passwordHash, actor, ipAddress, userAgent }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO tenants (id, name, slug, status, tier, branding)
       VALUES ($1, $2, $3, 'active', $4, $5::jsonb)`,
      [id, name, slug, tier, JSON.stringify({ issuerName: name, primaryColor: '#3b82f6' })]
    );
    await client.query(
      `INSERT INTO tenant_members (id, tenant_id, email, password_hash, role, is_super_admin, must_change_password)
       VALUES ($1, $2, $3, $4, 'owner', false, true)`,
      [ownerId, id, ownerEmail, passwordHash]
    );
    await recordAuditEvent({ tenantId: id, actorId: actor.id, actorEmail: actor.email, actorRole: 'super_admin', actorIsSuperAdmin: true, event: 'SUPER_ADMIN_TENANT_CREATED', ipAddress, userAgent, metadata: { name, slug, tier, ownerEmail } }, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateTenant({ tenantId, changes, actor, ipAddress, userAgent }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT id, name, status, tier FROM tenants WHERE id = $1 FOR UPDATE', [tenantId]);
    if (!current.rowCount) { await client.query('ROLLBACK'); return null; }
    const before = current.rows[0];
    const fields = Object.keys(changes);
    const values = [tenantId];
    const assignments = fields.map((field, index) => { values.push(changes[field]); return `${field} = $${index + 2}`; });
    assignments.push('updated_at = NOW()');
    const updated = await client.query(`UPDATE tenants SET ${assignments.join(', ')} WHERE id = $1 RETURNING id, name, slug, status, tier, created_at`, values);
    await recordAuditEvent({ tenantId, actorId: actor.id, actorEmail: actor.email, actorRole: 'super_admin', actorIsSuperAdmin: true, event: 'SUPER_ADMIN_TENANT_UPDATED', ipAddress, userAgent, metadata: { changes: Object.fromEntries(fields.map((field) => [field, { from: before[field], to: changes[field] }])) } }, client);
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function resetTenantOwnerPassword({ tenantId, passwordHash, actor, ipAddress, userAgent }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const owner = await client.query(
      `SELECT m.id, m.email FROM tenant_members m
        WHERE m.tenant_id = $1 AND m.role = 'owner' AND m.is_super_admin = false
        ORDER BY m.created_at ASC LIMIT 1 FOR UPDATE`, [tenantId]
    );
    if (!owner.rowCount) { await client.query('ROLLBACK'); return null; }
    const target = owner.rows[0];
    await client.query(
      `UPDATE tenant_members SET password_hash = $1, must_change_password = true, updated_at = NOW() WHERE id = $2`,
      [passwordHash, target.id]
    );
    await client.query(`UPDATE auth_sessions SET revoked_at = NOW() WHERE member_id = $1 AND revoked_at IS NULL`, [target.id]);
    await recordAuditEvent({ tenantId, actorId: actor.id, actorEmail: actor.email, actorRole: 'super_admin', actorIsSuperAdmin: true, event: 'SUPER_ADMIN_TENANT_OWNER_PASSWORD_RESET', targetMemberId: target.id, targetEmail: target.email, ipAddress, userAgent, metadata: { targetMemberId: target.id, targetEmail: target.email } }, client);
    await client.query('COMMIT');
    return { email: target.email };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
