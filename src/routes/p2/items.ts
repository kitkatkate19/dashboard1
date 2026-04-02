// src/routes/p2/items.ts — Work Items CRUD with filtering, sorting, views

import { Hono } from 'hono'
import { Env } from '../../types'
import { getSession, requireAuth } from '../../lib/auth'
import { logAudit } from '../../lib/db'
import { canAccessWorkspace } from './workspaces'

const items = new Hono<{ Bindings: Env }>()

// ── helper: log activity ───────────────────────────────────
async function logActivity(db: D1Database, workItemId: number, actorId: number, eventType: string, opts: { old_value?: string; new_value?: string; field_name?: string; note?: string } = {}) {
  await db.prepare(`
    INSERT INTO work_item_activity (work_item_id, actor_user_id, event_type, old_value, new_value, field_name, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(workItemId, actorId, eventType, opts.old_value ?? null, opts.new_value ?? null, opts.field_name ?? null, opts.note ?? null).run()
}

// ── helper: generate issued_id ─────────────────────────────
async function generateIssuedId(db: D1Database, workspaceId: number): Promise<string> {
  const ws = await db.prepare(`SELECT code FROM workspaces WHERE id = ?`).bind(workspaceId).first<any>()
  const code = ws?.code?.replace(/[^A-Z0-9]/g, '').slice(0, 6) ?? 'ITEM'
  const count = await db.prepare(`SELECT COUNT(*) as n FROM work_items WHERE workspace_id = ?`).bind(workspaceId).first<{ n: number }>()
  return `${code}-${String((count?.n ?? 0) + 1).padStart(3, '0')}`
}

// ── GET /api/p2/items?workspace_id=&status=&priority=&assignee=&search=&view=&sort=&page= ──
items.get('/', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const wsId      = parseInt(c.req.query('workspace_id') ?? '0')
  const statusId  = c.req.query('status_id')
  const statusSlug= c.req.query('status')   // NEW: filter by slug
  const priorityId= c.req.query('priority_id')
  const prioritySlug = c.req.query('priority') // NEW: filter by slug
  const typeId    = c.req.query('type_id')
  const assignee  = c.req.query('assignee_id')
  const search    = c.req.query('search') ?? ''
  const tag       = c.req.query('tag_id')
  const parentId  = c.req.query('parent_id')
  const dueBefore = c.req.query('due_before')
  const dueAfter  = c.req.query('due_after')
  const archived  = c.req.query('archived') === '1' ? 1 : 0

  // Support combined sort param e.g. sort=updated_desc
  const sortParam = c.req.query('sort') ?? ''
  let sortBy    = c.req.query('sort_by') ?? 'updated_at'
  let sortDir: 'ASC' | 'DESC' = c.req.query('sort_dir') === 'asc' ? 'ASC' : 'DESC'
  if (sortParam) {
    const parts = sortParam.split('_')
    const dir = parts.pop()
    if (dir === 'asc') sortDir = 'ASC'
    if (dir === 'desc') sortDir = 'DESC'
    sortBy = parts.join('_') || 'updated_at'
  }

  const limit  = Math.min(parseInt(c.req.query('limit') ?? '100'), 500)
  const offset = parseInt(c.req.query('offset') ?? ((parseInt(c.req.query('page') ?? '1') - 1) * 100).toString())

  if (!wsId) return c.json({ error: 'workspace_id required' }, 400)
  if (!await canAccessWorkspace(c.env.DB, wsId, session)) return c.json({ error: 'Forbidden' }, 403)

  const allowedSorts: Record<string, string> = {
    created_at: 'wi.created_at', updated_at: 'wi.updated_at',
    due_at: 'wi.due_at', title: 'wi.title', priority: 'wip.level',
    status: 'wis.sort_order', progress: 'wi.progress_pct',
  }
  const orderCol = allowedSorts[sortBy] ?? 'wi.created_at'

  let query = `
    SELECT wi.*,
           wi.progress_pct AS progress,
           wis.name AS status_name, wis.color AS status_color, wis.category AS status_category, wis.slug AS status_slug,
           wip.name AS priority_name, wip.color AS priority_color, wip.icon AS priority_icon, wip.level AS priority_level, wip.slug AS priority_slug,
           wit.name AS type_name, wit.icon AS type_icon, wit.color AS type_color, wit.slug AS type_slug,
           w.name AS workspace_name, w.code AS workspace_code,
           d.code AS dir_code, d.color AS dir_color,
           u.display_name AS owner_name, u.avatar_url AS owner_avatar,
           pp.preferred_name AS owner_preferred_name,
           (SELECT COUNT(*) FROM work_item_comments c WHERE c.work_item_id = wi.id) AS comment_count,
           (SELECT COUNT(*) FROM work_item_attachments a WHERE a.work_item_id = wi.id) AS attachment_count,
           (SELECT COUNT(*) FROM work_items sub WHERE sub.parent_id = wi.id AND sub.is_archived = 0) AS subtask_count
    FROM work_items wi
    LEFT JOIN work_item_statuses   wis ON wis.id = wi.status_id
    LEFT JOIN work_item_priorities wip ON wip.id = wi.priority_id
    LEFT JOIN work_item_types      wit ON wit.id = wi.work_item_type_id
    LEFT JOIN workspaces           w   ON w.id  = wi.workspace_id
    LEFT JOIN directorates         d   ON d.id  = w.directorate_id
    LEFT JOIN users u ON u.id = wi.owner_user_id
    LEFT JOIN people_profiles pp ON pp.user_id = wi.owner_user_id
    WHERE wi.workspace_id = ? AND wi.is_archived = ?
  `
  const params: any[] = [wsId, archived]

  if (parentId)   { query += ` AND wi.parent_id = ?`;    params.push(parseInt(parentId)) }
  else            { query += ` AND wi.parent_id IS NULL` }
  if (statusId)   { query += ` AND wi.status_id = ?`;    params.push(parseInt(statusId)) }
  if (statusSlug) { query += ` AND wis.slug = ?`;        params.push(statusSlug) }
  if (priorityId) { query += ` AND wi.priority_id = ?`;  params.push(parseInt(priorityId)) }
  if (prioritySlug){ query += ` AND wip.slug = ?`;       params.push(prioritySlug) }
  if (typeId)     { query += ` AND wi.work_item_type_id = ?`; params.push(parseInt(typeId)) }
  if (dueBefore)  { query += ` AND wi.due_at <= ?`;      params.push(dueBefore) }
  if (dueAfter)   { query += ` AND wi.due_at >= ?`;      params.push(dueAfter) }
  if (search)     { query += ` AND (wi.title LIKE ? OR wi.description LIKE ?)`; const s = `%${search}%`; params.push(s, s) }

  if (assignee) {
    query += ` AND wi.id IN (SELECT work_item_id FROM work_item_assignees WHERE user_id = ?)`
    params.push(parseInt(assignee))
  }
  if (tag) {
    query += ` AND wi.id IN (SELECT work_item_id FROM work_item_tag_links WHERE tag_id = ?)`
    params.push(parseInt(tag))
  }

  // Count query
  const countQuery = query.replace(/SELECT wi\.\*.*?FROM work_items wi/, 'SELECT COUNT(*) as total FROM work_items wi')
  const countResult = await c.env.DB.prepare(countQuery).bind(...params).first<{ total: number }>()

  query += ` ORDER BY ${orderCol} ${sortDir} LIMIT ? OFFSET ?`
  params.push(limit, offset)

  const rows = await c.env.DB.prepare(query).bind(...params).all<any>()

  // Attach assignees and tags to each item
  const enriched = await Promise.all(rows.results.map(async (item) => {
    const [assignees, tags] = await Promise.all([
      c.env.DB.prepare(`
        SELECT wia.*, u.display_name, u.avatar_url, pp.preferred_name
        FROM work_item_assignees wia JOIN users u ON u.id = wia.user_id
        LEFT JOIN people_profiles pp ON pp.user_id = u.id
        WHERE wia.work_item_id = ?
      `).bind(item.id).all(),
      c.env.DB.prepare(`
        SELECT wt.* FROM work_item_tags wt
        JOIN work_item_tag_links wtl ON wtl.tag_id = wt.id
        WHERE wtl.work_item_id = ?
      `).bind(item.id).all(),
    ])
    return {
      ...item,
      assignees: assignees.results,
      tags: tags.results,
      tags_json: JSON.stringify(tags.results),
      assignees_json: JSON.stringify(assignees.results),
    }
  }))

  return c.json({ items: enriched, total: countResult?.total ?? 0, limit, offset })
})

// ── GET /api/p2/items/:id ──────────────────────────────────
items.get('/:id', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const itemId = parseInt(c.req.param('id'))

  const item = await c.env.DB.prepare(`
    SELECT wi.*,
           wi.progress_pct AS progress,
           wis.name AS status_name, wis.color AS status_color, wis.category AS status_category, wis.slug AS status_slug,
           wip.name AS priority_name, wip.color AS priority_color, wip.level AS priority_level, wip.slug AS priority_slug,
           wit.name AS type_name, wit.icon AS type_icon, wit.slug AS type_slug,
           w.name AS workspace_name, w.code AS workspace_code,
           d.code AS dir_code, d.color AS dir_color,
           u.display_name AS owner_name, u.avatar_url AS owner_avatar, u.id AS owner_user_id,
           pp.preferred_name AS owner_preferred_name
    FROM work_items wi
    LEFT JOIN work_item_statuses wis   ON wis.id = wi.status_id
    LEFT JOIN work_item_priorities wip ON wip.id = wi.priority_id
    LEFT JOIN work_item_types wit      ON wit.id = wi.work_item_type_id
    LEFT JOIN workspaces w             ON w.id   = wi.workspace_id
    LEFT JOIN directorates d           ON d.id   = w.directorate_id
    LEFT JOIN users u ON u.id = wi.owner_user_id
    LEFT JOIN people_profiles pp ON pp.user_id = wi.owner_user_id
    WHERE wi.id = ?
  `).bind(itemId).first<any>()
  if (!item) return c.json({ error: 'Not found' }, 404)

  if (!await canAccessWorkspace(c.env.DB, item.workspace_id, session)) return c.json({ error: 'Forbidden' }, 403)

  const [assignees, tags, comments, attachments, activity, subtasks, links, approvals] = await Promise.all([
    c.env.DB.prepare(`
      SELECT wia.*, u.display_name, u.avatar_url, pp.preferred_name, pp.kbi_title
      FROM work_item_assignees wia JOIN users u ON u.id = wia.user_id
      LEFT JOIN people_profiles pp ON pp.user_id = u.id WHERE wia.work_item_id = ?
    `).bind(itemId).all(),
    c.env.DB.prepare(`
      SELECT wt.* FROM work_item_tags wt
      JOIN work_item_tag_links wtl ON wtl.tag_id = wt.id WHERE wtl.work_item_id = ?
    `).bind(itemId).all(),
    c.env.DB.prepare(`
      SELECT wc.*, u.display_name, u.avatar_url, pp.preferred_name
      FROM work_item_comments wc JOIN users u ON u.id = wc.user_id
      LEFT JOIN people_profiles pp ON pp.user_id = u.id
      WHERE wc.work_item_id = ? AND wc.parent_id IS NULL ORDER BY wc.created_at ASC
    `).bind(itemId).all(),
    c.env.DB.prepare(`SELECT * FROM work_item_attachments WHERE work_item_id = ? ORDER BY created_at DESC`).bind(itemId).all(),
    c.env.DB.prepare(`
      SELECT wa.*, u.display_name, u.avatar_url FROM work_item_activity wa
      LEFT JOIN users u ON u.id = wa.actor_user_id WHERE wa.work_item_id = ? ORDER BY wa.created_at ASC
    `).bind(itemId).all(),
    c.env.DB.prepare(`
      SELECT wi.id, wi.issued_id, wi.title, wi.status_id, wi.priority_id,
             wis.name AS status_name, wis.color AS status_color
      FROM work_items wi LEFT JOIN work_item_statuses wis ON wis.id = wi.status_id
      WHERE wi.parent_id = ? AND wi.is_archived = 0
    `).bind(itemId).all(),
    c.env.DB.prepare(`
      SELECT wl.*, wi.issued_id AS target_issued_id, wi.title AS target_title
      FROM work_item_links wl JOIN work_items wi ON wi.id = wl.target_id WHERE wl.source_id = ?
    `).bind(itemId).all(),
    c.env.DB.prepare(`
      SELECT ai.*, af.name AS flow_name FROM approval_instances ai
      JOIN approval_flows af ON af.id = ai.approval_flow_id
      WHERE ai.work_item_id = ? ORDER BY ai.created_at DESC
    `).bind(itemId).all(),
  ])

  return c.json({
    ...item,
    assignees: assignees.results,
    tags: tags.results,
    tags_json: JSON.stringify(tags.results),
    assignees_json: JSON.stringify(assignees.results),
    comments: comments.results,
    attachments: attachments.results,
    activity: activity.results,
    subtasks: subtasks.results,
    links: links.results,
    approvals: approvals.results,
  })
})

// ── POST /api/p2/items ─────────────────────────────────────
items.post('/', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const body = await c.req.json<any>()
  const { workspace_id, title, description, work_item_type_id, status_id, priority_id,
          owner_user_id, start_at, due_at, estimated_hours, parent_id, visibility_type,
          custom_fields, metadata } = body

  if (!workspace_id || !title) return c.json({ error: 'workspace_id and title required' }, 400)
  if (!await canAccessWorkspace(c.env.DB, workspace_id, session)) return c.json({ error: 'Forbidden' }, 403)

  // get default status if none provided
  let resolvedStatus = status_id
  if (!resolvedStatus) {
    const def = await c.env.DB.prepare(`SELECT id FROM work_item_statuses WHERE workspace_id = ? AND is_default = 1 LIMIT 1`).bind(workspace_id).first<any>()
    resolvedStatus = def?.id ?? null
  }

  const issuedId = await generateIssuedId(c.env.DB, workspace_id)

  const result = await c.env.DB.prepare(`
    INSERT INTO work_items (issued_id, workspace_id, work_item_type_id, parent_id, title, description,
      status_id, priority_id, owner_user_id, start_at, due_at, estimated_hours,
      visibility_type, custom_fields, metadata, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(issuedId, workspace_id, work_item_type_id ?? null, parent_id ?? null, title,
    description ?? null, resolvedStatus, priority_id ?? null,
    owner_user_id ?? session.userId, start_at ?? null, due_at ?? null,
    estimated_hours ?? null, visibility_type ?? 'workspace',
    custom_fields ? JSON.stringify(custom_fields) : null,
    metadata ? JSON.stringify(metadata) : null,
    session.userId, session.userId).run()

  const itemId = result.meta.last_row_id as number

  await logActivity(c.env.DB, itemId, session.userId, 'created', { note: title })
  await logAudit(c.env.DB, session.userId, 'work_item.created', 'work_item', itemId, { title, workspace_id })

  // Auto-assign creator if no owner
  if (!owner_user_id) {
    await c.env.DB.prepare(`INSERT OR IGNORE INTO work_item_assignees (work_item_id, user_id, assignment_role, assigned_by) VALUES (?, ?, 'assignee', ?)`).bind(itemId, session.userId, session.userId).run()
  }

  return c.json({ success: true, id: itemId, issued_id: issuedId })
})

// ── PUT /api/p2/items/:id ──────────────────────────────────
items.put('/:id', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const itemId = parseInt(c.req.param('id'))

  const current = await c.env.DB.prepare(`SELECT * FROM work_items WHERE id = ?`).bind(itemId).first<any>()
  if (!current) return c.json({ error: 'Not found' }, 404)
  if (!await canAccessWorkspace(c.env.DB, current.workspace_id, session)) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json<any>()
  const allowed = ['title', 'description', 'status_id', 'priority_id', 'work_item_type_id',
                   'owner_user_id', 'start_at', 'due_at', 'estimated_hours', 'actual_hours',
                   'progress_pct', 'visibility_type', 'custom_fields', 'metadata', 'parent_id']
  const fields = Object.keys(body).filter(k => allowed.includes(k))
  if (!fields.length) return c.json({ error: 'No valid fields' }, 400)

  const set = fields.map(f => `${f} = ?`).join(', ')
  const vals = fields.map(f => {
    const v = body[f]
    return (f === 'custom_fields' || f === 'metadata') && typeof v === 'object' ? JSON.stringify(v) : v
  })

  await c.env.DB.prepare(`UPDATE work_items SET ${set}, updated_by = ?, updated_at = datetime('now') WHERE id = ?`).bind(...vals, session.userId, itemId).run()

  // Log activity for key field changes
  for (const f of fields) {
    const oldVal = String(current[f] ?? '')
    const newVal = String(body[f] ?? '')
    if (oldVal !== newVal) {
      await logActivity(c.env.DB, itemId, session.userId, 'field_updated', { field_name: f, old_value: oldVal, new_value: newVal })
    }
  }

  return c.json({ success: true })
})

// ── DELETE /api/p2/items/:id ───────────────────────────────
items.delete('/:id', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const itemId = parseInt(c.req.param('id'))

  const item = await c.env.DB.prepare(`SELECT * FROM work_items WHERE id = ?`).bind(itemId).first<any>()
  if (!item) return c.json({ error: 'Not found' }, 404)
  if (!await canAccessWorkspace(c.env.DB, item.workspace_id, session)) return c.json({ error: 'Forbidden' }, 403)

  // Archive instead of hard delete
  await c.env.DB.prepare(`UPDATE work_items SET is_archived = 1, archived_at = datetime('now') WHERE id = ?`).bind(itemId).run()
  await logActivity(c.env.DB, itemId, session.userId, 'archived')
  await logAudit(c.env.DB, session.userId, 'work_item.archived', 'work_item', itemId)
  return c.json({ success: true })
})

// ── POST /api/p2/items/:id/assignees ──────────────────────
items.post('/:id/assignees', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const itemId = parseInt(c.req.param('id'))

  const item = await c.env.DB.prepare(`SELECT workspace_id FROM work_items WHERE id = ?`).bind(itemId).first<any>()
  if (!item || !await canAccessWorkspace(c.env.DB, item.workspace_id, session)) return c.json({ error: 'Forbidden' }, 403)

  const { userId, assignment_role } = await c.req.json<any>()
  await c.env.DB.prepare(`INSERT OR REPLACE INTO work_item_assignees (work_item_id, user_id, assignment_role, assigned_by) VALUES (?, ?, ?, ?)`).bind(itemId, userId, assignment_role ?? 'assignee', session.userId).run()
  await logActivity(c.env.DB, itemId, session.userId, 'assigned', { new_value: String(userId) })
  return c.json({ success: true })
})

// ── DELETE /api/p2/items/:id/assignees/:userId ────────────
items.delete('/:id/assignees/:userId', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const itemId = parseInt(c.req.param('id'))
  const userId = parseInt(c.req.param('userId'))

  const item = await c.env.DB.prepare(`SELECT workspace_id FROM work_items WHERE id = ?`).bind(itemId).first<any>()
  if (!item || !await canAccessWorkspace(c.env.DB, item.workspace_id, session)) return c.json({ error: 'Forbidden' }, 403)

  await c.env.DB.prepare(`DELETE FROM work_item_assignees WHERE work_item_id = ? AND user_id = ?`).bind(itemId, userId).run()
  return c.json({ success: true })
})

// ── POST /api/p2/items/:id/tags ───────────────────────────
items.post('/:id/tags', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const itemId = parseInt(c.req.param('id'))
  const { tagId } = await c.req.json<any>()

  const item = await c.env.DB.prepare(`SELECT workspace_id FROM work_items WHERE id = ?`).bind(itemId).first<any>()
  if (!item || !await canAccessWorkspace(c.env.DB, item.workspace_id, session)) return c.json({ error: 'Forbidden' }, 403)

  await c.env.DB.prepare(`INSERT OR IGNORE INTO work_item_tag_links (work_item_id, tag_id) VALUES (?, ?)`).bind(itemId, tagId).run()
  return c.json({ success: true })
})

// ── DELETE /api/p2/items/:id/tags/:tagId ──────────────────
items.delete('/:id/tags/:tagId', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const itemId = parseInt(c.req.param('id'))
  const tagId  = parseInt(c.req.param('tagId'))

  const item = await c.env.DB.prepare(`SELECT workspace_id FROM work_items WHERE id = ?`).bind(itemId).first<any>()
  if (!item || !await canAccessWorkspace(c.env.DB, item.workspace_id, session)) return c.json({ error: 'Forbidden' }, 403)

  await c.env.DB.prepare(`DELETE FROM work_item_tag_links WHERE work_item_id = ? AND tag_id = ?`).bind(itemId, tagId).run()
  return c.json({ success: true })
})

// ── POST /api/p2/items/:id/links ──────────────────────────
items.post('/:id/links', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const sourceId = parseInt(c.req.param('id'))
  const { targetId, link_type } = await c.req.json<any>()

  const item = await c.env.DB.prepare(`SELECT workspace_id FROM work_items WHERE id = ?`).bind(sourceId).first<any>()
  if (!item || !await canAccessWorkspace(c.env.DB, item.workspace_id, session)) return c.json({ error: 'Forbidden' }, 403)

  await c.env.DB.prepare(`INSERT OR IGNORE INTO work_item_links (source_id, target_id, link_type, created_by) VALUES (?, ?, ?, ?)`).bind(sourceId, targetId, link_type ?? 'related', session.userId).run()
  await logActivity(c.env.DB, sourceId, session.userId, 'linked', { new_value: String(targetId), note: link_type })
  return c.json({ success: true })
})

export default items
