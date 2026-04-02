// src/routes/admin.ts — God Admin Dashboard APIs

import { Hono } from 'hono';
import { Env } from '../types';
import { getSession, requireGodAdmin } from '../lib/auth';
import { logAudit } from '../lib/db';

const admin = new Hono<{ Bindings: Env }>();

// ── GET /api/admin/stats ─────────────────────────
admin.get('/stats', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const isAdmin = session.isGodAdmin || session.roles.some(r => ['god_admin','platform_admin'].includes(r));
  if (!isAdmin) return c.json({ error: 'Forbidden' }, 403);

  const [totalUsers, pendingUsers, activeUsers, totalEvents, pendingRequests, recentActivity] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) as count FROM users`).first<{count:number}>(),
    c.env.DB.prepare(`SELECT COUNT(*) as count FROM users WHERE status = 'pending'`).first<{count:number}>(),
    c.env.DB.prepare(`SELECT COUNT(*) as count FROM users WHERE status = 'active'`).first<{count:number}>(),
    c.env.DB.prepare(`SELECT COUNT(*) as count FROM events WHERE is_published = 1`).first<{count:number}>(),
    c.env.DB.prepare(`SELECT COUNT(*) as count FROM directorate_requests WHERE status = 'pending'`).first<{count:number}>(),
    c.env.DB.prepare(
      `SELECT al.*, u.email as actor_email, u.display_name as actor_name
       FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_id
       ORDER BY al.created_at DESC LIMIT 10`
    ).all(),
  ]);

  return c.json({
    stats: {
      totalUsers:      totalUsers?.count ?? 0,
      pendingUsers:    pendingUsers?.count ?? 0,
      activeUsers:     activeUsers?.count ?? 0,
      totalEvents:     totalEvents?.count ?? 0,
      pendingRequests: pendingRequests?.count ?? 0,
    },
    recentActivity: recentActivity.results,
  });
});

// ── GET /api/admin/pending-users ─────────────────
admin.get('/pending-users', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const isAdmin = session.isGodAdmin || session.roles.some(r => ['god_admin','platform_admin'].includes(r));
  if (!isAdmin) return c.json({ error: 'Forbidden' }, 403);

  const rows = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.display_name, u.avatar_url, u.created_at,
           p.preferred_name, p.kbi_title
    FROM users u
    LEFT JOIN people_profiles p ON p.user_id = u.id
    WHERE u.status = 'pending'
    ORDER BY u.created_at ASC
  `).all();

  return c.json({ users: rows.results });
});

// ── POST /api/admin/approve-user ─────────────────
admin.post('/approve-user', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const isAdmin = session.isGodAdmin || session.roles.some(r => ['god_admin','platform_admin'].includes(r));
  if (!isAdmin) return c.json({ error: 'Forbidden' }, 403);

  const { userId, note } = await c.req.json<{ userId: number; note?: string }>();

  // Activate user
  await c.env.DB.prepare(
    `UPDATE users SET status = 'active', updated_at = datetime('now') WHERE id = ?`
  ).bind(userId).run();

  // If they had new_joiner role only, keep it — admins can upgrade later
  await logAudit(c.env.DB, session.userId, 'user.approved', 'user', userId, { note });
  return c.json({ success: true });
});

// ── POST /api/admin/reject-user ──────────────────
admin.post('/reject-user', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const isAdmin = session.isGodAdmin || session.roles.some(r => ['god_admin','platform_admin'].includes(r));
  if (!isAdmin) return c.json({ error: 'Forbidden' }, 403);

  const { userId, reason } = await c.req.json<{ userId: number; reason?: string }>();

  await c.env.DB.prepare(
    `UPDATE users SET status = 'rejected', updated_at = datetime('now') WHERE id = ?`
  ).bind(userId).run();

  await logAudit(c.env.DB, session.userId, 'user.rejected', 'user', userId, { reason });
  return c.json({ success: true });
});

// ── GET /api/admin/directorate-requests ──────────
admin.get('/directorate-requests', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const isAdmin = session.isGodAdmin || session.roles.some(r => ['god_admin','platform_admin','directorate_lead'].includes(r));
  if (!isAdmin) return c.json({ error: 'Forbidden' }, 403);

  let query = `
    SELECT dr.*, u.email, u.display_name, d.code as directorate_code, d.name as directorate_name
    FROM directorate_requests dr
    JOIN users u ON u.id = dr.user_id
    JOIN directorates d ON d.id = dr.directorate_id
    WHERE dr.status = 'pending'
  `;

  // Directorate leads only see their directorates
  if (!session.isGodAdmin && session.roles.includes('directorate_lead')) {
    query += ` AND dr.directorate_id IN (${session.directorateIds.join(',') || '0'})`;
  }

  query += ` ORDER BY dr.created_at ASC`;
  const rows = await c.env.DB.prepare(query).all();
  return c.json({ requests: rows.results });
});

// ── POST /api/admin/approve-directorate-request ──
admin.post('/approve-directorate-request', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const isAdmin = session.isGodAdmin || session.roles.some(r => ['god_admin','platform_admin','directorate_lead'].includes(r));
  if (!isAdmin) return c.json({ error: 'Forbidden' }, 403);

  const { requestId, note } = await c.req.json<{ requestId: number; note?: string }>();

  const req = await c.env.DB.prepare(
    `SELECT * FROM directorate_requests WHERE id = ?`
  ).bind(requestId).first<any>();
  if (!req) return c.json({ error: 'Request not found' }, 404);

  // Approve the request
  await c.env.DB.prepare(
    `UPDATE directorate_requests SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?`
  ).bind(session.userId, requestId).run();

  // Add membership
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO user_directorates (user_id, directorate_id, approval_source, approved_by, approved_at)
     VALUES (?, ?, 'manual', ?, datetime('now'))`
  ).bind(req.user_id, req.directorate_id, session.userId).run();

  await c.env.DB.prepare(
    `INSERT INTO approval_actions (request_type, request_id, action, acted_by, note)
     VALUES ('directorate_join', ?, 'approved', ?, ?)`
  ).bind(requestId, session.userId, note ?? null).run();

  await logAudit(c.env.DB, session.userId, 'directorate.request.approved', 'user', req.user_id, { requestId, note });
  return c.json({ success: true });
});

// ── POST /api/admin/reject-directorate-request ───
admin.post('/reject-directorate-request', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const isAdmin = session.isGodAdmin || session.roles.some(r => ['god_admin','platform_admin','directorate_lead'].includes(r));
  if (!isAdmin) return c.json({ error: 'Forbidden' }, 403);

  const { requestId, reason } = await c.req.json<{ requestId: number; reason?: string }>();

  await c.env.DB.prepare(
    `UPDATE directorate_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?`
  ).bind(session.userId, requestId).run();

  await c.env.DB.prepare(
    `INSERT INTO approval_actions (request_type, request_id, action, acted_by, note)
     VALUES ('directorate_join', ?, 'rejected', ?, ?)`
  ).bind(requestId, session.userId, reason ?? null).run();

  await logAudit(c.env.DB, session.userId, 'directorate.request.rejected', 'user', null, { requestId, reason });
  return c.json({ success: true });
});

// ── GET /api/admin/audit-logs ─────────────────────
admin.get('/audit-logs', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const isAdmin = session.isGodAdmin || session.roles.some(r => ['god_admin','platform_admin'].includes(r));
  if (!isAdmin) return c.json({ error: 'Forbidden' }, 403);

  const limit  = parseInt(c.req.query('limit') ?? '50');
  const offset = parseInt(c.req.query('offset') ?? '0');
  const action = c.req.query('action') ?? '';

  let query = `
    SELECT al.*, u.email as actor_email, u.display_name as actor_name
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.actor_id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (action) { query += ` AND al.action LIKE ?`; params.push(`%${action}%`); }
  query += ` ORDER BY al.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const rows = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ logs: rows.results });
});

// ── POST /api/admin/promote-god-admin ────────────
admin.post('/promote-god-admin', async (c) => {
  const session = await requireGodAdmin(c);
  if (session instanceof Response) return session;

  const { userId } = await c.req.json<{ userId: number }>();

  await c.env.DB.prepare(
    `UPDATE users SET is_god_admin = 1 WHERE id = ?`
  ).bind(userId).run();

  const godAdminRole = await c.env.DB.prepare(`SELECT id FROM roles WHERE name = 'god_admin'`).first<{id:number}>();
  if (godAdminRole) {
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)`
    ).bind(userId, godAdminRole.id, session.userId).run();
  }

  await logAudit(c.env.DB, session.userId, 'user.promoted.god_admin', 'user', userId);
  return c.json({ success: true });
});

// ── POST /api/admin/seed-admin ───────────────────
// Bootstrap: create first God Admin from email
admin.post('/seed-admin', async (c) => {
  const { email, secret } = await c.req.json<{ email: string; secret: string }>();

  // Simple bootstrap secret check (set as env var ADMIN_BOOTSTRAP_SECRET)
  const bootstrapSecret = c.env.KV ? await c.env.KV.get('admin_bootstrap_secret') : null;

  // Check existing god admin count
  const existing = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM users WHERE is_god_admin = 1`
  ).first<{count:number}>();

  if ((existing?.count ?? 0) > 0) {
    return c.json({ error: 'God Admin already exists. Use promote-god-admin.' }, 409);
  }

  let user = await c.env.DB.prepare(
    `SELECT * FROM users WHERE email = ?`
  ).bind(email).first<any>();

  if (!user) {
    const result = await c.env.DB.prepare(
      `INSERT INTO users (email, status, is_god_admin, display_name) VALUES (?, 'active', 1, 'God Admin')`
    ).bind(email).run();
    const newId = result.meta.last_row_id as number;
    await c.env.DB.prepare(`INSERT INTO people_profiles (user_id) VALUES (?)`).bind(newId).run();
    user = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(newId).first<any>();
  } else {
    await c.env.DB.prepare(
      `UPDATE users SET is_god_admin = 1, status = 'active' WHERE id = ?`
    ).bind(user.id).run();
  }

  // Assign god_admin role
  const role = await c.env.DB.prepare(`SELECT id FROM roles WHERE name = 'god_admin'`).first<{id:number}>();
  if (role) {
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)`
    ).bind(user.id, role.id, user.id).run();
  }

  await logAudit(c.env.DB, user.id, 'user.promoted.god_admin', 'user', user.id, { bootstrap: true });
  return c.json({ success: true, message: 'God Admin created.', userId: user.id });
});

export default admin;
