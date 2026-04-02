// src/routes/p3/knowledge.ts — Phase 3: Knowledge Ingestion & Search
import { Hono } from 'hono'
import { requireAuth } from '../../lib/auth'
import { Env } from '../../types'

const app = new Hono<{ Bindings: Env }>()

// ── List Knowledge Sources ─────────────────────────────────────────────────
app.get('/sources', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const sources = await c.env.DB.prepare(
    `SELECT ks.*, d.name as directorate_name, u.display_name as created_by_name
     FROM knowledge_sources ks
     LEFT JOIN directorates d ON d.id = ks.directorate_id
     LEFT JOIN users u ON u.id = ks.created_by
     WHERE ks.is_active = 1 ORDER BY ks.name`
  ).all()
  return c.json({ sources: sources.results })
})

// ── Create Knowledge Source (admin) ───────────────────────────────────────
app.post('/sources', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  if (!session.isGodAdmin && !session.roles.includes('god_admin') && !session.roles.includes('platform_admin')) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  const { name, source_type, description, directorate_id, config } = await c.req.json()
  if (!name) return c.json({ error: 'Name required' }, 400)

  const result = await c.env.DB.prepare(
    `INSERT INTO knowledge_sources (name, source_type, description, directorate_id, config, created_by)
     VALUES (?,?,?,?,?,?)`
  ).bind(name, source_type || 'upload', description || null, directorate_id || null,
    config ? JSON.stringify(config) : null, session.userId).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// ── List Knowledge Documents ───────────────────────────────────────────────
app.get('/documents', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const sourceId = c.req.query('source_id')
  const dirId = c.req.query('directorate_id')
  const docType = c.req.query('type')
  const q = c.req.query('q')
  const page = parseInt(c.req.query('page') || '1')
  const limit = 20
  const offset = (page - 1) * limit

  let sql = `SELECT kd.id, kd.title, kd.slug, kd.document_type, kd.tags, kd.visibility_type,
    kd.indexed_at, kd.updated_at, kd.directorate_id, kd.knowledge_source_id,
    ks.name as source_name, d.name as directorate_name, u.display_name as created_by_name
    FROM knowledge_documents kd
    LEFT JOIN knowledge_sources ks ON ks.id = kd.knowledge_source_id
    LEFT JOIN directorates d ON d.id = kd.directorate_id
    LEFT JOIN users u ON u.id = kd.created_by
    WHERE 1=1`
  const params: any[] = []

  if (!session.isGodAdmin && !session.roles.includes('god_admin') && !session.roles.includes('platform_admin')) {
    sql += ` AND (kd.visibility_type = 'platform'`
    if (session.directorateIds.length > 0) {
      sql += ` OR (kd.visibility_type = 'directorate' AND kd.directorate_id IN (${session.directorateIds.map(() => '?').join(',')}))`
      params.push(...session.directorateIds)
    }
    sql += `)`
  }

  if (sourceId) { sql += ` AND kd.knowledge_source_id = ?`; params.push(sourceId) }
  if (dirId) { sql += ` AND kd.directorate_id = ?`; params.push(dirId) }
  if (docType) { sql += ` AND kd.document_type = ?`; params.push(docType) }
  if (q) { sql += ` AND (kd.title LIKE ? OR kd.content_text LIKE ?)`; params.push(`%${q}%`, `%${q}%`) }

  sql += ` ORDER BY kd.updated_at DESC LIMIT ? OFFSET ?`
  params.push(limit, offset)

  const docs = await c.env.DB.prepare(sql).bind(...params).all()
  return c.json({ documents: docs.results, page, limit })
})

// ── Get Single Document ────────────────────────────────────────────────────
app.get('/documents/:id', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const id = parseInt(c.req.param('id'))
  const doc = await c.env.DB.prepare(
    `SELECT kd.*, ks.name as source_name, d.name as directorate_name, u.display_name as created_by_name
     FROM knowledge_documents kd
     LEFT JOIN knowledge_sources ks ON ks.id = kd.knowledge_source_id
     LEFT JOIN directorates d ON d.id = kd.directorate_id
     LEFT JOIN users u ON u.id = kd.created_by
     WHERE kd.id = ?`
  ).bind(id).first<any>()
  if (!doc) return c.json({ error: 'Not found' }, 404)

  // Check visibility
  if (doc.visibility_type === 'directorate' && doc.directorate_id &&
    !session.isGodAdmin && !session.roles.includes('god_admin') &&
    !session.directorateIds.includes(doc.directorate_id)) {
    return c.json({ error: 'Access denied' }, 403)
  }

  // Get links
  const links = await c.env.DB.prepare(
    `SELECT * FROM knowledge_links WHERE knowledge_document_id = ?`
  ).bind(id).all()

  return c.json({ document: doc, links: links.results })
})

// ── Create/Ingest Document ─────────────────────────────────────────────────
app.post('/documents', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const body = await c.req.json()
  const { knowledge_source_id, title, document_type, content_text, tags, visibility_type,
    directorate_id, parsed_metadata_json, linked_workspace_id } = body
  if (!title || !content_text) return c.json({ error: 'Title and content required' }, 400)

  // Simple slug generation
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80) + '-' + Date.now()

  // Basic HTML rendering of markdown (simple conversion)
  const content_html = content_text
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^/g, '<p>').replace(/$/, '</p>')

  const result = await c.env.DB.prepare(
    `INSERT INTO knowledge_documents (knowledge_source_id, title, slug, document_type, content_text, content_html,
      tags, visibility_type, directorate_id, parsed_metadata_json, linked_workspace_id, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(knowledge_source_id || null, title, slug, document_type || 'article',
    content_text, content_html,
    tags ? JSON.stringify(tags) : null,
    visibility_type || 'platform', directorate_id || null,
    parsed_metadata_json ? JSON.stringify(parsed_metadata_json) : null,
    linked_workspace_id || null, session.userId).run()

  await c.env.DB.prepare(
    `UPDATE knowledge_sources SET doc_count = doc_count + 1 WHERE id = ?`
  ).bind(knowledge_source_id).run().catch(() => {})

  await c.env.DB.prepare(
    `INSERT INTO platform_audit_log (actor_user_id, actor_email, action, module, record_type, record_id)
     VALUES (?,?,'knowledge_doc_created','knowledge','knowledge_document',?)`
  ).bind(session.userId, session.email, result.meta.last_row_id).run()

  return c.json({ success: true, id: result.meta.last_row_id, slug })
})

// ── Update Document ────────────────────────────────────────────────────────
app.put('/documents/:id', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const id = parseInt(c.req.param('id'))
  const { title, content_text, tags, visibility_type, directorate_id, document_type } = await c.req.json()

  const existing = await c.env.DB.prepare(`SELECT * FROM knowledge_documents WHERE id = ?`).bind(id).first<any>()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const canEdit = session.isGodAdmin || session.roles.includes('god_admin') ||
    session.roles.includes('platform_admin') || existing.created_by === session.userId
  if (!canEdit) return c.json({ error: 'Forbidden' }, 403)

  const content_html = content_text ? content_text
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>') : existing.content_html

  await c.env.DB.prepare(
    `UPDATE knowledge_documents SET title = ?, content_text = ?, content_html = ?,
     tags = ?, visibility_type = ?, directorate_id = ?, document_type = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).bind(title || existing.title, content_text || existing.content_text, content_html,
    tags ? JSON.stringify(tags) : existing.tags,
    visibility_type || existing.visibility_type, directorate_id || existing.directorate_id,
    document_type || existing.document_type, id).run()

  return c.json({ success: true })
})

// ── Delete Document ────────────────────────────────────────────────────────
app.delete('/documents/:id', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const id = parseInt(c.req.param('id'))
  const doc = await c.env.DB.prepare(`SELECT * FROM knowledge_documents WHERE id = ?`).bind(id).first<any>()
  if (!doc) return c.json({ error: 'Not found' }, 404)

  const canDelete = session.isGodAdmin || session.roles.includes('god_admin') ||
    session.roles.includes('platform_admin') || doc.created_by === session.userId
  if (!canDelete) return c.json({ error: 'Forbidden' }, 403)

  await c.env.DB.prepare(`DELETE FROM knowledge_documents WHERE id = ?`).bind(id).run()
  await c.env.DB.prepare(
    `UPDATE knowledge_sources SET doc_count = MAX(0, doc_count - 1) WHERE id = ?`
  ).bind(doc.knowledge_source_id).run().catch(() => {})

  return c.json({ success: true })
})

// ── Search Knowledge Base ─────────────────────────────────────────────────
app.get('/search', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const q = c.req.query('q')
  if (!q || q.length < 2) return c.json({ results: [] })

  let sql = `SELECT kd.id, kd.title, kd.slug, kd.document_type, kd.tags, kd.indexed_at,
    ks.name as source_name, d.name as directorate_name,
    substr(kd.content_text, 1, 200) as excerpt
    FROM knowledge_documents kd
    LEFT JOIN knowledge_sources ks ON ks.id = kd.knowledge_source_id
    LEFT JOIN directorates d ON d.id = kd.directorate_id
    WHERE (kd.title LIKE ? OR kd.content_text LIKE ? OR kd.tags LIKE ?)`
  const params: any[] = [`%${q}%`, `%${q}%`, `%${q}%`]

  if (!session.isGodAdmin && !session.roles.includes('god_admin')) {
    sql += ` AND (kd.visibility_type = 'platform'`
    if (session.directorateIds.length > 0) {
      sql += ` OR (kd.visibility_type = 'directorate' AND kd.directorate_id IN (${session.directorateIds.map(() => '?').join(',')}))`
      params.push(...session.directorateIds)
    }
    sql += `)`
  }
  sql += ` ORDER BY kd.updated_at DESC LIMIT 20`

  const results = await c.env.DB.prepare(sql).bind(...params).all()
  return c.json({ results: results.results, query: q })
})

// ── Link Document to Entity ────────────────────────────────────────────────
app.post('/documents/:id/links', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session
  const id = parseInt(c.req.param('id'))
  const { linked_entity_type, linked_entity_id, link_reason } = await c.req.json()
  if (!linked_entity_type || !linked_entity_id) return c.json({ error: 'Missing fields' }, 400)

  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO knowledge_links (knowledge_document_id, linked_entity_type, linked_entity_id, link_reason, created_by)
     VALUES (?,?,?,?,?)`
  ).bind(id, linked_entity_type, linked_entity_id, link_reason || null, session.userId).run()

  return c.json({ success: true })
})

// ── Analytics for Knowledge Base ──────────────────────────────────────────
app.get('/analytics', async (c) => {
  const session = await requireAuth(c)
  if (session instanceof Response) return session

  const total = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM knowledge_documents`).first<any>()
  const byType = await c.env.DB.prepare(
    `SELECT document_type, COUNT(*) as cnt FROM knowledge_documents GROUP BY document_type ORDER BY cnt DESC`
  ).all()
  const bySources = await c.env.DB.prepare(
    `SELECT ks.name, ks.source_type, ks.doc_count, ks.last_synced_at, ks.sync_status
     FROM knowledge_sources ks WHERE ks.is_active = 1 ORDER BY ks.doc_count DESC`
  ).all()
  const recent = await c.env.DB.prepare(
    `SELECT kd.id, kd.title, kd.document_type, kd.indexed_at, ks.name as source_name
     FROM knowledge_documents kd LEFT JOIN knowledge_sources ks ON ks.id = kd.knowledge_source_id
     ORDER BY kd.indexed_at DESC LIMIT 10`
  ).all()

  return c.json({ total: total?.cnt ?? 0, by_type: byType.results, by_sources: bySources.results, recent: recent.results })
})

export default app
