// src/routes/p3/analytics.ts — Phase 3: Analytics & Executive Dashboards
import { Hono } from 'hono'
import { requireAuth } from '../../lib/auth'
import { Env } from '../../types'

const app = new Hono<{ Bindings: Env }>()

// ── Executive Overview Dashboard ──────────────────────────────────────────
app.get('/executive', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const canAccess = session.isGodAdmin || session.roles.includes('god_admin') ||
    session.roles.includes('platform_admin') || session.roles.includes('executive')
  if (!canAccess) return c.json({ error: 'Executive access required' }, 403)

  // Platform-wide metrics
  const [users, requests, workflowRuns, workItems, accounts, notifications] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active FROM users`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) as total,
      SUM(CASE WHEN status = 'submitted' OR status = 'under_review' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM requests`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) as total,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM workflow_runs`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) as total,
      SUM(CASE WHEN is_archived = 0 THEN 1 ELSE 0 END) as active
      FROM work_items`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active FROM accounts`).first<any>().catch(() => ({ total: 0, active: 0 })),
    c.env.DB.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread FROM notification_deliveries`).first<any>(),
  ])

  // Cross-directorate request breakdown
  const byDirectorate = await c.env.DB.prepare(
    `SELECT d.code, d.name, d.color,
      COUNT(r.id) as requests,
      SUM(CASE WHEN r.status IN ('submitted','under_review') THEN 1 ELSE 0 END) as pending,
      COUNT(DISTINCT wi.id) as work_items
     FROM directorates d
     LEFT JOIN requests r ON r.directorate_id = d.id
     LEFT JOIN workspaces ws ON ws.directorate_id = d.id
     LEFT JOIN work_items wi ON wi.workspace_id = ws.id AND wi.is_archived = 0
     WHERE d.is_active = 1 GROUP BY d.id ORDER BY d.code`
  ).all()

  // Recent requests needing attention
  const pendingRequests = await c.env.DB.prepare(
    `SELECT r.id, r.issued_id, r.title, r.status, r.priority, r.submitted_at,
      rt.name as type_name, rt.icon as type_icon, rt.color as type_color,
      u.display_name as requester_name, d.name as directorate_name
     FROM requests r
     JOIN request_types rt ON rt.id = r.request_type_id
     JOIN users u ON u.id = r.requested_by_user_id
     LEFT JOIN directorates d ON d.id = r.directorate_id
     WHERE r.status IN ('submitted','under_review')
     ORDER BY r.priority DESC, r.submitted_at ASC LIMIT 10`
  ).all()

  // Request trend (last 7 days)
  const requestTrend = await c.env.DB.prepare(
    `SELECT date(submitted_at) as day, COUNT(*) as cnt
     FROM requests WHERE submitted_at >= date('now', '-7 days')
     GROUP BY date(submitted_at) ORDER BY day`
  ).all()

  // Workflow performance summary
  const workflowPerf = await c.env.DB.prepare(
    `SELECT wt.name,
      COUNT(wr.id) as total,
      ROUND(100.0 * SUM(CASE WHEN wr.status = 'completed' THEN 1 ELSE 0 END) / MAX(COUNT(wr.id), 1), 1) as completion_rate,
      ROUND(AVG(CASE WHEN wr.completed_at IS NOT NULL
        THEN (julianday(wr.completed_at) - julianday(wr.started_at)) * 24 ELSE NULL END), 1) as avg_hours
     FROM workflow_runs wr JOIN workflow_templates wt ON wt.id = wr.workflow_template_id
     GROUP BY wt.id ORDER BY total DESC LIMIT 5`
  ).all()

  // Workspace health
  const workspaceHealth = await c.env.DB.prepare(
    `SELECT ws.name, ws.code, d.code as directorate_code, d.color,
      COUNT(CASE WHEN wi.is_archived = 0 AND wi.due_at IS NOT NULL AND wi.due_at < date('now') THEN 1 END) as overdue_items,
      COUNT(CASE WHEN wi.is_archived = 0 THEN 1 END) as total_items,
      MAX(wi.updated_at) as last_activity
     FROM workspaces ws
     JOIN directorates d ON d.id = ws.directorate_id
     LEFT JOIN work_items wi ON wi.workspace_id = ws.id
     WHERE ws.status = 'active' GROUP BY ws.id ORDER BY d.code, ws.name LIMIT 20`
  ).all()

  // Recent platform activity
  const recentActivity = await c.env.DB.prepare(
    `SELECT pal.*, u.display_name as actor_name FROM platform_audit_log pal
     LEFT JOIN users u ON u.id = pal.actor_user_id
     ORDER BY pal.created_at DESC LIMIT 20`
  ).all()

  return c.json({
    platform: { users, requests, workflow_runs: workflowRuns, work_items: workItems, accounts, notifications },
    by_directorate: byDirectorate.results,
    pending_requests: pendingRequests.results,
    request_trend: requestTrend.results,
    workflow_performance: workflowPerf.results,
    workspace_health: workspaceHealth.results,
    recent_activity: recentActivity.results
  })
})

// ── Directorate Analytics ─────────────────────────────────────────────────
app.get('/directorate/:code', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const code = c.req.param('code')

  const directorate = await c.env.DB.prepare(`SELECT * FROM directorates WHERE code = ?`).bind(code).first<any>()
  if (!directorate) return c.json({ error: 'Not found' }, 404)

  const canAccess = session.isGodAdmin || session.roles.includes('god_admin') ||
    session.roles.includes('platform_admin') || session.roles.includes('executive') ||
    session.directorateIds.includes(directorate.id)
  if (!canAccess) return c.json({ error: 'Access denied' }, 403)

  const [requests, workItems, workspaces, members] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) as total,
       SUM(CASE WHEN status = 'submitted' OR status = 'under_review' THEN 1 ELSE 0 END) as pending,
       SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
       SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
       FROM requests WHERE directorate_id = ?`
    ).bind(directorate.id).first<any>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) as total,
       SUM(CASE WHEN wis.category = 'done' THEN 1 ELSE 0 END) as completed,
       SUM(CASE WHEN wi.due_at < date('now') AND wi.is_archived = 0 THEN 1 ELSE 0 END) as overdue,
       ROUND(AVG(wi.progress_pct), 1) as avg_progress
       FROM work_items wi
       JOIN workspaces ws ON ws.id = wi.workspace_id
       LEFT JOIN work_item_statuses wis ON wis.id = wi.status_id
       WHERE ws.directorate_id = ? AND wi.is_archived = 0`
    ).bind(directorate.id).first<any>(),
    c.env.DB.prepare(
      `SELECT ws.name, ws.code, ws.icon, ws.color,
        COUNT(wi.id) as item_count,
        SUM(CASE WHEN wis.category = 'done' THEN 1 ELSE 0 END) as completed,
        MAX(wi.updated_at) as last_activity
       FROM workspaces ws
       LEFT JOIN work_items wi ON wi.workspace_id = ws.id AND wi.is_archived = 0
       LEFT JOIN work_item_statuses wis ON wis.id = wi.status_id
       WHERE ws.directorate_id = ? AND ws.status = 'active'
       GROUP BY ws.id ORDER BY ws.name`
    ).bind(directorate.id).all(),
    c.env.DB.prepare(
      `SELECT COUNT(DISTINCT udm.user_id) as total FROM user_directorate_memberships udm WHERE udm.directorate_id = ?`
    ).bind(directorate.id).first<any>().catch(() => ({ total: 0 })),
  ])

  // Request trend last 30 days
  const requestTrend = await c.env.DB.prepare(
    `SELECT date(submitted_at) as day, COUNT(*) as cnt
     FROM requests WHERE directorate_id = ? AND submitted_at >= date('now','-30 days')
     GROUP BY date(submitted_at) ORDER BY day`
  ).bind(directorate.id).all()

  // Top work items by priority
  const topItems = await c.env.DB.prepare(
    `SELECT wi.id, wi.issued_id, wi.title, wi.progress_pct, wi.due_at,
      wis.name as status_name, wis.color as status_color,
      wip.name as priority_name, wip.color as priority_color,
      u.display_name as owner_name, ws.name as workspace_name
     FROM work_items wi
     JOIN workspaces ws ON ws.id = wi.workspace_id
     LEFT JOIN work_item_statuses wis ON wis.id = wi.status_id
     LEFT JOIN work_item_priorities wip ON wip.id = wi.priority_id
     LEFT JOIN users u ON u.id = wi.owner_user_id
     WHERE ws.directorate_id = ? AND wi.is_archived = 0
     ORDER BY wip.level DESC, wi.due_at ASC LIMIT 10`
  ).bind(directorate.id).all()

  return c.json({
    directorate,
    requests, work_items: workItems, members,
    workspaces: workspaces.results,
    request_trend: requestTrend.results,
    top_items: topItems.results
  })
})

// ── Dashboard Configs ─────────────────────────────────────────────────────
app.get('/dashboards', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const configs = await c.env.DB.prepare(
    `SELECT dc.*, u.display_name as owner_name FROM dashboard_configs dc
     LEFT JOIN users u ON u.id = dc.owner_user_id
     WHERE dc.is_active = 1 ORDER BY dc.is_default DESC, dc.name`
  ).all()
  return c.json({ dashboards: configs.results })
})

app.get('/dashboards/:slug', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const slug = c.req.param('slug')
  const config = await c.env.DB.prepare(`SELECT * FROM dashboard_configs WHERE slug = ?`).bind(slug).first()
  if (!config) return c.json({ error: 'Not found' }, 404)
  return c.json({ dashboard: config })
})

// ── Analytics Snapshots ────────────────────────────────────────────────────
app.get('/snapshots', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const type = c.req.query('type')
  const scope = c.req.query('scope')
  let sql = `SELECT * FROM analytics_snapshots WHERE 1=1`
  const params: any[] = []
  if (type) { sql += ` AND snapshot_type = ?`; params.push(type) }
  if (scope) { sql += ` AND scope_value = ?`; params.push(scope) }
  sql += ` ORDER BY created_at DESC LIMIT 50`
  const snapshots = await c.env.DB.prepare(sql).bind(...params).all()
  return c.json({ snapshots: snapshots.results })
})

// ── Generate snapshot on demand (admin) ───────────────────────────────────
app.post('/snapshots/generate', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  if (!session.isGodAdmin && !session.roles.includes('god_admin') && !session.roles.includes('platform_admin')) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const now = new Date()
  const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString()
  const periodEnd = now.toISOString()

  // Platform summary snapshot
  const platformData = await c.env.DB.prepare(
    `SELECT
      (SELECT COUNT(*) FROM users WHERE status = 'active') as active_users,
      (SELECT COUNT(*) FROM requests WHERE submitted_at >= date('now','-7 days')) as requests_7d,
      (SELECT COUNT(*) FROM workflow_runs WHERE status = 'running') as active_workflows,
      (SELECT COUNT(*) FROM work_items WHERE is_archived = 0 AND due_at < date('now')) as overdue_items`
  ).first()

  await c.env.DB.prepare(
    `INSERT INTO analytics_snapshots (snapshot_type, scope_type, scope_value, period_type, period_start, period_end, payload_json)
     VALUES ('platform_summary','platform','all','daily',?,?,?)`
  ).bind(periodStart, periodEnd, JSON.stringify(platformData)).run()

  // Per-directorate snapshots
  const directorates = await c.env.DB.prepare(`SELECT * FROM directorates WHERE is_active = 1`).all()
  for (const d of directorates.results as any[]) {
    const dirData = await c.env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM requests WHERE directorate_id = ? AND submitted_at >= date('now','-7 days')) as requests_7d,
        (SELECT COUNT(*) FROM requests WHERE directorate_id = ? AND status IN ('submitted','under_review')) as pending_requests,
        (SELECT COUNT(*) FROM work_items wi JOIN workspaces ws ON ws.id = wi.workspace_id WHERE ws.directorate_id = ? AND wi.is_archived = 0) as active_items`
    ).bind(d.id, d.id, d.id).first()

    await c.env.DB.prepare(
      `INSERT INTO analytics_snapshots (snapshot_type, scope_type, scope_value, period_type, period_start, period_end, payload_json)
       VALUES ('directorate_summary','directorate',?,?'daily',?,?,?)`
    ).bind(d.code, periodStart, periodEnd, JSON.stringify(dirData)).run().catch(() => {})
  }

  return c.json({ success: true, generated_at: now.toISOString() })
})

// ── Platform Health ────────────────────────────────────────────────────────
app.get('/health', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  if (!session.isGodAdmin && !session.roles.includes('god_admin') && !session.roles.includes('platform_admin')) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const checks = await c.env.DB.prepare(
    `SELECT * FROM platform_health_checks ORDER BY checked_at DESC LIMIT 20`
  ).all()

  const automationHealth = await c.env.DB.prepare(
    `SELECT ar.name, ar.last_run_at, ar.last_run_status, ar.run_count, ar.is_active
     FROM automation_rules ar ORDER BY ar.last_run_at DESC`
  ).all()

  const connectorHealth = await c.env.DB.prepare(
    `SELECT cs.name, cs.connector_type, cs.sync_status, cs.last_synced_at, cs.error_message
     FROM connector_sources cs WHERE cs.is_active = 1`
  ).all()

  // Overdue workflow steps
  const overdueSteps = await c.env.DB.prepare(
    `SELECT wrs.*, wts.name as step_name, wr.record_type, wr.record_id,
      r.title as request_title, r.issued_id, u.display_name as assigned_name
     FROM workflow_run_steps wrs
     JOIN workflow_template_steps wts ON wts.id = wrs.template_step_id
     JOIN workflow_runs wr ON wr.id = wrs.workflow_run_id
     LEFT JOIN requests r ON r.id = wr.record_id AND wr.record_type = 'request'
     LEFT JOIN users u ON u.id = wrs.assigned_to_user_id
     WHERE wrs.status = 'active' AND wrs.deadline_at < datetime('now')
     ORDER BY wrs.deadline_at ASC LIMIT 20`
  ).all()

  return c.json({
    health_checks: checks.results,
    automation_health: automationHealth.results,
    connector_health: connectorHealth.results,
    overdue_workflow_steps: overdueSteps.results,
    checked_at: new Date().toISOString()
  })
})

// ── Cross-directorate User Activity ──────────────────────────────────────
app.get('/user-activity', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  if (!session.isGodAdmin && !session.roles.includes('god_admin') && !session.roles.includes('platform_admin')) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const logins = await c.env.DB.prepare(
    `SELECT date(last_login_at) as day, COUNT(*) as cnt FROM users
     WHERE last_login_at >= date('now','-30 days')
     GROUP BY date(last_login_at) ORDER BY day`
  ).all()

  const topUsers = await c.env.DB.prepare(
    `SELECT u.display_name, u.email, u.last_login_at,
      COUNT(DISTINCT pal.id) as actions,
      COUNT(DISTINCT r.id) as requests_submitted
     FROM users u
     LEFT JOIN platform_audit_log pal ON pal.actor_user_id = u.id AND pal.created_at >= date('now','-30 days')
     LEFT JOIN requests r ON r.requested_by_user_id = u.id AND r.submitted_at >= date('now','-30 days')
     WHERE u.status = 'active'
     GROUP BY u.id ORDER BY actions DESC LIMIT 20`
  ).all()

  return c.json({ login_trend: logins.results, top_users: topUsers.results })
})

export default app
