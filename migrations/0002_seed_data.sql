-- KBI Platform — Seed Data
-- Migration: 0002_seed_data.sql

-- ─────────────────────────────────────────────────
-- DIRECTORATES (K1–K7)
-- ─────────────────────────────────────────────────
INSERT OR IGNORE INTO directorates (code, name, description, color) VALUES
  ('K1', 'Strategy & Governance',      'Overall strategy, governance, and policy direction',              '#4F46E5'),
  ('K2', 'Technology & Innovation',    'Technical infrastructure, innovation programmes',                 '#0891B2'),
  ('K3', 'People & Culture',           'HR, talent, wellbeing, and cultural programmes',                  '#059669'),
  ('K4', 'Finance & Operations',       'Financial management and operational efficiency',                 '#D97706'),
  ('K5', 'Partnerships & Outreach',    'External partnerships, community, and outreach',                  '#DC2626'),
  ('K6', 'Research & Knowledge',       'Research initiatives, publications, knowledge management',        '#7C3AED'),
  ('K7', 'Communications & Brand',     'Internal/external comms, brand, and marketing',                   '#DB2777');

-- ─────────────────────────────────────────────────
-- ROLES
-- ─────────────────────────────────────────────────
INSERT OR IGNORE INTO roles (name, label, description, scope) VALUES
  ('god_admin',          'God Admin',        'Full platform control, can assign all roles and manage exceptions',  'platform'),
  ('platform_admin',     'Platform Admin',   'Manages content and settings, cannot assign God Admins',            'platform'),
  ('directorate_lead',   'Directorate Lead', 'Manages one or more directorates homepage modules',                 'directorate'),
  ('team_lead',          'Team Lead',        'Manages specific team visibility',                                  'team'),
  ('standard_user',      'Standard User',    'Access to homepage, directory, org chart, and approved pages',      'platform'),
  ('volunteer',          'Volunteer/Intern', 'Restricted visibility based on specific policies',                  'platform'),
  ('read_only',          'Read Only',        'Cross-view access without edit permissions',                        'platform'),
  ('executive',          'Executive',        'Executive read-only cross-directorate access',                      'platform'),
  ('new_joiner',         'New Joiner',       'Guided onboarding-first layout',                                    'platform');

-- ─────────────────────────────────────────────────
-- SAMPLE KNOWLEDGE ARTICLES
-- ─────────────────────────────────────────────────
INSERT OR IGNORE INTO knowledge_articles (title, slug, content, category, tags) VALUES
  ('Getting Started with KBI Platform', 'getting-started',
   '# Welcome to the KBI Internal Operations Platform\n\nThis guide will walk you through the key features available to you.\n\n## Your Profile\nUpdate your profile by navigating to **My Profile** in the top navigation.\n\n## People Directory\nFind colleagues across directorates using the **People Directory**.\n\n## Calendar\nView and manage KBI events in the **Calendar** section.\n\n## Getting Help\nContact your directorate lead or raise a support request via the admin panel.',
   'onboarding', '["onboarding","getting-started"]'),
  ('Platform Security & Access Policy', 'security-policy',
   '# KBI Platform Security Policy\n\nAll access to the KBI Internal Operations Platform is protected by Google SSO.\n\n## Access Rules\n- Only @kb.institute email addresses are permitted\n- Sessions expire after 8 hours of inactivity\n- All actions are logged in the audit trail\n\n## Reporting Issues\nReport any security concerns immediately to the God Admin.',
   'policy', '["security","policy","access"]'),
  ('How to Request Directorate Access', 'request-directorate-access',
   '# Requesting Directorate Access\n\nTo join a directorate:\n1. Go to **My Profile → Directorate Membership**\n2. Select your target directorate\n3. Submit your request with a reason\n4. Wait for approval from your Directorate Lead or God Admin\n\n## Auto-Approval\nIf your Google Workspace group matches the directorate, approval is automatic.',
   'access', '["access","directorate","membership"]');

-- ─────────────────────────────────────────────────
-- SAMPLE QUICK LINKS
-- ─────────────────────────────────────────────────
INSERT OR IGNORE INTO quick_links (title, url, icon, category, sort_order) VALUES
  ('Google Workspace',  'https://workspace.google.com',    'fab fa-google',       'productivity', 1),
  ('GitHub',            'https://github.com/kbi-internal',  'fab fa-github',       'development',  2),
  ('Notion',            'https://notion.so',                'fas fa-file-alt',     'productivity', 3),
  ('Slack',             'https://slack.com',                'fab fa-slack',        'communication',4),
  ('Figma',             'https://figma.com',                'fab fa-figma',        'design',       5);
