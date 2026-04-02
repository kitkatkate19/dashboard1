// src/index.ts — Main KBI Platform Hono Application (Phase 1 + Phase 2 + Phase 3)

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/cloudflare-workers'
import { Env } from './types'

// Phase 1 routes
import authRoutes      from './routes/auth'
import userRoutes      from './routes/users'
import directoryRoutes from './routes/directory'
import adminRoutes     from './routes/admin'
import calendarRoutes  from './routes/calendar'
import contentRoutes   from './routes/content'
import searchRoutes    from './routes/search'
import exportRoutes    from './routes/export'

// Phase 2 routes
import p2workspaces    from './routes/p2/workspaces'
import p2items         from './routes/p2/items'
import p2approvals     from './routes/p2/approvals'
import p2engage        from './routes/p2/engage'
import p2views         from './routes/p2/views'
import p2export        from './routes/p2/p2export'
import p2search        from './routes/p2/p2search'

// Phase 3 routes
import p3requests      from './routes/p3/requests'
import p3workflows     from './routes/p3/workflows'
import p3analytics     from './routes/p3/analytics'
import p3knowledge     from './routes/p3/knowledge'
import p3accounts      from './routes/p3/accounts'
import p3automation    from './routes/p3/automation'
import p3monitoring    from './routes/p3/monitoring'

const app = new Hono<{ Bindings: Env }>()

// ── Global Middleware ────────────────────────────
app.use('*', logger())
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowHeaders: ['Content-Type','Authorization','Cookie'],
  credentials: true,
}))

// ── Static Assets ────────────────────────────────
app.use('/static/*', serveStatic({ root: './public' }))

// ── Phase 1 API Routes ───────────────────────────
app.route('/api/auth',      authRoutes)
app.route('/api/users',     userRoutes)
app.route('/api/directory', directoryRoutes)
app.route('/api/admin',     adminRoutes)
app.route('/api/calendar',  calendarRoutes)
app.route('/api/content',   contentRoutes)
app.route('/api/search',    searchRoutes)
app.route('/api/export',    exportRoutes)

// ── Phase 2 API Routes ───────────────────────────
app.route('/api/p2/workspaces', p2workspaces)
app.route('/api/p2/items',      p2items)
app.route('/api/p2/approvals',  p2approvals)
app.route('/api/p2/engage',     p2engage)
app.route('/api/p2/views',      p2views)
app.route('/api/p2/export',     p2export)
app.route('/api/p2/search',     p2search)

// ── Phase 3 API Routes ───────────────────────────
app.route('/api/p3/requests',   p3requests)
app.route('/api/p3/workflows',  p3workflows)
app.route('/api/p3/analytics',  p3analytics)
app.route('/api/p3/knowledge',  p3knowledge)
app.route('/api/p3/accounts',   p3accounts)
app.route('/api/p3/automation', p3automation)
app.route('/api/p3/monitoring', p3monitoring)

// ── Health Check ─────────────────────────────────
app.get('/api/health', (c) => c.json({
  status: 'ok',
  version: '3.0.0',
  phase: 'Phase 1+2+3',
  platform: 'KBI Internal Operations Platform'
}))

// ── SPA Shell ────────────────────────────────────
app.get('*', (c) => c.html(getShellHTML()))

function getShellHTML(): string {
  return `<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KBI Internal Operations Platform</title>
  <meta name="robots" content="noindex, nofollow" />

  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            kbi: {
              50: '#f0f0ff', 100: '#e0e1ff', 200: '#c4c5ff',
              300: '#a5a7ff', 400: '#8485ff', 500: '#6366f1',
              600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81'
            }
          }
        }
      }
    }
  </script>

  <!-- Icons -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" />

  <!-- Chart.js -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>

  <!-- Marked (markdown renderer) -->
  <script src="https://cdn.jsdelivr.net/npm/marked@9.1.6/marked.min.js"></script>

  <!-- DayJS -->
  <script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.10/plugin/relativeTime.min.js"></script>

  <!-- App CSS -->
  <link rel="stylesheet" href="/static/app.css" />
</head>
<body class="h-full bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">

  <!-- Confidentiality Popup -->
  <div id="confidentiality-popup" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm hidden">
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 text-center">
      <div class="w-16 h-16 bg-kbi-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <i class="fas fa-shield-alt text-white text-2xl"></i>
      </div>
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-3">Internal Access Only</h2>
      <p class="text-gray-500 dark:text-gray-400 mb-6 text-sm leading-relaxed">
        This platform contains confidential KBI internal information. By continuing, you agree to the KBI Data Usage Policy and confirm you are an authorised KBI team member.
      </p>
      <button onclick="acceptConfidentiality()" class="w-full bg-kbi-600 hover:bg-kbi-700 text-white font-semibold py-3 rounded-xl transition-colors">
        I Understand — Enter Platform
      </button>
    </div>
  </div>

  <!-- Login Screen -->
  <div id="login-screen" class="fixed inset-0 z-40 flex items-center justify-center bg-gradient-to-br from-kbi-900 via-kbi-700 to-indigo-900 hidden">
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-8">
      <div class="text-center mb-8">
        <div class="w-16 h-16 bg-kbi-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <i class="fas fa-building text-white text-2xl"></i>
        </div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">KBI Platform</h1>
        <p class="text-gray-500 dark:text-gray-400 text-sm mt-1">Internal Operations Platform</p>
      </div>
      <button onclick="loginWithGoogle()" class="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-200 hover:border-kbi-400 text-gray-700 font-medium py-3 rounded-xl transition-all shadow-sm hover:shadow-md mb-4">
        <i class="fab fa-google text-red-500 text-lg"></i>
        Continue with Google Workspace
      </button>
      <p class="text-center text-xs text-gray-400 mt-4">Restricted to @kb.institute accounts only</p>
      <div id="dev-login-section" class="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700 hidden">
        <p class="text-xs text-center text-gray-400 mb-3">Development Login</p>
        <input id="dev-email" type="email" placeholder="your@kb.institute" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:border-kbi-400" />
        <button onclick="devLogin()" class="w-full bg-gray-800 text-white text-sm py-2 rounded-lg hover:bg-gray-700">Login (Dev)</button>
      </div>
    </div>
  </div>

  <!-- Main App Shell -->
  <div id="app-shell" class="hidden h-full flex">

    <!-- Sidebar -->
    <aside id="sidebar" class="w-64 flex-shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col h-screen sticky top-0 transition-all duration-300">

      <!-- Logo -->
      <div class="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
        <div class="w-9 h-9 bg-kbi-600 rounded-xl flex items-center justify-center flex-shrink-0">
          <i class="fas fa-building text-white text-sm"></i>
        </div>
        <div class="overflow-hidden">
          <div class="font-bold text-gray-900 dark:text-white text-sm">KBI Platform</div>
          <div class="text-xs text-gray-400" id="user-role-badge">Loading...</div>
        </div>
        <button onclick="toggleSidebar()" class="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 lg:hidden">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <!-- Search Bar -->
      <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-800 relative">
        <div class="relative">
          <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
          <input id="global-search" type="text" placeholder="Search platform..." oninput="debounceSearch(this.value)"
            class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-kbi-400 dark:text-gray-100" />
        </div>
        <div id="search-results" class="absolute left-4 right-4 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 hidden max-h-80 overflow-y-auto"></div>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 overflow-y-auto px-3 py-3 space-y-0.5" id="sidebar-nav">

        <!-- Phase 1 Core -->
        <div class="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Platform</div>
        <a onclick="navigate('home')" class="nav-link active flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-sm font-medium">
          <i class="fas fa-home w-4 text-center"></i> Home
        </a>
        <a onclick="navigate('directory')" class="nav-link flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-sm font-medium">
          <i class="fas fa-users w-4 text-center"></i> People Directory
        </a>
        <a onclick="navigate('org-chart')" class="nav-link flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-sm font-medium">
          <i class="fas fa-sitemap w-4 text-center"></i> Org Chart
        </a>
        <a onclick="navigate('calendar')" class="nav-link flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-sm font-medium">
          <i class="fas fa-calendar w-4 text-center"></i> KBI Calendar
        </a>
        <a onclick="navigate('guides')" class="nav-link flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-sm font-medium">
          <i class="fas fa-book w-4 text-center"></i> Guides
        </a>
        <a onclick="navigate('brand-kit')" class="nav-link flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-sm font-medium">
          <i class="fas fa-palette w-4 text-center"></i> Brand Kit
        </a>

        <!-- Phase 2 Workspaces -->
        <div class="px-3 py-1.5 mt-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Workspaces</div>
        <a onclick="navigate('workspaces')" class="nav-link flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-sm font-medium">
          <i class="fas fa-th-large w-4 text-center"></i> All Workspaces
        </a>

        <!-- Directorate Workspace Groups -->
        <div id="workspace-nav-groups" class="space-y-0.5">
          <!-- Populated dynamically by app.js -->
        </div>

        <!-- Admin Section -->
        <div id="admin-nav-section" class="hidden pt-2">
          <div class="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Administration</div>
          <a onclick="navigate('admin')" class="nav-link flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-sm font-medium">
            <i class="fas fa-crown w-4 text-center text-yellow-500"></i> God Admin
          </a>
          <a onclick="navigate('p2-search')" class="nav-link flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-sm font-medium">
            <i class="fas fa-search-plus w-4 text-center"></i> Advanced Search
          </a>
        </div>
      </nav>

      <!-- User Footer -->
      <div class="border-t border-gray-100 dark:border-gray-800 p-4">
        <div class="flex items-center gap-3">
          <div id="user-avatar" class="w-8 h-8 rounded-full bg-kbi-100 flex items-center justify-center flex-shrink-0">
            <i class="fas fa-user text-kbi-600 text-xs"></i>
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-900 dark:text-white truncate" id="user-display-name">User</div>
            <div class="text-xs text-gray-400 truncate" id="user-email-display"></div>
          </div>
          <div class="flex gap-1">
            <button onclick="toggleDark()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1" title="Toggle dark mode">
              <i class="fas fa-moon" id="dark-icon"></i>
            </button>
            <button onclick="navigate('profile')" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1" title="My Profile">
              <i class="fas fa-cog"></i>
            </button>
            <button onclick="logout()" class="text-gray-400 hover:text-red-500 p-1" title="Logout">
              <i class="fas fa-sign-out-alt"></i>
            </button>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 min-w-0 overflow-y-auto" id="main-content">
      <!-- Top bar (mobile) -->
      <div class="lg:hidden sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center gap-3 z-30">
        <button onclick="toggleSidebar()" class="text-gray-500">
          <i class="fas fa-bars"></i>
        </button>
        <span class="font-semibold text-sm">KBI Platform</span>
      </div>

      <!-- Page Content -->
      <div id="page-content" class="p-6 max-w-7xl mx-auto"></div>
    </main>
  </div>

  <!-- Item Detail Modal -->
  <div id="item-modal" class="fixed inset-0 z-40 hidden bg-black/50 backdrop-blur-sm flex items-start justify-center pt-16 px-4">
    <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
      <div id="item-modal-content" class="flex-1 overflow-y-auto p-6"></div>
    </div>
  </div>

  <!-- Toast Notifications -->
  <div id="toast-container" class="fixed bottom-4 right-4 z-50 space-y-2"></div>

  <!-- App JavaScript (Phase 1) -->
  <script src="/static/app.js"></script>
  <!-- App JavaScript (Phase 2 Extension) -->
  <script src="/static/p2-app.js"></script>
  <!-- App JavaScript (Phase 3 Extension) -->
  <script src="/static/p3-app.js"></script>
</body>
</html>`
}

export default app
