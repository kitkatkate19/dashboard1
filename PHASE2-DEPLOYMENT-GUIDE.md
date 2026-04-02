# KBI Internal Operations Platform — Phase 2 Deployment Guide
## Step-by-Step: GitHub → Cloudflare Pages

---

## Overview

Phase 2 adds the **Operational Workspace Layer** on top of Phase 1:

| Layer | What It Provides |
|-------|-----------------|
| Phase 1 | Auth, People Directory, Org Chart, Calendar, Guides, Brand Kit, Admin |
| Phase 2 (new) | K1–K7 Workspaces, Work Items, Kanban/Gantt/Calendar/List views, Comments, Attachments, Activity, Approvals, Advanced Search, Export |

**Tech Stack**: Hono + TypeScript · Cloudflare Pages · Cloudflare Workers · Cloudflare D1 (SQLite) · Cloudflare KV · Cloudflare R2

---

## Prerequisites

```bash
node --version   # v18+ required
npm --version    # v9+ required
git --version
```

Install Wrangler CLI:
```bash
npm install -g wrangler
wrangler --version   # Should be 3.x+
```

---

## Step 1: Upload to GitHub

### 1a. Extract the archive
```bash
tar -xzf kbi-platform-phase2.tar.gz
cd kbi-platform
```

### 1b. Create a Private GitHub Repo
1. Go to https://github.com/new
2. Name: `kbi-platform` (or your preferred name)
3. Set to **Private**
4. Do NOT initialise with README (repo already has one)
5. Click **Create Repository**

### 1c. Push code
```bash
git remote add origin https://github.com/YOUR_ORG/kbi-platform.git
git branch -M main
git push -f origin main
```

---

## Step 2: Cloudflare Account Setup

### 2a. Log in to Wrangler
```bash
wrangler login
# Opens browser for Cloudflare OAuth — approve access
wrangler whoami   # Confirm your account
```

### 2b. Create D1 Database (Production)
```bash
wrangler d1 create kbi-platform-production
```

Output will look like:
```
[[d1_databases]]
binding = "DB"
database_name = "kbi-platform-production"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy the `database_id` and paste it into `wrangler.jsonc`:
```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "kbi-platform-production",
      "database_id": "PASTE_YOUR_ID_HERE"
    }
  ]
}
```

### 2c. Create KV Namespace (for sessions)
```bash
wrangler kv:namespace create "KV"
wrangler kv:namespace create "KV" --preview
```

Paste both IDs into `wrangler.jsonc`:
```jsonc
{
  "kv_namespaces": [
    {
      "binding": "KV",
      "id": "PRODUCTION_ID",
      "preview_id": "PREVIEW_ID"
    }
  ]
}
```

### 2d. Create R2 Bucket (for attachments)
```bash
wrangler r2 bucket create kbi-platform-assets
```

Paste into `wrangler.jsonc`:
```jsonc
{
  "r2_buckets": [
    {
      "binding": "R2",
      "bucket_name": "kbi-platform-assets"
    }
  ]
}
```

---

## Step 3: Apply Database Migrations

### 3a. Local development (uses local SQLite — no network needed)
```bash
# Apply all migrations to local D1
npm run db:migrate:local

# Seed initial data (directorates, roles, admin users)
npm run db:seed:p1     # Phase 1 seed data
npm run db:seed:p2     # Phase 2 seed data (K1-K7 workspaces + sample items)
```

### 3b. Production database
```bash
# Apply migrations to real Cloudflare D1
npm run db:migrate:prod

# Seed Phase 1 base data (required)
wrangler d1 execute kbi-platform-production --file=./migrations/0002_seed_data.sql

# Seed Phase 2 workspaces + sample items (optional)
wrangler d1 execute kbi-platform-production --file=./migrations/0004_phase2_seed.sql
```

---

## Step 4: Local Development

```bash
npm install

# Apply local migrations
npm run db:migrate:local

# Seed data
wrangler d1 execute kbi-platform-production --local --file=./migrations/0002_seed_data.sql
wrangler d1 execute kbi-platform-production --local --file=./migrations/0004_phase2_seed.sql

# Build the project
npm run build

# Start local development server (with D1 local)
npm run dev:d1
# Server starts at http://localhost:3000
```

You can log in with the dev login form at `localhost:3000`:
- Use any `@kb.institute` email (e.g. `admin@kb.institute`)
- First user gets God Admin privileges if bootstrapped

### Bootstrap God Admin
```bash
curl -X POST http://localhost:3000/api/admin/seed-admin \
  -H "Content-Type: application/json" \
  -d '{"email": "your@kb.institute"}'
```

---

## Step 5: Deploy to Cloudflare Pages

### 5a. Build
```bash
npm run build
```

### 5b. Create Cloudflare Pages Project
```bash
wrangler pages project create kbi-platform \
  --production-branch main
```

### 5c. Deploy
```bash
wrangler pages deploy dist --project-name kbi-platform
```

You'll receive a deployment URL like:
```
https://kbi-platform.pages.dev
https://main.kbi-platform.pages.dev
```

### 5d. Set Production Secrets
```bash
# Google OAuth credentials (if using Google SSO directly)
wrangler pages secret put GOOGLE_CLIENT_ID --project-name kbi-platform
wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name kbi-platform

# JWT secret for session tokens
wrangler pages secret put JWT_SECRET --project-name kbi-platform

# (Optional) Any other API keys
wrangler pages secret put GOOGLE_ADMIN_EMAIL --project-name kbi-platform
```

---

## Step 6: Configure Cloudflare Access (Google SSO)

This adds the **@kb.institute only** identity gateway in front of your Pages deployment.

1. Go to [Cloudflare Zero Trust](https://one.dash.cloudflare.com)
2. Navigate to: **Access → Applications → Add an Application**
3. Choose **Self-hosted**
4. Configure:
   - **Application name**: KBI Platform
   - **Application domain**: `kbi-platform.pages.dev`
   - **Session duration**: 8 hours
5. Create a policy:
   - **Name**: KB Institute Only
   - **Action**: Allow
   - **Rule**: Emails ending in `@kb.institute`
6. Set up **Login method**: Google Workspace
   - Connect your Google Workspace under **Settings → Authentication → Login methods**
   - Restrict to domain: `kb.institute`
7. Save and test

---

## Step 7: GitHub Actions CI/CD (Automatic Deployment)

The repo includes `.github/workflows/deploy.yml`. Configure these GitHub secrets:

| Secret | Where to get it |
|--------|----------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare Dashboard → My Profile → API Tokens → Create Token → Use "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard → right sidebar |

After adding secrets, every push to `main` automatically:
1. Runs tests
2. Builds the project
3. Deploys to Cloudflare Pages
4. Applies new migrations

---

## Step 8: Bootstrap and Verify

### Verify deployment
```bash
curl https://kbi-platform.pages.dev/api/health
# Expected: {"status":"ok","version":"2.0.0","phase":"Phase 1+2","platform":"KBI Internal Operations Platform"}
```

### Bootstrap God Admin (production)
```bash
curl -X POST https://kbi-platform.pages.dev/api/admin/seed-admin \
  -H "Content-Type: application/json" \
  -d '{"email": "your@kb.institute"}'
```

### Test Phase 2 endpoints
```bash
# Workspaces
curl -s https://kbi-platform.pages.dev/api/p2/workspaces

# Search
curl -s "https://kbi-platform.pages.dev/api/p2/search?q=strategy"

# Health
curl -s https://kbi-platform.pages.dev/api/health
```

---

## Phase 2 Feature Map

### Workspaces (K1–K7)
| Directorate | Workspaces |
|-------------|-----------|
| K1 Strategy | Priority Tracker (Kanban), Decision Log (List), Strategic Programme (Gantt), Leadership Calendar |
| K2 Corporate | Admin Tracker (Kanban), Approval Management (Kanban), Financial/Grant Tracker, Contract/Legal (List) |
| K3 Comms | Comms Tracker, Campaign Board (Kanban), Content Calendar, Idea Backlog |
| K4 Innovation | Innovation PPM, Product Board (Kanban), Release Calendar, Implementation Roadmap (Gantt) |
| K5 Education | Education PPM, Programme Delivery, Curriculum Tracker, Training Calendar |
| K6 Partnerships | Partner Tracker, Engagement Tracker, Sales/Outreach (Kanban) |
| K7 Operations | Operations PPM, Event Management, Digital Systems, Talent & People Ops |

### View Modes
| View | Description |
|------|-------------|
| **List** | Sortable table with status/priority columns |
| **Kanban** | Drag-ready column board grouped by status |
| **Gantt** | Timeline chart with day-by-day bars and progress |
| **Calendar** | Monthly calendar view of items by due date |

### Work Item Features
- Title, Description (Markdown), Status, Priority, Type
- Owner + Assignees (multiple)
- Start date, Due date, Estimated/Actual hours
- Progress % with visual progress bar
- Tags (coloured, per-workspace)
- Comments (threaded, internal flag)
- Attachments (metadata + R2 storage link)
- Activity/Audit log (all changes tracked)
- Approval flows (multi-step, role-based)
- Saved views (personal + workspace-shared)

### API Routes (Phase 2)
```
GET    /api/p2/workspaces            List accessible workspaces
POST   /api/p2/workspaces            Create workspace
GET    /api/p2/workspaces/:id        Workspace detail
PUT    /api/p2/workspaces/:id        Update workspace
GET    /api/p2/workspaces/:id/statuses   Workspace statuses
GET    /api/p2/workspaces/:id/priorities  Workspace priorities
GET    /api/p2/workspaces/:id/types      Item types

GET    /api/p2/items?workspace_id=   List items (with filters)
POST   /api/p2/items                 Create item
GET    /api/p2/items/:id             Item detail (with all sub-data)
PUT    /api/p2/items/:id             Update item
DELETE /api/p2/items/:id             Archive item

GET    /api/p2/engage/comments/:id   Comments for item
POST   /api/p2/engage/comments       Post comment
GET    /api/p2/engage/attachments/:id Attachments for item
POST   /api/p2/engage/attachments    Register attachment
GET    /api/p2/engage/activity/:id   Activity log for item

GET    /api/p2/approvals/flows/:wsId  Approval flows
POST   /api/p2/approvals/flows        Create flow
POST   /api/p2/approvals/instances    Start approval
POST   /api/p2/approvals/instances/:id/action  Approve/reject

GET    /api/p2/views?workspace_id=   Saved views
POST   /api/p2/views                 Save view
PUT    /api/p2/views/:id             Update view
DELETE /api/p2/views/:id             Delete view

GET    /api/p2/search?q=             Cross-workspace search
GET    /api/p2/export/items          Export items CSV
GET    /api/p2/export/workspace-summary  Export workspace summary CSV
```

---

## RBAC (Role Access Summary)

| Role | Workspaces | Create Items | Approve | Export | God Admin Panel |
|------|-----------|-------------|---------|--------|----------------|
| God Admin | All | ✅ | ✅ | ✅ | ✅ |
| Platform Admin | All | ✅ | ✅ | ✅ | ✅ |
| Directorate Lead | Their directorates | ✅ | ✅ | ✅ | Limited |
| Workspace Admin | Their workspaces | ✅ | Workspace only | ✅ | ❌ |
| Team Lead | Team workspaces | ✅ | ❌ | ✅ | ❌ |
| Standard User | Assigned workspaces | ✅ | ❌ | ❌ | ❌ |
| Volunteer/Intern | Assigned workspaces | Limited | ❌ | ❌ | ❌ |
| Read Only / Executive | Assigned workspaces | ❌ | ❌ | ❌ | ❌ |

---

## Troubleshooting

### Build fails: `@hono/vite-cloudflare-pages`
```bash
npm install @hono/vite-cloudflare-pages --save-dev
npm run build
```

### D1 migration fails
```bash
# Reset local DB and re-apply
npm run db:reset
```

### Static files 404 (app.css, app.js, p2-app.js)
Files must be in `public/static/` — already set up correctly. Verify:
```bash
ls public/static/
# Should show: app.css  app.js  p2-app.js  style.css
```

### Wrangler authentication error
```bash
wrangler logout && wrangler login
```

### Sessions not persisting
Ensure KV namespace IDs are correctly set in `wrangler.jsonc`.

---

## Directory Structure
```
kbi-platform/
├── src/
│   ├── index.ts               # Main app entry (Phase 1 + 2 routes)
│   ├── types/index.ts         # TypeScript types
│   ├── lib/
│   │   ├── auth.ts            # Session management
│   │   └── db.ts              # DB helpers + audit logging
│   ├── middleware/            # Auth middleware
│   └── routes/
│       ├── auth.ts            # Google SSO + dev login
│       ├── users.ts           # User profiles + RBAC
│       ├── directory.ts       # People directory + org chart
│       ├── admin.ts           # God Admin dashboard
│       ├── calendar.ts        # KBI Calendar
│       ├── content.ts         # Announcements, Guides, Brand Kit
│       ├── search.ts          # Platform search (Phase 1)
│       ├── export.ts          # Phase 1 CSV exports
│       └── p2/
│           ├── workspaces.ts  # Workspace CRUD + membership
│           ├── items.ts       # Work items with all views
│           ├── engage.ts      # Comments, attachments, activity
│           ├── approvals.ts   # Approval flows + instances
│           ├── views.ts       # Saved views
│           ├── p2search.ts    # Cross-workspace search
│           └── p2export.ts    # Workspace CSV/summary export
├── public/static/
│   ├── app.js                 # Phase 1 frontend (SPA)
│   ├── p2-app.js              # Phase 2 workspace engine (SPA extension)
│   └── app.css                # Full platform CSS
├── migrations/
│   ├── 0001_initial_schema.sql    # Phase 1: Users, Directorates, Roles
│   ├── 0002_seed_data.sql         # Phase 1: Seed data (directorates, roles)
│   ├── 0003_phase2_work_engine.sql # Phase 2: Workspaces, Work Items, etc.
│   └── 0004_phase2_seed.sql       # Phase 2: K1-K7 workspaces + sample items
├── .github/workflows/deploy.yml  # CI/CD pipeline
├── ecosystem.config.cjs           # PM2 configuration
├── wrangler.jsonc                 # Cloudflare configuration
├── vite.config.ts                 # Build configuration
└── package.json
```
