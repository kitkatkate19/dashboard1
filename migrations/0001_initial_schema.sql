-- KBI Internal Operations Platform — Phase 1 Schema
-- Migration: 0001_initial_schema.sql

-- ─────────────────────────────────────────────────
-- DIRECTORATES (K1–K7)
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS directorates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT    NOT NULL UNIQUE, -- e.g. K1, K2
  name        TEXT    NOT NULL,
  description TEXT,
  color       TEXT    DEFAULT '#4F46E5',
  is_active   INTEGER DEFAULT 1,
  created_at  TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────
-- ROLES
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,   -- god_admin, platform_admin, directorate_lead, team_lead, standard_user, volunteer, read_only, new_joiner
  label       TEXT    NOT NULL,
  description TEXT,
  scope       TEXT    DEFAULT 'platform', -- platform | directorate | team
  created_at  TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────
-- USERS (Identity Records)
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT    NOT NULL UNIQUE,
  google_subject TEXT    UNIQUE,                   -- Google OAuth sub claim
  display_name   TEXT,
  avatar_url     TEXT,
  status         TEXT    DEFAULT 'pending',        -- pending | active | suspended | rejected
  is_god_admin   INTEGER DEFAULT 0,
  last_login_at  TEXT,
  created_at     TEXT    DEFAULT (datetime('now')),
  updated_at     TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────
-- PEOPLE PROFILES (Human-facing data)
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS people_profiles (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  preferred_name    TEXT,
  kbi_title         TEXT,
  department        TEXT,
  location          TEXT,
  bio               TEXT,
  phone             TEXT,
  linkedin_url      TEXT,
  timezone          TEXT    DEFAULT 'UTC',
  start_date        TEXT,
  manager_user_id   INTEGER REFERENCES users(id),
  education         TEXT,    -- JSON string: [{institution, degree, year}]
  experience        TEXT,    -- JSON string: [{company, role, years}]
  skills            TEXT,    -- JSON string: [string]
  pronouns          TEXT,
  is_profile_public INTEGER DEFAULT 1,
  profile_photo_key TEXT,    -- R2 object key
  created_at        TEXT    DEFAULT (datetime('now')),
  updated_at        TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────
-- USER ROLES (M:N)
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_roles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id      INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by  INTEGER REFERENCES users(id),
  assigned_at  TEXT    DEFAULT (datetime('now')),
  UNIQUE(user_id, role_id)
);

-- ─────────────────────────────────────────────────
-- USER DIRECTORATES (Approved memberships)
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_directorates (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  directorate_id   INTEGER NOT NULL REFERENCES directorates(id) ON DELETE CASCADE,
  approval_source  TEXT    DEFAULT 'manual',  -- auto | manual | google_sync
  approved_by      INTEGER REFERENCES users(id),
  approved_at      TEXT    DEFAULT (datetime('now')),
  is_primary       INTEGER DEFAULT 0,
  UNIQUE(user_id, directorate_id)
);

-- ─────────────────────────────────────────────────
-- DIRECTORATE REQUESTS (Pending signup)
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS directorate_requests (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  directorate_id INTEGER NOT NULL REFERENCES directorates(id),
  status         TEXT    DEFAULT 'pending',   -- pending | approved | rejected
  reason         TEXT,
  reviewed_by    INTEGER REFERENCES users(id),
  reviewed_at    TEXT,
  created_at     TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────
-- TEAMS
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  directorate_id INTEGER REFERENCES directorates(id),
  lead_user_id   INTEGER REFERENCES users(id),
  description    TEXT,
  is_active      INTEGER DEFAULT 1,
  created_at     TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────
-- TEAM MEMBERSHIPS (M:N)
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_memberships (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id     INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT    DEFAULT 'member',  -- lead | member
  joined_at   TEXT    DEFAULT (datetime('now')),
  UNIQUE(team_id, user_id)
);

-- ─────────────────────────────────────────────────
-- ORG UNITS (Hierarchical structure)
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_units (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  parent_id      INTEGER REFERENCES org_units(id),
  directorate_id INTEGER REFERENCES directorates(id),
  head_user_id   INTEGER REFERENCES users(id),
  level          INTEGER DEFAULT 0,
  created_at     TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────
-- REPORTING LINES
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reporting_lines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reports_to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, reports_to_id)
);

-- ─────────────────────────────────────────────────
-- ANNOUNCEMENTS
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT    NOT NULL,
  body           TEXT,
  author_id      INTEGER REFERENCES users(id),
  directorate_id INTEGER REFERENCES directorates(id),  -- NULL = platform-wide
  is_pinned      INTEGER DEFAULT 0,
  is_published   INTEGER DEFAULT 1,
  published_at   TEXT    DEFAULT (datetime('now')),
  expires_at     TEXT,
  created_at     TEXT    DEFAULT (datetime('now')),
  updated_at     TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────
-- KNOWLEDGE ARTICLES (Guides)
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_articles (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT    NOT NULL,
  slug           TEXT    NOT NULL UNIQUE,
  content        TEXT,   -- Markdown
  category       TEXT    DEFAULT 'general',
  author_id      INTEGER REFERENCES users(id),
  directorate_id INTEGER REFERENCES directorates(id),
  tags           TEXT,   -- JSON string
  is_published   INTEGER DEFAULT 1,
  view_count     INTEGER DEFAULT 0,
  created_at     TEXT    DEFAULT (datetime('now')),
  updated_at     TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────
-- BRAND RESOURCES
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brand_resources (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  description  TEXT,
  category     TEXT    DEFAULT 'general',   -- logo | font | template | color_palette | icon
  file_key     TEXT,    -- R2 key
  file_url     TEXT,
  file_size    INTEGER,
  mime_type    TEXT,
  version      TEXT    DEFAULT '1.0',
  uploaded_by  INTEGER REFERENCES users(id),
  is_active    INTEGER DEFAULT 1,
  created_at   TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────
-- EVENTS (KBI Calendar)
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT    NOT NULL,
  description    TEXT,
  location       TEXT,
  start_at       TEXT    NOT NULL,
  end_at         TEXT,
  all_day        INTEGER DEFAULT 0,
  event_type     TEXT    DEFAULT 'general',   -- general | directorate | chapter | collaboration
  directorate_id INTEGER REFERENCES directorates(id),
  created_by     INTEGER REFERENCES users(id),
  google_event_id TEXT,
  is_published   INTEGER DEFAULT 1,
  created_at     TEXT    DEFAULT (datetime('now')),
  updated_at     TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────
-- EVENT VISIBILITY RULES
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_visibility_rules (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id       INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  visibility     TEXT    DEFAULT 'all',  -- all | role | directorate
  role_id        INTEGER REFERENCES roles(id),
  directorate_id INTEGER REFERENCES directorates(id)
);

-- ─────────────────────────────────────────────────
-- QUICK LINKS
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quick_links (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT    NOT NULL,
  url            TEXT    NOT NULL,
  icon           TEXT,
  category       TEXT    DEFAULT 'general',
  directorate_id INTEGER REFERENCES directorates(id),  -- NULL = platform-wide
  created_by     INTEGER REFERENCES users(id),
  sort_order     INTEGER DEFAULT 0,
  is_active      INTEGER DEFAULT 1,
  created_at     TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────
-- AUDIT LOGS
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id     INTEGER REFERENCES users(id),
  action       TEXT    NOT NULL,  -- e.g. user.approved, role.assigned, user.suspended
  target_type  TEXT,              -- user | directorate | role | event
  target_id    INTEGER,
  metadata     TEXT,              -- JSON
  ip_address   TEXT,
  user_agent   TEXT,
  created_at   TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────
-- APPROVAL ACTIONS
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_actions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  request_type TEXT    NOT NULL,  -- directorate_join | user_activation | role_request
  request_id   INTEGER NOT NULL,
  action       TEXT    NOT NULL,  -- approved | rejected
  acted_by     INTEGER REFERENCES users(id),
  note         TEXT,
  acted_at     TEXT    DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status         ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_google_subject ON users(google_subject);
CREATE INDEX IF NOT EXISTS idx_user_roles_user      ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_dir_user        ON user_directorates(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor     ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created   ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_events_start         ON events(start_at);
CREATE INDEX IF NOT EXISTS idx_announcements_dir    ON announcements(directorate_id);
