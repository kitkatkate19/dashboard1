// src/routes/calendar.ts — KBI Calendar

import { Hono } from 'hono';
import { Env } from '../types';
import { getSession, requireAuth } from '../lib/auth';
import { logAudit } from '../lib/db';

const calendar = new Hono<{ Bindings: Env }>();

// ── GET /api/calendar/events ─────────────────────
calendar.get('/events', async (c) => {
  const session = await requireAuth(c);
  if (session instanceof Response) return session;

  const startDate    = c.req.query('start') ?? new Date().toISOString().split('T')[0];
  const endDate      = c.req.query('end');
  const directorateId = c.req.query('directorate_id');
  const eventType    = c.req.query('type');

  let query = `
    SELECT e.*, d.code as directorate_code, d.name as directorate_name,
           u.display_name as created_by_name
    FROM events e
    LEFT JOIN directorates d ON d.id = e.directorate_id
    LEFT JOIN users u ON u.id = e.created_by
    WHERE e.is_published = 1 AND e.start_at >= ?
  `;
  const params: any[] = [startDate];

  if (endDate)       { query += ` AND e.start_at <= ?`;      params.push(endDate); }
  if (directorateId) { query += ` AND e.directorate_id = ?`; params.push(parseInt(directorateId)); }
  if (eventType)     { query += ` AND e.event_type = ?`;     params.push(eventType); }

  // Permission filter — non-admins only see global + their directorate events
  if (!session.isGodAdmin && !session.roles.includes('god_admin')) {
    const dirIds = session.directorateIds.length > 0
      ? session.directorateIds.join(',')
      : '0';
    query += ` AND (e.directorate_id IS NULL OR e.directorate_id IN (${dirIds}))`;
  }

  query += ` ORDER BY e.start_at ASC LIMIT 200`;

  const rows = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ events: rows.results });
});

// ── GET /api/calendar/events/:id ─────────────────
calendar.get('/events/:id', async (c) => {
  const session = await requireAuth(c);
  if (session instanceof Response) return session;

  const event = await c.env.DB.prepare(`
    SELECT e.*, d.code as directorate_code, d.name as directorate_name,
           u.display_name as created_by_name
    FROM events e
    LEFT JOIN directorates d ON d.id = e.directorate_id
    LEFT JOIN users u ON u.id = e.created_by
    WHERE e.id = ?
  `).bind(parseInt(c.req.param('id'))).first<any>();

  if (!event) return c.json({ error: 'Event not found' }, 404);

  // Check visibility
  if (event.directorate_id && !session.isGodAdmin) {
    if (!session.directorateIds.includes(event.directorate_id)) {
      return c.json({ error: 'Access denied' }, 403);
    }
  }

  return c.json(event);
});

// ── POST /api/calendar/events ────────────────────
calendar.post('/events', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const canCreate = session.isGodAdmin || session.roles.some(r =>
    ['god_admin','platform_admin','directorate_lead'].includes(r)
  );
  if (!canCreate) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json<any>();
  const { title, description, location, start_at, end_at, all_day, event_type, directorate_id } = body;

  if (!title || !start_at) return c.json({ error: 'title and start_at are required' }, 400);

  const result = await c.env.DB.prepare(`
    INSERT INTO events (title, description, location, start_at, end_at, all_day, event_type, directorate_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(title, description ?? null, location ?? null, start_at, end_at ?? null,
    all_day ? 1 : 0, event_type ?? 'general', directorate_id ?? null, session.userId).run();

  await logAudit(c.env.DB, session.userId, 'event.created', 'event', result.meta.last_row_id as number, { title });
  return c.json({ success: true, id: result.meta.last_row_id });
});

// ── PUT /api/calendar/events/:id ─────────────────
calendar.put('/events/:id', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const canEdit = session.isGodAdmin || session.roles.some(r =>
    ['god_admin','platform_admin','directorate_lead'].includes(r)
  );
  if (!canEdit) return c.json({ error: 'Forbidden' }, 403);

  const eventId = parseInt(c.req.param('id'));
  const body = await c.req.json<any>();
  const allowed = ['title','description','location','start_at','end_at','all_day','event_type','directorate_id','is_published'];
  const fields = Object.keys(body).filter(k => allowed.includes(k));
  if (fields.length === 0) return c.json({ error: 'No valid fields' }, 400);

  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => body[f]);

  await c.env.DB.prepare(
    `UPDATE events SET ${setClause}, updated_at = datetime('now') WHERE id = ?`
  ).bind(...values, eventId).run();

  await logAudit(c.env.DB, session.userId, 'event.updated', 'event', eventId, { fields });
  return c.json({ success: true });
});

// ── DELETE /api/calendar/events/:id ──────────────
calendar.delete('/events/:id', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const canDelete = session.isGodAdmin || session.roles.some(r =>
    ['god_admin','platform_admin'].includes(r)
  );
  if (!canDelete) return c.json({ error: 'Forbidden' }, 403);

  const eventId = parseInt(c.req.param('id'));
  await c.env.DB.prepare(`DELETE FROM events WHERE id = ?`).bind(eventId).run();
  await logAudit(c.env.DB, session.userId, 'event.deleted', 'event', eventId);
  return c.json({ success: true });
});

export default calendar;
