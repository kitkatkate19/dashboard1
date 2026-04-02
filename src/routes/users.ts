// src/routes/users.ts — User management & profile APIs

import { Hono } from 'hono';
import { Env } from '../types';
import { getSession, requireAuth } from '../lib/auth';
import { logAudit } from '../lib/db';

const users = new Hono<{ Bindings: Env }>();

// ── GET /api/users ───────────────────────────────
// List users (admin only)
users.get('/', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const isAdmin = session.isGodAdmin || session.roles.some(r => ['god_admin','platform_admin'].includes(r));
  if (!isAdmin) return c.json({ error: 'Forbidden' }, 403);

  const status = c.req.query('status') ?? 'active';
  const search = c.req.query('search') ?? '';
  const limit  = parseInt(c.req.query('limit') ?? '50');
  const offset = parseInt(c.req.query('offset') ?? '0');

  let query = `
    SELECT u.id, u.email, u.display_name, u.avatar_url, u.status, u.is_god_admin,
           u.created_at, u.last_login_at,
           p.preferred_name, p.kbi_title, p.location
    FROM users u
    LEFT JOIN people_profiles p ON p.user_id = u.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (status !== 'all') { query += ` AND u.status = ?`; params.push(status); }
  if (search) { query += ` AND (u.email LIKE ? OR u.display_name LIKE ? OR p.preferred_name LIKE ?)`; const s = `%${search}%`; params.push(s, s, s); }

  query += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const rows = await c.env.DB.prepare(query).bind(...params).all();
  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM users u LEFT JOIN people_profiles p ON p.user_id = u.id WHERE 1=1 ${status !== 'all' ? 'AND u.status = ?' : ''}`
  ).bind(...(status !== 'all' ? [status] : [])).first<{total: number}>();

  return c.json({ users: rows.results, total: countRow?.total ?? 0, limit, offset });
});

// ── GET /api/users/:id ───────────────────────────
users.get('/:id', async (c) => {
  const session = await requireAuth(c);
  if (session instanceof Response) return session;

  const userId = parseInt(c.req.param('id'));
  const isSelf = session.userId === userId;
  const isAdmin = session.isGodAdmin || session.roles.some(r => ['god_admin','platform_admin'].includes(r));

  const user = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.display_name, u.avatar_url, u.status, u.is_god_admin, u.created_at,
           p.preferred_name, p.kbi_title, p.department, p.location, p.bio, p.phone,
           p.linkedin_url, p.timezone, p.start_date, p.manager_user_id, p.education,
           p.experience, p.skills, p.pronouns, p.is_profile_public, p.profile_photo_key
    FROM users u
    LEFT JOIN people_profiles p ON p.user_id = u.id
    WHERE u.id = ?
  `).bind(userId).first<any>();

  if (!user) return c.json({ error: 'User not found' }, 404);
  if (!user.is_profile_public && !isSelf && !isAdmin) return c.json({ error: 'Profile is private' }, 403);

  // Attach roles
  const roles = await c.env.DB.prepare(
    `SELECT r.name, r.label FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?`
  ).bind(userId).all();

  // Attach directorates
  const directorates = await c.env.DB.prepare(`
    SELECT d.id, d.code, d.name, d.color, ud.is_primary
    FROM directorates d
    JOIN user_directorates ud ON ud.directorate_id = d.id
    WHERE ud.user_id = ?
  `).bind(userId).all();

  // Attach teams
  const teams = await c.env.DB.prepare(`
    SELECT t.id, t.name, tm.role FROM teams t
    JOIN team_memberships tm ON tm.team_id = t.id
    WHERE tm.user_id = ?
  `).bind(userId).all();

  return c.json({ ...user, roles: roles.results, directorates: directorates.results, teams: teams.results });
});

// ── PUT /api/users/:id/profile ───────────────────
users.put('/:id/profile', async (c) => {
  const session = await requireAuth(c);
  if (session instanceof Response) return session;

  const userId = parseInt(c.req.param('id'));
  const isSelf = session.userId === userId;
  const isAdmin = session.isGodAdmin || session.roles.some(r => ['god_admin','platform_admin'].includes(r));
  if (!isSelf && !isAdmin) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json<any>();
  const allowed = ['preferred_name','kbi_title','department','location','bio','phone',
                   'linkedin_url','timezone','education','experience','skills','pronouns','is_profile_public'];

  const fields = Object.keys(body).filter(k => allowed.includes(k));
  if (fields.length === 0) return c.json({ error: 'No valid fields' }, 400);

  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => {
    const v = body[f];
    return typeof v === 'object' ? JSON.stringify(v) : v;
  });

  await c.env.DB.prepare(
    `UPDATE people_profiles SET ${setClause}, updated_at = datetime('now') WHERE user_id = ?`
  ).bind(...values, userId).run();

  await logAudit(c.env.DB, session.userId, 'profile.updated', 'user', userId, { fields });
  return c.json({ success: true });
});

// ── PUT /api/users/:id/status ────────────────────
users.put('/:id/status', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const isAdmin = session.isGodAdmin || session.roles.some(r => ['god_admin','platform_admin'].includes(r));
  if (!isAdmin) return c.json({ error: 'Forbidden' }, 403);

  const userId = parseInt(c.req.param('id'));
  const { status, note } = await c.req.json<{ status: string; note?: string }>();
  const validStatuses = ['pending','active','suspended','rejected'];
  if (!validStatuses.includes(status)) return c.json({ error: 'Invalid status' }, 400);

  await c.env.DB.prepare(
    `UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(status, userId).run();

  await logAudit(c.env.DB, session.userId, `user.status.${status}`, 'user', userId, { note });
  return c.json({ success: true });
});

// ── POST /api/users/:id/roles ────────────────────
users.post('/:id/roles', async (c) => {
  const session = await getSession(c);
  if (!session?.isGodAdmin && !session?.roles.includes('god_admin') && !session?.roles.includes('platform_admin')) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const userId = parseInt(c.req.param('id'));
  const { roleId } = await c.req.json<{ roleId: number }>();

  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)`
  ).bind(userId, roleId, session!.userId).run();

  await logAudit(c.env.DB, session!.userId, 'role.assigned', 'user', userId, { roleId });
  return c.json({ success: true });
});

// ── DELETE /api/users/:id/roles/:roleId ──────────
users.delete('/:id/roles/:roleId', async (c) => {
  const session = await getSession(c);
  if (!session?.isGodAdmin && !session?.roles.includes('god_admin')) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const userId = parseInt(c.req.param('id'));
  const roleId = parseInt(c.req.param('roleId'));

  await c.env.DB.prepare(
    `DELETE FROM user_roles WHERE user_id = ? AND role_id = ?`
  ).bind(userId, roleId).run();

  await logAudit(c.env.DB, session.userId, 'role.removed', 'user', userId, { roleId });
  return c.json({ success: true });
});

// ── GET /api/users/:id/audit ─────────────────────
users.get('/:id/audit', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const isAdmin = session.isGodAdmin || session.roles.some(r => ['god_admin','platform_admin'].includes(r));
  const isSelf = session.userId === parseInt(c.req.param('id'));
  if (!isAdmin && !isSelf) return c.json({ error: 'Forbidden' }, 403);

  const userId = parseInt(c.req.param('id'));
  const logs = await c.env.DB.prepare(
    `SELECT * FROM audit_logs WHERE actor_id = ? OR (target_type = 'user' AND target_id = ?) ORDER BY created_at DESC LIMIT 100`
  ).bind(userId, userId).all();

  return c.json({ logs: logs.results });
});

export default users;
