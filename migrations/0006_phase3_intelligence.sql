-- ═══════════════════════════════════════════════════════════════════════════
-- KBI Platform — Phase 3 Intelligence & Automation Layer
-- Migration: 0006_phase3_intelligence.sql
-- Modules: Request System, Workflow Engine, Automation, Analytics,
--          Knowledge Ingestion, Relationship Intelligence, Connectors,
--          Executive Dashboards, HR (Leave/Refund), Observability
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- MODULE 1: REQUEST SYSTEM
-- Internal request types: leave, refund, procurement, internal application
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS request_types (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT    NOT NULL,
  slug                TEXT    NOT NULL UNIQUE,          -- leave | refund | procurement | job_app
  description         TEXT,
  icon                TEXT    DEFAULT 'fas fa-file-alt',
  color               TEXT    DEFAULT '#4F46E5',
  directorate_id      INTEGER REFERENCES directorates(id),  -- NULL = platform-wide
  is_active           INTEGER DEFAULT 1,
  requires_workflow   INTEGER DEFAULT 1,
  default_workflow_template_id INTEGER,                  -- linked after workflow_templates created
  visibility_type     TEXT    DEFAULT 'platform',        -- platform | directorate | role
  visibility_value    TEXT,
  sla_hours           INTEGER DEFAULT 72,
  created_by          INTEGER REFERENCES users(id),
  created_at          TEXT    DEFAULT (datetime('now')),
  updated_at          TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS request_fields (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  request_type_id INTEGER NOT NULL REFERENCES request_types(id) ON DELETE CASCADE,
  field_key       TEXT    NOT NULL,
  label           TEXT    NOT NULL,
  field_type      TEXT    DEFAULT 'text',  -- text | textarea | date | select | multiselect | file | number | boolean
  options         TEXT,                    -- JSON array for select/multiselect
  is_required     INTEGER DEFAULT 0,
  placeholder     TEXT,
  help_text       TEXT,
  sort_order      INTEGER DEFAULT 0,
  UNIQUE(request_type_id, field_key)
);

CREATE TABLE IF NOT EXISTS requests (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  issued_id              TEXT    UNIQUE,                  -- e.g. REQ-2024-001
  request_type_id        INTEGER NOT NULL REFERENCES request_types(id),
  requested_by_user_id   INTEGER NOT NULL REFERENCES users(id),
  on_behalf_of_user_id   INTEGER REFERENCES users(id),   -- submitting on behalf of someone
  title                  TEXT    NOT NULL,
  description            TEXT,
  status                 TEXT    DEFAULT 'submitted',     -- submitted | under_review | approved | rejected | withdrawn | closed
  priority               TEXT    DEFAULT 'normal',        -- low | normal | high | urgent
  directorate_id         INTEGER REFERENCES directorates(id),
  current_workflow_run_id INTEGER,
  submitted_at           TEXT    DEFAULT (datetime('now')),
  due_at                 TEXT,
  closed_at              TEXT,
  closed_by_user_id      INTEGER REFERENCES users(id),
  visibility_type        TEXT    DEFAULT 'directorate',
  visibility_value       TEXT,
  metadata               TEXT,                            -- JSON: type-specific extras
  created_at             TEXT    DEFAULT (datetime('now')),
  updated_at             TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS request_responses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id      INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  request_field_id INTEGER NOT NULL REFERENCES request_fields(id),
  field_key       TEXT    NOT NULL,
  value_text      TEXT,
  value_json      TEXT,   -- for multi-value / complex types
  created_at      TEXT    DEFAULT (datetime('now'))
);

-- Leave-specific extension
CREATE TABLE IF NOT EXISTS leave_requests (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id            INTEGER NOT NULL UNIQUE REFERENCES requests(id) ON DELETE CASCADE,
  leave_type            TEXT    DEFAULT 'annual',  -- annual | sick | unpaid | maternity | paternity | compassionate | other
  start_date            TEXT    NOT NULL,
  end_date              TEXT    NOT NULL,
  days_requested        REAL,
  cover_user_id         INTEGER REFERENCES users(id),
  handover_notes        TEXT,
  is_half_day           INTEGER DEFAULT 0,
  half_day_period       TEXT,   -- morning | afternoon
  return_date           TEXT,
  approved_days         REAL,
  rejection_reason      TEXT,
  created_at            TEXT    DEFAULT (datetime('now'))
);

-- Refund-specific extension
CREATE TABLE IF NOT EXISTS refund_requests (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id            INTEGER NOT NULL UNIQUE REFERENCES requests(id) ON DELETE CASCADE,
  expense_category      TEXT    DEFAULT 'general',  -- travel | accommodation | equipment | software | training | meals | other
  expense_date          TEXT    NOT NULL,
  amount                REAL    NOT NULL,
  currency              TEXT    DEFAULT 'GBP',
  vendor_name           TEXT,
  receipt_file_key      TEXT,   -- R2 key
  bank_account_info     TEXT,   -- encrypted/masked reference
  cost_centre           TEXT,
  project_code          TEXT,
  approved_amount       REAL,
  paid_at               TEXT,
  rejection_reason      TEXT,
  created_at            TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────────────────
-- MODULE 2: WORKFLOW ENGINE
-- Multi-step approval and orchestration chains
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_templates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  slug            TEXT    NOT NULL UNIQUE,
  description     TEXT,
  record_type     TEXT    DEFAULT 'request',   -- request | work_item | leave | refund
  is_active       INTEGER DEFAULT 1,
  is_sequential   INTEGER DEFAULT 1,           -- 1=steps in order, 0=parallel
  sla_hours       INTEGER DEFAULT 72,
  escalation_after_hours INTEGER DEFAULT 48,
  created_by      INTEGER REFERENCES users(id),
  created_at      TEXT    DEFAULT (datetime('now')),
  updated_at      TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workflow_template_steps (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_template_id   INTEGER NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  step_order             INTEGER NOT NULL,
  name                   TEXT    NOT NULL,
  step_type              TEXT    DEFAULT 'approval',  -- approval | review | notification | auto | condition
  approver_type          TEXT    DEFAULT 'role',      -- role | user | directorate_lead | god_admin | manager
  approver_value         TEXT,                        -- role name, user_id, etc.
  is_required            INTEGER DEFAULT 1,
  timeout_hours          INTEGER DEFAULT 72,
  on_timeout_action      TEXT    DEFAULT 'escalate',  -- escalate | auto_approve | reject | notify
  instructions           TEXT,
  UNIQUE(workflow_template_id, step_order)
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_template_id     INTEGER NOT NULL REFERENCES workflow_templates(id),
  record_type              TEXT    NOT NULL,
  record_id                INTEGER NOT NULL,
  status                   TEXT    DEFAULT 'running',  -- running | completed | rejected | cancelled | error
  current_step_order       INTEGER DEFAULT 1,
  started_at               TEXT    DEFAULT (datetime('now')),
  started_by_user_id       INTEGER REFERENCES users(id),
  completed_at             TEXT,
  completed_by_user_id     INTEGER REFERENCES users(id),
  cancelled_at             TEXT,
  error_message            TEXT,
  metadata                 TEXT    -- JSON
);

CREATE TABLE IF NOT EXISTS workflow_run_steps (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_run_id       INTEGER NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  template_step_id      INTEGER NOT NULL REFERENCES workflow_template_steps(id),
  step_order            INTEGER NOT NULL,
  status                TEXT    DEFAULT 'pending',   -- pending | active | approved | rejected | skipped | escalated | timed_out
  assigned_to_user_id   INTEGER REFERENCES users(id),
  acted_by_user_id      INTEGER REFERENCES users(id),
  action                TEXT,   -- approved | rejected | delegated | escalated
  rationale             TEXT,
  activated_at          TEXT,
  deadline_at           TEXT,
  acted_at              TEXT,
  escalated_at          TEXT,
  escalation_target_user_id INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS workflow_events (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_run_id     INTEGER NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_order          INTEGER,
  event_type          TEXT    NOT NULL,   -- started | step_activated | approved | rejected | escalated | completed | cancelled | error
  actor_user_id       INTEGER REFERENCES users(id),
  description         TEXT,
  metadata            TEXT,               -- JSON
  occurred_at         TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────────────────
-- MODULE 3: AUTOMATION & NOTIFICATIONS
-- Rule-based automation engine + notification system
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_templates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  slug            TEXT    NOT NULL UNIQUE,
  subject         TEXT    NOT NULL,
  body_text       TEXT    NOT NULL,        -- plain text with {{variable}} placeholders
  body_html       TEXT,                    -- HTML version
  channel         TEXT    DEFAULT 'in_app',  -- in_app | email | both
  is_active       INTEGER DEFAULT 1,
  created_by      INTEGER REFERENCES users(id),
  created_at      TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_template_id INTEGER REFERENCES notification_templates(id),
  recipient_user_id        INTEGER REFERENCES users(id),
  channel                  TEXT    DEFAULT 'in_app',
  subject                  TEXT,
  body                     TEXT,
  status                   TEXT    DEFAULT 'pending',  -- pending | sent | failed | skipped
  record_type              TEXT,
  record_id                INTEGER,
  is_read                  INTEGER DEFAULT 0,
  sent_at                  TEXT,
  read_at                  TEXT,
  error_message            TEXT,
  created_at               TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automation_rules (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT    NOT NULL,
  description         TEXT,
  trigger_type        TEXT    NOT NULL,   -- schedule | record_created | status_changed | field_updated | workflow_event | sla_breach | manual
  trigger_config      TEXT    NOT NULL,   -- JSON: trigger parameters
  conditions          TEXT,               -- JSON: filter conditions
  action_type         TEXT    NOT NULL,   -- send_notification | create_request | update_field | escalate | run_workflow | create_reminder | webhook
  action_config       TEXT    NOT NULL,   -- JSON: action parameters
  is_active           INTEGER DEFAULT 1,
  directorate_id      INTEGER REFERENCES directorates(id),  -- NULL = platform-wide
  last_run_at         TEXT,
  last_run_status     TEXT,
  run_count           INTEGER DEFAULT 0,
  created_by          INTEGER REFERENCES users(id),
  created_at          TEXT    DEFAULT (datetime('now')),
  updated_at          TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  automation_rule_id  INTEGER NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  status              TEXT    DEFAULT 'running',  -- running | success | failed | skipped
  triggered_by        TEXT    DEFAULT 'system',   -- system | manual | webhook
  trigger_context     TEXT,   -- JSON: what caused this run
  actions_taken       TEXT,   -- JSON: list of actions performed
  error_message       TEXT,
  started_at          TEXT    DEFAULT (datetime('now')),
  completed_at        TEXT,
  duration_ms         INTEGER
);

CREATE TABLE IF NOT EXISTS scheduled_reminders (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  record_type         TEXT    NOT NULL,   -- work_item | request | leave | workflow_run
  record_id           INTEGER NOT NULL,
  recipient_user_id   INTEGER REFERENCES users(id),
  message             TEXT    NOT NULL,
  remind_at           TEXT    NOT NULL,
  is_sent             INTEGER DEFAULT 0,
  sent_at             TEXT,
  created_by          INTEGER REFERENCES users(id),
  created_at          TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────────────────
-- MODULE 4: ANALYTICS & EXECUTIVE DASHBOARDS
-- Cross-directorate snapshots and dashboard configs
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_type   TEXT    NOT NULL,   -- directorate_summary | platform_summary | workflow_performance | request_volume | user_activity | workspace_health
  scope_type      TEXT    DEFAULT 'platform',   -- platform | directorate | workspace | user
  scope_value     TEXT,               -- directorate code, workspace id, user id, etc.
  period_type     TEXT    DEFAULT 'weekly',     -- daily | weekly | monthly | quarterly
  period_start    TEXT    NOT NULL,
  period_end      TEXT    NOT NULL,
  payload_json    TEXT    NOT NULL,   -- JSON: metric data
  created_at      TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dashboard_configs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  slug            TEXT    NOT NULL UNIQUE,
  description     TEXT,
  dashboard_type  TEXT    DEFAULT 'executive',  -- executive | directorate | personal | team
  owner_user_id   INTEGER REFERENCES users(id),
  directorate_id  INTEGER REFERENCES directorates(id),
  widgets         TEXT    NOT NULL,             -- JSON: widget definitions
  layout          TEXT,                         -- JSON: grid layout
  visibility_type TEXT    DEFAULT 'role',       -- role | directorate | user | public
  visibility_value TEXT,
  is_default      INTEGER DEFAULT 0,
  is_active       INTEGER DEFAULT 1,
  created_by      INTEGER REFERENCES users(id),
  created_at      TEXT    DEFAULT (datetime('now')),
  updated_at      TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────────────────
-- MODULE 5: KNOWLEDGE INGESTION
-- Markdown / Obsidian vault and structured knowledge base
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  source_type     TEXT    DEFAULT 'upload',  -- upload | github | url | obsidian
  description     TEXT,
  directorate_id  INTEGER REFERENCES directorates(id),
  config          TEXT,             -- JSON: source-specific config (url, token, etc.)
  last_synced_at  TEXT,
  sync_status     TEXT    DEFAULT 'idle',   -- idle | syncing | success | failed
  doc_count       INTEGER DEFAULT 0,
  is_active       INTEGER DEFAULT 1,
  created_by      INTEGER REFERENCES users(id),
  created_at      TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  knowledge_source_id   INTEGER REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  title                 TEXT    NOT NULL,
  slug                  TEXT,
  document_type         TEXT    DEFAULT 'article',  -- article | note | policy | guide | template | reference
  content_text          TEXT,               -- full markdown content
  content_html          TEXT,               -- rendered HTML
  parsed_metadata_json  TEXT,               -- extracted front-matter, tags, links
  tags                  TEXT,               -- JSON array of tags
  visibility_type       TEXT    DEFAULT 'platform',
  visibility_value      TEXT,
  directorate_id        INTEGER REFERENCES directorates(id),
  linked_workspace_id   INTEGER REFERENCES workspaces(id),
  file_key              TEXT,               -- R2 key for original file
  indexed_at            TEXT    DEFAULT (datetime('now')),
  updated_at            TEXT    DEFAULT (datetime('now')),
  created_by            INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS knowledge_links (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  knowledge_document_id   INTEGER NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  linked_entity_type      TEXT    NOT NULL,  -- user | account | work_item | workspace | directorate
  linked_entity_id        INTEGER NOT NULL,
  link_reason             TEXT,
  created_by              INTEGER REFERENCES users(id),
  created_at              TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────────────────
-- MODULE 6: RELATIONSHIP INTELLIGENCE (K6 COLLAB / CRM)
-- Account management, contacts, engagement tracking
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS accounts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  account_type    TEXT    DEFAULT 'partner',  -- partner | funder | sponsor | government | ngo | academic | other
  sector          TEXT,
  region          TEXT,
  country         TEXT    DEFAULT 'GBR',
  website         TEXT,
  description     TEXT,
  status          TEXT    DEFAULT 'active',   -- prospect | active | inactive | archived
  tier            TEXT    DEFAULT 'standard', -- strategic | key | standard | historical
  owner_user_id   INTEGER REFERENCES users(id),
  directorate_id  INTEGER REFERENCES directorates(id),
  logo_file_key   TEXT,
  tags            TEXT,   -- JSON array
  custom_fields   TEXT,   -- JSON
  last_engaged_at TEXT,
  created_by      INTEGER REFERENCES users(id),
  created_at      TEXT    DEFAULT (datetime('now')),
  updated_at      TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS account_contacts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id      INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  full_name       TEXT    NOT NULL,
  title           TEXT,
  email           TEXT,
  phone           TEXT,
  linkedin_url    TEXT,
  is_primary      INTEGER DEFAULT 0,
  is_active       INTEGER DEFAULT 1,
  notes           TEXT,
  linked_user_id  INTEGER REFERENCES users(id),   -- if contact is also a KBI user
  created_by      INTEGER REFERENCES users(id),
  created_at      TEXT    DEFAULT (datetime('now')),
  updated_at      TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS engagement_logs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id          INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  contact_id          INTEGER REFERENCES account_contacts(id) ON DELETE SET NULL,
  contact_user_id     INTEGER REFERENCES users(id),   -- internal KBI person
  engagement_type     TEXT    DEFAULT 'meeting',      -- meeting | email | call | event | proposal | mou | report | other
  subject             TEXT,
  summary             TEXT    NOT NULL,
  outcome             TEXT,
  occurred_at         TEXT    NOT NULL,
  next_follow_up_at   TEXT,
  follow_up_note      TEXT,
  owner_user_id       INTEGER REFERENCES users(id),
  directorate_id      INTEGER REFERENCES directorates(id),
  visibility_type     TEXT    DEFAULT 'directorate',
  attachments         TEXT,   -- JSON array of file keys
  created_at          TEXT    DEFAULT (datetime('now')),
  updated_at          TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS relationship_edges (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type     TEXT    NOT NULL,    -- user | account
  source_id       INTEGER NOT NULL,
  target_type     TEXT    NOT NULL,    -- user | account
  target_id       INTEGER NOT NULL,
  relationship_type TEXT  NOT NULL,    -- collaborates | manages | leads | advised_by | funded_by | partners_with
  strength        TEXT    DEFAULT 'medium',  -- weak | medium | strong
  notes           TEXT,
  directorate_id  INTEGER REFERENCES directorates(id),
  created_by      INTEGER REFERENCES users(id),
  created_at      TEXT    DEFAULT (datetime('now')),
  updated_at      TEXT    DEFAULT (datetime('now')),
  UNIQUE(source_type, source_id, target_type, target_id, relationship_type)
);

-- ─────────────────────────────────────────────────────────────────────────
-- MODULE 7: HR — JOB POSTINGS & APPLICATIONS (K7 OPS / K4 INNO)
-- Internal opportunities and applications
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_postings (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  title               TEXT    NOT NULL,
  department          TEXT,
  directorate_id      INTEGER REFERENCES directorates(id),
  employment_type     TEXT    DEFAULT 'full_time',  -- full_time | part_time | contract | volunteer | intern
  location            TEXT,
  is_remote           INTEGER DEFAULT 0,
  description         TEXT    NOT NULL,
  requirements        TEXT,
  salary_range        TEXT,
  status              TEXT    DEFAULT 'draft',   -- draft | open | reviewing | filled | closed
  posted_at           TEXT,
  closes_at           TEXT,
  visibility          TEXT    DEFAULT 'platform',  -- platform | public
  application_count   INTEGER DEFAULT 0,
  created_by          INTEGER REFERENCES users(id),
  created_at          TEXT    DEFAULT (datetime('now')),
  updated_at          TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_applications (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  job_posting_id      INTEGER NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  applicant_user_id   INTEGER REFERENCES users(id),
  applicant_name      TEXT,               -- for external applicants
  applicant_email     TEXT,
  cover_letter        TEXT,
  cv_file_key         TEXT,               -- R2 key
  status              TEXT    DEFAULT 'submitted',  -- submitted | reviewing | shortlisted | interviewed | offered | rejected | withdrawn
  reviewer_notes      TEXT,
  reviewed_by         INTEGER REFERENCES users(id),
  submitted_at        TEXT    DEFAULT (datetime('now')),
  updated_at          TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────────────────
-- MODULE 8: EXTERNAL CONNECTORS
-- Foundation for Google Workspace, external data sources
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS connector_sources (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  connector_type  TEXT    NOT NULL,  -- google_calendar | google_drive | google_contacts | webhook | rest_api | csv_upload
  description     TEXT,
  config          TEXT,              -- JSON: endpoint, credentials reference, mapping config
  is_active       INTEGER DEFAULT 1,
  sync_frequency  TEXT    DEFAULT 'manual',  -- manual | hourly | daily | weekly
  last_synced_at  TEXT,
  sync_status     TEXT    DEFAULT 'idle',    -- idle | running | success | failed | needs_auth
  error_message   TEXT,
  directorate_id  INTEGER REFERENCES directorates(id),
  created_by      INTEGER REFERENCES users(id),
  created_at      TEXT    DEFAULT (datetime('now')),
  updated_at      TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS connector_sync_runs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  connector_source_id INTEGER NOT NULL REFERENCES connector_sources(id) ON DELETE CASCADE,
  status              TEXT    DEFAULT 'running',  -- running | success | partial | failed
  records_synced      INTEGER DEFAULT 0,
  records_skipped     INTEGER DEFAULT 0,
  records_failed      INTEGER DEFAULT 0,
  error_message       TEXT,
  sync_log            TEXT,              -- JSON: detailed log entries
  started_at          TEXT    DEFAULT (datetime('now')),
  completed_at        TEXT,
  triggered_by        TEXT    DEFAULT 'system'   -- system | manual | webhook
);

-- ─────────────────────────────────────────────────────────────────────────
-- MODULE 9: OBSERVABILITY & AUDIT ENHANCEMENT
-- Extended audit log, platform health, and monitoring
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform_audit_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id   INTEGER REFERENCES users(id),
  actor_email     TEXT,
  action          TEXT    NOT NULL,        -- detailed action name
  module          TEXT,                    -- requests | workflow | automation | analytics | knowledge | accounts | admin
  record_type     TEXT,
  record_id       INTEGER,
  old_value       TEXT,                    -- JSON snapshot before
  new_value       TEXT,                    -- JSON snapshot after
  ip_address      TEXT,
  user_agent      TEXT,
  session_id      TEXT,
  severity        TEXT    DEFAULT 'info',  -- info | warning | critical
  created_at      TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS platform_health_checks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  check_name      TEXT    NOT NULL,
  status          TEXT    DEFAULT 'ok',   -- ok | degraded | down
  response_time_ms INTEGER,
  details         TEXT,                   -- JSON
  checked_at      TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────────────────
-- MODULE 10: GOD ADMIN MONITORING
-- Sensitive override and monitoring capabilities
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS god_admin_actions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id   INTEGER NOT NULL REFERENCES users(id),
  action_type     TEXT    NOT NULL,   -- override_workflow | force_approve | suspend_user | reset_session | delete_record | view_sensitive
  target_type     TEXT,
  target_id       INTEGER,
  justification   TEXT    NOT NULL,
  old_state       TEXT,   -- JSON snapshot
  new_state       TEXT,   -- JSON snapshot
  created_at      TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS executive_flags (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  flagged_by      INTEGER NOT NULL REFERENCES users(id),
  record_type     TEXT    NOT NULL,
  record_id       INTEGER NOT NULL,
  flag_reason     TEXT    NOT NULL,
  flag_type       TEXT    DEFAULT 'attention',  -- attention | escalation | risk | opportunity
  status          TEXT    DEFAULT 'open',        -- open | acknowledged | resolved
  acknowledged_by INTEGER REFERENCES users(id),
  acknowledged_at TEXT,
  resolution_note TEXT,
  created_at      TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────────────────
-- PHASE 3 INDEXES
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_requests_type       ON requests(request_type_id);
CREATE INDEX IF NOT EXISTS idx_requests_user       ON requests(requested_by_user_id);
CREATE INDEX IF NOT EXISTS idx_requests_status     ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_directorate ON requests(directorate_id);
CREATE INDEX IF NOT EXISTS idx_requests_submitted  ON requests(submitted_at);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_record ON workflow_runs(record_type, record_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_wf_run_steps_run    ON workflow_run_steps(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_wf_events_run       ON workflow_events(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_notif_deliveries_user ON notification_deliveries(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_notif_deliveries_read ON notification_deliveries(is_read);
CREATE INDEX IF NOT EXISTS idx_automation_runs_rule ON automation_runs(automation_rule_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_type      ON analytics_snapshots(snapshot_type);
CREATE INDEX IF NOT EXISTS idx_snapshots_scope     ON analytics_snapshots(scope_type, scope_value);
CREATE INDEX IF NOT EXISTS idx_snapshots_period    ON analytics_snapshots(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_src  ON knowledge_documents(knowledge_source_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_dir  ON knowledge_documents(directorate_id);
CREATE INDEX IF NOT EXISTS idx_accounts_owner      ON accounts(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_directorate ON accounts(directorate_id);
CREATE INDEX IF NOT EXISTS idx_accounts_status     ON accounts(status);
CREATE INDEX IF NOT EXISTS idx_engagement_account  ON engagement_logs(account_id);
CREATE INDEX IF NOT EXISTS idx_engagement_owner    ON engagement_logs(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_rel_edges_source    ON relationship_edges(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_rel_edges_target    ON relationship_edges(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_connector_syncs     ON connector_sync_runs(connector_source_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_actor ON platform_audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_module ON platform_audit_log(module);
CREATE INDEX IF NOT EXISTS idx_platform_audit_record ON platform_audit_log(record_type, record_id);
CREATE INDEX IF NOT EXISTS idx_reminders_remind    ON scheduled_reminders(remind_at);
CREATE INDEX IF NOT EXISTS idx_reminders_sent      ON scheduled_reminders(is_sent);
CREATE INDEX IF NOT EXISTS idx_leave_requests      ON leave_requests(request_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests     ON refund_requests(request_id);
CREATE INDEX IF NOT EXISTS idx_job_applications    ON job_applications(job_posting_id);
