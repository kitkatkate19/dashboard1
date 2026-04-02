-- migrations/0004_phase2_seed.sql
-- Phase 2 seed: K1-K7 workspaces, modules, types, statuses, priorities, and sample items

-- ── Workspaces (one per directorate + sub-boards) ──────────────────────────────

INSERT OR IGNORE INTO workspaces (id, directorate_id, name, code, description, workspace_type, icon, color, status, default_view) VALUES
-- K1 Strategy
(1,  1, 'K1 Priority Tracker',           'K1-PRIOR',  'Strategic priorities and OKRs',                  'board',    '🎯', '#6366f1', 'active', 'list'),
(2,  1, 'K1 Decision Log',               'K1-DLOG',   'Leadership decision records',                    'board',    '📋', '#6366f1', 'active', 'list'),
(3,  1, 'K1 Strategic Programme',        'K1-PROG',   'Multi-year programme tracker with Gantt',        'board',    '📊', '#6366f1', 'active', 'gantt'),
(4,  1, 'K1 Metrics Register',           'K1-METR',   'KPIs and performance metrics',                   'board',    '📈', '#6366f1', 'active', 'list'),
-- K2 Corporate
(5,  2, 'K2 Admin Tracker',              'K2-ADMIN',  'Administrative tasks and compliance',            'board',    '🏢', '#0ea5e9', 'active', 'kanban'),
(6,  2, 'K2 Approval Management',        'K2-APPROV', 'Approval requests and sign-offs',               'board',    '✅', '#0ea5e9', 'active', 'kanban'),
(7,  2, 'K2 Financial Tracker',          'K2-FIN',    'Budget, grants and financial items',             'board',    '💰', '#0ea5e9', 'active', 'list'),
(8,  2, 'K2 Contract Lifecycle',         'K2-CONT',   'Contracts and legal document lifecycle',         'board',    '📄', '#0ea5e9', 'active', 'list'),
-- K3 Communications
(9,  3, 'K3 Communication Tracker',      'K3-COMM',   'Internal and external communications',          'board',    '📢', '#f59e0b', 'active', 'list'),
(10, 3, 'K3 Campaign Board',             'K3-CAMP',   'Campaign planning and execution',               'board',    '🚀', '#f59e0b', 'active', 'kanban'),
(11, 3, 'K3 Content Calendar',           'K3-CONT',   'Editorial and content publishing schedule',     'board',    '📅', '#f59e0b', 'active', 'calendar'),
(12, 3, 'K3 Idea Backlog',               'K3-IDEA',   'Communication and campaign ideas',              'board',    '💡', '#f59e0b', 'active', 'list'),
-- K4 Innovation
(13, 4, 'K4 Project Board',              'K4-PROJ',   'Innovation projects and initiatives',           'board',    '⚡', '#10b981', 'active', 'kanban'),
(14, 4, 'K4 Product Tracker',            'K4-PROD',   'Product roadmap and feature backlog',           'board',    '📦', '#10b981', 'active', 'list'),
(15, 4, 'K4 Release Calendar',           'K4-REL',    'Release schedule and milestones',               'board',    '🗓️', '#10b981', 'active', 'calendar'),
(16, 4, 'K4 Implementation Roadmap',     'K4-ROAD',   'Implementation timeline and dependencies',      'board',    '🗺️', '#10b981', 'active', 'gantt'),
-- K5 Education
(17, 5, 'K5 Programme Delivery',         'K5-PROG',   'Education programme delivery board',            'board',    '🎓', '#ec4899', 'active', 'kanban'),
(18, 5, 'K5 Curriculum Tracker',         'K5-CURR',   'Curriculum design and review',                  'board',    '📚', '#ec4899', 'active', 'list'),
(19, 5, 'K5 Training Calendar',          'K5-TRAIN',  'Training sessions and workshops schedule',      'board',    '🏫', '#ec4899', 'active', 'calendar'),
(20, 5, 'K5 Facilitator Roster',         'K5-FACIL',  'Facilitator assignments and availability',      'board',    '👩‍🏫', '#ec4899', 'active', 'list'),
-- K6 Collaboration
(21, 6, 'K6 Partner Tracker',            'K6-PART',   'Key accounts and partner relationships',        'board',    '🤝', '#8b5cf6', 'active', 'list'),
(22, 6, 'K6 Engagement Tracker',         'K6-ENGAG',  'Stakeholder engagement activities',             'board',    '💬', '#8b5cf6', 'active', 'kanban'),
(23, 6, 'K6 Sales Tracker',              'K6-SALES',  'Sales pipeline and opportunities',              'board',    '💹', '#8b5cf6', 'active', 'kanban'),
-- K7 Operations
(24, 7, 'K7 Event Management',           'K7-EVENT',  'Events planning and operations board',          'board',    '🎪', '#ef4444', 'active', 'kanban'),
(25, 7, 'K7 Digital Systems',            'K7-DIGIT',  'Digital tools and systems management',          'board',    '💻', '#ef4444', 'active', 'list'),
(26, 7, 'K7 Talent & People Admin',      'K7-TALNT',  'Recruitment, onboarding, HR admin',            'board',    '👥', '#ef4444', 'active', 'list'),
(27, 7, 'K7 Office Admin',               'K7-OFFIC',  'Office operations and facilities',              'board',    '🏠', '#ef4444', 'active', 'list');

-- ── Enable default modules for all workspaces ──────────────────────────────────

INSERT OR IGNORE INTO workspace_modules (workspace_id, module_key, is_enabled) 
SELECT id, 'comments',    1 FROM workspaces;

INSERT OR IGNORE INTO workspace_modules (workspace_id, module_key, is_enabled) 
SELECT id, 'attachments', 1 FROM workspaces;

INSERT OR IGNORE INTO workspace_modules (workspace_id, module_key, is_enabled) 
SELECT id, 'activity',    1 FROM workspaces;

INSERT OR IGNORE INTO workspace_modules (workspace_id, module_key, is_enabled) 
SELECT id, 'tags',        1 FROM workspaces;

-- Enable Gantt for Gantt-default workspaces
INSERT OR IGNORE INTO workspace_modules (workspace_id, module_key, is_enabled) VALUES
(3,  'gantt',    1),
(16, 'gantt',    1);

-- Enable Calendar for calendar-default workspaces
INSERT OR IGNORE INTO workspace_modules (workspace_id, module_key, is_enabled) VALUES
(11, 'calendar', 1),
(15, 'calendar', 1),
(19, 'calendar', 1);

-- Enable approvals for approval-focused workspaces
INSERT OR IGNORE INTO workspace_modules (workspace_id, module_key, is_enabled) VALUES
(6,  'approvals', 1),
(7,  'approvals', 1),
(8,  'approvals', 1);

-- ── Work Item Types (per directorate pattern) ──────────────────────────────────

-- Generic types seeded for every workspace
INSERT OR IGNORE INTO work_item_types (workspace_id, name, slug, icon, color, description) 
SELECT id, 'Task',        'task',        '✅', '#6366f1', 'A standard task or to-do item'   FROM workspaces;
INSERT OR IGNORE INTO work_item_types (workspace_id, name, slug, icon, color, description) 
SELECT id, 'Issue',       'issue',       '🐛', '#ef4444', 'A problem or bug to resolve'      FROM workspaces;
INSERT OR IGNORE INTO work_item_types (workspace_id, name, slug, icon, color, description) 
SELECT id, 'Milestone',   'milestone',   '🏁', '#10b981', 'A key deliverable or checkpoint'  FROM workspaces;

-- K1 specific types
INSERT OR IGNORE INTO work_item_types (workspace_id, name, slug, icon, color, description) VALUES
(1,  'Priority',        'priority',   '🎯', '#6366f1', 'Strategic priority item'),
(2,  'Decision',        'decision',   '⚖️', '#6366f1', 'A recorded decision'),
(3,  'Programme',       'programme',  '📊', '#6366f1', 'Strategic programme'),
(4,  'KPI',             'kpi',        '📈', '#6366f1', 'Key performance indicator');

-- K2 specific types
INSERT OR IGNORE INTO work_item_types (workspace_id, name, slug, icon, color, description) VALUES
(5,  'Admin Task',      'admin-task', '🏢', '#0ea5e9', 'Administrative task'),
(6,  'Approval',        'approval',   '✅', '#0ea5e9', 'Approval request'),
(7,  'Budget Item',     'budget',     '💰', '#0ea5e9', 'Budget or financial item'),
(8,  'Contract',        'contract',   '📄', '#0ea5e9', 'Contract record');

-- K3 specific types
INSERT OR IGNORE INTO work_item_types (workspace_id, name, slug, icon, color, description) VALUES
(9,  'Communication',   'comms',      '📢', '#f59e0b', 'Communication item'),
(10, 'Campaign',        'campaign',   '🚀', '#f59e0b', 'Campaign item'),
(11, 'Content Piece',   'content',    '✍️', '#f59e0b', 'Content to publish'),
(12, 'Idea',            'idea',       '💡', '#f59e0b', 'Creative idea');

-- K4 specific types
INSERT OR IGNORE INTO work_item_types (workspace_id, name, slug, icon, color, description) VALUES
(13, 'Project',         'project',    '⚡', '#10b981', 'Innovation project'),
(14, 'Feature',         'feature',    '📦', '#10b981', 'Product feature'),
(15, 'Release',         'release',    '🗓️', '#10b981', 'Product release'),
(16, 'Epic',            'epic',       '🗺️', '#10b981', 'Large implementation epic');

-- K5 specific types
INSERT OR IGNORE INTO work_item_types (workspace_id, name, slug, icon, color, description) VALUES
(17, 'Programme',       'edu-prog',   '🎓', '#ec4899', 'Education programme'),
(18, 'Module',          'module',     '📚', '#ec4899', 'Curriculum module'),
(19, 'Training Session','session',    '🏫', '#ec4899', 'Training session'),
(20, 'Facilitator',     'facilitator','👩‍🏫','#ec4899', 'Facilitator record');

-- K6 specific types
INSERT OR IGNORE INTO work_item_types (workspace_id, name, slug, icon, color, description) VALUES
(21, 'Partner',         'partner',    '🤝', '#8b5cf6', 'Partner / key account'),
(22, 'Engagement',      'engagement', '💬', '#8b5cf6', 'Engagement record'),
(23, 'Opportunity',     'opportunity','💹', '#8b5cf6', 'Sales opportunity');

-- K7 specific types
INSERT OR IGNORE INTO work_item_types (workspace_id, name, slug, icon, color, description) VALUES
(24, 'Event',           'event',      '🎪', '#ef4444', 'Managed event'),
(25, 'System',          'system',     '💻', '#ef4444', 'Digital system or tool'),
(26, 'Hire',            'hire',       '👥', '#ef4444', 'Recruitment item'),
(27, 'Facility',        'facility',   '🏠', '#ef4444', 'Office facility item');

-- ── Statuses (universal set, inserted for each workspace) ─────────────────────

INSERT OR IGNORE INTO work_item_statuses (workspace_id, name, slug, color, category, sort_order)
SELECT id, 'Backlog',     'backlog',     '#94a3b8', 'todo',        1 FROM workspaces;
INSERT OR IGNORE INTO work_item_statuses (workspace_id, name, slug, color, category, sort_order)
SELECT id, 'To Do',       'todo',        '#64748b', 'todo',        2 FROM workspaces;
INSERT OR IGNORE INTO work_item_statuses (workspace_id, name, slug, color, category, sort_order)
SELECT id, 'In Progress', 'in-progress', '#3b82f6', 'in_progress', 3 FROM workspaces;
INSERT OR IGNORE INTO work_item_statuses (workspace_id, name, slug, color, category, sort_order)
SELECT id, 'In Review',   'in-review',   '#f59e0b', 'in_progress', 4 FROM workspaces;
INSERT OR IGNORE INTO work_item_statuses (workspace_id, name, slug, color, category, sort_order)
SELECT id, 'Blocked',     'blocked',     '#ef4444', 'in_progress', 5 FROM workspaces;
INSERT OR IGNORE INTO work_item_statuses (workspace_id, name, slug, color, category, sort_order)
SELECT id, 'Done',        'done',        '#10b981', 'done',        6 FROM workspaces;
INSERT OR IGNORE INTO work_item_statuses (workspace_id, name, slug, color, category, sort_order)
SELECT id, 'Cancelled',   'cancelled',   '#6b7280', 'cancelled',   7 FROM workspaces;

-- ── Priorities (universal set — global, not per workspace) ───────────────────

INSERT OR IGNORE INTO work_item_priorities (name, slug, color, icon, level, sort_order) VALUES
  ('Critical', 'critical', '#dc2626', '🔴', 4, 1),
  ('High',     'high',     '#f97316', '🟠', 3, 2),
  ('Medium',   'medium',   '#eab308', '🟡', 2, 3),
  ('Low',      'low',      '#22c55e', '🟢', 1, 4),
  ('None',     'none',     '#9ca3af', '⚪', 0, 5);

-- ── Tags (sample tags per directorate) ────────────────────────────────────────

INSERT OR IGNORE INTO work_item_tags (workspace_id, name, color) VALUES
(1, 'Q1', '#6366f1'), (1, 'Q2', '#8b5cf6'), (1, 'Q3', '#a78bfa'), (1, 'Q4', '#c4b5fd'),
(1, 'OKR', '#4338ca'), (1, 'Urgent', '#ef4444'),
(5, 'Compliance', '#0ea5e9'), (5, 'Finance', '#0284c7'), (5, 'Legal', '#075985'),
(9, 'Social', '#f59e0b'), (9, 'Email', '#d97706'), (9, 'Web', '#92400e'),
(13, 'MVP', '#10b981'), (13, 'R&D', '#059669'), (13, 'Prototype', '#047857'),
(17, 'Online', '#ec4899'), (17, 'In-Person', '#db2777'), (17, 'Hybrid', '#be185d'),
(21, 'Government', '#8b5cf6'), (21, 'NGO', '#7c3aed'), (21, 'Private', '#6d28d9'),
(24, 'External', '#ef4444'), (24, 'Internal', '#dc2626'), (24, 'Virtual', '#b91c1c');

-- ── Approval Flows (sample flows for K2) ──────────────────────────────────────

INSERT OR IGNORE INTO approval_flows (id, workspace_id, name, trigger_type, is_active) VALUES
(1, 6, 'Standard Approval', 'manual', 1),
(2, 7, 'Finance Approval',  'manual', 1),
(3, 8, 'Contract Approval', 'manual', 1);

INSERT OR IGNORE INTO approval_steps (approval_flow_id, step_order, name, approver_type, approver_value, timeout_hours) VALUES
(1, 1, 'Line Manager Review', 'role', 'team_lead',        48),
(1, 2, 'Director Sign-off',   'role', 'directorate_lead', 72),
(2, 1, 'Finance Review',      'role', 'team_lead',        48),
(2, 2, 'Director Approval',   'role', 'directorate_lead', 72),
(2, 3, 'God Admin Final',     'role', 'god_admin',        96),
(3, 1, 'Legal Review',        'role', 'team_lead',        72),
(3, 2, 'Director Sign-off',   'role', 'directorate_lead', 72);

-- ── Sample Work Items (a few per workspace for demo) ──────────────────────────
-- Note: created_by references users(id); user id=1 is the seeded god admin
-- Priority is global (no workspace_id); status is per workspace

-- K1 Priority Tracker items
INSERT OR IGNORE INTO work_items (workspace_id, issued_id, work_item_type_id, title, description, status_id, priority_id)
SELECT 1, 'K1PRIOR-001', wit.id, 'Define Annual OKRs', 'Set and agree organisational objectives for the year', ws.id, wp.id
FROM work_item_types wit, work_item_statuses ws, work_item_priorities wp
WHERE wit.workspace_id=1 AND wit.slug='priority' AND ws.workspace_id=1 AND ws.slug='in-progress' AND wp.slug='critical'
LIMIT 1;

INSERT OR IGNORE INTO work_items (workspace_id, issued_id, work_item_type_id, title, description, status_id, priority_id)
SELECT 1, 'K1PRIOR-002', wit.id, 'Board Strategy Review', 'Quarterly review of strategic priorities with board', ws.id, wp.id
FROM work_item_types wit, work_item_statuses ws, work_item_priorities wp
WHERE wit.workspace_id=1 AND wit.slug='priority' AND ws.workspace_id=1 AND ws.slug='todo' AND wp.slug='high'
LIMIT 1;

-- K2 Admin Tracker items
INSERT OR IGNORE INTO work_items (workspace_id, issued_id, work_item_type_id, title, description, status_id, priority_id)
SELECT 5, 'K2ADMIN-001', wit.id, 'Annual Compliance Audit', 'Complete annual regulatory compliance review', ws.id, wp.id
FROM work_item_types wit, work_item_statuses ws, work_item_priorities wp
WHERE wit.workspace_id=5 AND wit.slug='admin-task' AND ws.workspace_id=5 AND ws.slug='in-progress' AND wp.slug='critical'
LIMIT 1;

INSERT OR IGNORE INTO work_items (workspace_id, issued_id, work_item_type_id, title, description, status_id, priority_id)
SELECT 7, 'K2FIN-001', wit.id, 'Q1 Budget Review', 'Review and reconcile Q1 expenditure against budget', ws.id, wp.id
FROM work_item_types wit, work_item_statuses ws, work_item_priorities wp
WHERE wit.workspace_id=7 AND wit.slug='budget' AND ws.workspace_id=7 AND ws.slug='in-review' AND wp.slug='high'
LIMIT 1;

-- K3 Campaign Board items
INSERT OR IGNORE INTO work_items (workspace_id, issued_id, work_item_type_id, title, description, status_id, priority_id)
SELECT 10, 'K3CAMP-001', wit.id, 'Annual Report Campaign', 'Design and launch annual report communications campaign', ws.id, wp.id
FROM work_item_types wit, work_item_statuses ws, work_item_priorities wp
WHERE wit.workspace_id=10 AND wit.slug='campaign' AND ws.workspace_id=10 AND ws.slug='in-progress' AND wp.slug='high'
LIMIT 1;

-- K4 Project Board items
INSERT OR IGNORE INTO work_items (workspace_id, issued_id, work_item_type_id, title, description, status_id, priority_id)
SELECT 13, 'K4PROJ-001', wit.id, 'Platform v2 Development', 'Build next generation internal platform features', ws.id, wp.id
FROM work_item_types wit, work_item_statuses ws, work_item_priorities wp
WHERE wit.workspace_id=13 AND wit.slug='project' AND ws.workspace_id=13 AND ws.slug='in-progress' AND wp.slug='critical'
LIMIT 1;

-- K5 Programme Delivery items
INSERT OR IGNORE INTO work_items (workspace_id, issued_id, work_item_type_id, title, description, status_id, priority_id)
SELECT 17, 'K5PROG-001', wit.id, 'Leadership Cohort 2024', 'Deliver the 2024 leadership development programme', ws.id, wp.id
FROM work_item_types wit, work_item_statuses ws, work_item_priorities wp
WHERE wit.workspace_id=17 AND wit.slug='edu-prog' AND ws.workspace_id=17 AND ws.slug='in-progress' AND wp.slug='high'
LIMIT 1;

-- K6 Partner Tracker items
INSERT OR IGNORE INTO work_items (workspace_id, issued_id, work_item_type_id, title, description, status_id, priority_id)
SELECT 21, 'K6PART-001', wit.id, 'Ministry of Education MOU', 'Renew Memorandum of Understanding with MoE', ws.id, wp.id
FROM work_item_types wit, work_item_statuses ws, work_item_priorities wp
WHERE wit.workspace_id=21 AND wit.slug='partner' AND ws.workspace_id=21 AND ws.slug='in-review' AND wp.slug='high'
LIMIT 1;

-- K7 Event Management items
INSERT OR IGNORE INTO work_items (workspace_id, issued_id, work_item_type_id, title, description, status_id, priority_id)
SELECT 24, 'K7EVENT-001', wit.id, 'KBI Annual Summit 2024', 'Plan and deliver the annual KBI leadership summit', ws.id, wp.id
FROM work_item_types wit, work_item_statuses ws, work_item_priorities wp
WHERE wit.workspace_id=24 AND wit.slug='event' AND ws.workspace_id=24 AND ws.slug='in-progress' AND wp.slug='critical'
LIMIT 1;

INSERT OR IGNORE INTO work_items (workspace_id, issued_id, work_item_type_id, title, description, status_id, priority_id)
SELECT 25, 'K7DIGIT-001', wit.id, 'CRM System Upgrade', 'Evaluate and upgrade the organisation CRM platform', ws.id, wp.id
FROM work_item_types wit, work_item_statuses ws, work_item_priorities wp
WHERE wit.workspace_id=25 AND wit.slug='system' AND ws.workspace_id=25 AND ws.slug='todo' AND wp.slug='medium'
LIMIT 1;

