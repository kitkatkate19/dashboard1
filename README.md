# KBI Internal Operations Platform — Phase 1 + Phase 2

## Overview
A fully serverless internal operations platform for KBI, built on Cloudflare Pages + Workers + D1 + R2 + KV. Phase 1 provides secure identity, people directory, org chart, calendar, guides, brand kit, search, and God Admin. Phase 2 adds reusable directorate workspaces with List / Kanban / Gantt / Calendar views, work items, comments, attachments, activity logs, approval workflows, saved views, and CSV export.

---

## Live Status
| Environment | URL |
|---|---|
| Production | `https://<your-project>.pages.dev` |
| GitHub | `https://github.com/<org>/kbi-platform` |

---

## Tech Stack
- **Backend:** Hono v4 (TypeScript) on Cloudflare Workers
- **Frontend:** Vanilla JS SPA with Tailwind CSS (CDN), Day.js, Chart.js, Marked.js
- **Database:** Cloudflare D1 (SQLite, 18 Phase-1 tables + 20 Phase-2 tables)
- **File storage:** Cloudflare R2
- **Session store:** Cloudflare KV
- **Auth gateway:** Cloudflare Access + Google Workspace SSO
- **CI/CD:** GitHub Actions → Cloudflare Pages

---

## Project Structure
```
kbi-platform/
├── src/
│   ├── index.ts                 # Main app + SPA shell
│   ├── types/index.ts           # TypeScript types & Env bindings
│   ├── lib/
│   │   ├── auth.ts              # Session management (KV)
│   │   └── db.ts                # D1 helpers, audit logging
│   └── routes/
│       ├── auth.ts              # Google OAuth + session
│       ├── users.ts             # Profiles, roles, RBAC
│       ├── directory.ts         # People directory, org chart
│       ├── admin.ts             # God Admin dashboard
│       ├── calendar.ts          # KBI calendar
│       ├── content.ts           # Announcements, guides, brand kit
│       ├── search.ts            # Phase 1 permission-aware search
│       ├── export.ts            # Phase 1 CSV export
│       └── p2/
│           ├── workspaces.ts    # Workspace CRUD + membership
│           ├── items.ts         # Work items (list/filter/sort)
│           ├── approvals.ts     # Approval flows, instances, actions
│           ├── engage.ts        # Comments, attachments, activity
│           ├── views.ts         # Saved views
│           ├── p2export.ts      # Phase 2 CSV export
│           └── p2search.ts      # Phase 2 cross-workspace search
├── public/static/
│   ├── app.js                   # Phase 1 frontend SPA
│   ├── p2-app.js                # Phase 2 frontend extension
│   ├── app.css                  # Core styles
│   └── style.css                # Additional styles
├── migrations/
│   ├── 0001_initial_schema.sql  # Phase 1 tables (18 tables)
│   ├── 0002_seed_data.sql       # Directorates, roles, sample data
│   ├── 0003_phase2_work_engine.sql  # Phase 2 tables (20 tables)
│   ├── 0004_phase2_seed.sql     # K1-K7 workspaces + sample items
│   └── 0005_phase2_schema_fix.sql  # Slug indexes + finalisation
├── wrangler.jsonc               # Cloudflare config
├── ecosystem.config.cjs         # PM2 config (sandbox dev)
├── vite.config.ts               # Vite build config
└── package.json
```

---

## Features

### Phase 1 (Foundation)
- ✅ Google Workspace SSO (restricted to @kb.institute)
- ✅ 9-role RBAC (God Admin → New Joiner)
- ✅ K1–K7 directorate membership
- ✅ User approval workflow
- ✅ People Directory (searchable)
- ✅ Org Chart (manager tree)
- ✅ KBI Calendar (month grid + list)
- ✅ Guides / Knowledge Base (Markdown)
- ✅ Brand Kit (asset repository)
- ✅ Permission-aware global search
- ✅ CSV export (admin roles)
- ✅ God Admin dashboard (approvals, audit log)
- ✅ Confidentiality gate + dark mode

### Phase 2 (Operational Workspaces)
- ✅ 27 pre-seeded workspaces across K1–K7
- ✅ List / Kanban / Gantt / Calendar view engines
- ✅ Work items (issued IDs, types, statuses, priorities)
- ✅ Threaded comments with internal-only flag
- ✅ File attachments (R2)
- ✅ Activity history (immutable audit trail per item)
- ✅ Configurable approval flows (multi-step)
- ✅ Saved views (personal + workspace-shared)
- ✅ Tags per workspace
- ✅ Advanced cross-workspace search
- ✅ CSV export per workspace
- ✅ Subtasks (parent-child items)
- ✅ Assignees (multiple per item with roles)
- ✅ Gantt chart with progress bars
- ✅ Workspace membership management

---

## RBAC — Role Hierarchy
| Role | Scope | Key Capabilities |
|---|---|---|
| God Admin | Platform | Full control, all workspaces, audit everything |
| Platform Admin | Platform | Content, config, no role escalation |
| Directorate Lead | Directorate | Manage directorate workspaces, approve members |
| Workspace Admin | Workspace | Configure workspace, add members |
| Team Lead | Team | View team records, approve workspace items |
| Standard User | Platform | Create/edit within assigned workspaces |
| Volunteer/Intern | Platform | Restricted edit |
| Read Only / Executive | Platform | View only |
| New Joiner | Platform | Onboarding layout |

---

## API Reference (Phase 2)

### Workspaces
| Method | Path | Description |
|---|---|---|
| GET | `/api/p2/workspaces` | List accessible workspaces |
| POST | `/api/p2/workspaces` | Create workspace |
| GET | `/api/p2/workspaces/:id` | Workspace detail + statuses/types/members |
| GET | `/api/p2/workspaces/:id/statuses` | Status list |
| GET | `/api/p2/workspaces/:id/priorities` | Priority list |
| GET | `/api/p2/workspaces/:id/types` | Type list |
| POST | `/api/p2/workspaces/:id/members` | Add member |

### Work Items
| Method | Path | Description |
|---|---|---|
| GET | `/api/p2/items?workspace_id=&status=&priority=&search=&sort=&page=` | List with filters |
| POST | `/api/p2/items` | Create item |
| GET | `/api/p2/items/:id` | Item detail |
| PUT | `/api/p2/items/:id` | Update item |
| DELETE | `/api/p2/items/:id` | Archive item |

### Comments / Activity / Attachments
| Method | Path | Description |
|---|---|---|
| GET | `/api/p2/engage/comments/:itemId` | Threaded comments |
| POST | `/api/p2/engage/comments` | Add comment |
| GET | `/api/p2/engage/activity/:itemId` | Activity log |
| GET | `/api/p2/engage/attachments/:itemId` | Attachments list |
| POST | `/api/p2/engage/attachments` | Record attachment metadata |

### Approvals
| Method | Path | Description |
|---|---|---|
| GET | `/api/p2/approvals/flows/:workspaceId` | Approval flows |
| POST | `/api/p2/approvals/trigger` | Trigger approval instance |
| POST | `/api/p2/approvals/action` | Approve / reject action |
| GET | `/api/p2/approvals/pending` | My pending approvals |

### Search & Export
| Method | Path | Description |
|---|---|---|
| GET | `/api/p2/search?q=&workspace_id=&type=` | Cross-workspace search |
| GET | `/api/p2/export/items?workspace_id=&format=csv` | Export items as CSV |
| GET | `/api/p2/export/workspace-summary?workspace_id=` | Summary report CSV |

---

## Data Model (Phase 2 tables)
```
workspaces          — directorate-linked operational boards
workspace_modules   — per-workspace feature flags (comments, gantt, etc.)
workspace_members   — users × workspaces with roles
work_item_types     — configurable types per workspace (Task, Milestone, etc.)
work_item_statuses  — configurable statuses per workspace (Todo, In Progress, etc.)
work_item_priorities— global priority levels (Critical, High, Medium, Low, None)
work_items          — central work record (issued_id, title, status, priority, dates)
work_item_assignees — M:N users × items
work_item_comments  — threaded comments with internal flag
work_item_attachments — R2 file references
work_item_activity  — immutable event log per item
work_item_tags      — tags per workspace
work_item_tag_links — M:N tags × items
work_item_links     — item relationships (blocks, duplicates, related)
saved_views         — filter/sort/group presets per workspace
approval_flows      — configurable approval process definitions
approval_steps      — ordered steps within flows
approval_instances  — triggered approval runs
approval_instance_actions — individual approve/reject/comment actions
notification_jobs   — async notification queue
export_jobs         — export request tracking
```

---

## Deployment Guide

### Prerequisites
- GitHub account (repo created)
- Cloudflare account (free tier works)
- Google Cloud Console project (for OAuth)
- Node.js 18+ installed locally

---

### Step 1 — Clone & Install
```bash
# Extract the zip you downloaded
unzip kbi-platform-phase2.zip -d kbi-platform
cd kbi-platform

# Install dependencies
npm install
```

---

### Step 2 — Cloudflare Setup
```bash
# Login to Cloudflare via Wrangler
npx wrangler login

# Verify your account
npx wrangler whoami
```

---

### Step 3 — Create D1 Database
```bash
# Create production database
npx wrangler d1 create kbi-platform-production

# 🔴 IMPORTANT: Copy the database_id from the output
# Example output:
# ✅ Successfully created DB 'kbi-platform-production'
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Update `wrangler.jsonc`** — replace `REPLACE_WITH_YOUR_D1_DATABASE_ID`:
```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "kbi-platform-production",
    "database_id": "YOUR_ACTUAL_DATABASE_ID_HERE"
  }
]
```

---

### Step 4 — Create KV Namespace (Sessions)
```bash
# Create KV namespace
npx wrangler kv namespace create kbi_sessions

# Output example:
# id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
# preview_id = "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"
```

**Update `wrangler.jsonc`**:
```jsonc
"kv_namespaces": [
  {
    "binding": "KV",
    "id": "YOUR_KV_ID_HERE",
    "preview_id": "YOUR_KV_PREVIEW_ID_HERE"
  }
]
```

---

### Step 5 — Create R2 Bucket (File Storage)
```bash
npx wrangler r2 bucket create kbi-platform-files
```

**Update `wrangler.jsonc`**:
```jsonc
"r2_buckets": [
  {
    "binding": "R2",
    "bucket_name": "kbi-platform-files"
  }
]
```

---

### Step 6 — Create Cloudflare Pages Project
```bash
npx wrangler pages project create kbi-platform \
  --production-branch main \
  --compatibility-date 2024-01-01
```

---

### Step 7 — Apply Database Migrations
```bash
# Apply to production database
npx wrangler d1 migrations apply kbi-platform-production

# Verify migrations ran
npx wrangler d1 execute kbi-platform-production \
  --command "SELECT COUNT(*) FROM workspaces;"
# Should return 27
```

---

### Step 8 — Build & Deploy
```bash
# Build the project
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name kbi-platform

# 🎉 Your platform is live at:
# https://kbi-platform.pages.dev
# or a preview URL like: https://abc123.kbi-platform.pages.dev
```

---

### Step 9 — Set Environment Secrets
```bash
# Google OAuth credentials
npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name kbi-platform
npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name kbi-platform

# JWT secret (generate a strong random string)
npx wrangler pages secret put JWT_SECRET --project-name kbi-platform

# Platform domain (your Cloudflare Pages URL)
npx wrangler pages secret put PLATFORM_DOMAIN --project-name kbi-platform
# Enter: https://kbi-platform.pages.dev

# List all secrets
npx wrangler pages secret list --project-name kbi-platform
```

---

### Step 10 — Bootstrap God Admin
```bash
# Create your first admin account
curl -X POST https://kbi-platform.pages.dev/api/admin/seed-admin \
  -H "Content-Type: application/json" \
  -d '{"email": "your.name@kb.institute"}'

# Response: { "message": "God Admin created", "user_id": 1 }
```

---

### Step 11 — Cloudflare Access (Google SSO Gateway)
1. Go to **Cloudflare Zero Trust** → `one.dash.cloudflare.com`
2. **Access → Applications → Add an Application**
3. Select **Self-hosted**
4. Set Application domain: `kbi-platform.pages.dev`
5. **Add a policy** → Name: "KBI Staff Only"
   - Include rule: **Emails ending in** → `kb.institute`
6. Save application

---

### Step 12 — Google OAuth Setup
1. Go to **Google Cloud Console** → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID → Web Application
3. Authorised JavaScript origins: `https://kbi-platform.pages.dev`
4. Authorised redirect URIs: `https://kbi-platform.pages.dev/api/auth/callback`
5. Copy Client ID + Secret → set as Wrangler secrets (Step 9)

---

### Step 13 — GitHub Actions CI/CD
Add these secrets to your GitHub repository:
- `CLOUDFLARE_API_TOKEN` — Create at dash.cloudflare.com → My Profile → API Tokens
  - Template: "Cloudflare Pages — Edit" 
- `CLOUDFLARE_ACCOUNT_ID` — Found at dash.cloudflare.com (right sidebar)

The `.github/workflows/deploy.yml` will automatically deploy on push to `main`.

---

### Local Development (Sandbox/Dev Machine)
```bash
# Install dependencies
npm install

# Apply local DB migrations
npm run db:migrate:local

# Start dev server (wrangler pages dev with local D1)
npm run dev:d1
# Visit: http://localhost:3000

# Development login (appears in UI when NODE_ENV=development)
# Use: Press "Login (Dev)" → enter any @kb.institute email
```

---

## Acceptance Criteria Checklist

### Phase 1
- [x] Access restricted to @kb.institute Google accounts
- [x] RBAC with 9-role hierarchy enforced on all routes
- [x] God Admin dashboard with pending users, role assignments, audit log
- [x] People Directory (searchable, public profiles only)
- [x] Org Chart (manager tree)
- [x] KBI Calendar (month + list views, directorate-scoped events)
- [x] Guides (Markdown articles, categories, view count)
- [x] Brand Kit (asset repository with download links)
- [x] Permission-aware search across all Phase 1 modules
- [x] CSV export for approved admin/lead roles

### Phase 2
- [x] 27 workspaces across K1-K7 directorates pre-seeded
- [x] List view with filtering, sorting, search
- [x] Kanban board with drag-column grouping
- [x] Gantt chart with date bars and progress
- [x] Calendar view for due-date items
- [x] Work item detail panel (comments, activity, attachments)
- [x] Threaded comments (with internal-only flag)
- [x] Activity history immutable audit log per item
- [x] Approval flows (configurable multi-step)
- [x] Saved views (personal + workspace-shared)
- [x] Advanced cross-workspace search
- [x] CSV export per workspace
- [x] Workspace membership management
- [x] Tags per workspace
- [x] Subtasks (parent-child items)

---

## Support & Next Steps (Phase 3 Ideas)
- Real-time notifications via Cloudflare Durable Objects
- Email digest via Cloudflare Email Workers
- Bulk item operations
- Custom field builder per workspace
- Dependency tracking (item links)
- Recurring events/items
- Public-facing status page

---

*Last updated: April 2026 — KBI Platform Phase 1 + Phase 2 Complete*
