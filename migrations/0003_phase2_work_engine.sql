-- ═══════════════════════════════════════════════════════════════
-- KBI Platform — Phase 2 Schema
-- Migration: 0003_phase2_work_engine.sql
-- Shared Work Engine: workspaces, work items, engagement,
-- approvals, activity, tags, saved views, exports
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- WORKSPACES
-- Each directorate can have multiple workspaces (boards/trackers)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  directorate_id    INTEGER REFERENCES directorates(id),
  name              TEXT    NOT NULL,
  code              TEXT    NOT NULL UNIQUE,          -- e.g. K1-STRAT, K4-PPM
  description       TEXT,
  workspace_type    TEXT    DEFAULT 'board',          -- board | tracker | calendar | register
  icon              TEXT    DEFAULT 'fas fa-layer-group',
  color             TEXT    DEFAULT '#4F46E5',
  status            TEXT    DEFAULT 'active',         -- active | archived
  default_view      TEXT    DEFAULT 'list',           -- list | kanban | gantt | calendar | card
  settings          TEXT,                             -- JSON: custom config per workspace
  created_by        INTEGER REFERENCES users(id),
  created_at        TEXT    DEFAULT (datetime('now')),
  updated_at        TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────
-- WORKSPACE MODULES (which modules are enabled per workspace)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_modules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  module_key    TEXT    NOT NULL,   -- comments | attachments | approvals | gantt | calendar
  is_enabled    INTEGER DEFAULT 1,
  config        TEXT,               -- JSON: module-level config
  UNIQUE(workspace_id, module_key)
);

-- ─────────────────────────────────────────────────────────────
-- WORKSPACE MEMBERS (who has access to each workspace)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  role          TEXT    DEFAULT 'member',  -- admin | lead | member | viewer
  added_by      INTEGER REFERENCES users(id),
  added_at      TEXT    DEFAULT (datetime('now')),
  UNIQUE(workspace_id, user_id)
);

-- ─────────────────────────────────────────────────────────────
-- WORK ITEM TYPES (configurable per workspace)
-- e.g. Task, Project, Campaign, Case, Decision, Grant, Contract
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_item_types (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  slug          TEXT,
  icon          TEXT    DEFAULT 'fas fa-circle',
  color         TEXT    DEFAULT '#6366F1',
  description   TEXT,
  sort_order    INTEGER DEFAULT 0
);

-- ─────────────────────────────────────────────────────────────
-- WORK ITEM STATUSES (per workspace, fully configurable)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_item_statuses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  slug          TEXT,
  color         TEXT    DEFAULT '#6B7280',
  category      TEXT    DEFAULT 'active',  -- backlog | active | review | done | cancelled
  sort_order    INTEGER DEFAULT 0,
  is_default    INTEGER DEFAULT 0,
  is_terminal   INTEGER DEFAULT 0          -- marks completed/cancelled states
);

-- ─────────────────────────────────────────────────────────────
-- WORK ITEM PRIORITIES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_item_priorities (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  slug       TEXT,
  color      TEXT DEFAULT '#6B7280',
  icon       TEXT DEFAULT '🏳️',
  level      INTEGER DEFAULT 0,  -- 0=none, 1=low, 2=medium, 3=high, 4=urgent
  sort_order INTEGER DEFAULT 0
);

-- ─────────────────────────────────────────────────────────────
-- WORK ITEMS  (the central shared record model)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_items (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  issued_id            TEXT,                              -- human-readable e.g. K1-042
  workspace_id         INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  work_item_type_id    INTEGER REFERENCES work_item_types(id),
  parent_id            INTEGER REFERENCES work_items(id), -- subtasks / sub-items
  title                TEXT    NOT NULL,
  description          TEXT,                              -- rich text / markdown
  status_id            INTEGER REFERENCES work_item_statuses(id),
  priority_id          INTEGER REFERENCES work_item_priorities(id),
  owner_user_id        INTEGER REFERENCES users(id),
  start_at             TEXT,
  due_at               TEXT,
  completed_at         TEXT,
  estimated_hours      REAL,
  actual_hours         REAL,
  progress_pct         INTEGER DEFAULT 0,                 -- 0–100
  visibility_type      TEXT    DEFAULT 'workspace',       -- workspace | directorate | platform | private
  custom_fields        TEXT,                              -- JSON: extensible field bag
  metadata             TEXT,                              -- JSON: module-specific data
  is_archived          INTEGER DEFAULT 0,
  created_by           INTEGER REFERENCES users(id),
  updated_by           INTEGER REFERENCES users(id),
  created_at           TEXT    DEFAULT (datetime('now')),
  updated_at           TEXT    DEFAULT (datetime('now')),
  archived_at          TEXT
);

-- ─────────────────────────────────────────────────────────────
-- WORK ITEM ASSIGNEES  (M:N — multiple people per item)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_item_assignees (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id    INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  assignment_role TEXT    DEFAULT 'assignee',  -- owner | assignee | reviewer | cc
  assigned_at     TEXT    DEFAULT (datetime('now')),
  assigned_by     INTEGER REFERENCES users(id),
  UNIQUE(work_item_id, user_id)
);

-- ─────────────────────────────────────────────────────────────
-- WORK ITEM TAGS  (tag catalog per workspace)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_item_tags (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  color        TEXT    DEFAULT '#6366F1',
  created_at   TEXT    DEFAULT (datetime('now')),
  UNIQUE(workspace_id, name)
);

-- ─────────────────────────────────────────────────────────────
-- WORK ITEM TAG LINKS  (M:N)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_item_tag_links (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id  INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  tag_id        INTEGER NOT NULL REFERENCES work_item_tags(id) ON DELETE CASCADE,
  UNIQUE(work_item_id, tag_id)
);

-- ─────────────────────────────────────────────────────────────
-- WORK ITEM COMMENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_item_comments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id  INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  body          TEXT    NOT NULL,
  is_edited     INTEGER DEFAULT 0,
  is_internal   INTEGER DEFAULT 0,  -- internal/team-only note
  parent_id     INTEGER REFERENCES work_item_comments(id), -- threaded replies
  created_at    TEXT    DEFAULT (datetime('now')),
  edited_at     TEXT
);

-- ─────────────────────────────────────────────────────────────
-- WORK ITEM ATTACHMENTS  (metadata; file lives in R2)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_item_attachments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id  INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  uploaded_by   INTEGER REFERENCES users(id),
  file_name     TEXT    NOT NULL,
  file_key      TEXT    NOT NULL UNIQUE,  -- R2 object key
  file_size     INTEGER,
  mime_type     TEXT,
  description   TEXT,
  created_at    TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────
-- WORK ITEM ACTIVITY  (full immutable event log per item)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_item_activity (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id  INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  actor_user_id INTEGER REFERENCES users(id),
  event_type    TEXT    NOT NULL,  -- created | status_changed | assigned | commented |
                                   -- attachment_added | field_updated | approval_requested |
                                   -- approved | rejected | archived
  old_value     TEXT,
  new_value     TEXT,
  field_name    TEXT,
  note          TEXT,
  created_at    TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────
-- WORK ITEM LINKS  (relationships between items)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_item_links (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id     INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  target_id     INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  link_type     TEXT    DEFAULT 'related',  -- related | blocks | blocked_by | duplicates | parent_of
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT    DEFAULT (datetime('now')),
  UNIQUE(source_id, target_id, link_type)
);

-- ─────────────────────────────────────────────────────────────
-- SAVED VIEWS  (per-user or per-workspace filter presets)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_views (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by    INTEGER REFERENCES users(id),
  name          TEXT    NOT NULL,
  view_type     TEXT    DEFAULT 'list',  -- list | kanban | gantt | calendar | card
  filters       TEXT,                   -- JSON: filter rules
  sort_by       TEXT,                   -- JSON: sort config
  group_by      TEXT,
  is_shared     INTEGER DEFAULT 0,      -- 1 = visible to all workspace members
  is_default    INTEGER DEFAULT 0,
  created_at    TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────
-- APPROVAL FLOWS  (configurable per workspace/type)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_flows (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  trigger_type  TEXT    DEFAULT 'manual',     -- manual | status_change | field_value
  trigger_value TEXT,                          -- e.g. status name that triggers
  record_type   TEXT    DEFAULT 'work_item',
  is_active     INTEGER DEFAULT 1,
  created_at    TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────
-- APPROVAL STEPS  (ordered steps within a flow)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_steps (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  approval_flow_id INTEGER NOT NULL REFERENCES approval_flows(id) ON DELETE CASCADE,
  step_order      INTEGER NOT NULL,
  name            TEXT    NOT NULL,
  approver_type   TEXT    DEFAULT 'role',     -- role | user | directorate_lead | god_admin
  approver_value  TEXT,                        -- role name or user_id
  is_required     INTEGER DEFAULT 1,
  timeout_hours   INTEGER DEFAULT 72,          -- auto-escalate after N hours
  UNIQUE(approval_flow_id, step_order)
);

-- ─────────────────────────────────────────────────────────────
-- APPROVAL INSTANCES  (one per triggered approval)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_instances (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  approval_flow_id      INTEGER NOT NULL REFERENCES approval_flows(id),
  work_item_id          INTEGER REFERENCES work_items(id) ON DELETE CASCADE,
  record_type           TEXT    DEFAULT 'work_item',
  record_id             INTEGER NOT NULL,
  current_step_order    INTEGER DEFAULT 1,
  status                TEXT    DEFAULT 'pending',  -- pending | approved | rejected | cancelled
  requested_by          INTEGER REFERENCES users(id),
  rationale             TEXT,
  created_at            TEXT    DEFAULT (datetime('now')),
  closed_at             TEXT,
  updated_at            TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────
-- APPROVAL INSTANCE ACTIONS  (each step decision)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_instance_actions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  approval_instance_id INTEGER NOT NULL REFERENCES approval_instances(id) ON DELETE CASCADE,
  step_order          INTEGER NOT NULL,
  actor_user_id       INTEGER REFERENCES users(id),
  action              TEXT    NOT NULL,   -- approved | rejected | delegated | escalated
  rationale           TEXT,
  acted_at            TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────
-- NOTIFICATION JOBS  (async notifications queue)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_jobs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_id  INTEGER REFERENCES users(id),
  type          TEXT    NOT NULL,   -- approval_request | item_assigned | comment_mention | reminder
  title         TEXT,
  body          TEXT,
  payload       TEXT,               -- JSON: context data
  is_read       INTEGER DEFAULT 0,
  created_at    TEXT    DEFAULT (datetime('now')),
  read_at       TEXT
);

-- ─────────────────────────────────────────────────────────────
-- EXPORT JOBS  (track CSV/XLSX export requests)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS export_jobs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  INTEGER REFERENCES workspaces(id),
  requested_by  INTEGER REFERENCES users(id),
  status        TEXT    DEFAULT 'pending',  -- pending | processing | done | failed
  format        TEXT    DEFAULT 'csv',
  filters       TEXT,                       -- JSON: applied filters
  file_key      TEXT,                       -- R2 key when done
  row_count     INTEGER,
  error_msg     TEXT,
  created_at    TEXT    DEFAULT (datetime('now')),
  completed_at  TEXT
);

-- ─────────────────────────────────────────────────────────────
-- PHASE 2 INDEXES
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_work_items_workspace    ON work_items(workspace_id);
CREATE INDEX IF NOT EXISTS idx_work_items_status       ON work_items(status_id);
CREATE INDEX IF NOT EXISTS idx_work_items_owner        ON work_items(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_work_items_due          ON work_items(due_at);
CREATE INDEX IF NOT EXISTS idx_work_items_created      ON work_items(created_at);
CREATE INDEX IF NOT EXISTS idx_work_items_parent       ON work_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_work_items_archived     ON work_items(is_archived);
CREATE INDEX IF NOT EXISTS idx_assignees_item          ON work_item_assignees(work_item_id);
CREATE INDEX IF NOT EXISTS idx_assignees_user          ON work_item_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_item           ON work_item_comments(work_item_id);
CREATE INDEX IF NOT EXISTS idx_activity_item           ON work_item_activity(work_item_id);
CREATE INDEX IF NOT EXISTS idx_activity_actor          ON work_item_activity(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_attachments_item        ON work_item_attachments(work_item_id);
CREATE INDEX IF NOT EXISTS idx_tag_links_item          ON work_item_tag_links(work_item_id);
CREATE INDEX IF NOT EXISTS idx_tag_links_tag           ON work_item_tag_links(tag_id);
CREATE INDEX IF NOT EXISTS idx_approval_instances_item ON approval_instances(work_item_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notification_jobs(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read      ON notification_jobs(is_read);
CREATE INDEX IF NOT EXISTS idx_workspace_members_ws    ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user  ON workspace_members(user_id);
