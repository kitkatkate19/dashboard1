// src/routes/p2/p2search.ts — Phase 2 permission-aware cross-workspace search

import { Hono } from 'hono'
import { Env } from '../../types'
import { requireAuth } from '../../lib/auth'

const p2search = new Hono<{ Bindings: Env }>()

// ── GET /api/p2/search?q=&workspace_id=&type=&status=&page= ──
p2search.get('/', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const q       = (c.req.query('q') ?? '').trim()
  const wsId    = c.req.query('workspace_id') ? parseInt(c.req.query('workspace_id')!) : null
  const type    = c.req.query('type') // 'item' | 'comment' | 'attachment'
  const status  = c.req.query('status')
  const page    = Math.max(1, parseInt(c.req.query('page') ?? '1'))
  const perPage = 20
  const offset  = (page - 1) * perPage

  if (!q || q.length < 2) return c.json({ results: [], total: 0, q })

  const isAdmin  = session.isGodAdmin || session.roles.some((r: string) => ['god_admin', 'platform_admin'].includes(r))
  const dirIds   = session.directorateIds.length > 0 ? session.directorateIds.join(',') : '0'

  // Build workspace access clause
  let wsAccessClause = isAdmin
    ? `1=1`
    : `(w.directorate_id IN (${dirIds}) OR w.id IN (SELECT workspace_id FROM workspace_members WHERE user_id = ${session.userId}))`

  if (wsId) wsAccessClause += ` AND w.id = ${wsId}`

  const searchTerm = `%${q}%`
  const results: any[] = []

  // ── Search Work Items ──────────────────────────────────────
  if (!type || type === 'item') {
    const statusClause = status ? `AND ws_stat.slug = '${status.replace(/'/g, "''")}'` : ''
    const itemResults = await c.env.DB.prepare(`
      SELECT
        'item'            AS result_type,
        wi.id,
        wi.issued_id      AS reference,
        wi.title,
        wi.description    AS excerpt,
        ws_stat.name      AS status,
        wp.name           AS priority,
        w.name            AS workspace_name,
        w.code            AS workspace_code,
        d.code            AS directorate_code,
        wi.updated_at     AS date,
        owner.display_name AS owner_name
      FROM work_items wi
      JOIN workspaces w             ON w.id = wi.workspace_id
      LEFT JOIN directorates d      ON d.id = w.directorate_id
      LEFT JOIN work_item_statuses  ws_stat ON ws_stat.id = wi.status_id
      LEFT JOIN work_item_priorities wp      ON wp.id = wi.priority_id
      LEFT JOIN users               owner   ON owner.id = wi.owner_user_id
      WHERE wi.is_archived = 0
        AND ${wsAccessClause}
        AND (wi.title LIKE ? OR wi.description LIKE ? OR wi.issued_id LIKE ?)
        ${statusClause}
      ORDER BY wi.updated_at DESC
      LIMIT ${perPage} OFFSET ${offset}
    `).bind(searchTerm, searchTerm, searchTerm).all<any>()

    results.push(...itemResults.results.map(r => ({
      ...r,
      excerpt: r.excerpt ? r.excerpt.slice(0, 200) : null
    })))
  }

  // ── Search Comments ────────────────────────────────────────
  if (!type || type === 'comment') {
    const commentResults = await c.env.DB.prepare(`
      SELECT
        'comment'         AS result_type,
        wic.id,
        wi.issued_id      AS reference,
        wi.title          AS item_title,
        wic.body          AS excerpt,
        w.name            AS workspace_name,
        w.code            AS workspace_code,
        d.code            AS directorate_code,
        wic.created_at    AS date,
        u.display_name    AS owner_name
      FROM work_item_comments wic
      JOIN work_items wi            ON wi.id = wic.work_item_id
      JOIN workspaces w             ON w.id = wi.workspace_id
      LEFT JOIN directorates d      ON d.id = w.directorate_id
      LEFT JOIN users u             ON u.id = wic.user_id
      WHERE wi.is_archived = 0
        AND ${wsAccessClause}
        AND wic.body LIKE ?
      ORDER BY wic.created_at DESC
      LIMIT ${Math.floor(perPage/2)} OFFSET ${offset}
    `).bind(searchTerm).all<any>()

    results.push(...commentResults.results.map(r => ({
      ...r,
      excerpt: r.excerpt ? r.excerpt.slice(0, 200) : null
    })))
  }

  // ── Search Attachments ─────────────────────────────────────
  if (!type || type === 'attachment') {
    const attachResults = await c.env.DB.prepare(`
      SELECT
        'attachment'      AS result_type,
        wia.id,
        wi.issued_id      AS reference,
        wi.title          AS item_title,
        wia.file_name     AS excerpt,
        w.name            AS workspace_name,
        w.code            AS workspace_code,
        d.code            AS directorate_code,
        wia.uploaded_at   AS date,
        u.display_name    AS owner_name
      FROM work_item_attachments wia
      JOIN work_items wi            ON wi.id = wia.work_item_id
      JOIN workspaces w             ON w.id = wi.workspace_id
      LEFT JOIN directorates d      ON d.id = w.directorate_id
      LEFT JOIN users u             ON u.id = wia.uploaded_by
      WHERE wi.is_archived = 0
        AND ${wsAccessClause}
        AND (wia.file_name LIKE ? OR wia.description LIKE ?)
      ORDER BY wia.uploaded_at DESC
      LIMIT ${Math.floor(perPage/2)} OFFSET ${offset}
    `).bind(searchTerm, searchTerm).all<any>()

    results.push(...attachResults.results)
  }

  // sort merged results by date desc
  results.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

  return c.json({
    q,
    results: results.slice(0, perPage),
    total: results.length,
    page,
    per_page: perPage,
  })
})

export default p2search
