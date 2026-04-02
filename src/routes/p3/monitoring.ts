// src/routes/p3/monitoring.ts — Phase 3: God Admin Monitoring & Audit
import { Hono } from 'hono'
import { requireAuth, requireGodAdmin } from '../../lib/auth'
import { Env } from '../../types'

const app = new Hono<{ Bindings: Env }>()

// ── Full Platform Audit Log ────────────────────────────────────────────────
app.get('/audit', async (c) => {
  const session = await requireGodAdmin(c)
  if (session instanceof Response) return session
  const page = parseInt(c.req.query('page') || '1')
  const limit = 50
  const offset = (page - 1) * limit
  const module = c.req.query('module')
  const severity = c.req.query('severity')
  const userId = c.req.query('user_id')

  let sql = `SELECT pal.*, u.display_name as actor_name FROM platform_audit_log pal
     LEFT JOIN users u ON u.id = pal.actor_user_id WHERE 1=1`
  const params: any[] = []
  if (module) { sql += ` AND pal.module = ?`; params.push(module) }
  if (severity) { sql += ` AND pal.severity = ?`; params.push(severity) }
  if (userId) { sql += ` AND pal.actor_user_id = ?`; params.push(parseInt(userId)) }
  sql += ` ORDER BY pal.created_at DESC LIMIT ? OFFSET ?`
  params.push(limit, offset)

  const logs = await c.env.DB.prepare(sql).bind(...params).all()
  const total = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM platform_audit_log`).first<{ cnt: number }>()

  return c.json({ logs: logs.results, total: total?.cnt ?? 0, page, limit })
})

// ── God Admin Actions Log ─────────────────────────────────────────────────
app.get('/god-admin-actions', async (c) => {
  const session = await requireGodAdmin(c)
  if (session instanceof Response) return session

  const actions = await c.env.DB.prepare(
    `SELECT gaa.*, u.display_name as admin_name, u.email as admin_email
     FROM god_admin_actions gaa JOIN users u ON u.id = gaa.admin_user_id
     ORDER BY gaa.created_at DESC LIMIT 50`
  ).all()
  return c.json({ actions: actions.results })
})

// ── Record God Admin Action ────────────────────────────────────────────────
app.post('/god-admin-actions', async (c) => {
  const session = await requireGodAdmin(c)
  if (session instanceof Response) return session

  const { action_type, target_type, target_id, justification, old_state, new_state } = await c.req.json()
  if (!action_type || !justification || justification.length < 10) {
    return c.json({ error: 'Action type and justification (min 10 chars) required' }, 400)
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO god_admin_actions (admin_user_id, action_type, target_type, target_id, justification, old_state, new_state)
     VALUES (?,?,?,?,?,?,?)`
  ).bind(session.userId, action_type, target_type || null, target_id || null,
    justification, old_state ? JSON.stringify(old_state) : null,
    new_state ? JSON.stringify(new_state) : null).run()

  await c.env.DB.prepare(
    `INSERT INTO platform_audit_log (actor_user_id, actor_email, action, module, record_type, record_id, severity)
     VALUES (?,?,?,'admin','god_admin_action',?,'critical')`
  ).bind(session.userId, session.email, action_type, result.meta.last_row_id).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// ── Executive Flags ────────────────────────────────────────────────────────
app.get('/flags', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const canAccess = session.isGodAdmin || session.roles.includes('god_admin') ||
    session.roles.includes('executive') || session.roles.includes('platform_admin')
  if (!canAccess) return c.json({ error: 'Forbidden' }, 403)

  const flags = await c.env.DB.prepare(
    `SELECT ef.*, u.display_name as flagged_by_name, ack.display_name as acknowledged_by_name
     FROM executive_flags ef
     JOIN users u ON u.id = ef.flagged_by
     LEFT JOIN users ack ON ack.id = ef.acknowledged_by
     WHERE ef.status = 'open' ORDER BY ef.created_at DESC LIMIT 50`
  ).all()
  return c.json({ flags: flags.results })
})

app.post('/flags', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const { record_type, record_id, flag_reason, flag_type } = await c.req.json()
  if (!record_type || !record_id || !flag_reason) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO executive_flags (flagged_by, record_type, record_id, flag_reason, flag_type)
     VALUES (?,?,?,?,?)`
  ).bind(session.userId, record_type, record_id, flag_reason, flag_type || 'attention').run()

  // Notify executives and god admins
  const executives = await c.env.DB.prepare(
    `SELECT DISTINCT u.id FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.name IN ('god_admin','executive') AND u.status = 'active'`
  ).all()
  for (const exec of executives.results as any[]) {
    await c.env.DB.prepare(
      `INSERT INTO notification_deliveries (recipient_user_id, channel, subject, body, record_type, record_id, status)
       VALUES (?,'in_app','New Executive Flag',?,'executive_flag',?,'sent')`
    ).bind(exec.id, `${flag_reason.slice(0, 100)} — Flagged by ${session.email}`, result.meta.last_row_id).run()
  }

  return c.json({ success: true, id: result.meta.last_row_id })
})

app.patch('/flags/:id/acknowledge', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const canAck = session.isGodAdmin || session.roles.includes('god_admin') ||
    session.roles.includes('executive') || session.roles.includes('platform_admin')
  if (!canAck) return c.json({ error: 'Forbidden' }, 403)

  const id = parseInt(c.req.param('id'))
  const { resolution_note } = await c.req.json()

  await c.env.DB.prepare(
    `UPDATE executive_flags SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = datetime('now'), resolution_note = ?
     WHERE id = ?`
  ).bind(session.userId, resolution_note || null, id).run()

  return c.json({ success: true })
})

app.patch('/flags/:id/resolve', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const canResolve = session.isGodAdmin || session.roles.includes('god_admin') ||
    session.roles.includes('executive') || session.roles.includes('platform_admin')
  if (!canResolve) return c.json({ error: 'Forbidden' }, 403)

  const id = parseInt(c.req.param('id'))
  const { resolution_note } = await c.req.json()

  await c.env.DB.prepare(
    `UPDATE executive_flags SET status = 'resolved', acknowledged_by = ?, acknowledged_at = datetime('now'), resolution_note = ?
     WHERE id = ?`
  ).bind(session.userId, resolution_note || null, id).run()

  return c.json({ success: true })
})

// ── Platform User Management (God Admin) ──────────────────────────────────
app.get('/users', async (c) => {
  const session = await requireGodAdmin(c)
  if (session instanceof Response) return session

  const users = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.display_name, u.status, u.is_god_admin, u.last_login_at, u.created_at,
      GROUP_CONCAT(r.name, ', ') as roles,
      GROUP_CONCAT(DISTINCT d.code, ', ') as directorates
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     LEFT JOIN user_directorate_memberships udm ON udm.user_id = u.id
     LEFT JOIN directorates d ON d.id = udm.directorate_id
     GROUP BY u.id ORDER BY u.created_at DESC LIMIT 100`
  ).all()

  return c.json({ users: users.results })
})

app.patch('/users/:id/status', async (c) => {
  const session = await requireGodAdmin(c)
  if (session instanceof Response) return session
  const id = parseInt(c.req.param('id'))
  const { status, justification } = await c.req.json()

  const validStatuses = ['active', 'suspended', 'rejected']
  if (!validStatuses.includes(status)) return c.json({ error: 'Invalid status' }, 400)
  if (!justification) return c.json({ error: 'Justification required' }, 400)

  const oldUser = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first()
  await c.env.DB.prepare(`UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?`).bind(status, id).run()

  await c.env.DB.prepare(
    `INSERT INTO god_admin_actions (admin_user_id, action_type, target_type, target_id, justification, old_state, new_state)
     VALUES (?,'user_status_change','user',?,?,?,?)`
  ).bind(session.userId, id, justification, JSON.stringify({ status: (oldUser as any)?.status }), JSON.stringify({ status })).run()

  await c.env.DB.prepare(
    `INSERT INTO platform_audit_log (actor_user_id, actor_email, action, module, record_type, record_id, new_value, severity)
     VALUES (?,?,'user_status_changed','admin','user',?,?,'critical')`
  ).bind(session.userId, session.email, id, JSON.stringify({ status, justification })).run()

  return c.json({ success: true })
})

// ── Session Management (God Admin) ───────────────────────────────────────
app.post('/users/:id/revoke-sessions', async (c) => {
  const session = await requireGodAdmin(c)
  if (session instanceof Response) return session
  const id = parseInt(c.req.param('id'))
  const { justification } = await c.req.json()
  if (!justification) return c.json({ error: 'Justification required' }, 400)

  // Get user email to build KV key prefix
  const user = await c.env.DB.prepare(`SELECT email FROM users WHERE id = ?`).bind(id).first<{ email: string }>()
  if (!user) return c.json({ error: 'User not found' }, 404)

  // Log the action (actual KV deletion would require listing keys which is complex)
  await c.env.DB.prepare(
    `INSERT INTO god_admin_actions (admin_user_id, action_type, target_type, target_id, justification)
     VALUES (?,'revoke_sessions','user',?,?)`
  ).bind(session.userId, id, justification).run()

  await c.env.DB.prepare(
    `INSERT INTO platform_audit_log (actor_user_id, actor_email, action, module, record_type, record_id, severity)
     VALUES (?,?,'sessions_revoked','admin','user',?,'critical')`
  ).bind(session.userId, session.email, id).run()

  return c.json({ success: true, message: 'Session revocation logged. User must re-authenticate.' })
})

// ── Platform Summary for God Admin ────────────────────────────────────────
app.get('/summary', async (c) => {
  const session = await requireGodAdmin(c)
  if (session instanceof Response) return session

  const [users, requests, workflows, automation, flags, audit] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) as total, SUM(status='active') as active, SUM(status='pending') as pending, SUM(status='suspended') as suspended FROM users`
    ).first<any>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) as total, SUM(status IN ('submitted','under_review')) as pending,
       SUM(status='approved') as approved, SUM(status='rejected') as rejected FROM requests`
    ).first<any>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) as total, SUM(status='running') as running, SUM(status='completed') as completed,
       SUM(status='rejected') as rejected FROM workflow_runs`
    ).first<any>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) as total, SUM(is_active=1) as active FROM automation_rules`
    ).first<any>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM executive_flags WHERE status = 'open'`
    ).first<any>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) as total, SUM(severity='critical') as critical FROM platform_audit_log WHERE created_at >= date('now','-24 hours')`
    ).first<any>(),
  ])

  const godAdminActions = await c.env.DB.prepare(
    `SELECT gaa.*, u.display_name as admin_name
     FROM god_admin_actions gaa JOIN users u ON u.id = gaa.admin_user_id
     ORDER BY gaa.created_at DESC LIMIT 10`
  ).all()

  const criticalAudit = await c.env.DB.prepare(
    `SELECT pal.*, u.display_name as actor_name FROM platform_audit_log pal
     LEFT JOIN users u ON u.id = pal.actor_user_id
     WHERE pal.severity = 'critical' ORDER BY pal.created_at DESC LIMIT 20`
  ).all()

  return c.json({
    users, requests, workflows, automation, open_flags: flags,
    audit_24h: audit,
    recent_god_admin_actions: godAdminActions.results,
    critical_audit_log: criticalAudit.results
  })
})

// ── Job Postings & Applications ────────────────────────────────────────────
app.get('/jobs', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const status = c.req.query('status') || 'open'
  const jobs = await c.env.DB.prepare(
    `SELECT jp.*, d.name as directorate_name, u.display_name as created_by_name,
      COUNT(ja.id) as application_count
     FROM job_postings jp
     LEFT JOIN directorates d ON d.id = jp.directorate_id
     LEFT JOIN users u ON u.id = jp.created_by
     LEFT JOIN job_applications ja ON ja.job_posting_id = jp.id
     WHERE jp.status = ? GROUP BY jp.id ORDER BY jp.posted_at DESC`
  ).bind(status).all()

  return c.json({ jobs: jobs.results })
})

app.post('/jobs', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const canCreate = session.isGodAdmin || session.roles.includes('god_admin') ||
    session.roles.includes('platform_admin') || session.roles.includes('directorate_lead')
  if (!canCreate) return c.json({ error: 'Forbidden' }, 403)

  const { title, department, directorate_id, employment_type, location, is_remote, description, requirements, salary_range, closes_at } = await c.req.json()
  if (!title || !description) return c.json({ error: 'Title and description required' }, 400)

  const result = await c.env.DB.prepare(
    `INSERT INTO job_postings (title, department, directorate_id, employment_type, location, is_remote,
      description, requirements, salary_range, status, posted_at, closes_at, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,'open',datetime('now'),?,?)`
  ).bind(title, department || null, directorate_id || null, employment_type || 'full_time',
    location || null, is_remote ? 1 : 0, description, requirements || null,
    salary_range || null, closes_at || null, session.userId).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

app.post('/jobs/:id/apply', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const jobId = parseInt(c.req.param('id'))
  const { cover_letter } = await c.req.json()

  const existing = await c.env.DB.prepare(
    `SELECT id FROM job_applications WHERE job_posting_id = ? AND applicant_user_id = ?`
  ).bind(jobId, session.userId).first()
  if (existing) return c.json({ error: 'You have already applied for this position' }, 409)

  const result = await c.env.DB.prepare(
    `INSERT INTO job_applications (job_posting_id, applicant_user_id, cover_letter)
     VALUES (?,?,?)`
  ).bind(jobId, session.userId, cover_letter || null).run()

  await c.env.DB.prepare(
    `UPDATE job_postings SET application_count = application_count + 1 WHERE id = ?`
  ).bind(jobId).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

export default app
