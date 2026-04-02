// src/routes/export.ts — CSV/XLSX export for approved users

import { Hono } from 'hono';
import { Env } from '../types';
import { getSession } from '../lib/auth';
import { logAudit } from '../lib/db';

const exportRoutes = new Hono<{ Bindings: Env }>();

function toCSV(rows: any[], columns?: string[]): string {
  if (!rows.length) return '';
  const keys = columns ?? Object.keys(rows[0]);
  const header = keys.map(k => `"${k}"`).join(',');
  const body = rows.map(row =>
    keys.map(k => {
      const v = row[k];
      if (v === null || v === undefined) return '';
      if (typeof v === 'string') return `"${v.replace(/"/g, '""')}"`;
      return String(v);
    }).join(',')
  ).join('\n');
  return `${header}\n${body}`;
}

// ── GET /api/export/users ────────────────────────
exportRoutes.get('/users', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const isAdmin = session.isGodAdmin || session.roles.some(r => ['god_admin','platform_admin'].includes(r));
  if (!isAdmin) return c.json({ error: 'Forbidden' }, 403);

  const rows = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.display_name, u.status, u.is_god_admin, u.created_at,
           p.preferred_name, p.kbi_title, p.department, p.location, p.phone
    FROM users u
    LEFT JOIN people_profiles p ON p.user_id = u.id
    ORDER BY u.created_at DESC
  `).all<any>();

  const csv = toCSV(rows.results, ['id','email','display_name','preferred_name','kbi_title','department','location','status','created_at']);

  await logAudit(c.env.DB, session.userId, 'export.users', undefined, undefined, { count: rows.results.length });

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="kbi-users-export.csv"',
    },
  });
});

// ── GET /api/export/directory ────────────────────
exportRoutes.get('/directory', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const isAdmin = session.isGodAdmin || session.roles.some(r => ['god_admin','platform_admin','directorate_lead'].includes(r));
  if (!isAdmin) return c.json({ error: 'Forbidden' }, 403);

  const rows = await c.env.DB.prepare(`
    SELECT u.email, u.display_name, p.preferred_name, p.kbi_title, p.department,
           p.location, p.phone, p.linkedin_url, p.timezone, p.start_date
    FROM users u
    JOIN people_profiles p ON p.user_id = u.id
    WHERE u.status = 'active' AND p.is_profile_public = 1
    ORDER BY p.preferred_name ASC
  `).all<any>();

  const csv = toCSV(rows.results);
  await logAudit(c.env.DB, session.userId, 'export.directory', undefined, undefined, { count: rows.results.length });

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="kbi-directory-export.csv"',
    },
  });
});

// ── GET /api/export/events ───────────────────────
exportRoutes.get('/events', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const isAdmin = session.isGodAdmin || session.roles.some(r => ['god_admin','platform_admin','directorate_lead'].includes(r));
  if (!isAdmin) return c.json({ error: 'Forbidden' }, 403);

  const rows = await c.env.DB.prepare(`
    SELECT e.id, e.title, e.description, e.location, e.start_at, e.end_at,
           e.event_type, e.all_day, d.code as directorate
    FROM events e
    LEFT JOIN directorates d ON d.id = e.directorate_id
    WHERE e.is_published = 1
    ORDER BY e.start_at ASC
  `).all<any>();

  const csv = toCSV(rows.results);
  await logAudit(c.env.DB, session.userId, 'export.events');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="kbi-events-export.csv"',
    },
  });
});

// ── GET /api/export/audit-logs ───────────────────
exportRoutes.get('/audit-logs', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  if (!session.isGodAdmin) return c.json({ error: 'God Admin only' }, 403);

  const rows = await c.env.DB.prepare(`
    SELECT al.id, al.action, al.target_type, al.target_id, al.metadata,
           al.ip_address, al.created_at, u.email as actor_email
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.actor_id
    ORDER BY al.created_at DESC
    LIMIT 10000
  `).all<any>();

  const csv = toCSV(rows.results);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="kbi-audit-logs.csv"',
    },
  });
});

export default exportRoutes;
