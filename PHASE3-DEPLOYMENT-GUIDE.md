# KBI Internal Operations Platform — Phase 3 Deployment Guide

## Overview

Phase 3 adds the **Intelligence & Automation Layer** on top of the Phase 1 + Phase 2 foundation.

### What's New in Phase 3

| Module | Description |
|--------|-------------|
| **Request System** | Leave, expense refund, procurement, IT access, training requests with configurable field forms |
| **Workflow Engine** | Multi-step approval chains with escalation, delegation, SLA tracking, and overrides |
| **Automation Center** | Rule-based triggers, scheduled reminders, notification delivery |
| **Executive Dashboard** | Cross-directorate KPIs, pending items, workflow performance, activity feed |
| **Knowledge Base** | Markdown ingestion, full-text search, document library with Obsidian support |
| **Relationship Intelligence** | Account CRM, contact management, engagement logs, follow-up tracking |
| **Analytics Snapshots** | Periodic platform/directorate summaries stored for historical comparison |
| **External Connectors** | Foundation for Google Workspace, CSV upload, webhook integrations |
| **God Admin Monitoring** | Executive flags, platform audit log, god admin action log, session revocation |
| **HR Workflows** | Job postings, internal applications, leave & refund extensions |

---

## Prerequisites

- Completed Phase 1 + Phase 2 deployment on Cloudflare Pages
- Existing D1 database with Phase 1 + Phase 2 migrations applied
- Wrangler CLI installed (`npm install -g wrangler`)
- Cloudflare account with API token
- Node.js 18+ installed

---

## Step 1: Clone and Set Up Repository

```bash
# If starting fresh from this archive:
cd your-projects-folder
unzip kbi-platform-phase3.zip -d kbi-platform
cd kbi-platform

# OR if continuing from an existing git repo:
git pull origin main
```

---

## Step 2: Install Dependencies

```bash
npm install
```

---

## Step 3: Authenticate with Cloudflare

```bash
npx wrangler login
# OR using an API token:
export CLOUDFLARE_API_TOKEN=your_api_token_here

# Verify authentication
npx wrangler whoami
```

---

## Step 4: Apply Phase 3 Database Migrations

Phase 3 adds 2 new migration files:

```bash
# Apply Phase 3 schema (new tables)
npx wrangler d1 migrations apply kbi-platform-production \
  --migrations-path ./migrations \
  --migration-name "0006_phase3_intelligence"

# Apply Phase 3 seed data
npx wrangler d1 migrations apply kbi-platform-production \
  --migrations-path ./migrations \
  --migration-name "0007_phase3_seed"
```

### Alternative: Apply specific migration files directly

```bash
# Apply Phase 3 schema
npx wrangler d1 execute kbi-platform-production \
  --file ./migrations/0006_phase3_intelligence.sql

# Apply Phase 3 seed data
npx wrangler d1 execute kbi-platform-production \
  --file ./migrations/0007_phase3_seed.sql
```

### Apply to local development first (recommended)

```bash
# Apply to local SQLite for testing
npx wrangler d1 execute kbi-platform-production --local \
  --file ./migrations/0006_phase3_intelligence.sql

npx wrangler d1 execute kbi-platform-production --local \
  --file ./migrations/0007_phase3_seed.sql
```

---

## Step 5: Local Development Testing

```bash
# Build the project
npm run build

# Start local dev server (with D1 local mode)
npx wrangler pages dev dist \
  --d1=kbi-platform-production \
  --local \
  --ip 0.0.0.0 \
  --port 3000
```

Or use PM2 (recommended for sandbox):
```bash
npm run build
pm2 start ecosystem.config.cjs
pm2 logs kbi-platform --nostream
```

Open http://localhost:3000 and test Phase 3 features.

### Verify Phase 3 API endpoints are working:

```bash
# Health check (should show Phase 1+2+3)
curl http://localhost:3000/api/health

# Request types
curl -b cookies.txt http://localhost:3000/api/p3/requests/types

# Workflow templates
curl -b cookies.txt http://localhost:3000/api/p3/workflows/templates
```

---

## Step 6: Build for Production

```bash
npm run build
```

This generates the `dist/` folder containing:
- `_worker.js` — compiled Hono application with all Phase 3 routes
- `_routes.json` — routing configuration
- `static/app.js` — Phase 1 frontend
- `static/p2-app.js` — Phase 2 frontend
- `static/p3-app.js` — Phase 3 frontend (new)

---

## Step 7: Deploy to Cloudflare Pages

### Option A: Using wrangler deploy

```bash
# Deploy to existing Cloudflare Pages project
npx wrangler pages deploy dist \
  --project-name kbi-platform

# You will receive URLs:
# Production: https://[hash].kbi-platform.pages.dev
# Branch: https://main.kbi-platform.pages.dev
```

### Option B: Create a new Cloudflare Pages project (first-time)

```bash
# Create the Pages project
npx wrangler pages project create kbi-platform \
  --production-branch main \
  --compatibility-date 2024-11-01

# Deploy
npx wrangler pages deploy dist --project-name kbi-platform
```

---

## Step 8: Set Environment Variables

```bash
# Required: Google OAuth credentials
npx wrangler pages secret put GOOGLE_CLIENT_ID \
  --project-name kbi-platform

npx wrangler pages secret put GOOGLE_CLIENT_SECRET \
  --project-name kbi-platform

# Required: JWT secret for session signing
npx wrangler pages secret put JWT_SECRET \
  --project-name kbi-platform

# Optional: Platform domain restriction
npx wrangler pages secret put PLATFORM_DOMAIN \
  --project-name kbi-platform
# Enter value: kb.institute

# Verify secrets
npx wrangler pages secret list --project-name kbi-platform
```

---

## Step 9: Apply Production Database Migrations

```bash
# Apply Phase 3 schema to production D1
npx wrangler d1 execute kbi-platform-production \
  --file ./migrations/0006_phase3_intelligence.sql

npx wrangler d1 execute kbi-platform-production \
  --file ./migrations/0007_phase3_seed.sql

# Verify tables were created
npx wrangler d1 execute kbi-platform-production \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

---

## Step 10: Verify Production Deployment

```bash
# Test health endpoint
curl https://kbi-platform.pages.dev/api/health

# Expected response:
# {"status":"ok","version":"3.0.0","phase":"Phase 1+2+3","platform":"KBI Internal Operations Platform"}
```

---

## GitHub Integration

### Push to GitHub for CI/CD

```bash
# Initialize git (if not already done)
git init
git add .
git commit -m "Phase 3: Intelligence & Automation Layer"

# Add GitHub remote
git remote add origin https://github.com/YOUR_ORG/kbi-platform.git
git push -f origin main
```

### Set up GitHub Actions for automatic deployment

The `.github/workflows/deploy.yml` file handles automatic deployments on push to `main`.

Required GitHub Secrets (Settings → Secrets → Actions):
- `CLOUDFLARE_API_TOKEN` — your Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare account ID

---

## New API Reference — Phase 3

### Request System

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/p3/requests/types` | List request types | All authenticated |
| GET | `/api/p3/requests/types/:slug` | Get type with fields | All authenticated |
| POST | `/api/p3/requests` | Submit new request | All authenticated |
| GET | `/api/p3/requests/my` | My submitted requests | All authenticated |
| GET | `/api/p3/requests` | All requests (paged) | Admin/Lead |
| GET | `/api/p3/requests/:id` | Request detail | Owner/Admin |
| PATCH | `/api/p3/requests/:id/status` | Update status | Admin/Owner |
| GET | `/api/p3/requests/pending/mine` | My pending approvals | All authenticated |
| GET | `/api/p3/requests/analytics/summary` | Request analytics | Executive/Admin |

### Workflow Engine

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/p3/workflows/templates` | List templates | All authenticated |
| GET | `/api/p3/workflows/templates/:id` | Template detail | All authenticated |
| POST | `/api/p3/workflows/templates` | Create template | Admin/Workflow Admin |
| POST | `/api/p3/workflows/runs` | Start workflow run | All authenticated |
| GET | `/api/p3/workflows/runs` | List runs | Admin/Lead |
| GET | `/api/p3/workflows/runs/:id` | Run detail | All authenticated |
| POST | `/api/p3/workflows/runs/:id/act` | Approve/reject/delegate | Assigned approver |
| POST | `/api/p3/workflows/runs/:id/override` | Force override | God Admin only |
| GET | `/api/p3/workflows/analytics` | Workflow performance | Executive/Admin |

### Analytics

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/p3/analytics/executive` | Executive overview | Executive/God Admin |
| GET | `/api/p3/analytics/directorate/:code` | Directorate analytics | Admin/Directorate Lead |
| GET | `/api/p3/analytics/dashboards` | List dashboards | All authenticated |
| GET | `/api/p3/analytics/dashboards/:slug` | Dashboard config | All authenticated |
| GET | `/api/p3/analytics/snapshots` | Analytics snapshots | All authenticated |
| POST | `/api/p3/analytics/snapshots/generate` | Generate snapshot | Admin |
| GET | `/api/p3/analytics/health` | Platform health | Admin |
| GET | `/api/p3/analytics/user-activity` | User activity | God Admin/Admin |

### Knowledge Base

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/p3/knowledge/sources` | Knowledge sources | All authenticated |
| POST | `/api/p3/knowledge/sources` | Create source | Admin |
| GET | `/api/p3/knowledge/documents` | List documents | Permission-aware |
| GET | `/api/p3/knowledge/documents/:id` | Document detail | Permission-aware |
| POST | `/api/p3/knowledge/documents` | Create document | All authenticated |
| PUT | `/api/p3/knowledge/documents/:id` | Update document | Owner/Admin |
| DELETE | `/api/p3/knowledge/documents/:id` | Delete document | Owner/Admin |
| GET | `/api/p3/knowledge/search?q=` | Full-text search | Permission-aware |
| POST | `/api/p3/knowledge/documents/:id/links` | Link to entity | All authenticated |
| GET | `/api/p3/knowledge/analytics` | Knowledge analytics | All authenticated |

### Relationship Intelligence

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/p3/accounts` | List accounts | All authenticated |
| GET | `/api/p3/accounts/:id` | Account detail | All authenticated |
| POST | `/api/p3/accounts` | Create account | All authenticated |
| PUT | `/api/p3/accounts/:id` | Update account | Owner/Admin |
| POST | `/api/p3/accounts/:id/contacts` | Add contact | All authenticated |
| PUT | `/api/p3/accounts/:id/contacts/:cid` | Update contact | All authenticated |
| GET | `/api/p3/accounts/engagements/list` | List engagements | All authenticated |
| POST | `/api/p3/accounts/engagements` | Log engagement | All authenticated |
| GET | `/api/p3/accounts/relationships` | Relationship graph | All authenticated |
| POST | `/api/p3/accounts/relationships` | Create edge | All authenticated |
| GET | `/api/p3/accounts/follow-ups` | Upcoming follow-ups | All authenticated |
| GET | `/api/p3/accounts/analytics` | Account analytics | All authenticated |

### Automation & Notifications

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/p3/automation/rules` | Automation rules | Admin/Workflow Admin |
| POST | `/api/p3/automation/rules` | Create rule | Admin/Workflow Admin |
| PATCH | `/api/p3/automation/rules/:id/toggle` | Enable/disable rule | Admin |
| POST | `/api/p3/automation/rules/:id/trigger` | Manual trigger | Admin |
| GET | `/api/p3/automation/runs` | Automation run history | Admin |
| GET | `/api/p3/automation/notification-templates` | Notification templates | All authenticated |
| GET | `/api/p3/automation/notifications/inbox` | My notifications | All authenticated |
| PATCH | `/api/p3/automation/notifications/:id/read` | Mark read | Owner |
| POST | `/api/p3/automation/notifications/mark-all-read` | Mark all read | Owner |
| GET | `/api/p3/automation/reminders` | My reminders | All authenticated |
| POST | `/api/p3/automation/reminders` | Create reminder | All authenticated |
| GET | `/api/p3/automation/connectors` | Connector sources | Admin |
| POST | `/api/p3/automation/connectors` | Create connector | Admin |
| POST | `/api/p3/automation/connectors/:id/sync` | Trigger sync | Admin |

### God Admin Monitoring

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/p3/monitoring/audit` | Full audit log | God Admin |
| GET | `/api/p3/monitoring/god-admin-actions` | Admin action log | God Admin |
| POST | `/api/p3/monitoring/god-admin-actions` | Record admin action | God Admin |
| GET | `/api/p3/monitoring/flags` | Executive flags | Executive/Admin |
| POST | `/api/p3/monitoring/flags` | Create flag | All authenticated |
| PATCH | `/api/p3/monitoring/flags/:id/acknowledge` | Acknowledge flag | Executive/Admin |
| PATCH | `/api/p3/monitoring/flags/:id/resolve` | Resolve flag | Executive/Admin |
| GET | `/api/p3/monitoring/users` | User management | God Admin |
| PATCH | `/api/p3/monitoring/users/:id/status` | Update user status | God Admin |
| POST | `/api/p3/monitoring/users/:id/revoke-sessions` | Revoke sessions | God Admin |
| GET | `/api/p3/monitoring/summary` | God Admin summary | God Admin |
| GET | `/api/p3/monitoring/jobs` | Job postings | All authenticated |
| POST | `/api/p3/monitoring/jobs` | Create job posting | Admin/Lead |
| POST | `/api/p3/monitoring/jobs/:id/apply` | Apply for job | All authenticated |

---

## Role Permissions Summary

| Role | Requests | Workflows | Analytics | Knowledge | Accounts | Automation | Monitoring |
|------|----------|-----------|-----------|-----------|----------|------------|------------|
| God Admin | Full | Full + Override | Full | Full | Full | Full | Full |
| Executive | View All | View | Full Exec | View | View | — | Flags Only |
| Platform Admin | Full | Full | Full | Full | Full | Full | Partial |
| Directorate Lead | Directorate | Directorate | Directorate | View | View | — | — |
| Workflow Admin | View | Manage Templates | — | — | — | Manage Rules | — |
| Standard User | Own + Submit | Own | — | Read | Read | Notifications | — |
| Restricted User | Submit Only | — | — | Read | — | — | — |

---

## Phase 3 Milestone Acceptance Criteria

### Milestone 1: Request System ✅
- [ ] Users can submit leave, expense, procurement, and IT access requests
- [ ] Dynamic form fields configurable per request type
- [ ] Requests receive issued IDs (e.g., REQ-2024-0001)
- [ ] Submitters receive in-app notifications
- [ ] Leave requests create leave_requests extension records
- [ ] Expense requests create refund_requests extension records
- [ ] All actions are audit logged

### Milestone 2: Workflow Engine ✅
- [ ] Multi-step approval workflows with sequential steps
- [ ] Approver assignment by role or manager lookup
- [ ] Approve, reject, delegate, and escalate actions
- [ ] Step activation with deadline tracking
- [ ] Automatic request status updates on workflow completion
- [ ] God Admin force override with justification requirement
- [ ] Full workflow event log
- [ ] Notifications sent to approvers at each step

### Milestone 3: Executive Dashboard ✅
- [ ] Cross-directorate KPI summary cards
- [ ] Directorate-level request and work item breakdown table
- [ ] Pending approvals quick view with urgency indicators
- [ ] Workflow performance rate chart
- [ ] Recent platform activity feed
- [ ] Access restricted to executive and god admin roles

### Milestone 4: Automation Center ✅
- [ ] Automation rules with trigger/action definitions
- [ ] Enable/disable individual rules
- [ ] Manual rule trigger with action log
- [ ] Run history with success/failure status
- [ ] Scheduled reminders creation and listing
- [ ] Notification inbox with read/unread state
- [ ] Mark all read functionality

### Milestone 5: Knowledge Base ✅
- [ ] Knowledge sources creation and management
- [ ] Markdown document ingestion with HTML rendering
- [ ] Permission-aware visibility (platform vs directorate)
- [ ] Full-text search across title and content
- [ ] Document tagging and categorization
- [ ] Document-to-entity linking (accounts, workspaces, users)
- [ ] Marked.js markdown rendering in frontend

### Milestone 6: Relationship Intelligence ✅
- [ ] Account CRUD with tier and type classification
- [ ] Contact management per account
- [ ] Engagement log with type, summary, and outcome
- [ ] Follow-up date tracking with reminder creation
- [ ] Relationship graph edges between users and accounts
- [ ] Engagement analytics and trend reporting

### Milestone 7: Monitoring & Observability ✅
- [ ] Full platform audit log with module and severity filters
- [ ] God admin action log with justification capture
- [ ] Executive flags with acknowledge and resolve workflow
- [ ] Platform health summary for god admins
- [ ] User status management with justification
- [ ] Session revocation logging
- [ ] Critical event flagging in audit log

### Milestone 8: External Connectors ✅
- [ ] Connector source definitions (Google, webhook, CSV, REST)
- [ ] Manual sync trigger with run history
- [ ] Sync status and error tracking
- [ ] Foundation for Google Calendar and Contacts sync

---

## Troubleshooting

### Build fails with TypeScript errors
```bash
# Check TypeScript version
npx tsc --version

# Try building with type checking disabled
npx vite build --mode production
```

### D1 migration fails
```bash
# Check current migration state
npx wrangler d1 migrations list kbi-platform-production

# Apply specific file manually
npx wrangler d1 execute kbi-platform-production \
  --file ./migrations/0006_phase3_intelligence.sql \
  --yes
```

### Routes returning 404 in production
```bash
# Check dist/_routes.json exists
cat dist/_routes.json

# Verify _worker.js includes Phase 3 routes
grep "p3" dist/_worker.js | head -5
```

### Notifications not appearing
- Ensure user has `status = 'active'` in the database
- Check notification_deliveries table for records
- Verify p3-app.js is loaded (check browser console)

### Workflow steps not activating
- Ensure workflow_template_steps exist for the template
- Check workflow_runs and workflow_run_steps tables
- Verify manager_user_id is set in people_profiles for manager-type approvals

---

## Development Notes

### Adding a new request type
1. Insert into `request_types` table
2. Add fields to `request_fields` table
3. Create/assign a `workflow_templates` record
4. Update `request_types.default_workflow_template_id`

### Adding a new automation rule
1. Use the Automation Center UI (Admin only)
2. Or insert directly into `automation_rules` with trigger_config and action_config JSON

### Extending the executive dashboard
1. Edit `dashboard_configs` table to update `widgets` JSON
2. Add corresponding data to `/api/p3/analytics/executive` endpoint

---

*KBI Internal Operations Platform — Phase 3 · Built on Cloudflare Pages + Workers + D1*
