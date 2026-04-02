// src/routes/p2/p2export.ts — CSV/XLSX Export for workspaces & work items

import { Hono } from 'hono'
import { Env } from '../../types'
import { requireAuth } from '../../lib/auth'
import { canAccessWorkspace } from './workspaces'

const p2export = new Hono<{ Bindings: Env }>()

// helper: convert array of objects to CSV string
function toCSV(rows: Record<string, any>[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const lines = [headers.map(escape).join(',')]
  for (const row of rows) lines.push(headers.map(h => escape(row[h])).join(','))
  return lines.join('\r\n')
}

// ── GET /api/p2/export/items?workspace_id=&status=&priority=&format=csv ──
p2export.get('/items', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  // Only certain roles can export
  const canExport = session.isGodAdmin ||
    session.roles.some((r: string) => ['god_admin', 'platform_admin', 'directorate_lead', 'workspace_admin', 'team_lead'].includes(r))
  if (!canExport) return c.json({ error: 'Insufficient permissions to export' }, 403)

  const wsId     = parseInt(c.req.query('workspace_id') ?? '0')
  const status   = c.req.query('status')
  const priority = c.req.query('priority')
  const assignee = c.req.query('assignee_id')
  const format   = c.req.query('format') ?? 'csv'

  if (!wsId) return c.json({ error: 'workspace_id required' }, 400)
  if (!await canAccessWorkspace(c.env.DB, wsId, session)) return c.json({ error: 'Forbidden' }, 403)

  // Build query
  let sql = `
    SELECT
      wi.issued_id           AS "Issue ID",
      wit.name               AS "Type",
      wi.title               AS "Title",
      ws_stat.name           AS "Status",
      wp.name                AS "Priority",
      wi.description         AS "Description",
      owner.display_name     AS "Owner",
      wi.start_at            AS "Start Date",
      wi.due_at              AS "Due Date",
      wi.completed_at        AS "Completed At",
      wi.progress            AS "Progress %",
      wi.estimated_hours     AS "Est. Hours",
      wi.actual_hours        AS "Actual Hours",
      wi.created_at          AS "Created At",
      wi.updated_at          AS "Updated At"
    FROM work_items wi
    LEFT JOIN work_item_types        wit     ON wit.id     = wi.work_item_type_id
    LEFT JOIN work_item_statuses     ws_stat ON ws_stat.id = wi.status_id
    LEFT JOIN work_item_priorities   wp      ON wp.id      = wi.priority_id
    LEFT JOIN users                  owner   ON owner.id   = wi.owner_user_id
    WHERE wi.workspace_id = ? AND wi.is_archived = 0
  `
  const params: any[] = [wsId]

  if (status)   { sql += ` AND ws_stat.slug = ?`; params.push(status) }
  if (priority) { sql += ` AND wp.slug = ?`;      params.push(priority) }
  if (assignee) {
    sql += ` AND wi.id IN (SELECT work_item_id FROM work_item_assignees WHERE user_id = ?)`
    params.push(parseInt(assignee))
  }
  sql += ` ORDER BY wi.created_at DESC LIMIT 5000`

  const stmt   = c.env.DB.prepare(sql)
  const bound  = params.reduce((s, p) => s.bind(p), stmt)
  // D1 doesn't support chained bind; use spread
  const result = await c.env.DB.prepare(sql).bind(...params).all<any>()
  const rows   = result.results

  // Log export job
  await c.env.DB.prepare(`
    INSERT INTO export_jobs (workspace_id, requested_by, format, status, row_count, filters, completed_at)
    VALUES (?, ?, ?, 'completed', ?, ?, datetime('now'))
  `).bind(wsId, session.userId, format, rows.length, JSON.stringify({ status, priority, assignee })).run()

  if (format === 'csv') {
    const csv = toCSV(rows)
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="work-items-ws${wsId}-${new Date().toISOString().slice(0,10)}.csv"`,
      }
    })
  }

  // JSON fallback
  return c.json({ rows, count: rows.length })
})

// ── GET /api/p2/export/workspace-summary?workspace_id= ───
p2export.get('/workspace-summary', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const wsId = parseInt(c.req.query('workspace_id') ?? '0')
  if (!wsId) return c.json({ error: 'workspace_id required' }, 400)
  if (!await canAccessWorkspace(c.env.DB, wsId, session)) return c.json({ error: 'Forbidden' }, 403)

  const canExport = session.isGodAdmin ||
    session.roles.some((r: string) => ['god_admin', 'platform_admin', 'directorate_lead', 'workspace_admin'].includes(r))
  if (!canExport) return c.json({ error: 'Forbidden' }, 403)

  const [ws, statusBreakdown, priorityBreakdown, assigneeBreakdown, recent] = await Promise.all([
    c.env.DB.prepare(`SELECT w.*, d.name AS dir_name FROM workspaces w LEFT JOIN directorates d ON d.id=w.directorate_id WHERE w.id=?`).bind(wsId).first<any>(),
    c.env.DB.prepare(`SELECT ws.name AS status, COUNT(*) AS count FROM work_items wi LEFT JOIN work_item_statuses ws ON ws.id=wi.status_id WHERE wi.workspace_id=? AND wi.is_archived=0 GROUP BY ws.name ORDER BY count DESC`).bind(wsId).all<any>(),
    c.env.DB.prepare(`SELECT wp.name AS priority, COUNT(*) AS count FROM work_items wi LEFT JOIN work_item_priorities wp ON wp.id=wi.priority_id WHERE wi.workspace_id=? AND wi.is_archived=0 GROUP BY wp.name ORDER BY count DESC`).bind(wsId).all<any>(),
    c.env.DB.prepare(`SELECT u.display_name AS assignee, COUNT(*) AS assigned FROM work_item_assignees wia JOIN users u ON u.id=wia.user_id JOIN work_items wi ON wi.id=wia.work_item_id WHERE wi.workspace_id=? AND wi.is_archived=0 GROUP BY u.display_name ORDER BY assigned DESC LIMIT 10`).bind(wsId).all<any>(),
    c.env.DB.prepare(`SELECT wi.issued_id, wi.title, ws.name AS status, wi.updated_at FROM work_items wi LEFT JOIN work_item_statuses ws ON ws.id=wi.status_id WHERE wi.workspace_id=? AND wi.is_archived=0 ORDER BY wi.updated_at DESC LIMIT 20`).bind(wsId).all<any>(),
  ])

  const summaryRows = [
    { Section: 'WORKSPACE', Key: 'Name', Value: ws?.name },
    { Section: 'WORKSPACE', Key: 'Directorate', Value: ws?.dir_name },
    { Section: 'WORKSPACE', Key: 'Code', Value: ws?.code },
    { Section: 'WORKSPACE', Key: 'Status', Value: ws?.status },
    ...statusBreakdown.results.map((r: any) => ({ Section: 'BY STATUS', Key: r.status, Value: r.count })),
    ...priorityBreakdown.results.map((r: any) => ({ Section: 'BY PRIORITY', Key: r.priority, Value: r.count })),
    ...assigneeBreakdown.results.map((r: any) => ({ Section: 'BY ASSIGNEE', Key: r.assignee, Value: r.assigned })),
  ]

  const csv = toCSV(summaryRows)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="workspace-summary-${wsId}-${new Date().toISOString().slice(0,10)}.csv"`,
    }
  })
})

// ── GET /api/p2/export/jobs?workspace_id= ─────────────────
p2export.get('/jobs', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const wsId = parseInt(c.req.query('workspace_id') ?? '0')
  if (!wsId) return c.json({ error: 'workspace_id required' }, 400)
  if (!await canAccessWorkspace(c.env.DB, wsId, session)) return c.json({ error: 'Forbidden' }, 403)

  const jobs = await c.env.DB.prepare(`
    SELECT ej.*, u.display_name AS requester_name
    FROM export_jobs ej
    LEFT JOIN users u ON u.id = ej.requested_by
    WHERE ej.workspace_id = ?
    ORDER BY ej.created_at DESC LIMIT 50
  `).bind(wsId).all<any>()

  return c.json({ jobs: jobs.results })
})

export default p2export
