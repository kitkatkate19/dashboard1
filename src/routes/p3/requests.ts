// src/routes/p3/requests.ts — Phase 3: Internal Request System
import { Hono } from 'hono'
import { requireAuth, requireGodAdmin } from '../../lib/auth'
import { Env } from '../../types'

const app = new Hono<{ Bindings: Env }>()

// ── Helper: Generate issued_id ─────────────────────────────────────────────
async function generateIssuedId(db: D1Database): Promise<string> {
  const year = new Date().getFullYear()
  const row = await db.prepare(
    `SELECT COUNT(*) as cnt FROM requests WHERE issued_id LIKE 'REQ-${year}-%'`
  ).first<{ cnt: number }>()
  const seq = String((row?.cnt ?? 0) + 1).padStart(4, '0')
  return `REQ-${year}-${seq}`
}

// ── List Request Types ─────────────────────────────────────────────────────
app.get('/types', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const types = await c.env.DB.prepare(
    `SELECT rt.*, d.name as directorate_name, d.code as directorate_code
     FROM request_types rt
     LEFT JOIN directorates d ON d.id = rt.directorate_id
     WHERE rt.is_active = 1 ORDER BY rt.name`
  ).all()
  return c.json({ types: types.results })
})

// ── Get Request Type with Fields ───────────────────────────────────────────
app.get('/types/:slug', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const slug = c.req.param('slug')
  const type = await c.env.DB.prepare(
    `SELECT * FROM request_types WHERE slug = ? AND is_active = 1`
  ).bind(slug).first()
  if (!type) return c.json({ error: 'Not found' }, 404)
  const fields = await c.env.DB.prepare(
    `SELECT * FROM request_fields WHERE request_type_id = ? ORDER BY sort_order`
  ).bind((type as any).id).all()
  return c.json({ type, fields: fields.results })
})

// ── Submit a Request ───────────────────────────────────────────────────────
app.post('/', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const body = await c.req.json()
  const { request_type_id, title, description, priority, directorate_id, responses } = body
  if (!request_type_id || !title) return c.json({ error: 'Missing required fields' }, 400)

  const issued_id = await generateIssuedId(c.env.DB)
  const result = await c.env.DB.prepare(
    `INSERT INTO requests (issued_id, request_type_id, requested_by_user_id, title, description,
       priority, directorate_id, status, submitted_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,'submitted',datetime('now'),datetime('now'),datetime('now'))`
  ).bind(issued_id, request_type_id, session.userId, title, description || null,
    priority || 'normal', directorate_id || null).run()

  const reqId = result.meta.last_row_id

  // Save field responses
  if (Array.isArray(responses) && responses.length > 0) {
    for (const resp of responses) {
      await c.env.DB.prepare(
        `INSERT INTO request_responses (request_id, request_field_id, field_key, value_text, value_json)
         VALUES (?,?,?,?,?)`
      ).bind(reqId, resp.field_id || null, resp.field_key, resp.value_text || null,
        resp.value_json ? JSON.stringify(resp.value_json) : null).run()
    }
  }

  // Create leave_requests extension if applicable
  const reqType = await c.env.DB.prepare(`SELECT slug FROM request_types WHERE id = ?`)
    .bind(request_type_id).first<{ slug: string }>()

  if (reqType?.slug === 'annual_leave' || reqType?.slug === 'sick_leave') {
    const leaveData = body.leave || {}
    await c.env.DB.prepare(
      `INSERT INTO leave_requests (request_id, leave_type, start_date, end_date, days_requested, handover_notes)
       VALUES (?,?,?,?,?,?)`
    ).bind(reqId, leaveData.leave_type || 'annual', leaveData.start_date, leaveData.end_date,
      leaveData.days_requested || null, leaveData.handover_notes || null).run()
  }

  if (reqType?.slug === 'expense_refund') {
    const refundData = body.refund || {}
    await c.env.DB.prepare(
      `INSERT INTO refund_requests (request_id, expense_category, expense_date, amount, currency, vendor_name, cost_centre)
       VALUES (?,?,?,?,?,?,?)`
    ).bind(reqId, refundData.expense_category || 'general', refundData.expense_date,
      refundData.amount, refundData.currency || 'GBP', refundData.vendor_name || null,
      refundData.cost_centre || null).run()
  }

  // Audit log
  await c.env.DB.prepare(
    `INSERT INTO platform_audit_log (actor_user_id, actor_email, action, module, record_type, record_id, severity)
     VALUES (?,?,'request_submitted','requests','request',?,'info')`
  ).bind(session.userId, session.email, reqId).run()

  // Create in-app notification for submitter
  await c.env.DB.prepare(
    `INSERT INTO notification_deliveries (recipient_user_id, channel, subject, body, record_type, record_id, status)
     VALUES (?,'in_app','Request Submitted','Your request has been submitted and is under review.','request',?,'sent')`
  ).bind(session.userId, reqId).run()

  return c.json({ success: true, id: reqId, issued_id })
})

// ── List My Requests ───────────────────────────────────────────────────────
app.get('/my', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const status = c.req.query('status')
  let sql = `SELECT r.*, rt.name as type_name, rt.icon as type_icon, rt.color as type_color,
    u.display_name as requester_name
    FROM requests r
    JOIN request_types rt ON rt.id = r.request_type_id
    JOIN users u ON u.id = r.requested_by_user_id
    WHERE r.requested_by_user_id = ?`
  const params: any[] = [session.userId]
  if (status) { sql += ` AND r.status = ?`; params.push(status) }
  sql += ` ORDER BY r.submitted_at DESC LIMIT 50`
  const reqs = await c.env.DB.prepare(sql).bind(...params).all()
  return c.json({ requests: reqs.results })
})

// ── List All Requests (admin/lead) ─────────────────────────────────────────
app.get('/', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const status = c.req.query('status')
  const type = c.req.query('type')
  const dir = c.req.query('directorate_id')
  const page = parseInt(c.req.query('page') || '1')
  const limit = 25
  const offset = (page - 1) * limit

  const isAdmin = session.isGodAdmin || session.roles.includes('god_admin') ||
    session.roles.includes('platform_admin') || session.roles.includes('executive')

  let sql = `SELECT r.*, rt.name as type_name, rt.icon as type_icon, rt.color as type_color,
    u.display_name as requester_name, d.name as directorate_name
    FROM requests r
    JOIN request_types rt ON rt.id = r.request_type_id
    JOIN users u ON u.id = r.requested_by_user_id
    LEFT JOIN directorates d ON d.id = r.directorate_id
    WHERE 1=1`
  const params: any[] = []

  if (!isAdmin) {
    // Non-admins see only their directorate requests
    if (session.directorateIds.length > 0) {
      sql += ` AND r.directorate_id IN (${session.directorateIds.map(() => '?').join(',')})`
      params.push(...session.directorateIds)
    } else {
      sql += ` AND r.requested_by_user_id = ?`
      params.push(session.userId)
    }
  }

  if (status) { sql += ` AND r.status = ?`; params.push(status) }
  if (type) { sql += ` AND rt.slug = ?`; params.push(type) }
  if (dir) { sql += ` AND r.directorate_id = ?`; params.push(dir) }
  sql += ` ORDER BY r.submitted_at DESC LIMIT ? OFFSET ?`
  params.push(limit, offset)
  const reqs = await c.env.DB.prepare(sql).bind(...params).all()
  return c.json({ requests: reqs.results, page, limit })
})

// ── Get Single Request with full detail ───────────────────────────────────
app.get('/:id', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const id = parseInt(c.req.param('id'))
  const req = await c.env.DB.prepare(
    `SELECT r.*, rt.name as type_name, rt.icon as type_icon, rt.color as type_color, rt.slug as type_slug,
      u.display_name as requester_name, u.email as requester_email,
      d.name as directorate_name, d.code as directorate_code
     FROM requests r
     JOIN request_types rt ON rt.id = r.request_type_id
     JOIN users u ON u.id = r.requested_by_user_id
     LEFT JOIN directorates d ON d.id = r.directorate_id
     WHERE r.id = ?`
  ).bind(id).first()
  if (!req) return c.json({ error: 'Not found' }, 404)

  // Check access: own request, admin, or same directorate
  const r = req as any
  const canAccess = session.isGodAdmin || session.roles.includes('god_admin') ||
    session.roles.includes('platform_admin') || session.roles.includes('executive') ||
    r.requested_by_user_id === session.userId ||
    session.directorateIds.includes(r.directorate_id)
  if (!canAccess) return c.json({ error: 'Access denied' }, 403)

  // Get responses
  const responses = await c.env.DB.prepare(
    `SELECT rr.*, rf.label, rf.field_type FROM request_responses rr
     JOIN request_fields rf ON rf.id = rr.request_field_id
     WHERE rr.request_id = ?`
  ).bind(id).all()

  // Get workflow run
  const workflowRun = await c.env.DB.prepare(
    `SELECT wr.*, wt.name as template_name FROM workflow_runs wr
     JOIN workflow_templates wt ON wt.id = wr.workflow_template_id
     WHERE wr.record_type = 'request' AND wr.record_id = ?
     ORDER BY wr.started_at DESC LIMIT 1`
  ).bind(id).first()

  // Get leave or refund extension
  let extension = null
  if (r.type_slug === 'annual_leave' || r.type_slug === 'sick_leave') {
    extension = await c.env.DB.prepare(`SELECT * FROM leave_requests WHERE request_id = ?`).bind(id).first()
  } else if (r.type_slug === 'expense_refund') {
    extension = await c.env.DB.prepare(`SELECT * FROM refund_requests WHERE request_id = ?`).bind(id).first()
  }

  // Get notifications for this request
  const notifications = await c.env.DB.prepare(
    `SELECT nd.*, u.display_name as recipient_name FROM notification_deliveries nd
     LEFT JOIN users u ON u.id = nd.recipient_user_id
     WHERE nd.record_type = 'request' AND nd.record_id = ?
     ORDER BY nd.created_at DESC LIMIT 10`
  ).bind(id).all()

  return c.json({ request: req, responses: responses.results, workflowRun, extension, notifications: notifications.results })
})

// ── Update Request Status (admin/approver action) ──────────────────────────
app.patch('/:id/status', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const id = parseInt(c.req.param('id'))
  const { status, note } = await c.req.json()

  const allowed = ['under_review', 'approved', 'rejected', 'withdrawn', 'closed']
  if (!allowed.includes(status)) return c.json({ error: 'Invalid status' }, 400)

  const isAdmin = session.isGodAdmin || session.roles.includes('god_admin') ||
    session.roles.includes('platform_admin') || session.roles.includes('directorate_lead')

  if (!isAdmin) {
    // User can only withdraw their own request
    if (status !== 'withdrawn') return c.json({ error: 'Forbidden' }, 403)
    const own = await c.env.DB.prepare(`SELECT id FROM requests WHERE id = ? AND requested_by_user_id = ?`)
      .bind(id, session.userId).first()
    if (!own) return c.json({ error: 'Not found' }, 404)
  }

  await c.env.DB.prepare(
    `UPDATE requests SET status = ?, closed_at = CASE WHEN ? IN ('approved','rejected','closed','withdrawn') THEN datetime('now') ELSE closed_at END,
     closed_by_user_id = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(status, status, session.userId, id).run()

  // Notify requester
  const reqRow = await c.env.DB.prepare(`SELECT requested_by_user_id, title FROM requests WHERE id = ?`).bind(id).first<any>()
  if (reqRow) {
    const templateSlug = status === 'approved' ? 'request_approved' : status === 'rejected' ? 'request_rejected' : 'request_submitted'
    await c.env.DB.prepare(
      `INSERT INTO notification_deliveries (recipient_user_id, channel, subject, body, record_type, record_id, status)
       VALUES (?,'in_app',?,?,'request',?,'sent')`
    ).bind(reqRow.requested_by_user_id,
      `Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      `Your request "${reqRow.title}" has been ${status}. ${note || ''}`,
      id).run()
  }

  await c.env.DB.prepare(
    `INSERT INTO platform_audit_log (actor_user_id, actor_email, action, module, record_type, record_id, new_value, severity)
     VALUES (?,?,?,?,'request',?,?,'info')`
  ).bind(session.userId, session.email, `request_status_${status}`, 'requests', id, JSON.stringify({ status, note })).run()

  return c.json({ success: true })
})

// ── Get pending approvals (items needing action by current user) ───────────
app.get('/pending/mine', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  // Find workflow run steps assigned to this user that are active
  const steps = await c.env.DB.prepare(
    `SELECT wrs.*, wr.record_type, wr.record_id, wts.name as step_name,
       r.title as request_title, r.issued_id, r.status as request_status,
       rt.name as type_name, rt.icon as type_icon, rt.color as type_color,
       u.display_name as requester_name
     FROM workflow_run_steps wrs
     JOIN workflow_runs wr ON wr.id = wrs.workflow_run_id
     JOIN workflow_template_steps wts ON wts.id = wrs.template_step_id
     LEFT JOIN requests r ON r.id = wr.record_id AND wr.record_type = 'request'
     LEFT JOIN request_types rt ON rt.id = r.request_type_id
     LEFT JOIN users u ON u.id = r.requested_by_user_id
     WHERE wrs.assigned_to_user_id = ? AND wrs.status = 'active'
     ORDER BY wrs.activated_at DESC`
  ).bind(session.userId).all()

  return c.json({ pending_steps: steps.results })
})

// ── Analytics: Request Summary ─────────────────────────────────────────────
app.get('/analytics/summary', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const isAdmin = session.isGodAdmin || session.roles.includes('god_admin') ||
    session.roles.includes('platform_admin') || session.roles.includes('executive')
  if (!isAdmin) return c.json({ error: 'Forbidden' }, 403)

  const total = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM requests`).first<{ cnt: number }>()
  const byStatus = await c.env.DB.prepare(
    `SELECT status, COUNT(*) as cnt FROM requests GROUP BY status`
  ).all()
  const byType = await c.env.DB.prepare(
    `SELECT rt.name, rt.icon, rt.color, COUNT(r.id) as cnt
     FROM requests r JOIN request_types rt ON rt.id = r.request_type_id
     GROUP BY rt.id ORDER BY cnt DESC`
  ).all()
  const byDirectorate = await c.env.DB.prepare(
    `SELECT d.name, d.code, d.color, COUNT(r.id) as cnt
     FROM requests r LEFT JOIN directorates d ON d.id = r.directorate_id
     GROUP BY d.id ORDER BY cnt DESC`
  ).all()
  const recent = await c.env.DB.prepare(
    `SELECT r.issued_id, r.title, r.status, r.submitted_at, rt.name as type_name, u.display_name as requester
     FROM requests r JOIN request_types rt ON rt.id = r.request_type_id JOIN users u ON u.id = r.requested_by_user_id
     ORDER BY r.submitted_at DESC LIMIT 10`
  ).all()

  return c.json({
    total: total?.cnt ?? 0,
    by_status: byStatus.results,
    by_type: byType.results,
    by_directorate: byDirectorate.results,
    recent: recent.results
  })
})

export default app
