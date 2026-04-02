// src/routes/p2/approvals.ts — Approval Flows, Instances, Actions

import { Hono } from 'hono'
import { Env } from '../../types'
import { requireAuth, getSession } from '../../lib/auth'
import { logAudit } from '../../lib/db'
import { canAccessWorkspace, canManageWorkspace } from './workspaces'

const approvals = new Hono<{ Bindings: Env }>()

// ── GET /api/p2/approvals/flows/:workspaceId ───────────────
approvals.get('/flows/:workspaceId', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const wsId = parseInt(c.req.param('workspaceId'))
  if (!await canAccessWorkspace(c.env.DB, wsId, session)) return c.json({ error: 'Forbidden' }, 403)

  const flows = await c.env.DB.prepare(`SELECT * FROM approval_flows WHERE workspace_id = ? ORDER BY name ASC`).bind(wsId).all<any>()

  const withSteps = await Promise.all(flows.results.map(async (f) => {
    const steps = await c.env.DB.prepare(`SELECT * FROM approval_steps WHERE approval_flow_id = ? ORDER BY step_order ASC`).bind(f.id).all()
    return { ...f, steps: steps.results }
  }))

  return c.json({ flows: withSteps })
})

// ── POST /api/p2/approvals/flows ──────────────────────────
approvals.post('/flows', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const { workspace_id, name, trigger_type, trigger_value, steps } = await c.req.json<any>()
  if (!workspace_id || !name) return c.json({ error: 'workspace_id and name required' }, 400)
  if (!await canManageWorkspace(c.env.DB, workspace_id, session)) return c.json({ error: 'Forbidden' }, 403)

  const result = await c.env.DB.prepare(`
    INSERT INTO approval_flows (workspace_id, name, trigger_type, trigger_value) VALUES (?, ?, ?, ?)
  `).bind(workspace_id, name, trigger_type ?? 'manual', trigger_value ?? null).run()

  const flowId = result.meta.last_row_id as number

  // Create steps
  if (Array.isArray(steps)) {
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]
      await c.env.DB.prepare(`
        INSERT INTO approval_steps (approval_flow_id, step_order, name, approver_type, approver_value, is_required, timeout_hours)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(flowId, i + 1, s.name, s.approver_type ?? 'role', s.approver_value ?? null, s.is_required ? 1 : 1, s.timeout_hours ?? 72).run()
    }
  }

  await logAudit(c.env.DB, session.userId, 'approval_flow.created', 'approval_flow', flowId, { name })
  return c.json({ success: true, id: flowId })
})

// ── GET /api/p2/approvals/instances/:workspaceId ──────────
approvals.get('/instances/:workspaceId', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const wsId = parseInt(c.req.param('workspaceId'))
  if (!await canAccessWorkspace(c.env.DB, wsId, session)) return c.json({ error: 'Forbidden' }, 403)

  const status = c.req.query('status') ?? 'pending'
  let query = `
    SELECT ai.*, af.name AS flow_name,
           wi.issued_id, wi.title AS item_title,
           u.display_name AS requested_by_name
    FROM approval_instances ai
    JOIN approval_flows af ON af.id = ai.approval_flow_id
    LEFT JOIN work_items wi ON wi.id = ai.work_item_id
    LEFT JOIN users u ON u.id = ai.requested_by
    WHERE af.workspace_id = ?
  `
  const params: any[] = [wsId]
  if (status !== 'all') { query += ` AND ai.status = ?`; params.push(status) }
  query += ` ORDER BY ai.created_at DESC`

  const rows = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ instances: rows.results })
})

// ── GET /api/p2/approvals/my-pending ──────────────────────
// All approvals pending for the current user's role
approvals.get('/my-pending', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const rows = await c.env.DB.prepare(`
    SELECT ai.*, af.name AS flow_name, w.name AS workspace_name, w.code AS workspace_code,
           wi.issued_id, wi.title AS item_title,
           u.display_name AS requested_by_name,
           aps.name AS current_step_name, aps.approver_type, aps.approver_value
    FROM approval_instances ai
    JOIN approval_flows af ON af.id = ai.approval_flow_id
    JOIN workspaces w ON w.id = af.workspace_id
    LEFT JOIN work_items wi ON wi.id = ai.work_item_id
    LEFT JOIN users u ON u.id = ai.requested_by
    LEFT JOIN approval_steps aps ON aps.approval_flow_id = ai.approval_flow_id AND aps.step_order = ai.current_step_order
    WHERE ai.status = 'pending'
    ORDER BY ai.created_at ASC
  `).all<any>()

  // Filter to items this user can approve based on their role
  const userRoles = session.roles
  const myPending = rows.results.filter(row => {
    if (session.isGodAdmin) return true
    if (row.approver_type === 'god_admin' && session.isGodAdmin) return true
    if (row.approver_type === 'role' && userRoles.includes(row.approver_value)) return true
    if (row.approver_type === 'user' && String(row.approver_value) === String(session.userId)) return true
    if (row.approver_type === 'directorate_lead' && userRoles.includes('directorate_lead')) return true
    return false
  })

  return c.json({ pending: myPending, count: myPending.length })
})

// ── POST /api/p2/approvals/request ────────────────────────
approvals.post('/request', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const { work_item_id, approval_flow_id, rationale } = await c.req.json<any>()
  if (!work_item_id || !approval_flow_id) return c.json({ error: 'work_item_id and approval_flow_id required' }, 400)

  const item = await c.env.DB.prepare(`SELECT workspace_id FROM work_items WHERE id = ?`).bind(work_item_id).first<any>()
  if (!item || !await canAccessWorkspace(c.env.DB, item.workspace_id, session)) return c.json({ error: 'Forbidden' }, 403)

  // Check no existing pending instance
  const existing = await c.env.DB.prepare(`
    SELECT id FROM approval_instances WHERE work_item_id = ? AND approval_flow_id = ? AND status = 'pending'
  `).bind(work_item_id, approval_flow_id).first()
  if (existing) return c.json({ error: 'Approval already pending' }, 409)

  const result = await c.env.DB.prepare(`
    INSERT INTO approval_instances (approval_flow_id, work_item_id, record_type, record_id, requested_by, rationale)
    VALUES (?, ?, 'work_item', ?, ?, ?)
  `).bind(approval_flow_id, work_item_id, work_item_id, session.userId, rationale ?? null).run()

  const instanceId = result.meta.last_row_id as number

  // Log activity
  await c.env.DB.prepare(`
    INSERT INTO work_item_activity (work_item_id, actor_user_id, event_type, note)
    VALUES (?, ?, 'approval_requested', ?)
  `).bind(work_item_id, session.userId, rationale ?? 'Approval requested').run()

  // Create notification for approvers
  await c.env.DB.prepare(`
    INSERT INTO notification_jobs (recipient_id, type, title, body, payload)
    SELECT u.id, 'approval_request',
           'Approval Required',
           'A new item requires your approval.',
           json_object('instance_id', ?, 'work_item_id', ?)
    FROM users u WHERE u.is_god_admin = 1
  `).bind(instanceId, work_item_id).run()

  await logAudit(c.env.DB, session.userId, 'approval.requested', 'work_item', work_item_id, { instanceId })
  return c.json({ success: true, instance_id: instanceId })
})

// ── POST /api/p2/approvals/decide ─────────────────────────
approvals.post('/decide', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const { instance_id, action, rationale } = await c.req.json<any>()
  if (!instance_id || !['approved', 'rejected', 'delegated'].includes(action)) {
    return c.json({ error: 'instance_id and valid action required' }, 400)
  }

  const instance = await c.env.DB.prepare(`
    SELECT ai.*, af.workspace_id FROM approval_instances ai
    JOIN approval_flows af ON af.id = ai.approval_flow_id
    WHERE ai.id = ?
  `).bind(instance_id).first<any>()
  if (!instance) return c.json({ error: 'Instance not found' }, 404)
  if (instance.status !== 'pending') return c.json({ error: 'Instance is not pending' }, 409)

  // Verify approver rights
  const step = await c.env.DB.prepare(`
    SELECT * FROM approval_steps WHERE approval_flow_id = ? AND step_order = ?
  `).bind(instance.approval_flow_id, instance.current_step_order).first<any>()

  const canApprove = session.isGodAdmin
    || (step?.approver_type === 'role' && session.roles.includes(step?.approver_value))
    || (step?.approver_type === 'user' && String(step?.approver_value) === String(session.userId))
    || (step?.approver_type === 'directorate_lead' && session.roles.includes('directorate_lead'))
    || (step?.approver_type === 'god_admin' && session.isGodAdmin)

  if (!canApprove) return c.json({ error: 'You are not the designated approver for this step' }, 403)

  // Record the action
  await c.env.DB.prepare(`
    INSERT INTO approval_instance_actions (approval_instance_id, step_order, actor_user_id, action, rationale)
    VALUES (?, ?, ?, ?, ?)
  `).bind(instance_id, instance.current_step_order, session.userId, action, rationale ?? null).run()

  if (action === 'approved') {
    // Check if more steps remain
    const nextStep = await c.env.DB.prepare(`
      SELECT * FROM approval_steps WHERE approval_flow_id = ? AND step_order = ?
    `).bind(instance.approval_flow_id, instance.current_step_order + 1).first()

    if (nextStep) {
      // Advance to next step
      await c.env.DB.prepare(`UPDATE approval_instances SET current_step_order = ?, updated_at = datetime('now') WHERE id = ?`).bind(instance.current_step_order + 1, instance_id).run()
    } else {
      // All steps approved — close the instance
      await c.env.DB.prepare(`UPDATE approval_instances SET status = 'approved', closed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).bind(instance_id).run()
      // Log activity on the work item
      if (instance.work_item_id) {
        await c.env.DB.prepare(`INSERT INTO work_item_activity (work_item_id, actor_user_id, event_type, note) VALUES (?, ?, 'approved', ?)`).bind(instance.work_item_id, session.userId, rationale ?? 'Approved').run()
      }
    }
  } else if (action === 'rejected') {
    await c.env.DB.prepare(`UPDATE approval_instances SET status = 'rejected', closed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).bind(instance_id).run()
    if (instance.work_item_id) {
      await c.env.DB.prepare(`INSERT INTO work_item_activity (work_item_id, actor_user_id, event_type, note) VALUES (?, ?, 'rejected', ?)`).bind(instance.work_item_id, session.userId, rationale ?? 'Rejected').run()
    }
  }

  await logAudit(c.env.DB, session.userId, `approval.${action}`, 'approval_instance', instance_id, { rationale })
  return c.json({ success: true })
})

// ── GET /api/p2/approvals/history/:itemId ─────────────────
approvals.get('/history/:itemId', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const itemId = parseInt(c.req.param('itemId'))

  const item = await c.env.DB.prepare(`SELECT workspace_id FROM work_items WHERE id = ?`).bind(itemId).first<any>()
  if (!item || !await canAccessWorkspace(c.env.DB, item.workspace_id, session)) return c.json({ error: 'Forbidden' }, 403)

  const instances = await c.env.DB.prepare(`
    SELECT ai.*, af.name AS flow_name, u.display_name AS requested_by_name
    FROM approval_instances ai
    JOIN approval_flows af ON af.id = ai.approval_flow_id
    LEFT JOIN users u ON u.id = ai.requested_by
    WHERE ai.work_item_id = ? ORDER BY ai.created_at DESC
  `).bind(itemId).all<any>()

  const withActions = await Promise.all(instances.results.map(async (inst) => {
    const actions = await c.env.DB.prepare(`
      SELECT aia.*, u.display_name AS actor_name FROM approval_instance_actions aia
      LEFT JOIN users u ON u.id = aia.actor_user_id
      WHERE aia.approval_instance_id = ? ORDER BY aia.acted_at ASC
    `).bind(inst.id).all()
    return { ...inst, actions: actions.results }
  }))

  return c.json({ approvals: withActions })
})

export default approvals
