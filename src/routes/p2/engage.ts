// src/routes/p2/engage.ts — Comments, Attachments, Activity, Saved Views, Notifications

import { Hono } from 'hono'
import { Env } from '../../types'
import { requireAuth, getSession } from '../../lib/auth'
import { canAccessWorkspace } from './workspaces'

const engage = new Hono<{ Bindings: Env }>()

// ═══════════════════════════════════════════════
// COMMENTS
// ═══════════════════════════════════════════════

// ── GET /api/p2/engage/comments/:itemId ───────────────────
engage.get('/comments/:itemId', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const itemId = parseInt(c.req.param('itemId'))

  const item = await c.env.DB.prepare(`SELECT workspace_id FROM work_items WHERE id = ?`).bind(itemId).first<any>()
  if (!item || !await canAccessWorkspace(c.env.DB, item.workspace_id, session)) return c.json({ error: 'Forbidden' }, 403)

  const rows = await c.env.DB.prepare(`
    SELECT wc.*,
           u.display_name AS author_name, u.avatar_url,
           COALESCE(pp.preferred_name, u.display_name) AS author_preferred_name
    FROM work_item_comments wc
    LEFT JOIN users u ON u.id = wc.user_id
    LEFT JOIN people_profiles pp ON pp.user_id = wc.user_id
    WHERE wc.work_item_id = ?
    ORDER BY wc.created_at ASC
  `).bind(itemId).all<any>()

  // Build threaded structure
  const topLevel = rows.results.filter(c => !c.parent_id)
  const byParent: Record<number, any[]> = {}
  rows.results.filter(c => c.parent_id).forEach(c => {
    if (!byParent[c.parent_id]) byParent[c.parent_id] = []
    byParent[c.parent_id].push(c)
  })
  const threaded = topLevel.map(c => ({ ...c, replies: byParent[c.id] ?? [] }))

  return c.json({ comments: threaded })
})

// ── POST /api/p2/engage/comments ──────────────────────────
engage.post('/comments', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const { work_item_id, body: commentBody, parent_id, is_internal } = await c.req.json<any>()
  if (!work_item_id || !commentBody?.trim()) return c.json({ error: 'work_item_id and body required' }, 400)

  const item = await c.env.DB.prepare(`SELECT workspace_id FROM work_items WHERE id = ?`).bind(work_item_id).first<any>()
  if (!item || !await canAccessWorkspace(c.env.DB, item.workspace_id, session)) return c.json({ error: 'Forbidden' }, 403)

  const result = await c.env.DB.prepare(`
    INSERT INTO work_item_comments (work_item_id, user_id, body, parent_id) VALUES (?, ?, ?, ?)
  `).bind(work_item_id, session.userId, commentBody.trim(), parent_id ?? null).run()

  await c.env.DB.prepare(`
    INSERT INTO work_item_activity (work_item_id, actor_user_id, event_type, note)
    VALUES (?, ?, 'commented', ?)
  `).bind(work_item_id, session.userId, commentBody.slice(0, 100)).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// ── PUT /api/p2/engage/comments/:id ───────────────────────
engage.put('/comments/:id', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const commentId = parseInt(c.req.param('id'))

  const comment = await c.env.DB.prepare(`
    SELECT wc.*, wi.workspace_id FROM work_item_comments wc
    JOIN work_items wi ON wi.id = wc.work_item_id WHERE wc.id = ?
  `).bind(commentId).first<any>()
  if (!comment) return c.json({ error: 'Not found' }, 404)
  if (comment.user_id !== session.userId && !session.isGodAdmin) return c.json({ error: 'Forbidden' }, 403)

  const { body: newBody } = await c.req.json<any>()
  await c.env.DB.prepare(`UPDATE work_item_comments SET body = ?, is_edited = 1, edited_at = datetime('now') WHERE id = ?`).bind(newBody, commentId).run()
  return c.json({ success: true })
})

// ── DELETE /api/p2/engage/comments/:id ────────────────────
engage.delete('/comments/:id', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const commentId = parseInt(c.req.param('id'))

  const comment = await c.env.DB.prepare(`SELECT user_id FROM work_item_comments WHERE id = ?`).bind(commentId).first<any>()
  if (!comment) return c.json({ error: 'Not found' }, 404)
  if (comment.user_id !== session.userId && !session.isGodAdmin) return c.json({ error: 'Forbidden' }, 403)

  await c.env.DB.prepare(`DELETE FROM work_item_comments WHERE id = ?`).bind(commentId).run()
  return c.json({ success: true })
})

// ═══════════════════════════════════════════════
// ATTACHMENTS
// ═══════════════════════════════════════════════

// ── GET /api/p2/engage/attachments/:itemId ────────────────
engage.get('/attachments/:itemId', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const itemId = parseInt(c.req.param('itemId'))

  const item = await c.env.DB.prepare(`SELECT workspace_id FROM work_items WHERE id = ?`).bind(itemId).first<any>()
  if (!item || !await canAccessWorkspace(c.env.DB, item.workspace_id, session)) return c.json({ error: 'Forbidden' }, 403)

  const rows = await c.env.DB.prepare(`
    SELECT wa.*, wa.created_at AS uploaded_at,
           u.display_name AS uploader_name
    FROM work_item_attachments wa
    LEFT JOIN users u ON u.id = wa.uploaded_by
    WHERE wa.work_item_id = ?
    ORDER BY wa.created_at DESC
  `).bind(itemId).all()
  return c.json({ attachments: rows.results })
})

// ── POST /api/p2/engage/attachments ───────────────────────
// Records attachment metadata; actual file should be pre-uploaded to R2
engage.post('/attachments', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const { work_item_id, file_name, file_key, file_size, mime_type, description } = await c.req.json<any>()
  if (!work_item_id || !file_name || !file_key) return c.json({ error: 'work_item_id, file_name, file_key required' }, 400)

  const item = await c.env.DB.prepare(`SELECT workspace_id FROM work_items WHERE id = ?`).bind(work_item_id).first<any>()
  if (!item || !await canAccessWorkspace(c.env.DB, item.workspace_id, session)) return c.json({ error: 'Forbidden' }, 403)

  const result = await c.env.DB.prepare(`
    INSERT INTO work_item_attachments (work_item_id, uploaded_by, file_name, file_key, file_size, mime_type, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(work_item_id, session.userId, file_name, file_key, file_size ?? null, mime_type ?? null, description ?? null).run()

  await c.env.DB.prepare(`
    INSERT INTO work_item_activity (work_item_id, actor_user_id, event_type, new_value)
    VALUES (?, ?, 'attachment_added', ?)
  `).bind(work_item_id, session.userId, file_name).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// ── POST /api/p2/engage/attachments/upload-url ────────────
// Generate a signed R2 upload URL
engage.post('/attachments/upload-url', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const { work_item_id, file_name, mime_type } = await c.req.json<any>()
  if (!work_item_id || !file_name) return c.json({ error: 'work_item_id and file_name required' }, 400)

  const key = `attachments/${work_item_id}/${Date.now()}-${file_name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  // In production: use R2 signed URL. For now return key for direct upload handling
  return c.json({ upload_url: `/api/p2/engage/attachments/upload/${encodeURIComponent(key)}`, key })
})

// ── PUT /api/p2/engage/attachments/upload/:key ────────────
// Direct R2 upload endpoint
engage.put('/attachments/upload/:key', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const key = decodeURIComponent(c.req.param('key'))
  const body = await c.req.arrayBuffer()
  const contentType = c.req.header('Content-Type') ?? 'application/octet-stream'

  await c.env.R2.put(key, body, { httpMetadata: { contentType } })
  return c.json({ success: true, key })
})

// ── DELETE /api/p2/engage/attachments/:id ─────────────────
engage.delete('/attachments/:id', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const attId = parseInt(c.req.param('id'))

  const att = await c.env.DB.prepare(`
    SELECT wa.*, wi.workspace_id FROM work_item_attachments wa
    JOIN work_items wi ON wi.id = wa.work_item_id WHERE wa.id = ?
  `).bind(attId).first<any>()
  if (!att) return c.json({ error: 'Not found' }, 404)
  if (!await canAccessWorkspace(c.env.DB, att.workspace_id, session)) return c.json({ error: 'Forbidden' }, 403)

  // Delete from R2
  try { await c.env.R2.delete(att.file_key) } catch {}
  await c.env.DB.prepare(`DELETE FROM work_item_attachments WHERE id = ?`).bind(attId).run()
  return c.json({ success: true })
})

// ═══════════════════════════════════════════════
// ACTIVITY
// ═══════════════════════════════════════════════

engage.get('/activity/:itemId', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const itemId = parseInt(c.req.param('itemId'))

  const item = await c.env.DB.prepare(`SELECT workspace_id FROM work_items WHERE id = ?`).bind(itemId).first<any>()
  if (!item || !await canAccessWorkspace(c.env.DB, item.workspace_id, session)) return c.json({ error: 'Forbidden' }, 403)

  const rows = await c.env.DB.prepare(`
    SELECT wa.*,
           u.display_name AS actor_name, u.avatar_url
    FROM work_item_activity wa
    LEFT JOIN users u ON u.id = wa.actor_user_id
    WHERE wa.work_item_id = ? ORDER BY wa.created_at ASC
  `).bind(itemId).all()
  return c.json({ activity: rows.results })
})

// ═══════════════════════════════════════════════
// SAVED VIEWS
// ═══════════════════════════════════════════════

engage.get('/saved-views/:workspaceId', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const wsId = parseInt(c.req.param('workspaceId'))
  if (!await canAccessWorkspace(c.env.DB, wsId, session)) return c.json({ error: 'Forbidden' }, 403)

  const rows = await c.env.DB.prepare(`
    SELECT sv.*, u.display_name AS creator_name FROM saved_views sv
    LEFT JOIN users u ON u.id = sv.created_by
    WHERE sv.workspace_id = ? AND (sv.is_shared = 1 OR sv.created_by = ?)
    ORDER BY sv.is_default DESC, sv.name ASC
  `).bind(wsId, session.userId).all()
  return c.json({ views: rows.results })
})

engage.post('/saved-views', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const { workspace_id, name, view_type, filters, sort_by, group_by, is_shared, is_default } = await c.req.json<any>()
  if (!workspace_id || !name) return c.json({ error: 'workspace_id and name required' }, 400)
  if (!await canAccessWorkspace(c.env.DB, workspace_id, session)) return c.json({ error: 'Forbidden' }, 403)

  const result = await c.env.DB.prepare(`
    INSERT INTO saved_views (workspace_id, created_by, name, view_type, filters, sort_by, group_by, is_shared, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(workspace_id, session.userId, name, view_type ?? 'list',
    filters ? JSON.stringify(filters) : null, sort_by ? JSON.stringify(sort_by) : null,
    group_by ?? null, is_shared ? 1 : 0, is_default ? 1 : 0).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

engage.delete('/saved-views/:id', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const viewId = parseInt(c.req.param('id'))

  const view = await c.env.DB.prepare(`SELECT * FROM saved_views WHERE id = ?`).bind(viewId).first<any>()
  if (!view) return c.json({ error: 'Not found' }, 404)
  if (view.created_by !== session.userId && !session.isGodAdmin) return c.json({ error: 'Forbidden' }, 403)

  await c.env.DB.prepare(`DELETE FROM saved_views WHERE id = ?`).bind(viewId).run()
  return c.json({ success: true })
})

// ═══════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════

engage.get('/notifications', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const unreadOnly = c.req.query('unread') === '1'
  let query = `SELECT * FROM notification_jobs WHERE recipient_id = ?`
  if (unreadOnly) query += ` AND is_read = 0`
  query += ` ORDER BY created_at DESC LIMIT 50`

  const rows = await c.env.DB.prepare(query).bind(session.userId).all()
  const unreadCount = await c.env.DB.prepare(`SELECT COUNT(*) as n FROM notification_jobs WHERE recipient_id = ? AND is_read = 0`).bind(session.userId).first<{ n: number }>()

  return c.json({ notifications: rows.results, unread_count: unreadCount?.n ?? 0 })
})

engage.post('/notifications/mark-read', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const { ids } = await c.req.json<{ ids?: number[] }>()
  if (ids?.length) {
    await c.env.DB.prepare(`UPDATE notification_jobs SET is_read = 1, read_at = datetime('now') WHERE id IN (${ids.join(',')}) AND recipient_id = ?`).bind(session.userId).run()
  } else {
    await c.env.DB.prepare(`UPDATE notification_jobs SET is_read = 1, read_at = datetime('now') WHERE recipient_id = ?`).bind(session.userId).run()
  }
  return c.json({ success: true })
})

export default engage
