// src/routes/p2/workspaces.ts — Workspace CRUD + membership management

import { Hono } from 'hono'
import { Env } from '../../types'
import { getSession, requireAuth } from '../../lib/auth'
import { logAudit } from '../../lib/db'

const workspaces = new Hono<{ Bindings: Env }>()

// helper: check workspace access
async function canAccessWorkspace(db: D1Database, workspaceId: number, session: any) {
  if (session.isGodAdmin) return true
  // check directorate membership
  const ws = await db.prepare(`SELECT directorate_id FROM workspaces WHERE id = ?`).bind(workspaceId).first<any>()
  if (!ws) return false
  if (ws.directorate_id && session.directorateIds.includes(ws.directorate_id)) return true
  // check explicit workspace membership
  const m = await db.prepare(`SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ?`).bind(workspaceId, session.userId).first()
  return !!m
}

async function canManageWorkspace(db: D1Database, workspaceId: number, session: any) {
  if (session.isGodAdmin) return true
  if (session.roles.some((r: string) => ['god_admin', 'platform_admin'].includes(r))) return true
  const m = await db.prepare(`SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?`).bind(workspaceId, session.userId).first<any>()
  return m && ['admin', 'lead'].includes(m.role)
}

// ── GET /api/p2/workspaces ─────────────────────────────────
// List workspaces the session user can access
workspaces.get('/', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const isAdmin = session.isGodAdmin || session.roles.some((r: string) => ['god_admin', 'platform_admin'].includes(r))
  const dirIds  = session.directorateIds.length > 0 ? session.directorateIds.join(',') : '0'

  let query = `
    SELECT w.*, d.code AS dir_code, d.name AS dir_name, d.color AS dir_color,
           COUNT(DISTINCT wm.user_id) AS member_count,
           COUNT(DISTINCT wi.id)      AS item_count
    FROM workspaces w
    LEFT JOIN directorates d    ON d.id = w.directorate_id
    LEFT JOIN workspace_members wm ON wm.workspace_id = w.id
    LEFT JOIN work_items wi     ON wi.workspace_id = w.id AND wi.is_archived = 0
    WHERE w.status = 'active'
  `
  if (!isAdmin) {
    query += ` AND (w.directorate_id IN (${dirIds}) OR w.id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = ${session.userId}
    ))`
  }
  query += ` GROUP BY w.id ORDER BY w.directorate_id ASC, w.name ASC`

  const rows = await c.env.DB.prepare(query).all()
  return c.json({ workspaces: rows.results })
})

// ── GET /api/p2/workspaces/:id ─────────────────────────────
workspaces.get('/:id', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const wsId = parseInt(c.req.param('id'))

  if (!await canAccessWorkspace(c.env.DB, wsId, session)) return c.json({ error: 'Forbidden' }, 403)

  const ws = await c.env.DB.prepare(`
    SELECT w.*, d.code AS dir_code, d.name AS dir_name, d.color AS dir_color
    FROM workspaces w LEFT JOIN directorates d ON d.id = w.directorate_id WHERE w.id = ?
  `).bind(wsId).first<any>()
  if (!ws) return c.json({ error: 'Not found' }, 404)

  const [modules, statuses, types, priorities, tags, members, savedViews] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM workspace_modules WHERE workspace_id = ?`).bind(wsId).all(),
    c.env.DB.prepare(`SELECT * FROM work_item_statuses WHERE workspace_id = ? ORDER BY sort_order ASC`).bind(wsId).all(),
    c.env.DB.prepare(`SELECT * FROM work_item_types WHERE workspace_id = ? ORDER BY sort_order ASC`).bind(wsId).all(),
    c.env.DB.prepare(`SELECT * FROM work_item_priorities ORDER BY level ASC`).all(),
    c.env.DB.prepare(`SELECT * FROM work_item_tags WHERE workspace_id = ? ORDER BY name ASC`).bind(wsId).all(),
    c.env.DB.prepare(`
      SELECT wm.*, u.display_name, u.email, p.preferred_name, p.kbi_title
      FROM workspace_members wm JOIN users u ON u.id = wm.user_id
      LEFT JOIN people_profiles p ON p.user_id = u.id
      WHERE wm.workspace_id = ? ORDER BY wm.role ASC
    `).bind(wsId).all(),
    c.env.DB.prepare(`
      SELECT * FROM saved_views WHERE workspace_id = ? AND (is_shared = 1 OR created_by = ?)
      ORDER BY is_default DESC, name ASC
    `).bind(wsId, session.userId).all(),
  ])

  return c.json({
    ...ws,
    modules: modules.results,
    statuses: statuses.results,
    types: types.results,
    priorities: priorities.results,
    tags: tags.results,
    members: members.results,
    savedViews: savedViews.results,
  })
})

// ── POST /api/p2/workspaces ────────────────────────────────
workspaces.post('/', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ error: 'Unauthorized' }, 401)
  const isAdmin = session.isGodAdmin || session.roles.some((r: string) => ['god_admin', 'platform_admin', 'directorate_lead'].includes(r))
  if (!isAdmin) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json<any>()
  const { name, code, description, workspace_type, icon, color, directorate_id, default_view } = body
  if (!name || !code) return c.json({ error: 'name and code are required' }, 400)

  const result = await c.env.DB.prepare(`
    INSERT INTO workspaces (name, code, description, workspace_type, icon, color, directorate_id, default_view, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(name, code, description ?? null, workspace_type ?? 'board',
    icon ?? 'fas fa-layer-group', color ?? '#4F46E5',
    directorate_id ?? null, default_view ?? 'list', session.userId).run()

  const wsId = result.meta.last_row_id as number

  // Seed default modules
  const defaultModules = ['comments', 'attachments', 'activity', 'approvals']
  for (const m of defaultModules) {
    await c.env.DB.prepare(`INSERT OR IGNORE INTO workspace_modules (workspace_id, module_key) VALUES (?, ?)`).bind(wsId, m).run()
  }

  // Add creator as admin member
  await c.env.DB.prepare(`INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role, added_by) VALUES (?, ?, 'admin', ?)`).bind(wsId, session.userId, session.userId).run()

  await logAudit(c.env.DB, session.userId, 'workspace.created', 'workspace', wsId, { name, code })
  return c.json({ success: true, id: wsId })
})

// ── PUT /api/p2/workspaces/:id ─────────────────────────────
workspaces.put('/:id', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const wsId = parseInt(c.req.param('id'))
  if (!await canManageWorkspace(c.env.DB, wsId, session)) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json<any>()
  const allowed = ['name', 'description', 'workspace_type', 'icon', 'color', 'default_view', 'status', 'settings']
  const fields = Object.keys(body).filter(k => allowed.includes(k))
  if (!fields.length) return c.json({ error: 'No valid fields' }, 400)

  const set = fields.map(f => `${f} = ?`).join(', ')
  await c.env.DB.prepare(`UPDATE workspaces SET ${set}, updated_at = datetime('now') WHERE id = ?`).bind(...fields.map(f => body[f]), wsId).run()
  await logAudit(c.env.DB, session.userId, 'workspace.updated', 'workspace', wsId, { fields })
  return c.json({ success: true })
})

// ── POST /api/p2/workspaces/:id/members ───────────────────
workspaces.post('/:id/members', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const wsId = parseInt(c.req.param('id'))
  if (!await canManageWorkspace(c.env.DB, wsId, session)) return c.json({ error: 'Forbidden' }, 403)

  const { userId, role } = await c.req.json<any>()
  await c.env.DB.prepare(`INSERT OR REPLACE INTO workspace_members (workspace_id, user_id, role, added_by) VALUES (?, ?, ?, ?)`).bind(wsId, userId, role ?? 'member', session.userId).run()
  await logAudit(c.env.DB, session.userId, 'workspace.member.added', 'workspace', wsId, { userId, role })
  return c.json({ success: true })
})

// ── DELETE /api/p2/workspaces/:id/members/:userId ─────────
workspaces.delete('/:id/members/:userId', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const wsId = parseInt(c.req.param('id'))
  if (!await canManageWorkspace(c.env.DB, wsId, session)) return c.json({ error: 'Forbidden' }, 403)

  const userId = parseInt(c.req.param('userId'))
  await c.env.DB.prepare(`DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?`).bind(wsId, userId).run()
  return c.json({ success: true })
})

// ── POST /api/p2/workspaces/:id/statuses ──────────────────
workspaces.post('/:id/statuses', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const wsId = parseInt(c.req.param('id'))
  if (!await canManageWorkspace(c.env.DB, wsId, session)) return c.json({ error: 'Forbidden' }, 403)

  const { name, color, category, sort_order, is_default } = await c.req.json<any>()
  if (!name) return c.json({ error: 'name required' }, 400)

  const result = await c.env.DB.prepare(`
    INSERT INTO work_item_statuses (workspace_id, name, color, category, sort_order, is_default)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(wsId, name, color ?? '#6B7280', category ?? 'active', sort_order ?? 0, is_default ? 1 : 0).run()
  return c.json({ success: true, id: result.meta.last_row_id })
})

// ── POST /api/p2/workspaces/:id/tags ──────────────────────
workspaces.post('/:id/tags', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const wsId = parseInt(c.req.param('id'))
  if (!await canAccessWorkspace(c.env.DB, wsId, session)) return c.json({ error: 'Forbidden' }, 403)

  const { name, color } = await c.req.json<any>()
  if (!name) return c.json({ error: 'name required' }, 400)

  const result = await c.env.DB.prepare(`INSERT OR IGNORE INTO work_item_tags (workspace_id, name, color) VALUES (?, ?, ?)`).bind(wsId, name, color ?? '#6366F1').run()
  return c.json({ success: true, id: result.meta.last_row_id })
})

// ── GET /api/p2/workspaces/:id/statuses ──────────────────
workspaces.get('/:id/statuses', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const wsId = parseInt(c.req.param('id'))
  if (!await canAccessWorkspace(c.env.DB, wsId, session)) return c.json({ error: 'Forbidden' }, 403)

  // Try workspace-specific statuses first; fall back to workspace 1 (global defaults)
  let rows = await c.env.DB.prepare(`SELECT * FROM work_item_statuses WHERE workspace_id = ? ORDER BY sort_order ASC`).bind(wsId).all<any>()
  if (!rows.results.length) {
    rows = await c.env.DB.prepare(`SELECT * FROM work_item_statuses WHERE workspace_id = 1 ORDER BY sort_order ASC`).all<any>()
  }
  return c.json({ statuses: rows.results })
})

// ── GET /api/p2/workspaces/:id/priorities ─────────────────
workspaces.get('/:id/priorities', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const wsId = parseInt(c.req.param('id'))
  if (!await canAccessWorkspace(c.env.DB, wsId, session)) return c.json({ error: 'Forbidden' }, 403)

  let rows = await c.env.DB.prepare(`SELECT * FROM work_item_priorities WHERE workspace_id = ? ORDER BY sort_order ASC`).bind(wsId).all<any>()
  if (!rows.results.length) {
    rows = await c.env.DB.prepare(`SELECT * FROM work_item_priorities WHERE workspace_id = 1 ORDER BY sort_order ASC`).all<any>()
  }
  return c.json({ priorities: rows.results })
})

// ── GET /api/p2/workspaces/:id/types ──────────────────────
workspaces.get('/:id/types', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const wsId = parseInt(c.req.param('id'))
  if (!await canAccessWorkspace(c.env.DB, wsId, session)) return c.json({ error: 'Forbidden' }, 403)

  let rows = await c.env.DB.prepare(`SELECT * FROM work_item_types WHERE workspace_id = ? ORDER BY name ASC`).bind(wsId).all<any>()
  if (!rows.results.length) {
    rows = await c.env.DB.prepare(`SELECT * FROM work_item_types WHERE workspace_id = 1 ORDER BY name ASC`).all<any>()
  }
  return c.json({ types: rows.results })
})

// ── GET /api/p2/workspaces/:id/tags ──────────────────────
workspaces.get('/:id/tags', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const wsId = parseInt(c.req.param('id'))
  if (!await canAccessWorkspace(c.env.DB, wsId, session)) return c.json({ error: 'Forbidden' }, 403)

  const rows = await c.env.DB.prepare(`SELECT * FROM work_item_tags WHERE workspace_id = ? ORDER BY name ASC`).bind(wsId).all<any>()
  return c.json({ tags: rows.results })
})

export { canAccessWorkspace, canManageWorkspace }
export default workspaces
