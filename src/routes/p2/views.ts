// src/routes/p2/views.ts — Saved Views (per-user or workspace-shared)

import { Hono } from 'hono'
import { Env } from '../../types'
import { requireAuth } from '../../lib/auth'
import { canAccessWorkspace } from './workspaces'

const views = new Hono<{ Bindings: Env }>()

// ── GET /api/p2/views?workspace_id= ──────────────────────
views.get('/', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const wsId = parseInt(c.req.query('workspace_id') ?? '0')
  if (!wsId) return c.json({ error: 'workspace_id required' }, 400)
  if (!await canAccessWorkspace(c.env.DB, wsId, session)) return c.json({ error: 'Forbidden' }, 403)

  const rows = await c.env.DB.prepare(`
    SELECT sv.*, u.display_name AS owner_name
    FROM saved_views sv
    LEFT JOIN users u ON u.id = sv.created_by
    WHERE sv.workspace_id = ?
      AND (sv.is_shared = 1 OR sv.created_by = ?)
    ORDER BY sv.is_workspace_shared DESC, sv.name ASC
  `).bind(wsId, session.userId).all<any>()

  return c.json({ views: rows.results })
})

// ── POST /api/p2/views ────────────────────────────────────
views.post('/', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const { workspace_id, name, view_type, filters_json, sort_json, group_by, is_workspace_shared } = await c.req.json()
  if (!workspace_id || !name || !view_type) return c.json({ error: 'workspace_id, name, view_type required' }, 400)
  if (!await canAccessWorkspace(c.env.DB, workspace_id, session)) return c.json({ error: 'Forbidden' }, 403)

  const result = await c.env.DB.prepare(`
    INSERT INTO saved_views (workspace_id, name, view_type, filters, sort_by, group_by, is_shared, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(workspace_id, name, view_type, filters_json ?? null, sort_json ?? null, group_by ?? null,
    is_workspace_shared ? 1 : 0, session.userId).run()

  return c.json({ id: result.meta.last_row_id, name, view_type, message: 'View saved' }, 201)
})

// ── PUT /api/p2/views/:id ─────────────────────────────────
views.put('/:id', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const id = parseInt(c.req.param('id'))
  const existing = await c.env.DB.prepare(`SELECT * FROM saved_views WHERE id = ?`).bind(id).first<any>()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  // only owner or workspace admin can update
  if (existing.created_by !== session.userId && !session.isGodAdmin) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const { name, view_type, filters_json, sort_json, group_by, is_workspace_shared } = await c.req.json()
  await c.env.DB.prepare(`
    UPDATE saved_views SET name=?, view_type=?, filters=?, sort_by=?, group_by=?, is_shared=?
    WHERE id=?
  `).bind(name ?? existing.name, view_type ?? existing.view_type,
    filters_json ?? existing.filters, sort_json ?? existing.sort_by,
    group_by ?? existing.group_by, is_workspace_shared ? 1 : 0, id).run()

  return c.json({ message: 'View updated' })
})

// ── DELETE /api/p2/views/:id ──────────────────────────────
views.delete('/:id', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const id = parseInt(c.req.param('id'))
  const existing = await c.env.DB.prepare(`SELECT * FROM saved_views WHERE id = ?`).bind(id).first<any>()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  if (existing.created_by !== session.userId && !session.isGodAdmin) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  await c.env.DB.prepare(`DELETE FROM saved_views WHERE id = ?`).bind(id).run()
  return c.json({ message: 'View deleted' })
})

export default views
