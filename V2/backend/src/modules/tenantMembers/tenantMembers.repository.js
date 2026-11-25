import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';

export async function listTenantMembers(tenantId) {
  const result = await pool.query(
    `SELECT id, email, role, must_change_password, created_at, updated_at
       FROM tenant_members
      WHERE tenant_id = $1 AND is_super_admin = false
      ORDER BY created_at ASC`,
    [tenantId]
  );
  return result.rows;
}

export async function insertTenantMember({ tenantId, email, passwordHash, role }) {
  const result = await pool.query(
    `INSERT INTO tenant_members
       (id, tenant_id, email, password_hash, role, is_super_admin, must_change_password)
     VALUES ($1, $2, $3, $4, $5, false, true)
     RETURNING id, email, role, must_change_password, created_at, updated_at`,
    [crypto.randomUUID(), tenantId, email, passwordHash, role]
  );
  return result.rows[0];
}

export async function updateTenantMemberRole({ tenantId, memberId, role }) {
  const before = await pool.query(
    `SELECT role FROM tenant_members WHERE tenant_id = $1 AND id = $2 AND is_super_admin = false AND role <> 'owner'`,
    [tenantId, memberId]
  );
  if (!before.rowCount) return null;
  const result = await pool.query(
    `UPDATE tenant_members
        SET role = $3, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2 AND is_super_admin = false AND role <> 'owner'
      RETURNING id, email, role, must_change_password, created_at, updated_at`,
    [tenantId, memberId, role]
  );
  return result.rows[0] ? { member: result.rows[0], previousRole: before.rows[0].role } : null;
}

export async function deleteTenantMember({ tenantId, memberId }) {
  const result = await pool.query(
    `DELETE FROM tenant_members
      WHERE tenant_id = $1 AND id = $2 AND is_super_admin = false AND role <> 'owner'
      RETURNING id, email, role`,
    [tenantId, memberId]
  );
  return result.rows[0] || null;
}
