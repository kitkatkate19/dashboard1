-- ═══════════════════════════════════════════════════════════════════════════
-- KBI Platform — Phase 3 Seed Data
-- Migration: 0007_phase3_seed.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Request Types ──────────────────────────────────────────────────────────
INSERT OR IGNORE INTO request_types (name, slug, description, icon, color, requires_workflow, sla_hours, visibility_type) VALUES
  ('Annual Leave', 'annual_leave', 'Request annual leave days', 'fas fa-umbrella-beach', '#10B981', 1, 48, 'platform'),
  ('Sick Leave', 'sick_leave', 'Report sick leave absence', 'fas fa-thermometer-half', '#EF4444', 1, 24, 'platform'),
  ('Expense Refund', 'expense_refund', 'Submit an expense claim for reimbursement', 'fas fa-receipt', '#F59E0B', 1, 96, 'platform'),
  ('Procurement Request', 'procurement', 'Request purchase approval for goods or services', 'fas fa-shopping-cart', '#8B5CF6', 1, 72, 'platform'),
  ('Internal Application', 'internal_application', 'Apply for an internal role or opportunity', 'fas fa-user-plus', '#3B82F6', 1, 168, 'platform'),
  ('Training Request', 'training_request', 'Request approval for training or certification', 'fas fa-graduation-cap', '#06B6D4', 1, 72, 'platform'),
  ('IT Access Request', 'it_access', 'Request new system access or permissions', 'fas fa-key', '#6366F1', 1, 48, 'platform'),
  ('Other Request', 'other_request', 'General purpose request', 'fas fa-file-alt', '#6B7280', 0, 72, 'platform');

-- ── Request Fields: Annual Leave ───────────────────────────────────────────
INSERT OR IGNORE INTO request_fields (request_type_id, field_key, label, field_type, is_required, sort_order)
SELECT id, 'start_date', 'Start Date', 'date', 1, 1 FROM request_types WHERE slug = 'annual_leave';
INSERT OR IGNORE INTO request_fields (request_type_id, field_key, label, field_type, is_required, sort_order)
SELECT id, 'end_date', 'End Date', 'date', 1, 2 FROM request_types WHERE slug = 'annual_leave';
INSERT OR IGNORE INTO request_fields (request_type_id, field_key, label, field_type, options, is_required, sort_order)
SELECT id, 'leave_type', 'Leave Type', 'select', '["Annual","Unpaid","Maternity","Paternity","Compassionate","Other"]', 1, 3 FROM request_types WHERE slug = 'annual_leave';
INSERT OR IGNORE INTO request_fields (request_type_id, field_key, label, field_type, is_required, sort_order)
SELECT id, 'cover_person', 'Cover Person', 'text', 0, 4 FROM request_types WHERE slug = 'annual_leave';
INSERT OR IGNORE INTO request_fields (request_type_id, field_key, label, field_type, is_required, sort_order)
SELECT id, 'handover_notes', 'Handover Notes', 'textarea', 0, 5 FROM request_types WHERE slug = 'annual_leave';

-- ── Request Fields: Expense Refund ─────────────────────────────────────────
INSERT OR IGNORE INTO request_fields (request_type_id, field_key, label, field_type, options, is_required, sort_order)
SELECT id, 'expense_category', 'Expense Category', 'select', '["Travel","Accommodation","Equipment","Software","Training","Meals","Other"]', 1, 1 FROM request_types WHERE slug = 'expense_refund';
INSERT OR IGNORE INTO request_fields (request_type_id, field_key, label, field_type, is_required, sort_order)
SELECT id, 'expense_date', 'Expense Date', 'date', 1, 2 FROM request_types WHERE slug = 'expense_refund';
INSERT OR IGNORE INTO request_fields (request_type_id, field_key, label, field_type, is_required, sort_order)
SELECT id, 'amount', 'Amount (£)', 'number', 1, 3 FROM request_types WHERE slug = 'expense_refund';
INSERT OR IGNORE INTO request_fields (request_type_id, field_key, label, field_type, is_required, sort_order)
SELECT id, 'vendor_name', 'Vendor / Supplier', 'text', 1, 4 FROM request_types WHERE slug = 'expense_refund';
INSERT OR IGNORE INTO request_fields (request_type_id, field_key, label, field_type, is_required, sort_order)
SELECT id, 'business_purpose', 'Business Purpose', 'textarea', 1, 5 FROM request_types WHERE slug = 'expense_refund';

-- ── Workflow Templates ─────────────────────────────────────────────────────
INSERT OR IGNORE INTO workflow_templates (name, slug, description, record_type, is_active, is_sequential, sla_hours, escalation_after_hours) VALUES
  ('Standard Leave Approval', 'leave_approval', '2-step leave approval: Line Manager then HR', 'request', 1, 1, 48, 24),
  ('Expense Reimbursement', 'expense_reimbursement', 'Expense review: Manager approval then Finance processing', 'request', 1, 1, 96, 48),
  ('Procurement Approval', 'procurement_approval', 'Purchase approval with budget check', 'request', 1, 1, 72, 36),
  ('General Request Review', 'general_review', 'Single-step manager review and decision', 'request', 1, 1, 72, 48),
  ('Executive Escalation', 'executive_escalation', 'Escalation path to Executive and God Admin', 'request', 1, 1, 24, 12),
  ('Training Approval', 'training_approval', 'Training request: Manager and L&D approval', 'request', 1, 1, 72, 36);

-- ── Workflow Steps: Leave Approval ─────────────────────────────────────────
INSERT OR IGNORE INTO workflow_template_steps (workflow_template_id, step_order, name, step_type, approver_type, approver_value, timeout_hours, on_timeout_action)
SELECT id, 1, 'Line Manager Review', 'approval', 'manager', NULL, 24, 'escalate' FROM workflow_templates WHERE slug = 'leave_approval';
INSERT OR IGNORE INTO workflow_template_steps (workflow_template_id, step_order, name, step_type, approver_type, approver_value, timeout_hours, on_timeout_action)
SELECT id, 2, 'HR Confirmation', 'approval', 'role', 'platform_admin', 24, 'escalate' FROM workflow_templates WHERE slug = 'leave_approval';

-- ── Workflow Steps: Expense Reimbursement ──────────────────────────────────
INSERT OR IGNORE INTO workflow_template_steps (workflow_template_id, step_order, name, step_type, approver_type, approver_value, timeout_hours, on_timeout_action)
SELECT id, 1, 'Manager Approval', 'approval', 'manager', NULL, 48, 'escalate' FROM workflow_templates WHERE slug = 'expense_reimbursement';
INSERT OR IGNORE INTO workflow_template_steps (workflow_template_id, step_order, name, step_type, approver_type, approver_value, timeout_hours, on_timeout_action)
SELECT id, 2, 'Finance Processing', 'approval', 'role', 'platform_admin', 48, 'escalate' FROM workflow_templates WHERE slug = 'expense_reimbursement';

-- ── Workflow Steps: General Review ─────────────────────────────────────────
INSERT OR IGNORE INTO workflow_template_steps (workflow_template_id, step_order, name, step_type, approver_type, approver_value, timeout_hours, on_timeout_action)
SELECT id, 1, 'Manager Decision', 'approval', 'manager', NULL, 72, 'escalate' FROM workflow_templates WHERE slug = 'general_review';

-- ── Notification Templates ─────────────────────────────────────────────────
INSERT OR IGNORE INTO notification_templates (name, slug, subject, body_text, channel, is_active) VALUES
  ('Request Submitted', 'request_submitted', 'Your request has been submitted', 'Hi {{recipient_name}},\n\nYour request "{{request_title}}" ({{request_id}}) has been submitted and is under review.\n\nExpected resolution by: {{due_date}}\n\nKBI Platform', 'in_app', 1),
  ('Approval Required', 'approval_required', 'Action Required: Approval Request', 'Hi {{recipient_name}},\n\nYou have a pending approval request:\n\n{{request_title}} submitted by {{submitted_by}}\n\nPlease review and action this request.\n\nKBI Platform', 'in_app', 1),
  ('Request Approved', 'request_approved', 'Your request has been approved', 'Hi {{recipient_name}},\n\nGreat news! Your request "{{request_title}}" has been approved.\n\n{{approval_notes}}\n\nKBI Platform', 'in_app', 1),
  ('Request Rejected', 'request_rejected', 'Your request requires attention', 'Hi {{recipient_name}},\n\nYour request "{{request_title}}" was not approved.\n\nReason: {{rejection_reason}}\n\nIf you have questions, please contact your manager.\n\nKBI Platform', 'in_app', 1),
  ('SLA Breach Warning', 'sla_breach_warning', 'Action Required: Overdue Request', 'Hi {{recipient_name}},\n\nThe following request is approaching its deadline:\n\n{{request_title}} — Due: {{due_date}}\n\nPlease take action immediately.\n\nKBI Platform', 'in_app', 1),
  ('Workflow Escalated', 'workflow_escalated', 'Escalation Notice', 'Hi {{recipient_name}},\n\nA request has been escalated to you:\n\n{{request_title}}\n\nOriginal approver: {{original_approver}}\n\nPlease review urgently.\n\nKBI Platform', 'in_app', 1),
  ('Reminder', 'scheduled_reminder', 'Reminder: {{subject}}', '{{message}}', 'in_app', 1);

-- ── Automation Rules ───────────────────────────────────────────────────────
INSERT OR IGNORE INTO automation_rules (name, description, trigger_type, trigger_config, action_type, action_config, is_active) VALUES
  ('SLA Breach Alert', 'Notify when request approaches SLA deadline', 'sla_breach', '{"hours_before": 4}', 'send_notification', '{"template_slug": "sla_breach_warning"}', 1),
  ('New Request Submitted', 'Notify approver when request is submitted', 'record_created', '{"record_type": "request"}', 'send_notification', '{"template_slug": "approval_required"}', 1),
  ('Workflow Timeout Escalation', 'Escalate overdue workflow steps', 'workflow_event', '{"event_type": "step_timeout"}', 'escalate', '{"to_role": "directorate_lead"}', 1),
  ('Weekly Platform Summary', 'Generate weekly analytics snapshot every Monday', 'schedule', '{"cron": "0 8 * * 1"}', 'create_reminder', '{"message": "Weekly platform analytics snapshot generated"}', 1);

-- ── Dashboard Configs ──────────────────────────────────────────────────────
INSERT OR IGNORE INTO dashboard_configs (name, slug, description, dashboard_type, widgets, visibility_type, visibility_value, is_default) VALUES
  ('Executive Overview', 'executive_overview', 'Cross-directorate leadership dashboard', 'executive',
   '[{"id":"platform_health","type":"metric_cards","title":"Platform Health"},{"id":"request_volume","type":"bar_chart","title":"Request Volume by Directorate"},{"id":"workflow_performance","type":"line_chart","title":"Workflow Completion Rate"},{"id":"pending_approvals","type":"table","title":"Pending Approvals"},{"id":"team_activity","type":"activity_feed","title":"Recent Activity"}]',
   'role', 'executive,god_admin', 1),
  ('Platform Analytics', 'platform_analytics', 'Full platform usage analytics', 'executive',
   '[{"id":"user_activity","type":"line_chart","title":"Daily Active Users"},{"id":"workspace_health","type":"grid","title":"Workspace Health"},{"id":"request_trends","type":"area_chart","title":"Request Trends"},{"id":"automation_status","type":"status_grid","title":"Automation Rules Status"}]',
   'role', 'god_admin,platform_admin', 0),
  ('K1 Strategy Dashboard', 'k1_dashboard', 'K1 STRAT directorate analytics', 'directorate',
   '[{"id":"milestone_progress","type":"progress_bars","title":"Milestone Progress"},{"id":"strategic_items","type":"table","title":"Strategic Work Items"},{"id":"cross_directorate","type":"heatmap","title":"Cross-Directorate Dependencies"}]',
   'directorate', 'K1', 0),
  ('K6 Relationship Intelligence', 'k6_crm', 'K6 COLLAB relationship and account overview', 'directorate',
   '[{"id":"account_summary","type":"metric_cards","title":"Account Portfolio"},{"id":"engagement_timeline","type":"timeline","title":"Recent Engagements"},{"id":"relationship_graph","type":"graph","title":"Relationship Network"},{"id":"follow_ups","type":"table","title":"Upcoming Follow-ups"}]',
   'directorate', 'K6', 0);

-- ── Knowledge Sources ──────────────────────────────────────────────────────
INSERT OR IGNORE INTO knowledge_sources (name, source_type, description, sync_status, is_active) VALUES
  ('KBI Policy Library', 'upload', 'Core KBI policies, procedures, and guidelines', 'idle', 1),
  ('Operations Handbook', 'upload', 'Internal operations and process documentation', 'idle', 1),
  ('Obsidian Vault', 'obsidian', 'Team knowledge base from Obsidian markdown vault', 'idle', 1);

-- ── Sample Accounts ────────────────────────────────────────────────────────
INSERT OR IGNORE INTO accounts (name, account_type, sector, region, country, status, tier, description) VALUES
  ('UK Government Department', 'government', 'Public Sector', 'UK', 'GBR', 'active', 'strategic', 'Key government partner for policy initiatives'),
  ('Tech Foundation', 'funder', 'Technology', 'Global', 'INT', 'active', 'key', 'Major programme funder'),
  ('University Research Consortium', 'academic', 'Education', 'UK', 'GBR', 'active', 'standard', 'Academic research partner'),
  ('Regional NGO Alliance', 'ngo', 'Civil Society', 'Africa', 'INT', 'prospect', 'standard', 'Prospective regional partner');

-- ── Connector Sources ──────────────────────────────────────────────────────
INSERT OR IGNORE INTO connector_sources (name, connector_type, description, sync_frequency, sync_status, is_active) VALUES
  ('Google Calendar Sync', 'google_calendar', 'Sync KBI calendar events from Google Workspace', 'daily', 'idle', 0),
  ('Google Contacts', 'google_contacts', 'Sync team directory from Google Workspace', 'weekly', 'idle', 0),
  ('CSV Data Import', 'csv_upload', 'Manual CSV imports for bulk data ingestion', 'manual', 'idle', 1);
