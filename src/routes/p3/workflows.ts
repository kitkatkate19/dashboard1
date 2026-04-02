// src/routes/p3/workflows.ts — Phase 3: Workflow Engine
import { Hono } from 'hono'
import { requireAuth } from '../../lib/auth'
import { Env } from '../../types'

const app = new Hono<{ Bindings: Env }>()

// ── List Workflow Templates ────────────────────────────────────────────────
app.get('/templates', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const templates = await c.env.DB.prepare(
    `SELECT wt.*, COUNT(ws.id) as step_count,
      (SELECT COUNT(*) FROM workflow_runs wr WHERE wr.workflow_template_id = wt.id) as run_count
     FROM workflow_templates wt
     LEFT JOIN workflow_template_steps ws ON ws.workflow_template_id = wt.id
     WHERE wt.is_active = 1 GROUP BY wt.id ORDER BY wt.name`
  ).all()
  return c.json({ templates: templates.results })
})

// ── Get Template with Steps ────────────────────────────────────────────────
app.get('/templates/:id', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const id = parseInt(c.req.param('id'))
  const template = await c.env.DB.prepare(`SELECT * FROM workflow_templates WHERE id = ?`).bind(id).first()
  if (!template) return c.json({ error: 'Not found' }, 404)
  const steps = await c.env.DB.prepare(
    `SELECT * FROM workflow_template_steps WHERE workflow_template_id = ? ORDER BY step_order`
  ).bind(id).all()
  return c.json({ template, steps: steps.results })
})

// ── Create Workflow Template (admin) ──────────────────────────────────────
app.post('/templates', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  if (!session.isGodAdmin && !session.roles.includes('god_admin') &&
    !session.roles.includes('platform_admin') && !session.roles.includes('workflow_admin')) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  const body = await c.req.json()
  const { name, slug, description, record_type, sla_hours, escalation_after_hours, steps } = body
  if (!name || !slug) return c.json({ error: 'Name and slug required' }, 400)

  const result = await c.env.DB.prepare(
    `INSERT INTO workflow_templates (name, slug, description, record_type, sla_hours, escalation_after_hours, created_by)
     VALUES (?,?,?,?,?,?,?)`
  ).bind(name, slug, description || null, record_type || 'request',
    sla_hours || 72, escalation_after_hours || 48, session.userId).run()

  const templateId = result.meta.last_row_id
  if (Array.isArray(steps)) {
    for (const step of steps) {
      await c.env.DB.prepare(
        `INSERT INTO workflow_template_steps (workflow_template_id, step_order, name, step_type, approver_type, approver_value, timeout_hours, on_timeout_action, instructions)
         VALUES (?,?,?,?,?,?,?,?,?)`
      ).bind(templateId, step.step_order, step.name, step.step_type || 'approval',
        step.approver_type || 'role', step.approver_value || null,
        step.timeout_hours || 72, step.on_timeout_action || 'escalate',
        step.instructions || null).run()
    }
  }
  return c.json({ success: true, id: templateId })
})

// ── Start a Workflow Run ───────────────────────────────────────────────────
app.post('/runs', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const { workflow_template_id, record_type, record_id } = await c.req.json()
  if (!workflow_template_id || !record_type || !record_id) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  // Load template steps
  const steps = await c.env.DB.prepare(
    `SELECT * FROM workflow_template_steps WHERE workflow_template_id = ? ORDER BY step_order`
  ).bind(workflow_template_id).all()
  if (!steps.results.length) return c.json({ error: 'Template has no steps' }, 400)

  // Create workflow run
  const runResult = await c.env.DB.prepare(
    `INSERT INTO workflow_runs (workflow_template_id, record_type, record_id, status, current_step_order, started_by_user_id)
     VALUES (?,?,?,'running',1,?)`
  ).bind(workflow_template_id, record_type, record_id, session.userId).run()
  const runId = runResult.meta.last_row_id

  // Determine first step approver
  const firstStep = steps.results[0] as any
  let assignedUserId: number | null = null

  if (firstStep.approver_type === 'manager') {
    // Look up manager from people_profiles
    const profile = await c.env.DB.prepare(
      `SELECT pp.manager_user_id FROM requests r
       JOIN people_profiles pp ON pp.user_id = r.requested_by_user_id
       WHERE r.id = ?`
    ).bind(record_id).first<{ manager_user_id: number }>()
    assignedUserId = profile?.manager_user_id ?? null
  } else if (firstStep.approver_type === 'role') {
    // Find first user with that role
    const roleUser = await c.env.DB.prepare(
      `SELECT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE r.name = ? AND u.status = 'active' LIMIT 1`
    ).bind(firstStep.approver_value).first<{ id: number }>()
    assignedUserId = roleUser?.id ?? null
  }

  const deadline = new Date(Date.now() + (firstStep.timeout_hours || 72) * 3600000).toISOString()

  // Create run steps
  for (const step of steps.results as any[]) {
    const isFirst = step.step_order === 1
    await c.env.DB.prepare(
      `INSERT INTO workflow_run_steps (workflow_run_id, template_step_id, step_order, status, assigned_to_user_id, activated_at, deadline_at)
       VALUES (?,?,?,?,?,?,?)`
    ).bind(runId, step.id, step.step_order,
      isFirst ? 'active' : 'pending',
      isFirst ? assignedUserId : null,
      isFirst ? new Date().toISOString() : null,
      isFirst ? deadline : null).run()
  }

  // Record workflow event
  await c.env.DB.prepare(
    `INSERT INTO workflow_events (workflow_run_id, step_order, event_type, actor_user_id, description)
     VALUES (?,1,'started',?,'Workflow started')`
  ).bind(runId, session.userId).run()

  // Update request with current workflow run id
  if (record_type === 'request') {
    await c.env.DB.prepare(`UPDATE requests SET current_workflow_run_id = ?, status = 'under_review' WHERE id = ?`)
      .bind(runId, record_id).run()
  }

  // Notify assigned approver
  if (assignedUserId) {
    await c.env.DB.prepare(
      `INSERT INTO notification_deliveries (recipient_user_id, channel, subject, body, record_type, record_id, status)
       VALUES (?,'in_app','Action Required: Approval Needed','You have a new approval request waiting for your action.','workflow_run',?,'sent')`
    ).bind(assignedUserId, runId).run()
  }

  return c.json({ success: true, run_id: runId })
})

// ── List Workflow Runs ─────────────────────────────────────────────────────
app.get('/runs', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const status = c.req.query('status')
  let sql = `SELECT wr.*, wt.name as template_name, wt.slug as template_slug,
    r.title as request_title, r.issued_id
    FROM workflow_runs wr
    JOIN workflow_templates wt ON wt.id = wr.workflow_template_id
    LEFT JOIN requests r ON r.id = wr.record_id AND wr.record_type = 'request'
    WHERE 1=1`
  const params: any[] = []
  if (status) { sql += ` AND wr.status = ?`; params.push(status) }
  sql += ` ORDER BY wr.started_at DESC LIMIT 50`
  const runs = await c.env.DB.prepare(sql).bind(...params).all()
  return c.json({ runs: runs.results })
})

// ── Get Workflow Run Detail ────────────────────────────────────────────────
app.get('/runs/:id', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const id = parseInt(c.req.param('id'))
  const run = await c.env.DB.prepare(
    `SELECT wr.*, wt.name as template_name, r.title as request_title, r.issued_id
     FROM workflow_runs wr JOIN workflow_templates wt ON wt.id = wr.workflow_template_id
     LEFT JOIN requests r ON r.id = wr.record_id AND wr.record_type = 'request'
     WHERE wr.id = ?`
  ).bind(id).first()
  if (!run) return c.json({ error: 'Not found' }, 404)

  const steps = await c.env.DB.prepare(
    `SELECT wrs.*, wts.name as step_name, wts.approver_type, wts.approver_value, wts.step_type,
      u.display_name as assigned_user_name, u.email as assigned_user_email,
      actor.display_name as acted_user_name
     FROM workflow_run_steps wrs
     JOIN workflow_template_steps wts ON wts.id = wrs.template_step_id
     LEFT JOIN users u ON u.id = wrs.assigned_to_user_id
     LEFT JOIN users actor ON actor.id = wrs.acted_by_user_id
     WHERE wrs.workflow_run_id = ? ORDER BY wrs.step_order`
  ).bind(id).all()

  const events = await c.env.DB.prepare(
    `SELECT we.*, u.display_name as actor_name FROM workflow_events we
     LEFT JOIN users u ON u.id = we.actor_user_id
     WHERE we.workflow_run_id = ? ORDER BY we.occurred_at DESC LIMIT 20`
  ).bind(id).all()

  return c.json({ run, steps: steps.results, events: events.results })
})

// ── Act on a Workflow Step (approve/reject/delegate) ──────────────────────
app.post('/runs/:id/act', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const runId = parseInt(c.req.param('id'))
  const { action, rationale, delegate_to_user_id } = await c.req.json()

  if (!['approved', 'rejected', 'delegated', 'escalated'].includes(action)) {
    return c.json({ error: 'Invalid action' }, 400)
  }

  // Get current active step assigned to this user
  const step = await c.env.DB.prepare(
    `SELECT wrs.*, wts.step_order, wts.on_timeout_action FROM workflow_run_steps wrs
     JOIN workflow_template_steps wts ON wts.id = wrs.template_step_id
     WHERE wrs.workflow_run_id = ? AND wrs.assigned_to_user_id = ? AND wrs.status = 'active'`
  ).bind(runId, session.userId).first<any>()

  // Allow god admin to act on any step
  const adminStep = (!step && (session.isGodAdmin || session.roles.includes('god_admin')))
    ? await c.env.DB.prepare(
        `SELECT * FROM workflow_run_steps WHERE workflow_run_id = ? AND status = 'active' LIMIT 1`
      ).bind(runId).first<any>()
    : null

  const activeStep = step || adminStep
  if (!activeStep) return c.json({ error: 'No active step found for you' }, 404)

  if (action === 'delegated' && delegate_to_user_id) {
    await c.env.DB.prepare(
      `UPDATE workflow_run_steps SET assigned_to_user_id = ? WHERE id = ?`
    ).bind(delegate_to_user_id, activeStep.id).run()
    await c.env.DB.prepare(
      `INSERT INTO workflow_events (workflow_run_id, step_order, event_type, actor_user_id, description)
       VALUES (?,?,'step_delegated',?,?)`
    ).bind(runId, activeStep.step_order, session.userId, `Delegated to user ${delegate_to_user_id}`).run()
    // Notify new assignee
    await c.env.DB.prepare(
      `INSERT INTO notification_deliveries (recipient_user_id, channel, subject, body, record_type, record_id, status)
       VALUES (?,'in_app','Workflow Delegated to You','A workflow approval has been delegated to you.','workflow_run',?,'sent')`
    ).bind(delegate_to_user_id, runId).run()
    return c.json({ success: true })
  }

  // Mark this step as acted
  await c.env.DB.prepare(
    `UPDATE workflow_run_steps SET status = ?, acted_by_user_id = ?, action = ?, rationale = ?, acted_at = datetime('now')
     WHERE id = ?`
  ).bind(action, session.userId, action, rationale || null, activeStep.id).run()

  await c.env.DB.prepare(
    `INSERT INTO workflow_events (workflow_run_id, step_order, event_type, actor_user_id, description)
     VALUES (?,?,?,?,?)`
  ).bind(runId, activeStep.step_order, action, session.userId, rationale || `Step ${action}`).run()

  if (action === 'rejected') {
    // Reject entire workflow run
    await c.env.DB.prepare(
      `UPDATE workflow_runs SET status = 'rejected', completed_at = datetime('now'), completed_by_user_id = ? WHERE id = ?`
    ).bind(session.userId, runId).run()
    // Update request status
    const run = await c.env.DB.prepare(`SELECT * FROM workflow_runs WHERE id = ?`).bind(runId).first<any>()
    if (run?.record_type === 'request') {
      await c.env.DB.prepare(`UPDATE requests SET status = 'rejected', updated_at = datetime('now') WHERE id = ?`)
        .bind(run.record_id).run()
      const req = await c.env.DB.prepare(`SELECT requested_by_user_id, title FROM requests WHERE id = ?`)
        .bind(run.record_id).first<any>()
      if (req) {
        await c.env.DB.prepare(
          `INSERT INTO notification_deliveries (recipient_user_id, channel, subject, body, record_type, record_id, status)
           VALUES (?,'in_app','Request Not Approved',?,'request',?,'sent')`
        ).bind(req.requested_by_user_id, `Your request "${req.title}" was not approved. Reason: ${rationale || 'No reason given'}`, run.record_id).run()
      }
    }
  } else if (action === 'approved') {
    // Check if there's a next step
    const nextStep = await c.env.DB.prepare(
      `SELECT wrs.*, wts.approver_type, wts.approver_value, wts.timeout_hours FROM workflow_run_steps wrs
       JOIN workflow_template_steps wts ON wts.id = wrs.template_step_id
       WHERE wrs.workflow_run_id = ? AND wrs.step_order = ?`
    ).bind(runId, activeStep.step_order + 1).first<any>()

    if (nextStep) {
      // Activate next step
      let nextUserId: number | null = null
      const run = await c.env.DB.prepare(`SELECT * FROM workflow_runs WHERE id = ?`).bind(runId).first<any>()
      if (nextStep.approver_type === 'manager' && run?.record_type === 'request') {
        const profile = await c.env.DB.prepare(
          `SELECT pp.manager_user_id FROM requests r
           JOIN people_profiles pp ON pp.user_id = r.requested_by_user_id WHERE r.id = ?`
        ).bind(run.record_id).first<{ manager_user_id: number }>()
        nextUserId = profile?.manager_user_id ?? null
      } else if (nextStep.approver_type === 'role') {
        const roleUser = await c.env.DB.prepare(
          `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
           WHERE r.name = ? AND u.status = 'active' LIMIT 1`
        ).bind(nextStep.approver_value).first<{ id: number }>()
        nextUserId = roleUser?.id ?? null
      }

      const deadline = new Date(Date.now() + (nextStep.timeout_hours || 72) * 3600000).toISOString()
      await c.env.DB.prepare(
        `UPDATE workflow_run_steps SET status = 'active', assigned_to_user_id = ?, activated_at = datetime('now'), deadline_at = ?
         WHERE id = ?`
      ).bind(nextUserId, deadline, nextStep.id).run()
      await c.env.DB.prepare(
        `UPDATE workflow_runs SET current_step_order = ? WHERE id = ?`
      ).bind(activeStep.step_order + 1, runId).run()
      await c.env.DB.prepare(
        `INSERT INTO workflow_events (workflow_run_id, step_order, event_type, actor_user_id, description)
         VALUES (?,?,'step_activated',?,?)`
      ).bind(runId, activeStep.step_order + 1, session.userId, `Step ${activeStep.step_order + 1} activated`).run()

      if (nextUserId) {
        await c.env.DB.prepare(
          `INSERT INTO notification_deliveries (recipient_user_id, channel, subject, body, record_type, record_id, status)
           VALUES (?,'in_app','Action Required: Approval Request','You have a new workflow step requiring your action.','workflow_run',?,'sent')`
        ).bind(nextUserId, runId).run()
      }
    } else {
      // All steps complete — workflow done
      await c.env.DB.prepare(
        `UPDATE workflow_runs SET status = 'completed', completed_at = datetime('now'), completed_by_user_id = ? WHERE id = ?`
      ).bind(session.userId, runId).run()
      await c.env.DB.prepare(
        `INSERT INTO workflow_events (workflow_run_id, event_type, actor_user_id, description)
         VALUES (?,'completed',?,'All steps completed successfully')`
      ).bind(runId, session.userId).run()

      const run = await c.env.DB.prepare(`SELECT * FROM workflow_runs WHERE id = ?`).bind(runId).first<any>()
      if (run?.record_type === 'request') {
        await c.env.DB.prepare(`UPDATE requests SET status = 'approved', updated_at = datetime('now') WHERE id = ?`)
          .bind(run.record_id).run()
        const req = await c.env.DB.prepare(`SELECT requested_by_user_id, title FROM requests WHERE id = ?`)
          .bind(run.record_id).first<any>()
        if (req) {
          await c.env.DB.prepare(
            `INSERT INTO notification_deliveries (recipient_user_id, channel, subject, body, record_type, record_id, status)
             VALUES (?,'in_app','Request Approved',?,'request',?,'sent')`
          ).bind(req.requested_by_user_id, `Your request "${req.title}" has been fully approved!`, run.record_id).run()
        }
      }
    }
  }

  await c.env.DB.prepare(
    `INSERT INTO platform_audit_log (actor_user_id, actor_email, action, module, record_type, record_id, new_value, severity)
     VALUES (?,?,'workflow_step_acted','workflow','workflow_run',?,?,'info')`
  ).bind(session.userId, session.email, runId, JSON.stringify({ action, step_order: activeStep.step_order })).run()

  return c.json({ success: true })
})

// ── God Admin: Force override workflow ────────────────────────────────────
app.post('/runs/:id/override', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  if (!session.isGodAdmin && !session.roles.includes('god_admin')) {
    return c.json({ error: 'God Admin only' }, 403)
  }
  const runId = parseInt(c.req.param('id'))
  const { action, justification } = await c.req.json()

  if (!justification || justification.length < 10) {
    return c.json({ error: 'Justification required (min 10 chars)' }, 400)
  }

  const newStatus = action === 'force_approve' ? 'completed' : 'rejected'
  await c.env.DB.prepare(
    `UPDATE workflow_runs SET status = ?, completed_at = datetime('now'), completed_by_user_id = ? WHERE id = ?`
  ).bind(newStatus, session.userId, runId).run()

  // Update all pending steps as skipped
  await c.env.DB.prepare(
    `UPDATE workflow_run_steps SET status = 'skipped' WHERE workflow_run_id = ? AND status IN ('pending','active')`
  ).bind(runId).run()

  const run = await c.env.DB.prepare(`SELECT * FROM workflow_runs WHERE id = ?`).bind(runId).first<any>()
  if (run?.record_type === 'request') {
    const reqStatus = action === 'force_approve' ? 'approved' : 'rejected'
    await c.env.DB.prepare(`UPDATE requests SET status = ? WHERE id = ?`).bind(reqStatus, run.record_id).run()
  }

  // Log god admin action
  await c.env.DB.prepare(
    `INSERT INTO god_admin_actions (admin_user_id, action_type, target_type, target_id, justification, new_state)
     VALUES (?,?,?,?,?,?)`
  ).bind(session.userId, 'override_workflow', 'workflow_run', runId, justification, JSON.stringify({ action })).run()

  await c.env.DB.prepare(
    `INSERT INTO platform_audit_log (actor_user_id, actor_email, action, module, record_type, record_id, new_value, severity)
     VALUES (?,?,'god_admin_workflow_override','workflow','workflow_run',?,?,'critical')`
  ).bind(session.userId, session.email, runId, JSON.stringify({ action, justification })).run()

  return c.json({ success: true })
})

// ── Analytics: Workflow performance ───────────────────────────────────────
app.get('/analytics', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const isAdmin = session.isGodAdmin || session.roles.includes('god_admin') ||
    session.roles.includes('platform_admin') || session.roles.includes('executive')
  if (!isAdmin) return c.json({ error: 'Forbidden' }, 403)

  const byStatus = await c.env.DB.prepare(`SELECT status, COUNT(*) as cnt FROM workflow_runs GROUP BY status`).all()
  const byTemplate = await c.env.DB.prepare(
    `SELECT wt.name, COUNT(wr.id) as total,
      SUM(CASE WHEN wr.status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN wr.status = 'rejected' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN wr.status = 'running' THEN 1 ELSE 0 END) as running
     FROM workflow_runs wr JOIN workflow_templates wt ON wt.id = wr.workflow_template_id
     GROUP BY wt.id ORDER BY total DESC`
  ).all()

  return c.json({ by_status: byStatus.results, by_template: byTemplate.results })
})

export default app
