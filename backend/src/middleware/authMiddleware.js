import { verifySessionToken } from '../services/cryptoService.js';
import { query } from '../db/index.js';

export async function requireAuth(req, res, next) {
  let token = null;

  // Check Bearer token header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.session) {
    token = req.cookies.session;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const payload = verifySessionToken(token);
  if (!payload || !payload.userId) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  // Fetch tenant member to verify account is still active
  const result = await query(
    `SELECT id, email, role, is_super_admin FROM tenant_members WHERE id = $1`,
    [payload.userId]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'User not found' });
  }

  req.user = result.rows[0];
  next();
}
