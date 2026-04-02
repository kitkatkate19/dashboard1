// src/routes/p3/automation.ts — Phase 3: Automation Center & Notifications
import { Hono } from 'hono'
import { requireAuth } from '../../lib/auth'
import { Env } from '../../types'

const app = new Hono<{ Bindings: Env }>()

// ── List Automation Rules ─────────────────────────────────────────────────
app.get('/rules', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const canAccess = session.isGodAdmin || session.roles.includes('god_admin') ||
    session.roles.includes('platform_admin') || session.roles.includes('workflow_admin')
  if (!canAccess) return c.json({ error: 'Forbidden' }, 403)

  const rules = await c.env.DB.prepare(
    `SELECT ar.*, d.name as directorate_name, u.display_name as created_by_name,
      (SELECT COUNT(*) FROM automation_runs rn WHERE rn.automation_rule_id = ar.id) as total_runs,
      (SELECT COUNT(*) FROM automation_runs rn WHERE rn.automation_rule_id = ar.id AND rn.status = 'success') as successful_runs
     FROM automation_rules ar
     LEFT JOIN directorates d ON d.id = ar.directorate_id
     LEFT JOIN users u ON u.id = ar.created_by
     ORDER BY ar.is_active DESC, ar.name`
  ).all()
  return c.json({ rules: rules.results })
})

// ── Create Automation Rule ────────────────────────────────────────────────
app.post('/rules', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const canCreate = session.isGodAdmin || session.roles.includes('god_admin') ||
    session.roles.includes('platform_admin') || session.roles.includes('workflow_admin')
  if (!canCreate) return c.json({ error: 'Forbidden' }, 403)

  const { name, description, trigger_type, trigger_config, conditions, action_type, action_config, directorate_id } = await c.req.json()
  if (!name || !trigger_type || !trigger_config || !action_type || !action_config) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO automation_rules (name, description, trigger_type, trigger_config, conditions, action_type, action_config, directorate_id, created_by)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind(name, description || null, trigger_type,
    JSON.stringify(trigger_config), conditions ? JSON.stringify(conditions) : null,
    action_type, JSON.stringify(action_config),
    directorate_id || null, session.userId).run()

  await c.env.DB.prepare(
    `INSERT INTO platform_audit_log (actor_user_id, actor_email, action, module, record_type, record_id)
     VALUES (?,?,'automation_rule_created','automation','automation_rule',?)`
  ).bind(session.userId, session.email, result.meta.last_row_id).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// ── Toggle Rule Active ────────────────────────────────────────────────────
app.patch('/rules/:id/toggle', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const canManage = session.isGodAdmin || session.roles.includes('god_admin') ||
    session.roles.includes('platform_admin') || session.roles.includes('workflow_admin')
  if (!canManage) return c.json({ error: 'Forbidden' }, 403)

  const id = parseInt(c.req.param('id'))
  const rule = await c.env.DB.prepare(`SELECT * FROM automation_rules WHERE id = ?`).bind(id).first<any>()
  if (!rule) return c.json({ error: 'Not found' }, 404)

  const newState = rule.is_active ? 0 : 1
  await c.env.DB.prepare(`UPDATE automation_rules SET is_active = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(newState, id).run()

  return c.json({ success: true, is_active: newState === 1 })
})

// ── Manual Trigger Automation Rule ────────────────────────────────────────
app.post('/rules/:id/trigger', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const canTrigger = session.isGodAdmin || session.roles.includes('god_admin') ||
    session.roles.includes('platform_admin')
  if (!canTrigger) return c.json({ error: 'Forbidden' }, 403)

  const id = parseInt(c.req.param('id'))
  const rule = await c.env.DB.prepare(`SELECT * FROM automation_rules WHERE id = ?`).bind(id).first<any>()
  if (!rule) return c.json({ error: 'Not found' }, 404)
  if (!rule.is_active) return c.json({ error: 'Rule is inactive' }, 400)

  const runResult = await c.env.DB.prepare(
    `INSERT INTO automation_runs (automation_rule_id, status, triggered_by, trigger_context, started_at)
     VALUES (?,'running','manual',?,datetime('now'))`
  ).bind(id, JSON.stringify({ triggered_by_user: session.userId })).run()
  const runId = runResult.meta.last_row_id

  // Simulate running the automation
  let actionsLog: string[] = []
  try {
    const actionConfig = JSON.parse(rule.action_config || '{}')
    switch (rule.action_type) {
      case 'send_notification':
        actionsLog.push(`Would send notification using template: ${actionConfig.template_slug}`)
        break
      case 'escalate':
        actionsLog.push(`Would escalate to role: ${actionConfig.to_role}`)
        break
      case 'create_reminder':
        actionsLog.push(`Would create reminder: ${actionConfig.message}`)
        break
      default:
        actionsLog.push(`Action type: ${rule.action_type} processed`)
    }

    await c.env.DB.prepare(
      `UPDATE automation_runs SET status = 'success', completed_at = datetime('now'), actions_taken = ? WHERE id = ?`
    ).bind(JSON.stringify(actionsLog), runId).run()
    await c.env.DB.prepare(
      `UPDATE automation_rules SET last_run_at = datetime('now'), last_run_status = 'success', run_count = run_count + 1, updated_at = datetime('now') WHERE id = ?`
    ).bind(id).run()
  } catch (e: any) {
    await c.env.DB.prepare(
      `UPDATE automation_runs SET status = 'failed', completed_at = datetime('now'), error_message = ? WHERE id = ?`
    ).bind(e.message, runId).run()
    await c.env.DB.prepare(
      `UPDATE automation_rules SET last_run_at = datetime('now'), last_run_status = 'failed' WHERE id = ?`
    ).bind(id).run()
  }

  return c.json({ success: true, run_id: runId, actions_taken: actionsLog })
})

// ── List Automation Runs ──────────────────────────────────────────────────
app.get('/runs', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const canAccess = session.isGodAdmin || session.roles.includes('god_admin') ||
    session.roles.includes('platform_admin')
  if (!canAccess) return c.json({ error: 'Forbidden' }, 403)

  const page = parseInt(c.req.query('page') || '1')
  const limit = 30
  const offset = (page - 1) * limit

  const runs = await c.env.DB.prepare(
    `SELECT ar.*, rul.name as rule_name, rul.action_type
     FROM automation_runs ar JOIN automation_rules rul ON rul.id = ar.automation_rule_id
     ORDER BY ar.started_at DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all()

  return c.json({ runs: runs.results, page, limit })
})

// ── Notification Templates ────────────────────────────────────────────────
app.get('/notification-templates', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const templates = await c.env.DB.prepare(
    `SELECT * FROM notification_templates ORDER BY name`
  ).all()
  return c.json({ templates: templates.results })
})

// ── My Notifications (Inbox) ──────────────────────────────────────────────
app.get('/notifications/inbox', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const page = parseInt(c.req.query('page') || '1')
  const limit = 20
  const offset = (page - 1) * limit
  const unreadOnly = c.req.query('unread') === 'true'

  let sql = `SELECT * FROM notification_deliveries WHERE recipient_user_id = ?`
  const params: any[] = [session.userId]
  if (unreadOnly) { sql += ` AND is_read = 0` }
  sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`
  params.push(limit, offset)

  const notifications = await c.env.DB.prepare(sql).bind(...params).all()
  const unread = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM notification_deliveries WHERE recipient_user_id = ? AND is_read = 0`
  ).bind(session.userId).first<{ cnt: number }>()

  return c.json({ notifications: notifications.results, unread_count: unread?.cnt ?? 0, page, limit })
})

// ── Mark Notification Read ────────────────────────────────────────────────
app.patch('/notifications/:id/read', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const id = parseInt(c.req.param('id'))
  await c.env.DB.prepare(
    `UPDATE notification_deliveries SET is_read = 1, read_at = datetime('now')
     WHERE id = ? AND recipient_user_id = ?`
  ).bind(id, session.userId).run()
  return c.json({ success: true })
})

// ── Mark All Read ─────────────────────────────────────────────────────────
app.post('/notifications/mark-all-read', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  await c.env.DB.prepare(
    `UPDATE notification_deliveries SET is_read = 1, read_at = datetime('now')
     WHERE recipient_user_id = ? AND is_read = 0`
  ).bind(session.userId).run()
  return c.json({ success: true })
})

// ── Scheduled Reminders ───────────────────────────────────────────────────
app.get('/reminders', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const reminders = await c.env.DB.prepare(
    `SELECT sr.*, u.display_name as recipient_name
     FROM scheduled_reminders sr LEFT JOIN users u ON u.id = sr.recipient_user_id
     WHERE sr.recipient_user_id = ? AND sr.is_sent = 0 AND sr.remind_at >= datetime('now')
     ORDER BY sr.remind_at ASC LIMIT 20`
  ).bind(session.userId).all()
  return c.json({ reminders: reminders.results })
})

app.post('/reminders', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const { record_type, record_id, recipient_user_id, message, remind_at } = await c.req.json()
  if (!message || !remind_at) return c.json({ error: 'Message and remind_at required' }, 400)

  const result = await c.env.DB.prepare(
    `INSERT INTO scheduled_reminders (record_type, record_id, recipient_user_id, message, remind_at, created_by)
     VALUES (?,?,?,?,?,?)`
  ).bind(record_type || 'general', record_id || null,
    recipient_user_id || session.userId, message, remind_at, session.userId).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// ── Connectors ────────────────────────────────────────────────────────────
app.get('/connectors', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const canAccess = session.isGodAdmin || session.roles.includes('god_admin') || session.roles.includes('platform_admin')
  if (!canAccess) return c.json({ error: 'Forbidden' }, 403)

  const connectors = await c.env.DB.prepare(
    `SELECT cs.*, d.name as directorate_name,
      (SELECT COUNT(*) FROM connector_sync_runs csr WHERE csr.connector_source_id = cs.id) as sync_count,
      (SELECT csr.status FROM connector_sync_runs csr WHERE csr.connector_source_id = cs.id ORDER BY csr.started_at DESC LIMIT 1) as last_sync_status
     FROM connector_sources cs LEFT JOIN directorates d ON d.id = cs.directorate_id
     ORDER BY cs.name`
  ).all()
  return c.json({ connectors: connectors.results })
})

app.post('/connectors', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  if (!session.isGodAdmin && !session.roles.includes('god_admin') && !session.roles.includes('platform_admin')) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  const { name, connector_type, description, config, sync_frequency, directorate_id } = await c.req.json()
  if (!name || !connector_type) return c.json({ error: 'Name and type required' }, 400)

  const result = await c.env.DB.prepare(
    `INSERT INTO connector_sources (name, connector_type, description, config, sync_frequency, directorate_id, created_by)
     VALUES (?,?,?,?,?,?,?)`
  ).bind(name, connector_type, description || null,
    config ? JSON.stringify(config) : null,
    sync_frequency || 'manual', directorate_id || null, session.userId).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

app.post('/connectors/:id/sync', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  if (!session.isGodAdmin && !session.roles.includes('god_admin') && !session.roles.includes('platform_admin')) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  const id = parseInt(c.req.param('id'))
  const connector = await c.env.DB.prepare(`SELECT * FROM connector_sources WHERE id = ?`).bind(id).first<any>()
  if (!connector) return c.json({ error: 'Not found' }, 404)

  const runResult = await c.env.DB.prepare(
    `INSERT INTO connector_sync_runs (connector_source_id, status, triggered_by)
     VALUES (?,'running','manual')`
  ).bind(id).run()

  await c.env.DB.prepare(
    `UPDATE connector_sources SET sync_status = 'running', last_synced_at = datetime('now') WHERE id = ?`
  ).bind(id).run()

  // Simulate a sync completion (in production, this would be async via Cloudflare Queues)
  await c.env.DB.prepare(
    `UPDATE connector_sync_runs SET status = 'success', records_synced = 0, completed_at = datetime('now'),
     sync_log = ? WHERE id = ?`
  ).bind(JSON.stringify([{ message: 'Manual sync initiated - configure connector for live data', timestamp: new Date().toISOString() }]),
    runResult.meta.last_row_id).run()

  await c.env.DB.prepare(
    `UPDATE connector_sources SET sync_status = 'success' WHERE id = ?`
  ).bind(id).run()

  return c.json({ success: true, run_id: runResult.meta.last_row_id })
})

export default app
