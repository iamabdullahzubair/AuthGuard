import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';

export async function findMemberForLogin(email) {
  const result = await pool.query(
    `SELECT m.id, m.tenant_id, m.email, m.password_hash, m.role,
            m.must_change_password,
            m.is_super_admin, t.name AS tenant_name, t.slug AS tenant_slug,
            t.status AS tenant_status, t.tier, t.branding
       FROM tenant_members m
       LEFT JOIN tenants t ON t.id = m.tenant_id
      WHERE lower(m.email) = $1`, [email]
  );
  return result.rows[0] || null;
}

export async function createSession({ memberId, token, expiresAt, ipAddress, userAgent, deviceName, deviceType }) {
  const session = {
    id: crypto.randomUUID(),
    tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
  };
  await pool.query(
    `INSERT INTO auth_sessions
       (id, member_id, token_hash, expires_at, ip_address, user_agent, device_name, device_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [session.id, memberId, session.tokenHash, expiresAt, ipAddress || null,
      userAgent?.slice(0, 500) || null, deviceName, deviceType]
  );
  return session.id;
}

export async function registerTenantMember({ tenant, member, session }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO tenants (id, name, slug, status, tier, branding)
       VALUES ($1, $2, $3, 'active', 'developer', $4::jsonb)`,
      [tenant.id, tenant.name, tenant.slug, JSON.stringify({ issuerName: tenant.name, primaryColor: '#3b82f6' })]
    );
    await client.query(
      `INSERT INTO tenant_members (id, tenant_id, email, password_hash, role, is_super_admin)
       VALUES ($1, $2, $3, $4, 'owner', false)`,
      [member.id, tenant.id, member.email, member.passwordHash]
    );
    await client.query(
      `INSERT INTO auth_sessions
         (id, member_id, token_hash, expires_at, ip_address, user_agent, device_name, device_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [session.id, member.id, session.tokenHash, session.expiresAt, session.ipAddress || null,
        session.userAgent?.slice(0, 500) || null, session.deviceName, session.deviceType]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function findSession(tokenHash) {
  const result = await pool.query(
    `SELECT s.id AS session_id, s.member_id, s.impersonation_tenant_id,
            m.email, m.role, m.is_super_admin, m.must_change_password,
            m.tenant_id AS home_tenant_id,
            ht.name AS home_tenant_name, ht.slug AS home_tenant_slug,
            ht.status AS home_tenant_status, ht.tier AS home_tier, ht.branding AS home_branding,
            tt.id AS target_id, tt.name AS target_name, tt.slug AS target_slug,
            tt.status AS target_status, tt.tier AS target_tier, tt.branding AS target_branding
       FROM auth_sessions s
       JOIN tenant_members m ON m.id = s.member_id
       LEFT JOIN tenants ht ON ht.id = m.tenant_id
       LEFT JOIN tenants tt ON tt.id = s.impersonation_tenant_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
    [tokenHash]
  );
  return result.rows[0] || null;
}

export async function touchSession(sessionId) {
  await pool.query(
    `UPDATE auth_sessions SET last_seen_at = NOW()
      WHERE id = $1 AND last_seen_at < NOW() - INTERVAL '5 minutes'`, [sessionId]
  );
}

export async function revokeSession(sessionId) {
  await pool.query(`UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`, [sessionId]);
}

export async function revokeAllMemberSessions(memberId) {
  const result = await pool.query(
    `UPDATE auth_sessions SET revoked_at = NOW()
      WHERE member_id = $1 AND revoked_at IS NULL`, [memberId]
  );
  return result.rowCount;
}

export async function listActiveMemberSessions(memberId, currentSessionId) {
  const result = await pool.query(
    `SELECT id, device_name, device_type, created_at, last_seen_at, expires_at, ip_address,
            user_agent, (id = $2) AS is_current
       FROM auth_sessions
      WHERE member_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
      ORDER BY last_seen_at DESC`, [memberId, currentSessionId]
  );
  return result.rows;
}

export async function revokeMemberSession(memberId, sessionId) {
  const result = await pool.query(
    `UPDATE auth_sessions SET revoked_at = NOW()
      WHERE member_id = $1 AND id = $2 AND revoked_at IS NULL AND expires_at > NOW()
      RETURNING id`, [memberId, sessionId]
  );
  return result.rowCount > 0;
}

export async function changeMemberPassword({ memberId, currentSessionId, passwordHash }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE tenant_members
          SET password_hash = $1, must_change_password = false, updated_at = NOW()
        WHERE id = $2`,
      [passwordHash, memberId]
    );
    await client.query(
      `UPDATE auth_sessions SET revoked_at = NOW()
        WHERE member_id = $1 AND id <> $2 AND revoked_at IS NULL`, [memberId, currentSessionId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getMemberPassword(memberId) {
  const result = await pool.query(
    `SELECT id, email, password_hash FROM tenant_members WHERE id = $1`, [memberId]
  );
  return result.rows[0] || null;
}

export async function setImpersonationTenant(sessionId, tenantId, tokenHash) {
  const result = await pool.query(
    `UPDATE auth_sessions s SET impersonation_tenant_id = $2, token_hash = $3
      FROM tenant_members m
      WHERE s.id = $1 AND s.member_id = m.id
        AND m.is_super_admin = true AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
      RETURNING s.id`, [sessionId, tenantId, tokenHash]
  );
  return result.rowCount > 0;
}

export async function clearImpersonationTenant(sessionId, tokenHash) {
  const result = await pool.query(
    `UPDATE auth_sessions s SET impersonation_tenant_id = NULL, token_hash = $2
      FROM tenant_members m
      WHERE s.id = $1 AND s.member_id = m.id AND m.is_super_admin = true
        AND s.revoked_at IS NULL AND s.expires_at > NOW()
      RETURNING s.id`, [sessionId, tokenHash]
  );
  return result.rowCount > 0;
}

export async function findTenantById(tenantId) {
  const result = await pool.query(
    `SELECT id, name, slug, status, tier, branding FROM tenants WHERE id = $1`, [tenantId]
  );
  return result.rows[0] || null;
}
