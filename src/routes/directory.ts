// src/routes/directory.ts — People Directory & Org Chart

import { Hono } from 'hono';
import { Env } from '../types';
import { requireAuth } from '../lib/auth';

const directory = new Hono<{ Bindings: Env }>();

// ── GET /api/directory ───────────────────────────
// Permission-aware people directory listing
directory.get('/', async (c) => {
  const session = await requireAuth(c);
  if (session instanceof Response) return session;

  const search        = c.req.query('search') ?? '';
  const directorateId = c.req.query('directorate_id');
  const limit         = parseInt(c.req.query('limit') ?? '50');
  const offset        = parseInt(c.req.query('offset') ?? '0');

  let query = `
    SELECT u.id, u.email, u.display_name, u.avatar_url,
           p.preferred_name, p.kbi_title, p.department, p.location,
           p.linkedin_url, p.bio, p.skills, p.timezone, p.pronouns,
           p.profile_photo_key, p.is_profile_public
    FROM users u
    JOIN people_profiles p ON p.user_id = u.id
    WHERE u.status = 'active' AND p.is_profile_public = 1
  `;
  const params: any[] = [];

  if (search) {
    query += ` AND (u.display_name LIKE ? OR p.preferred_name LIKE ? OR p.kbi_title LIKE ? OR u.email LIKE ?)`;
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  if (directorateId) {
    query += ` AND u.id IN (SELECT user_id FROM user_directorates WHERE directorate_id = ?)`;
    params.push(parseInt(directorateId));
  }

  query += ` ORDER BY COALESCE(p.preferred_name, u.display_name) ASC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const rows = await c.env.DB.prepare(query).bind(...params).all<any>();

  // Attach directorate for each person
  const enriched = await Promise.all(
    rows.results.map(async (person) => {
      const dirs = await c.env.DB.prepare(`
        SELECT d.code, d.name, d.color FROM directorates d
        JOIN user_directorates ud ON ud.directorate_id = d.id
        WHERE ud.user_id = ?
      `).bind(person.id).all();
      return { ...person, directorates: dirs.results };
    })
  );

  return c.json({ people: enriched, total: rows.results.length });
});

// ── GET /api/directory/org-chart ─────────────────
// Hierarchical org chart data
directory.get('/org-chart', async (c) => {
  const session = await requireAuth(c);
  if (session instanceof Response) return session;

  // Get all active users with manager info
  const rows = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.display_name, u.avatar_url,
           p.preferred_name, p.kbi_title, p.department, p.manager_user_id,
           p.profile_photo_key
    FROM users u
    JOIN people_profiles p ON p.user_id = u.id
    WHERE u.status = 'active'
    ORDER BY p.preferred_name ASC
  `).all<any>();

  // Build adjacency list
  const peopleMap: Record<number, any> = {};
  rows.results.forEach(p => {
    peopleMap[p.id] = { ...p, reports: [] };
  });

  const roots: any[] = [];
  rows.results.forEach(p => {
    if (p.manager_user_id && peopleMap[p.manager_user_id]) {
      peopleMap[p.manager_user_id].reports.push(peopleMap[p.id]);
    } else {
      roots.push(peopleMap[p.id]);
    }
  });

  return c.json({ chart: roots });
});

// ── GET /api/directory/directorates ──────────────
directory.get('/directorates', async (c) => {
  const session = await requireAuth(c);
  if (session instanceof Response) return session;

  const rows = await c.env.DB.prepare(`
    SELECT d.*, COUNT(ud.user_id) as member_count
    FROM directorates d
    LEFT JOIN user_directorates ud ON ud.directorate_id = d.id
    WHERE d.is_active = 1
    GROUP BY d.id
    ORDER BY d.code ASC
  `).all();

  return c.json({ directorates: rows.results });
});

// ── GET /api/directory/teams ──────────────────────
directory.get('/teams', async (c) => {
  const session = await requireAuth(c);
  if (session instanceof Response) return session;

  const directorateId = c.req.query('directorate_id');
  let query = `
    SELECT t.*, d.code as directorate_code, d.name as directorate_name,
           COUNT(tm.user_id) as member_count,
           u.display_name as lead_name
    FROM teams t
    LEFT JOIN directorates d ON d.id = t.directorate_id
    LEFT JOIN team_memberships tm ON tm.team_id = t.id
    LEFT JOIN users u ON u.id = t.lead_user_id
    WHERE t.is_active = 1
  `;
  const params: any[] = [];
  if (directorateId) { query += ` AND t.directorate_id = ?`; params.push(parseInt(directorateId)); }
  query += ` GROUP BY t.id ORDER BY t.name ASC`;

  const rows = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ teams: rows.results });
});

// ── POST /api/directory/request-directorate ───────
directory.post('/request-directorate', async (c) => {
  const session = await requireAuth(c);
  if (session instanceof Response) return session;

  const { directorate_id, reason } = await c.req.json<{ directorate_id: number; reason?: string }>();

  // Check if already member
  const existing = await c.env.DB.prepare(
    `SELECT id FROM user_directorates WHERE user_id = ? AND directorate_id = ?`
  ).bind(session.userId, directorate_id).first();
  if (existing) return c.json({ error: 'Already a member' }, 409);

  // Check for pending request
  const pending = await c.env.DB.prepare(
    `SELECT id FROM directorate_requests WHERE user_id = ? AND directorate_id = ? AND status = 'pending'`
  ).bind(session.userId, directorate_id).first();
  if (pending) return c.json({ error: 'Request already pending' }, 409);

  await c.env.DB.prepare(
    `INSERT INTO directorate_requests (user_id, directorate_id, reason) VALUES (?, ?, ?)`
  ).bind(session.userId, directorate_id, reason ?? null).run();

  return c.json({ success: true, message: 'Directorate access request submitted.' });
});

export default directory;
