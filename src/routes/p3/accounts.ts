// src/routes/p3/accounts.ts — Phase 3: Relationship Intelligence (K6 COLLAB CRM)
import { Hono } from 'hono'
import { requireAuth } from '../../lib/auth'
import { Env } from '../../types'

const app = new Hono<{ Bindings: Env }>()

// ── List Accounts ──────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const type = c.req.query('type')
  const status = c.req.query('status')
  const tier = c.req.query('tier')
  const q = c.req.query('q')
  const page = parseInt(c.req.query('page') || '1')
  const limit = 25
  const offset = (page - 1) * limit

  let sql = `SELECT a.*, u.display_name as owner_name, d.name as directorate_name, d.code as directorate_code,
    (SELECT COUNT(*) FROM account_contacts ac WHERE ac.account_id = a.id AND ac.is_active = 1) as contact_count,
    (SELECT COUNT(*) FROM engagement_logs el WHERE el.account_id = a.id) as engagement_count
    FROM accounts a
    LEFT JOIN users u ON u.id = a.owner_user_id
    LEFT JOIN directorates d ON d.id = a.directorate_id
    WHERE 1=1`
  const params: any[] = []

  if (type) { sql += ` AND a.account_type = ?`; params.push(type) }
  if (status) { sql += ` AND a.status = ?`; params.push(status) }
  if (tier) { sql += ` AND a.tier = ?`; params.push(tier) }
  if (q) { sql += ` AND (a.name LIKE ? OR a.description LIKE ? OR a.sector LIKE ?)`; params.push(`%${q}%`, `%${q}%`, `%${q}%`) }

  sql += ` ORDER BY a.tier = 'strategic' DESC, a.tier = 'key' DESC, a.name ASC LIMIT ? OFFSET ?`
  params.push(limit, offset)

  const accounts = await c.env.DB.prepare(sql).bind(...params).all()
  const total = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM accounts WHERE 1=1`).first<any>()
  return c.json({ accounts: accounts.results, total: total?.cnt ?? 0, page, limit })
})

// ── Get Account Detail ─────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const id = parseInt(c.req.param('id'))
  const account = await c.env.DB.prepare(
    `SELECT a.*, u.display_name as owner_name, d.name as directorate_name
     FROM accounts a LEFT JOIN users u ON u.id = a.owner_user_id LEFT JOIN directorates d ON d.id = a.directorate_id
     WHERE a.id = ?`
  ).bind(id).first()
  if (!account) return c.json({ error: 'Not found' }, 404)

  const contacts = await c.env.DB.prepare(
    `SELECT ac.*, u.display_name as linked_user_name
     FROM account_contacts ac LEFT JOIN users u ON u.id = ac.linked_user_id
     WHERE ac.account_id = ? AND ac.is_active = 1 ORDER BY ac.is_primary DESC, ac.full_name`
  ).bind(id).all()

  const engagements = await c.env.DB.prepare(
    `SELECT el.*, u.display_name as owner_name, ac.full_name as contact_name
     FROM engagement_logs el
     LEFT JOIN users u ON u.id = el.owner_user_id
     LEFT JOIN account_contacts ac ON ac.id = el.contact_id
     WHERE el.account_id = ? ORDER BY el.occurred_at DESC LIMIT 20`
  ).bind(id).all()

  const relEdges = await c.env.DB.prepare(
    `SELECT re.*, u.display_name as target_user_name
     FROM relationship_edges re
     LEFT JOIN users u ON u.id = re.target_id AND re.target_type = 'user'
     WHERE (re.source_type = 'account' AND re.source_id = ?) OR (re.target_type = 'account' AND re.target_id = ?)
     ORDER BY re.strength DESC`
  ).bind(id, id).all()

  const knowledge = await c.env.DB.prepare(
    `SELECT kd.id, kd.title, kd.document_type, kd.indexed_at
     FROM knowledge_links kl JOIN knowledge_documents kd ON kd.id = kl.knowledge_document_id
     WHERE kl.linked_entity_type = 'account' AND kl.linked_entity_id = ?`
  ).bind(id).all()

  return c.json({ account, contacts: contacts.results, engagements: engagements.results, relationship_edges: relEdges.results, knowledge_docs: knowledge.results })
})

// ── Create Account ─────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const body = await c.req.json()
  const { name, account_type, sector, region, country, website, description, status, tier, directorate_id, tags } = body
  if (!name) return c.json({ error: 'Name required' }, 400)

  const result = await c.env.DB.prepare(
    `INSERT INTO accounts (name, account_type, sector, region, country, website, description, status, tier,
      owner_user_id, directorate_id, tags, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(name, account_type || 'partner', sector || null, region || null, country || 'GBR',
    website || null, description || null, status || 'active', tier || 'standard',
    session.userId, directorate_id || null,
    tags ? JSON.stringify(tags) : null, session.userId).run()

  await c.env.DB.prepare(
    `INSERT INTO platform_audit_log (actor_user_id, actor_email, action, module, record_type, record_id)
     VALUES (?,?,'account_created','accounts','account',?)`
  ).bind(session.userId, session.email, result.meta.last_row_id).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// ── Update Account ─────────────────────────────────────────────────────────
app.put('/:id', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { name, account_type, sector, region, country, website, description, status, tier, directorate_id, tags } = body

  const existing = await c.env.DB.prepare(`SELECT * FROM accounts WHERE id = ?`).bind(id).first<any>()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  await c.env.DB.prepare(
    `UPDATE accounts SET name=?, account_type=?, sector=?, region=?, country=?, website=?,
     description=?, status=?, tier=?, directorate_id=?, tags=?, updated_at=datetime('now') WHERE id = ?`
  ).bind(name || existing.name, account_type || existing.account_type, sector || existing.sector,
    region || existing.region, country || existing.country, website || existing.website,
    description || existing.description, status || existing.status, tier || existing.tier,
    directorate_id || existing.directorate_id,
    tags ? JSON.stringify(tags) : existing.tags, id).run()

  return c.json({ success: true })
})

// ── Account Contacts ───────────────────────────────────────────────────────
app.post('/:id/contacts', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const accountId = parseInt(c.req.param('id'))
  const { full_name, title, email, phone, linkedin_url, is_primary, notes, linked_user_id } = await c.req.json()
  if (!full_name) return c.json({ error: 'Full name required' }, 400)

  if (is_primary) {
    await c.env.DB.prepare(`UPDATE account_contacts SET is_primary = 0 WHERE account_id = ?`).bind(accountId).run()
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO account_contacts (account_id, full_name, title, email, phone, linkedin_url, is_primary, notes, linked_user_id, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind(accountId, full_name, title || null, email || null, phone || null,
    linkedin_url || null, is_primary ? 1 : 0, notes || null, linked_user_id || null, session.userId).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

app.put('/:id/contacts/:cid', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const contactId = parseInt(c.req.param('cid'))
  const { full_name, title, email, phone, linkedin_url, is_primary, notes } = await c.req.json()
  const accountId = parseInt(c.req.param('id'))

  if (is_primary) {
    await c.env.DB.prepare(`UPDATE account_contacts SET is_primary = 0 WHERE account_id = ?`).bind(accountId).run()
  }

  await c.env.DB.prepare(
    `UPDATE account_contacts SET full_name=?, title=?, email=?, phone=?, linkedin_url=?, is_primary=?, notes=?, updated_at=datetime('now')
     WHERE id = ?`
  ).bind(full_name, title || null, email || null, phone || null, linkedin_url || null,
    is_primary ? 1 : 0, notes || null, contactId).run()

  return c.json({ success: true })
})

// ── Engagement Logs ────────────────────────────────────────────────────────
app.get('/engagements/list', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const page = parseInt(c.req.query('page') || '1')
  const limit = 25
  const offset = (page - 1) * limit

  const engagements = await c.env.DB.prepare(
    `SELECT el.*, a.name as account_name, u.display_name as owner_name, ac.full_name as contact_name
     FROM engagement_logs el
     LEFT JOIN accounts a ON a.id = el.account_id
     LEFT JOIN users u ON u.id = el.owner_user_id
     LEFT JOIN account_contacts ac ON ac.id = el.contact_id
     ORDER BY el.occurred_at DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all()

  return c.json({ engagements: engagements.results, page, limit })
})

app.post('/engagements', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const { account_id, contact_id, engagement_type, subject, summary, outcome,
    occurred_at, next_follow_up_at, follow_up_note, directorate_id } = await c.req.json()
  if (!summary) return c.json({ error: 'Summary required' }, 400)

  const result = await c.env.DB.prepare(
    `INSERT INTO engagement_logs (account_id, contact_id, engagement_type, subject, summary, outcome,
      occurred_at, next_follow_up_at, follow_up_note, owner_user_id, directorate_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(account_id || null, contact_id || null, engagement_type || 'meeting',
    subject || null, summary, outcome || null,
    occurred_at || new Date().toISOString(), next_follow_up_at || null,
    follow_up_note || null, session.userId, directorate_id || null).run()

  // Update account last_engaged_at
  if (account_id) {
    await c.env.DB.prepare(`UPDATE accounts SET last_engaged_at = datetime('now') WHERE id = ?`).bind(account_id).run()
  }

  // Create reminder if follow-up set
  if (next_follow_up_at) {
    await c.env.DB.prepare(
      `INSERT INTO scheduled_reminders (record_type, record_id, recipient_user_id, message, remind_at, created_by)
       VALUES ('engagement_log',?,'${session.userId}',?,?,?)`
    ).bind(result.meta.last_row_id, `Follow-up reminder: ${subject || summary.slice(0, 80)}`, next_follow_up_at, session.userId).run()
  }

  return c.json({ success: true, id: result.meta.last_row_id })
})

// ── Relationship Edges ─────────────────────────────────────────────────────
app.get('/relationships', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const edges = await c.env.DB.prepare(
    `SELECT re.*, d.name as directorate_name FROM relationship_edges re
     LEFT JOIN directorates d ON d.id = re.directorate_id
     ORDER BY re.strength DESC LIMIT 100`
  ).all()
  return c.json({ edges: edges.results })
})

app.post('/relationships', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const { source_type, source_id, target_type, target_id, relationship_type, strength, notes, directorate_id } = await c.req.json()
  if (!source_type || !source_id || !target_type || !target_id || !relationship_type) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO relationship_edges (source_type, source_id, target_type, target_id, relationship_type, strength, notes, directorate_id, created_by)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind(source_type, source_id, target_type, target_id, relationship_type,
    strength || 'medium', notes || null, directorate_id || null, session.userId).run()

  return c.json({ success: true })
})

// ── Upcoming Follow-ups ────────────────────────────────────────────────────
app.get('/follow-ups', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const followUps = await c.env.DB.prepare(
    `SELECT el.*, a.name as account_name, u.display_name as owner_name
     FROM engagement_logs el
     LEFT JOIN accounts a ON a.id = el.account_id
     LEFT JOIN users u ON u.id = el.owner_user_id
     WHERE el.next_follow_up_at IS NOT NULL AND el.next_follow_up_at >= date('now')
       AND (el.owner_user_id = ? OR ? = 1)
     ORDER BY el.next_follow_up_at ASC LIMIT 20`
  ).bind(session.userId, session.isGodAdmin ? 1 : 0).all()

  return c.json({ follow_ups: followUps.results })
})

// ── Account Analytics ──────────────────────────────────────────────────────
app.get('/analytics', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const totals = await c.env.DB.prepare(
    `SELECT COUNT(*) as total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN tier = 'strategic' THEN 1 ELSE 0 END) as strategic,
      SUM(CASE WHEN tier = 'key' THEN 1 ELSE 0 END) as key_accounts
     FROM accounts`
  ).first<any>()

  const byType = await c.env.DB.prepare(
    `SELECT account_type, COUNT(*) as cnt FROM accounts GROUP BY account_type ORDER BY cnt DESC`
  ).all()

  const engagementTrend = await c.env.DB.prepare(
    `SELECT date(occurred_at) as day, COUNT(*) as cnt
     FROM engagement_logs WHERE occurred_at >= date('now','-30 days')
     GROUP BY date(occurred_at) ORDER BY day`
  ).all()

  const topAccounts = await c.env.DB.prepare(
    `SELECT a.name, a.tier, a.status, a.last_engaged_at,
      COUNT(DISTINCT el.id) as engagement_count, COUNT(DISTINCT ac.id) as contact_count
     FROM accounts a
     LEFT JOIN engagement_logs el ON el.account_id = a.id
     LEFT JOIN account_contacts ac ON ac.account_id = a.id AND ac.is_active = 1
     GROUP BY a.id ORDER BY engagement_count DESC LIMIT 10`
  ).all()

  return c.json({ totals, by_type: byType.results, engagement_trend: engagementTrend.results, top_accounts: topAccounts.results })
})

export default app
