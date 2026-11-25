import { pool } from '../../db/pool.js';

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
