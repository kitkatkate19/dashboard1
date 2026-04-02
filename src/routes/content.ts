// src/routes/content.ts — Announcements, Knowledge Articles, Brand Resources, Quick Links

import { Hono } from 'hono';
import { Env } from '../types';
import { getSession, requireAuth } from '../lib/auth';
import { logAudit } from '../lib/db';

const content = new Hono<{ Bindings: Env }>();

// ═══════════════════════════════════════════════
// ANNOUNCEMENTS
// ═══════════════════════════════════════════════

content.get('/announcements', async (c) => {
  const session = await requireAuth(c);
  if (session instanceof Response) return session;

  const dirIds = session.directorateIds.length > 0 ? session.directorateIds.join(',') : '0';
  const isAdmin = session.isGodAdmin || session.roles.some(r => ['god_admin','platform_admin'].includes(r));

  let query = `
    SELECT a.*, u.display_name as author_name, d.code as directorate_code, d.name as directorate_name
    FROM announcements a
    LEFT JOIN users u ON u.id = a.author_id
    LEFT JOIN directorates d ON d.id = a.directorate_id
    WHERE a.is_published = 1 AND (a.expires_at IS NULL OR a.expires_at > datetime('now'))
  `;
  if (!isAdmin) {
    query += ` AND (a.directorate_id IS NULL OR a.directorate_id IN (${dirIds}))`;
  }
  query += ` ORDER BY a.is_pinned DESC, a.published_at DESC LIMIT 50`;

  const rows = await c.env.DB.prepare(query).all();
  return c.json({ announcements: rows.results });
});

content.post('/announcements', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const canPost = session.isGodAdmin || session.roles.some(r =>
    ['god_admin','platform_admin','directorate_lead'].includes(r)
  );
  if (!canPost) return c.json({ error: 'Forbidden' }, 403);

  const { title, body, directorate_id, is_pinned, expires_at } = await c.req.json<any>();
  if (!title) return c.json({ error: 'title is required' }, 400);

  const result = await c.env.DB.prepare(`
    INSERT INTO announcements (title, body, author_id, directorate_id, is_pinned, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(title, body ?? null, session.userId, directorate_id ?? null,
    is_pinned ? 1 : 0, expires_at ?? null).run();

  await logAudit(c.env.DB, session.userId, 'announcement.created', 'announcement', result.meta.last_row_id as number, { title });
  return c.json({ success: true, id: result.meta.last_row_id });
});

content.delete('/announcements/:id', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const canDelete = session.isGodAdmin || session.roles.some(r => ['god_admin','platform_admin'].includes(r));
  if (!canDelete) return c.json({ error: 'Forbidden' }, 403);

  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare(`DELETE FROM announcements WHERE id = ?`).bind(id).run();
  await logAudit(c.env.DB, session.userId, 'announcement.deleted', 'announcement', id);
  return c.json({ success: true });
});

// ═══════════════════════════════════════════════
// KNOWLEDGE ARTICLES / GUIDES
// ═══════════════════════════════════════════════

content.get('/articles', async (c) => {
  const session = await requireAuth(c);
  if (session instanceof Response) return session;

  const category = c.req.query('category') ?? '';
  const search   = c.req.query('search') ?? '';

  let query = `
    SELECT ka.id, ka.title, ka.slug, ka.category, ka.tags, ka.view_count,
           ka.created_at, ka.updated_at, u.display_name as author_name
    FROM knowledge_articles ka
    LEFT JOIN users u ON u.id = ka.author_id
    WHERE ka.is_published = 1
  `;
  const params: any[] = [];
  if (category) { query += ` AND ka.category = ?`; params.push(category); }
  if (search)   { query += ` AND (ka.title LIKE ? OR ka.content LIKE ?)`; const s = `%${search}%`; params.push(s, s); }
  query += ` ORDER BY ka.created_at DESC LIMIT 100`;

  const rows = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ articles: rows.results });
});

content.get('/articles/:slug', async (c) => {
  const session = await requireAuth(c);
  if (session instanceof Response) return session;

  const article = await c.env.DB.prepare(`
    SELECT ka.*, u.display_name as author_name
    FROM knowledge_articles ka
    LEFT JOIN users u ON u.id = ka.author_id
    WHERE ka.slug = ? AND ka.is_published = 1
  `).bind(c.req.param('slug')).first<any>();

  if (!article) return c.json({ error: 'Article not found' }, 404);

  // Increment view count
  await c.env.DB.prepare(`UPDATE knowledge_articles SET view_count = view_count + 1 WHERE id = ?`).bind(article.id).run();

  return c.json(article);
});

content.post('/articles', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const canPost = session.isGodAdmin || session.roles.some(r => ['god_admin','platform_admin'].includes(r));
  if (!canPost) return c.json({ error: 'Forbidden' }, 403);

  const { title, slug, content_body, category, tags, directorate_id } = await c.req.json<any>();
  if (!title || !slug) return c.json({ error: 'title and slug required' }, 400);

  const result = await c.env.DB.prepare(`
    INSERT INTO knowledge_articles (title, slug, content, category, author_id, directorate_id, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(title, slug, content_body ?? null, category ?? 'general', session.userId,
    directorate_id ?? null, tags ? JSON.stringify(tags) : null).run();

  await logAudit(c.env.DB, session.userId, 'article.created', 'article', result.meta.last_row_id as number, { title });
  return c.json({ success: true, id: result.meta.last_row_id });
});

// ═══════════════════════════════════════════════
// BRAND RESOURCES
// ═══════════════════════════════════════════════

content.get('/brand', async (c) => {
  const session = await requireAuth(c);
  if (session instanceof Response) return session;

  const category = c.req.query('category') ?? '';
  let query = `SELECT * FROM brand_resources WHERE is_active = 1`;
  const params: any[] = [];
  if (category) { query += ` AND category = ?`; params.push(category); }
  query += ` ORDER BY category ASC, name ASC`;

  const rows = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ resources: rows.results });
});

content.post('/brand', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const canPost = session.isGodAdmin || session.roles.some(r => ['god_admin','platform_admin'].includes(r));
  if (!canPost) return c.json({ error: 'Forbidden' }, 403);

  const { name, description, category, file_url, file_key, mime_type, version } = await c.req.json<any>();
  if (!name) return c.json({ error: 'name is required' }, 400);

  const result = await c.env.DB.prepare(`
    INSERT INTO brand_resources (name, description, category, file_url, file_key, mime_type, version, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(name, description ?? null, category ?? 'general', file_url ?? null,
    file_key ?? null, mime_type ?? null, version ?? '1.0', session.userId).run();

  await logAudit(c.env.DB, session.userId, 'brand.resource.added', 'brand', result.meta.last_row_id as number, { name });
  return c.json({ success: true, id: result.meta.last_row_id });
});

// ═══════════════════════════════════════════════
// QUICK LINKS
// ═══════════════════════════════════════════════

content.get('/links', async (c) => {
  const session = await requireAuth(c);
  if (session instanceof Response) return session;

  const dirIds = session.directorateIds.length > 0 ? session.directorateIds.join(',') : '0';

  const rows = await c.env.DB.prepare(`
    SELECT * FROM quick_links
    WHERE is_active = 1 AND (directorate_id IS NULL OR directorate_id IN (${dirIds}))
    ORDER BY sort_order ASC, title ASC
  `).all();

  return c.json({ links: rows.results });
});

content.post('/links', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const canPost = session.isGodAdmin || session.roles.some(r => ['god_admin','platform_admin','directorate_lead'].includes(r));
  if (!canPost) return c.json({ error: 'Forbidden' }, 403);

  const { title, url, icon, category, directorate_id, sort_order } = await c.req.json<any>();
  if (!title || !url) return c.json({ error: 'title and url required' }, 400);

  const result = await c.env.DB.prepare(`
    INSERT INTO quick_links (title, url, icon, category, directorate_id, created_by, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(title, url, icon ?? null, category ?? 'general', directorate_id ?? null,
    session.userId, sort_order ?? 0).run();

  return c.json({ success: true, id: result.meta.last_row_id });
});

export default content;
