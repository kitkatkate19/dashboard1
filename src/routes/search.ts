// src/routes/search.ts — Permission-aware global search

import { Hono } from 'hono';
import { Env } from '../types';
import { requireAuth } from '../lib/auth';

const search = new Hono<{ Bindings: Env }>();

// ── GET /api/search?q=... ────────────────────────
search.get('/', async (c) => {
  const session = await requireAuth(c);
  if (session instanceof Response) return session;

  const q = c.req.query('q') ?? '';
  if (q.length < 2) return c.json({ results: [], query: q });

  const s = `%${q}%`;
  const isAdmin = session.isGodAdmin || session.roles.some(r => ['god_admin','platform_admin'].includes(r));
  const dirIds  = session.directorateIds.length > 0 ? session.directorateIds.join(',') : '0';

  const results: any[] = [];

  // ── Search People ──────────────────────────────
  const people = await c.env.DB.prepare(`
    SELECT u.id, u.display_name, u.email, p.preferred_name, p.kbi_title, p.location
    FROM users u
    JOIN people_profiles p ON p.user_id = u.id
    WHERE u.status = 'active' AND p.is_profile_public = 1
      AND (u.display_name LIKE ? OR p.preferred_name LIKE ? OR p.kbi_title LIKE ? OR u.email LIKE ?)
    LIMIT 5
  `).bind(s, s, s, s).all<any>();

  people.results.forEach(p => results.push({ type: 'person', id: p.id, title: p.preferred_name || p.display_name, subtitle: p.kbi_title, url: `/directory/${p.id}` }));

  // ── Search Articles ────────────────────────────
  const articles = await c.env.DB.prepare(`
    SELECT id, title, slug, category FROM knowledge_articles
    WHERE is_published = 1 AND (title LIKE ? OR content LIKE ?)
    LIMIT 5
  `).bind(s, s).all<any>();

  articles.results.forEach(a => results.push({ type: 'article', id: a.id, title: a.title, subtitle: a.category, url: `/guides/${a.slug}` }));

  // ── Search Events ──────────────────────────────
  let evtQuery = `
    SELECT id, title, start_at, event_type, directorate_id FROM events
    WHERE is_published = 1 AND (title LIKE ? OR description LIKE ?)
  `;
  const evtParams: any[] = [s, s];
  if (!isAdmin) {
    evtQuery += ` AND (directorate_id IS NULL OR directorate_id IN (${dirIds}))`;
  }
  evtQuery += ` LIMIT 5`;

  const events = await c.env.DB.prepare(evtQuery).bind(...evtParams).all<any>();
  events.results.forEach(e => results.push({ type: 'event', id: e.id, title: e.title, subtitle: new Date(e.start_at).toLocaleDateString(), url: `/calendar?event=${e.id}` }));

  // ── Search Announcements ───────────────────────
  let annQuery = `
    SELECT id, title, body, directorate_id FROM announcements
    WHERE is_published = 1 AND (title LIKE ? OR body LIKE ?)
  `;
  const annParams: any[] = [s, s];
  if (!isAdmin) {
    annQuery += ` AND (directorate_id IS NULL OR directorate_id IN (${dirIds}))`;
  }
  annQuery += ` LIMIT 3`;

  const announcements = await c.env.DB.prepare(annQuery).bind(...annParams).all<any>();
  announcements.results.forEach(a => results.push({ type: 'announcement', id: a.id, title: a.title, subtitle: 'Announcement', url: `/home#ann-${a.id}` }));

  // ── Search Brand Resources ─────────────────────
  const brand = await c.env.DB.prepare(`
    SELECT id, name, description, category FROM brand_resources
    WHERE is_active = 1 AND (name LIKE ? OR description LIKE ?)
    LIMIT 3
  `).bind(s, s).all<any>();

  brand.results.forEach(b => results.push({ type: 'brand', id: b.id, title: b.name, subtitle: b.category, url: `/brand-kit` }));

  return c.json({ results, query: q, total: results.length });
});

export default search;
