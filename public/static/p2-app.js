// ═══════════════════════════════════════════════════════════════
// KBI Platform Phase 2 — Workspace Engine Frontend Extension
// Appended to Phase 1 app.js
// ═══════════════════════════════════════════════════════════════

// ───── State extensions ─────────────────────────────────────
State.workspaces       = [];
State.currentWorkspace = null;
State.currentView      = 'list'; // list | kanban | gantt | calendar
State.currentFilters   = {};
State.itemModal        = null;

// ───── Extend router with Phase 2 pages ─────────────────────
const _origNavigate = navigate;
// We'll override navigate to include Phase 2 pages
function navigate(page, params = {}) {
  State.currentPage = page;
  closeSidebarOnMobile && closeSidebarOnMobile();

  document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
  const matching = [...document.querySelectorAll('.nav-link')].find(el =>
    el.getAttribute('onclick')?.includes(`'${page}'`)
  );
  if (matching) matching.classList.add('active');

  const content = document.getElementById('page-content');
  if (content) content.innerHTML = `<div class="flex justify-center py-20"><div class="spinner"></div></div>`;

  const p2pages = {
    workspaces:     renderWorkspaces,
    workspace:      renderWorkspace,
    'p2-search':    renderP2Search,
  };

  const p1pages = {
    home:       renderHome,
    directory:  renderDirectory,
    'org-chart': renderOrgChart,
    calendar:   renderCalendar,
    guides:     renderGuides,
    'brand-kit': renderBrandKit,
    admin:      renderAdmin,
    profile:    renderProfile,
  };

  const fn = p2pages[page] || p1pages[page];
  if (fn) {
    fn(params).catch(e => {
      if (content) content.innerHTML = `<div class="text-center py-20 text-red-500"><i class="fas fa-exclamation-triangle text-3xl mb-4"></i><p>${e.message}</p></div>`;
    });
  }
}

// ───── Load workspaces for sidebar nav ──────────────────────
async function loadWorkspacesNav() {
  try {
    const data = await GET('/p2/workspaces');
    State.workspaces = data.workspaces || [];
    renderWorkspaceNav(State.workspaces);
  } catch {}
}

function renderWorkspaceNav(workspaces) {
  const container = document.getElementById('workspace-nav-groups');
  if (!container) return;

  // Group by directorate
  const groups = {};
  workspaces.forEach(ws => {
    const key = ws.dir_code || 'Other';
    if (!groups[key]) groups[key] = { name: ws.dir_name || 'Other', color: ws.dir_color || '#6366f1', workspaces: [] };
    groups[key].workspaces.push(ws);
  });

  container.innerHTML = Object.entries(groups).map(([code, group]) => `
    <div class="mb-1">
      <button onclick="toggleNavGroup('${code}')"
        class="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-200 transition-colors rounded-lg">
        <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${group.color}"></span>
        <span class="flex-1 text-left truncate">${code} — ${group.name}</span>
        <i class="fas fa-chevron-down text-xs transition-transform" id="nav-chevron-${code}"></i>
      </button>
      <div id="nav-group-${code}" class="pl-2 space-y-0.5">
        ${group.workspaces.map(ws => `
          <a onclick="navigate('workspace', {id:${ws.id}})"
            class="nav-link flex items-center gap-2 px-3 py-1.5 rounded-xl cursor-pointer text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors truncate">
            <span>${ws.icon || '📋'}</span>
            <span class="truncate">${ws.name}</span>
          </a>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function toggleNavGroup(code) {
  const group = document.getElementById(`nav-group-${code}`);
  const chevron = document.getElementById(`nav-chevron-${code}`);
  if (group) {
    const isHidden = group.classList.toggle('hidden');
    if (chevron) chevron.style.transform = isHidden ? 'rotate(-90deg)' : '';
  }
}

// Extend showApp to load workspace nav
const _origShowApp = showApp;
function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  updateUserUI();
  loadWorkspacesNav();
  navigate('home');
}

// ═══════════════════════════════════════════════
// WORKSPACES OVERVIEW PAGE
// ═══════════════════════════════════════════════
async function renderWorkspaces() {
  document.getElementById('page-content').innerHTML = `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          <i class="fas fa-th-large mr-3 text-kbi-500"></i>Workspaces
        </h1>
        ${canManageWorkspaces() ? `
          <button onclick="showCreateWorkspaceModal()" class="btn btn-primary text-sm">
            <i class="fas fa-plus"></i> New Workspace
          </button>
        ` : ''}
      </div>

      <!-- Filter -->
      <div class="flex flex-wrap gap-3">
        <input type="text" id="ws-filter" placeholder="Filter workspaces..." oninput="filterWorkspaceCards()"
          class="input flex-1 max-w-xs" />
        <div id="ws-dir-pills" class="flex flex-wrap gap-2"></div>
      </div>

      <!-- Workspace Grid -->
      <div id="workspace-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <div class="col-span-full flex justify-center py-16"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  try {
    const data = await GET('/p2/workspaces');
    State.workspaces = data.workspaces || [];
    renderWorkspaceGrid(State.workspaces);
    renderWsDirPills(State.workspaces);
  } catch (e) {
    document.getElementById('workspace-grid').innerHTML = `<p class="text-red-500 col-span-full">${e.message}</p>`;
  }
}

function renderWsDirPills(workspaces) {
  const dirs = [...new Map(workspaces.map(ws => [ws.dir_code, { code: ws.dir_code, color: ws.dir_color }])).values()];
  const el = document.getElementById('ws-dir-pills');
  if (!el) return;
  el.innerHTML = `
    <button onclick="filterWsByDir('')" class="dir-pill-btn active text-xs px-3 py-1.5 rounded-full border border-gray-200 font-medium">All</button>
    ${dirs.map(d => d.code ? `
      <button onclick="filterWsByDir('${d.code}')" style="background:${d.color}15;border-color:${d.color}40;color:${d.color}"
        class="dir-pill-btn text-xs px-3 py-1.5 rounded-full border font-medium">${d.code}</button>
    ` : '').join('')}
  `;
}

let _wsDirFilter = '';
function filterWsByDir(code) {
  _wsDirFilter = code;
  document.querySelectorAll('.dir-pill-btn').forEach(b => b.classList.remove('active'));
  event?.target?.classList.add('active');
  filterWorkspaceCards();
}

function filterWorkspaceCards() {
  const q = document.getElementById('ws-filter')?.value.toLowerCase() || '';
  const filtered = State.workspaces.filter(ws => {
    const matchQ = !q || ws.name.toLowerCase().includes(q) || ws.code?.toLowerCase().includes(q);
    const matchDir = !_wsDirFilter || ws.dir_code === _wsDirFilter;
    return matchQ && matchDir;
  });
  renderWorkspaceGrid(filtered);
}

function renderWorkspaceGrid(workspaces) {
  const grid = document.getElementById('workspace-grid');
  if (!workspaces.length) {
    grid.innerHTML = `<div class="col-span-full text-center py-16 text-gray-400"><i class="fas fa-th-large text-5xl mb-4"></i><p>No workspaces found</p></div>`;
    return;
  }

  const viewIcons = { list: 'fa-list', kanban: 'fa-columns', gantt: 'fa-stream', calendar: 'fa-calendar' };

  grid.innerHTML = workspaces.map(ws => `
    <div onclick="navigate('workspace', {id:${ws.id}})"
      class="card cursor-pointer hover:border-kbi-300 hover:shadow-md transition-all group">
      <div class="flex items-start gap-3 mb-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
          style="background:${ws.color || '#6366f1'}15">
          ${ws.icon || '📋'}
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-gray-900 dark:text-white text-sm truncate group-hover:text-kbi-600 transition-colors">${ws.name}</div>
          <div class="text-xs text-gray-400">${ws.code || ''}</div>
        </div>
        <span class="badge text-xs" style="background:${ws.dir_color || '#6366f1'}15;color:${ws.dir_color || '#6366f1'}">${ws.dir_code || ''}</span>
      </div>
      ${ws.description ? `<p class="text-xs text-gray-500 mb-3 line-clamp-2">${ws.description}</p>` : ''}
      <div class="flex items-center justify-between text-xs text-gray-400">
        <div class="flex items-center gap-3">
          <span><i class="fas fa-tasks mr-1"></i>${ws.item_count || 0} items</span>
          <span><i class="fas fa-users mr-1"></i>${ws.member_count || 0}</span>
        </div>
        <span class="flex items-center gap-1">
          <i class="fas ${viewIcons[ws.default_view] || 'fa-list'} text-kbi-400"></i>
          ${ws.default_view || 'list'}
        </span>
      </div>
    </div>
  `).join('');
}

function canManageWorkspaces() {
  return State.session?.isGodAdmin ||
    State.session?.roles?.some(r => ['god_admin','platform_admin'].includes(r));
}

// ═══════════════════════════════════════════════
// WORKSPACE DETAIL PAGE
// ═══════════════════════════════════════════════
async function renderWorkspace(params = {}) {
  const wsId = params.id;
  if (!wsId) return navigate('workspaces');

  try {
    const [wsData, itemsData, statusesData, prioritiesData] = await Promise.all([
      GET(`/p2/workspaces/${wsId}`),
      GET(`/p2/items?workspace_id=${wsId}&page=1`),
      GET(`/p2/workspaces/${wsId}/statuses`).catch(() => ({ statuses: defaultStatuses() })),
      GET(`/p2/workspaces/${wsId}/priorities`).catch(() => ({ priorities: defaultPriorities() })),
    ]);

    const ws = wsData.workspace;
    State.currentWorkspace = ws;
    State.currentView = ws.default_view || 'list';

    document.getElementById('page-content').innerHTML = `
      <div class="space-y-4">
        <!-- Workspace Header -->
        <div class="flex items-center gap-4">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
            style="background:${ws.color || '#6366f1'}20">
            ${ws.icon || '📋'}
          </div>
          <div class="flex-1">
            <div class="flex items-center gap-3">
              <h1 class="text-xl font-bold text-gray-900 dark:text-white">${ws.name}</h1>
              <span class="badge" style="background:${ws.dir_color || '#6366f1'}15;color:${ws.dir_color || '#6366f1'}">${ws.dir_code || ''}</span>
            </div>
            ${ws.description ? `<p class="text-sm text-gray-500">${ws.description}</p>` : ''}
          </div>
          <div class="flex items-center gap-2">
            <button onclick="exportWorkspaceCSV(${wsId})" class="btn btn-secondary text-sm" title="Export CSV">
              <i class="fas fa-download"></i>
            </button>
            <button onclick="showCreateItemModal(${wsId})" class="btn btn-primary text-sm">
              <i class="fas fa-plus"></i> New Item
            </button>
          </div>
        </div>

        <!-- View Toolbar -->
        <div class="flex flex-wrap items-center gap-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-2.5">
          <!-- View switcher -->
          <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            ${[
              { id:'list',     icon:'fa-list',      label:'List' },
              { id:'kanban',   icon:'fa-columns',   label:'Kanban' },
              { id:'gantt',    icon:'fa-stream',    label:'Gantt' },
              { id:'calendar', icon:'fa-calendar',  label:'Calendar' },
            ].map(v => `
              <button id="view-btn-${v.id}" onclick="switchView('${v.id}', ${wsId})"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${State.currentView === v.id ? 'bg-white dark:bg-gray-700 text-kbi-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}">
                <i class="fas ${v.icon}"></i> ${v.label}
              </button>
            `).join('')}
          </div>

          <!-- Filters -->
          <div class="flex items-center gap-2 flex-1 flex-wrap">
            <select id="ws-status-filter" onchange="applyWorkspaceFilters(${wsId})" class="input text-xs py-1.5 max-w-[120px]">
              <option value="">All Status</option>
              ${(statusesData.statuses || defaultStatuses()).map(s => `<option value="${s.slug}">${s.name}</option>`).join('')}
            </select>
            <select id="ws-priority-filter" onchange="applyWorkspaceFilters(${wsId})" class="input text-xs py-1.5 max-w-[120px]">
              <option value="">All Priority</option>
              ${(prioritiesData.priorities || defaultPriorities()).map(p => `<option value="${p.slug}">${p.icon || ''} ${p.name}</option>`).join('')}
            </select>
            <input type="text" id="ws-search-filter" placeholder="Search items..." oninput="debounceWorkspaceSearch(${wsId})"
              class="input text-xs py-1.5 max-w-[180px]" />
            <select id="ws-sort" onchange="applyWorkspaceFilters(${wsId})" class="input text-xs py-1.5 max-w-[130px]">
              <option value="updated_desc">Recently Updated</option>
              <option value="created_desc">Newest First</option>
              <option value="created_asc">Oldest First</option>
              <option value="priority_asc">Priority (High→Low)</option>
              <option value="due_asc">Due Date</option>
            </select>
          </div>
        </div>

        <!-- View Content -->
        <div id="workspace-view-content">
          <div class="flex justify-center py-16"><div class="spinner"></div></div>
        </div>
      </div>
    `;

    await renderWorkspaceView(wsId, itemsData.items || [], State.currentView, statusesData.statuses || defaultStatuses());

  } catch (e) {
    document.getElementById('page-content').innerHTML = `<div class="text-center py-20 text-red-500"><i class="fas fa-exclamation-triangle text-3xl mb-3"></i><p>${e.message}</p></div>`;
  }
}

function defaultStatuses() {
  return [
    { id:1, name:'Backlog',      slug:'backlog',     color:'#94a3b8', category:'todo' },
    { id:2, name:'To Do',        slug:'todo',        color:'#60a5fa', category:'todo' },
    { id:3, name:'In Progress',  slug:'in_progress', color:'#f59e0b', category:'in_progress' },
    { id:4, name:'In Review',    slug:'in_review',   color:'#8b5cf6', category:'in_progress' },
    { id:5, name:'Blocked',      slug:'blocked',     color:'#ef4444', category:'in_progress' },
    { id:6, name:'Done',         slug:'done',        color:'#10b981', category:'done' },
    { id:7, name:'Cancelled',    slug:'cancelled',   color:'#64748b', category:'cancelled' },
  ];
}

function defaultPriorities() {
  return [
    { id:1, name:'Critical', slug:'critical', color:'#dc2626', icon:'🔴' },
    { id:2, name:'High',     slug:'high',     color:'#f59e0b', icon:'🟠' },
    { id:3, name:'Medium',   slug:'medium',   color:'#60a5fa', icon:'🔵' },
    { id:4, name:'Low',      slug:'low',      color:'#94a3b8', icon:'⚪' },
  ];
}

async function switchView(viewId, wsId) {
  State.currentView = viewId;
  document.querySelectorAll('[id^="view-btn-"]').forEach(btn => {
    const isActive = btn.id === `view-btn-${viewId}`;
    btn.className = `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${isActive ? 'bg-white dark:bg-gray-700 text-kbi-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`;
  });
  await loadWorkspaceView(wsId);
}

let _wsSearchTimer;
function debounceWorkspaceSearch(wsId) {
  clearTimeout(_wsSearchTimer);
  _wsSearchTimer = setTimeout(() => applyWorkspaceFilters(wsId), 350);
}

async function applyWorkspaceFilters(wsId) {
  await loadWorkspaceView(wsId);
}

async function loadWorkspaceView(wsId) {
  const status   = document.getElementById('ws-status-filter')?.value || '';
  const priority = document.getElementById('ws-priority-filter')?.value || '';
  const search   = document.getElementById('ws-search-filter')?.value || '';
  const sort     = document.getElementById('ws-sort')?.value || 'updated_desc';

  let url = `/p2/items?workspace_id=${wsId}`;
  if (status)   url += `&status=${status}`;
  if (priority) url += `&priority=${priority}`;
  if (search)   url += `&search=${encodeURIComponent(search)}`;
  url += `&sort=${sort}&page=1`;

  const container = document.getElementById('workspace-view-content');
  if (!container) return;

  try {
    const [itemsData, statusesData] = await Promise.all([
      GET(url),
      GET(`/p2/workspaces/${wsId}/statuses`).catch(() => ({ statuses: defaultStatuses() })),
    ]);
    await renderWorkspaceView(wsId, itemsData.items || [], State.currentView, statusesData.statuses || defaultStatuses());
  } catch (e) {
    container.innerHTML = `<p class="text-red-500 text-center py-10">${e.message}</p>`;
  }
}

async function renderWorkspaceView(wsId, items, view, statuses) {
  const container = document.getElementById('workspace-view-content');
  if (!container) return;

  if (view === 'kanban') {
    container.innerHTML = renderKanbanView(items, statuses, wsId);
  } else if (view === 'gantt') {
    container.innerHTML = renderGanttView(items, wsId);
  } else if (view === 'calendar') {
    container.innerHTML = await renderItemCalendarView(items, wsId);
  } else {
    container.innerHTML = renderListView(items, wsId);
  }
}

// ═══════════════════════════════════════════════
// LIST VIEW
// ═══════════════════════════════════════════════
function renderListView(items, wsId) {
  if (!items.length) return emptyState('No items found. Create your first item!');

  return `
    <div class="card p-0 overflow-hidden">
      <!-- Table Header -->
      <div class="grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        <div class="col-span-5">Title</div>
        <div class="col-span-2">Status</div>
        <div class="col-span-1">Priority</div>
        <div class="col-span-2">Owner</div>
        <div class="col-span-1">Due</div>
        <div class="col-span-1 text-right">Actions</div>
      </div>

      <!-- Items -->
      <div class="divide-y divide-gray-100 dark:divide-gray-800">
        ${items.map(item => `
          <div onclick="openItemModal(${item.id}, ${wsId})"
            class="grid grid-cols-12 gap-2 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors group items-center">

            <div class="col-span-5 flex items-center gap-3 min-w-0">
              <div class="flex-shrink-0 w-4">
                ${getItemTypeIcon(item.type_slug)}
              </div>
              <div class="min-w-0">
                <div class="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-kbi-600">${item.title}</div>
                <div class="text-xs text-gray-400">${item.issued_id || ''}</div>
              </div>
            </div>

            <div class="col-span-2">
              <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                style="background:${item.status_color || '#94a3b8'}20;color:${item.status_color || '#94a3b8'}">
                ${item.status_name || 'No Status'}
              </span>
            </div>

            <div class="col-span-1">
              <span class="text-xs">${getPriorityBadge(item.priority_slug)}</span>
            </div>

            <div class="col-span-2 text-xs text-gray-500 truncate">
              ${item.owner_name || '—'}
            </div>

            <div class="col-span-1 text-xs ${isDueSoon(item.due_at) ? 'text-red-500 font-medium' : 'text-gray-400'}">
              ${item.due_at ? dayjs(item.due_at).format('MMM D') : '—'}
            </div>

            <div class="col-span-1 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onclick="event.stopPropagation(); openItemModal(${item.id}, ${wsId})" class="text-gray-400 hover:text-kbi-600 p-1">
                <i class="fas fa-expand-alt text-xs"></i>
              </button>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Footer -->
      <div class="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400">
        ${items.length} items
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════
// KANBAN VIEW
// ═══════════════════════════════════════════════
function renderKanbanView(items, statuses, wsId) {
  const columns = statuses.map(s => ({
    ...s,
    items: items.filter(i => i.status_slug === s.slug || i.status_name === s.name),
  }));

  return `
    <div class="flex gap-4 overflow-x-auto pb-4 kanban-board">
      ${columns.map(col => `
        <div class="kanban-col flex-shrink-0 w-72 flex flex-col">
          <!-- Column Header -->
          <div class="flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 mb-3 shadow-sm">
            <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${col.color}"></span>
            <span class="text-sm font-semibold text-gray-800 dark:text-gray-200 flex-1">${col.name}</span>
            <span class="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">${col.items.length}</span>
            <button onclick="showCreateItemModalWithStatus(${wsId}, '${col.slug}')" class="text-gray-400 hover:text-kbi-600 ml-1">
              <i class="fas fa-plus text-xs"></i>
            </button>
          </div>

          <!-- Cards -->
          <div class="flex-1 space-y-2 min-h-[120px]" data-status="${col.slug}">
            ${col.items.map(item => renderKanbanCard(item, wsId)).join('')}
            ${!col.items.length ? `<div class="h-16 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center text-xs text-gray-400">Drop here</div>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderKanbanCard(item, wsId) {
  return `
    <div onclick="openItemModal(${item.id}, ${wsId})"
      class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3 cursor-pointer hover:border-kbi-300 hover:shadow-md transition-all group">

      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="flex-1 min-w-0">
          <div class="text-xs text-gray-400 mb-0.5">${item.issued_id || ''}</div>
          <div class="text-sm font-medium text-gray-900 dark:text-white group-hover:text-kbi-600 line-clamp-2">${item.title}</div>
        </div>
        <span class="flex-shrink-0 text-xs">${getPriorityBadge(item.priority_slug)}</span>
      </div>

      ${item.tags_json ? (() => {
        try {
          const tags = JSON.parse(item.tags_json);
          return tags.length ? `<div class="flex flex-wrap gap-1 mb-2">${tags.slice(0,3).map(t => `<span class="text-xs px-1.5 py-0.5 rounded-md font-medium" style="background:${t.color}20;color:${t.color}">${t.name}</span>`).join('')}</div>` : '';
        } catch { return ''; }
      })() : ''}

      <div class="flex items-center justify-between text-xs text-gray-400 mt-2">
        <div class="flex items-center gap-2">
          ${item.comment_count ? `<span><i class="fas fa-comment mr-1"></i>${item.comment_count}</span>` : ''}
          ${item.attachment_count ? `<span><i class="fas fa-paperclip mr-1"></i>${item.attachment_count}</span>` : ''}
          ${item.progress ? `<span class="text-kbi-500">${item.progress}%</span>` : ''}
        </div>
        ${item.due_at ? `<span class="${isDueSoon(item.due_at) ? 'text-red-500 font-medium' : ''}">${dayjs(item.due_at).format('MMM D')}</span>` : ''}
      </div>

      ${item.owner_name ? `
        <div class="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-50 dark:border-gray-800">
          <div class="w-5 h-5 rounded-full bg-kbi-100 flex items-center justify-center text-kbi-600 text-xs font-bold">
            ${item.owner_name.charAt(0).toUpperCase()}
          </div>
          <span class="text-xs text-gray-400 truncate">${item.owner_name}</span>
        </div>
      ` : ''}
    </div>
  `;
}

// ═══════════════════════════════════════════════
// GANTT VIEW
// ═══════════════════════════════════════════════
function renderGanttView(items, wsId) {
  if (!items.length) return emptyState('No items found. Create items with start and due dates to see them in Gantt view.');

  const today = dayjs();
  const itemsWithDates = items.filter(i => i.start_at || i.due_at);

  if (!itemsWithDates.length) {
    return `
      <div class="card text-center py-12 text-gray-400">
        <i class="fas fa-stream text-4xl mb-3"></i>
        <p class="font-medium">No items with dates</p>
        <p class="text-sm mt-1">Add start and due dates to items to see them on the Gantt chart.</p>
      </div>
    `;
  }

  // Calculate date range
  let minDate = dayjs(today).subtract(1, 'week');
  let maxDate = dayjs(today).add(8, 'weeks');

  itemsWithDates.forEach(i => {
    const s = i.start_at ? dayjs(i.start_at) : null;
    const d = i.due_at ? dayjs(i.due_at) : null;
    if (s && s.isBefore(minDate)) minDate = s.subtract(3, 'days');
    if (d && d.isAfter(maxDate)) maxDate = d.add(3, 'days');
  });

  const totalDays = maxDate.diff(minDate, 'day');
  const colWidthPx = 36;

  // Build week headers
  let weekHeaders = '';
  let curr = minDate.startOf('week');
  while (curr.isBefore(maxDate)) {
    const weekDays = Math.min(7, maxDate.diff(curr, 'day'));
    weekHeaders += `<div class="text-xs text-gray-400 border-r border-gray-200 dark:border-gray-700 text-center py-1" style="width:${weekDays * colWidthPx}px;min-width:${weekDays * colWidthPx}px">
      ${curr.format('MMM D')}
    </div>`;
    curr = curr.add(7, 'day');
  }

  // Build day headers
  let dayHeaders = '';
  for (let i = 0; i < totalDays; i++) {
    const d = minDate.add(i, 'day');
    const isToday = d.isSame(today, 'day');
    const isWeekend = d.day() === 0 || d.day() === 6;
    dayHeaders += `<div class="text-xs border-r border-gray-200 dark:border-gray-700 text-center py-1 flex-shrink-0 ${isToday ? 'bg-kbi-50 dark:bg-kbi-900/30 text-kbi-600 font-bold' : isWeekend ? 'bg-gray-50 dark:bg-gray-800/50 text-gray-300' : 'text-gray-400'}"
      style="width:${colWidthPx}px">
      ${d.format('D')}
    </div>`;
  }

  // Today line position
  const todayOffset = today.diff(minDate, 'day');

  // Build item rows
  const itemRows = itemsWithDates.map(item => {
    const startDay = item.start_at ? dayjs(item.start_at).diff(minDate, 'day') : todayOffset;
    const endDay   = item.due_at ? dayjs(item.due_at).diff(minDate, 'day') : startDay + 1;
    const barStart = Math.max(0, startDay) * colWidthPx;
    const barWidth = Math.max(colWidthPx, (endDay - Math.max(0, startDay)) * colWidthPx);
    const progress = item.progress || 0;

    return `
      <div class="gantt-row flex border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30">
        <!-- Label -->
        <div class="gantt-label flex items-center gap-2 px-3 py-2 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 sticky left-0 z-10 min-w-0"
          style="width:220px;min-width:220px">
          <span class="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0"
            style="background:${item.status_color || '#94a3b8'}20;color:${item.status_color || '#94a3b8'}">${item.status_name || ''}</span>
          <span class="text-xs text-gray-800 dark:text-gray-200 truncate cursor-pointer hover:text-kbi-600" onclick="openItemModal(${item.id}, ${wsId})">${item.title}</span>
        </div>

        <!-- Gantt Track -->
        <div class="gantt-track relative flex-1" style="width:${totalDays * colWidthPx}px;min-width:${totalDays * colWidthPx}px;height:40px">
          <!-- Today line -->
          <div class="absolute top-0 bottom-0 w-px bg-kbi-400/60 z-10 pointer-events-none" style="left:${todayOffset * colWidthPx}px"></div>

          <!-- Bar -->
          <div onclick="openItemModal(${item.id}, ${wsId})"
            class="absolute top-1/2 -translate-y-1/2 rounded-lg cursor-pointer hover:opacity-90 transition-opacity overflow-hidden"
            style="left:${barStart}px;width:${barWidth}px;height:22px;background:${item.status_color || '#6366f1'}">
            <div class="h-full rounded-lg opacity-60" style="width:${progress}%;background:rgba(255,255,255,0.4)"></div>
            <div class="absolute inset-0 flex items-center px-2 text-white text-xs font-medium truncate">
              ${barWidth > 60 ? item.title : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="card p-0 overflow-hidden">
      <div class="overflow-x-auto">
        <div style="min-width:${220 + totalDays * colWidthPx}px">
          <!-- Header -->
          <div class="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div class="flex-shrink-0 border-r border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-semibold text-gray-500" style="width:220px;min-width:220px">Item</div>
            <div class="flex">${weekHeaders}</div>
          </div>
          <div class="flex border-b-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div class="flex-shrink-0 border-r border-gray-200 dark:border-gray-700" style="width:220px;min-width:220px"></div>
            <div class="flex">${dayHeaders}</div>
          </div>
          <!-- Rows -->
          ${itemRows}
        </div>
      </div>
      <div class="px-4 py-2 text-xs text-gray-400 border-t border-gray-200 dark:border-gray-700">
        ${itemsWithDates.length} items with dates
        ${items.length > itemsWithDates.length ? ` · ${items.length - itemsWithDates.length} without dates (hidden)` : ''}
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════
// CALENDAR VIEW (Workspace Items)
// ═══════════════════════════════════════════════
async function renderItemCalendarView(items, wsId) {
  const now = State.wsCalYear ? new Date(State.wsCalYear, State.wsCalMonth, 1) : new Date();
  State.wsCalYear  = now.getFullYear();
  State.wsCalMonth = now.getMonth();

  const firstDay = new Date(State.wsCalYear, State.wsCalMonth, 1).getDay();
  const daysInMonth = new Date(State.wsCalYear, State.wsCalMonth + 1, 0).getDate();
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const today = new Date();

  const monthTitle = new Date(State.wsCalYear, State.wsCalMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Build event map from items with due_at
  const eventMap = {};
  items.filter(i => i.due_at).forEach(i => {
    const d = dayjs(i.due_at).format('YYYY-MM-DD');
    if (!eventMap[d]) eventMap[d] = [];
    eventMap[d].push(i);
  });

  let grid = `<div class="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 rounded-xl overflow-hidden">`;
  days.forEach(d => {
    grid += `<div class="bg-gray-50 dark:bg-gray-800 text-center text-xs font-semibold text-gray-500 py-2">${d}</div>`;
  });
  for (let i = 0; i < firstDay; i++) grid += `<div class="bg-white dark:bg-gray-900 cal-cell"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${State.wsCalYear}-${String(State.wsCalMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = today.getDate() === d && today.getMonth() === State.wsCalMonth && today.getFullYear() === State.wsCalYear;
    const dayItems = eventMap[dateStr] || [];
    grid += `<div class="bg-white dark:bg-gray-900 cal-cell ${isToday ? 'ring-2 ring-kbi-400 ring-inset' : ''}">
      <div class="text-xs ${isToday ? 'w-6 h-6 bg-kbi-600 text-white rounded-full flex items-center justify-center font-bold' : 'text-gray-500 font-medium'} mb-1">${d}</div>
      ${dayItems.slice(0,2).map(i => `
        <div onclick="openItemModal(${i.id}, ${wsId})"
          class="cal-event text-white rounded cursor-pointer"
          style="background:${i.status_color || '#6366f1'}"
          title="${i.title}">
          ${i.title}
        </div>`).join('')}
      ${dayItems.length > 2 ? `<div class="text-xs text-gray-400">+${dayItems.length - 2}</div>` : ''}
    </div>`;
  }
  grid += `</div>`;

  return `
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <button onclick="changeWsCalMonth(-1, ${wsId})" class="btn btn-secondary"><i class="fas fa-chevron-left"></i></button>
        <h2 class="font-semibold text-gray-900 dark:text-white">${monthTitle}</h2>
        <button onclick="changeWsCalMonth(1, ${wsId})" class="btn btn-secondary"><i class="fas fa-chevron-right"></i></button>
      </div>
      ${grid}
    </div>
  `;
}

async function changeWsCalMonth(dir, wsId) {
  State.wsCalMonth = (State.wsCalMonth || 0) + dir;
  if (State.wsCalMonth < 0) { State.wsCalMonth = 11; State.wsCalYear = (State.wsCalYear || new Date().getFullYear()) - 1; }
  if (State.wsCalMonth > 11) { State.wsCalMonth = 0; State.wsCalYear = (State.wsCalYear || new Date().getFullYear()) + 1; }
  await loadWorkspaceView(wsId);
}

// ═══════════════════════════════════════════════
// ITEM DETAIL MODAL
// ═══════════════════════════════════════════════
async function openItemModal(itemId, wsId) {
  const modal = document.getElementById('item-modal');
  if (!modal) return;

  modal.classList.remove('hidden');
  document.getElementById('item-modal-content').innerHTML = `<div class="flex justify-center py-10"><div class="spinner"></div></div>`;

  try {
    const [item, commentsData, activityData, attachmentsData] = await Promise.all([
      GET(`/p2/items/${itemId}`),
      GET(`/p2/engage/comments/${itemId}`).catch(() => ({ comments: [] })),
      GET(`/p2/engage/activity/${itemId}`).catch(() => ({ activity: [] })),
      GET(`/p2/engage/attachments/${itemId}`).catch(() => ({ attachments: [] })),
    ]);

    const canEdit = State.session?.isGodAdmin ||
      State.session?.roles?.some(r => ['god_admin','platform_admin','directorate_lead','workspace_admin','team_lead'].includes(r)) ||
      item.owner_user_id === State.user?.id;

    const tags = item.tags_json ? (() => { try { return JSON.parse(item.tags_json); } catch { return []; } })() : [];
    const assignees = item.assignees_json ? (() => { try { return JSON.parse(item.assignees_json); } catch { return []; } })() : [];

    document.getElementById('item-modal-content').innerHTML = `
      <div class="flex items-start justify-between mb-4 gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <code class="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">${item.issued_id || ''}</code>
            <span class="badge text-xs" style="background:${item.dir_color || '#6366f1'}15;color:${item.dir_color || '#6366f1'}">${item.dir_code || ''}</span>
          </div>
          <h2 class="text-xl font-bold text-gray-900 dark:text-white">${item.title}</h2>
        </div>
        <button onclick="closeItemModal()" class="text-gray-400 hover:text-gray-600 flex-shrink-0 text-xl">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Main Content -->
        <div class="lg:col-span-2 space-y-5">

          <!-- Description -->
          <div>
            <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Description</div>
            ${item.description
              ? `<div class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed prose dark:prose-invert max-w-none">${marked.parse(item.description)}</div>`
              : `<p class="text-sm text-gray-400 italic">No description</p>`
            }
          </div>

          <!-- Tags -->
          ${tags.length ? `
            <div>
              <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Tags</div>
              <div class="flex flex-wrap gap-1.5">
                ${tags.map(t => `<span class="text-xs px-2 py-0.5 rounded-full font-medium" style="background:${t.color}20;color:${t.color}">${t.name}</span>`).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Progress -->
          ${item.progress !== null && item.progress !== undefined ? `
            <div>
              <div class="flex items-center justify-between mb-1">
                <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Progress</div>
                <span class="text-xs font-bold text-kbi-600">${item.progress}%</span>
              </div>
              <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div class="h-2 rounded-full bg-kbi-500 transition-all" style="width:${item.progress}%"></div>
              </div>
            </div>
          ` : ''}

          <!-- Tabs: Comments | Activity | Attachments -->
          <div>
            <div class="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-4">
              ${['Comments','Activity','Attachments'].map((tab, i) => `
                <button onclick="switchItemTab(${i}, ${itemId}, ${wsId})" id="item-tab-btn-${i}"
                  class="item-tab-btn px-4 py-2 text-sm font-medium border-b-2 transition-colors ${i === 0 ? 'border-kbi-500 text-kbi-600' : 'border-transparent text-gray-500 hover:text-gray-700'}">
                  ${tab} ${i === 0 ? `(${commentsData.comments.length})` : i === 2 ? `(${attachmentsData.attachments.length})` : ''}
                </button>
              `).join('')}
            </div>
            <div id="item-tab-content">
              ${renderComments(commentsData.comments, itemId, wsId)}
            </div>
          </div>
        </div>

        <!-- Sidebar Meta -->
        <div class="space-y-4">
          <!-- Status & Priority -->
          <div class="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-3">
            <div>
              <div class="text-xs text-gray-400 mb-1">Status</div>
              <span class="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg font-medium"
                style="background:${item.status_color || '#94a3b8'}20;color:${item.status_color || '#94a3b8'}">
                ● ${item.status_name || 'No Status'}
              </span>
            </div>
            <div>
              <div class="text-xs text-gray-400 mb-1">Priority</div>
              <span class="text-sm font-medium">${getPriorityBadge(item.priority_slug)} ${item.priority_name || '—'}</span>
            </div>
            ${item.owner_name ? `
              <div>
                <div class="text-xs text-gray-400 mb-1">Owner</div>
                <div class="flex items-center gap-2">
                  <div class="w-6 h-6 rounded-full bg-kbi-100 flex items-center justify-center text-kbi-600 text-xs font-bold">${item.owner_name.charAt(0).toUpperCase()}</div>
                  <span class="text-sm font-medium">${item.owner_name}</span>
                </div>
              </div>
            ` : ''}
            ${assignees.length ? `
              <div>
                <div class="text-xs text-gray-400 mb-1">Assignees</div>
                <div class="flex flex-wrap gap-1.5">
                  ${assignees.map(a => `
                    <div class="flex items-center gap-1.5 bg-white dark:bg-gray-700 rounded-lg px-2 py-1">
                      <div class="w-5 h-5 rounded-full bg-kbi-100 flex items-center justify-center text-kbi-600 text-xs font-bold">${a.display_name?.charAt(0) || '?'}</div>
                      <span class="text-xs">${a.display_name || a.email}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>

          <!-- Dates -->
          <div class="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-2 text-sm">
            ${item.start_at ? `<div class="flex justify-between"><span class="text-gray-400">Start</span><span class="font-medium">${dayjs(item.start_at).format('MMM D, YYYY')}</span></div>` : ''}
            ${item.due_at ? `<div class="flex justify-between"><span class="text-${isDueSoon(item.due_at)?'red-500 font-medium':'gray-400'}">Due</span><span class="font-medium ${isDueSoon(item.due_at)?'text-red-500':''}">${dayjs(item.due_at).format('MMM D, YYYY')}</span></div>` : ''}
            ${item.completed_at ? `<div class="flex justify-between"><span class="text-gray-400">Completed</span><span class="font-medium text-green-600">${dayjs(item.completed_at).format('MMM D, YYYY')}</span></div>` : ''}
            ${item.estimated_hours ? `<div class="flex justify-between"><span class="text-gray-400">Est. Hours</span><span class="font-medium">${item.estimated_hours}h</span></div>` : ''}
            ${item.actual_hours ? `<div class="flex justify-between"><span class="text-gray-400">Actual Hours</span><span class="font-medium">${item.actual_hours}h</span></div>` : ''}
          </div>

          <!-- Workspace -->
          <div class="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-sm">
            <div class="text-xs text-gray-400 mb-1">Workspace</div>
            <div class="font-medium">${item.workspace_name || '—'}</div>
            <div class="text-xs text-gray-400">${item.workspace_code || ''}</div>
          </div>

          <!-- Meta -->
          <div class="text-xs text-gray-400 space-y-1">
            <div>Created: ${dayjs(item.created_at).fromNow()}</div>
            <div>Updated: ${dayjs(item.updated_at).fromNow()}</div>
          </div>
        </div>
      </div>
    `;

    State.itemModal = { itemId, wsId, item };

  } catch (e) {
    document.getElementById('item-modal-content').innerHTML = `<p class="text-red-500 p-4">${e.message}</p>`;
  }
}

function closeItemModal() {
  const modal = document.getElementById('item-modal');
  if (modal) modal.classList.add('hidden');
  State.itemModal = null;
}

// Close modal on backdrop click
document.addEventListener('click', (e) => {
  const modal = document.getElementById('item-modal');
  if (modal && e.target === modal) closeItemModal();
});

function switchItemTab(idx, itemId, wsId) {
  document.querySelectorAll('.item-tab-btn').forEach((btn, i) => {
    btn.className = `item-tab-btn px-4 py-2 text-sm font-medium border-b-2 transition-colors ${i === idx ? 'border-kbi-500 text-kbi-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`;
  });

  const tabContent = document.getElementById('item-tab-content');
  if (!tabContent) return;

  const loaders = [
    () => GET(`/p2/engage/comments/${itemId}`).then(d => tabContent.innerHTML = renderComments(d.comments, itemId, wsId)),
    () => GET(`/p2/engage/activity/${itemId}`).then(d => tabContent.innerHTML = renderActivity(d.activity)),
    () => GET(`/p2/engage/attachments/${itemId}`).then(d => tabContent.innerHTML = renderAttachments(d.attachments, itemId)),
  ];

  tabContent.innerHTML = `<div class="flex justify-center py-6"><div class="spinner"></div></div>`;
  loaders[idx]().catch(e => { tabContent.innerHTML = `<p class="text-red-500 text-sm">${e.message}</p>`; });
}

function renderComments(comments, itemId, wsId) {
  return `
    <div class="space-y-3 mb-4">
      ${comments.length ? comments.map(c => `
        <div class="flex gap-3">
          <div class="w-7 h-7 rounded-full bg-kbi-100 flex items-center justify-center text-kbi-600 text-xs font-bold flex-shrink-0 mt-0.5">
            ${(c.author_name || '?').charAt(0).toUpperCase()}
          </div>
          <div class="flex-1 bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
            <div class="flex items-center gap-2 mb-1.5">
              <span class="text-xs font-semibold text-gray-800 dark:text-gray-200">${c.author_name || 'Unknown'}</span>
              <span class="text-xs text-gray-400">${dayjs(c.created_at).fromNow()}</span>
              ${c.is_internal ? '<span class="text-xs text-yellow-600 bg-yellow-50 px-1.5 rounded">Internal</span>' : ''}
            </div>
            <div class="text-sm text-gray-700 dark:text-gray-300">${c.body}</div>
          </div>
        </div>
      `).join('') : `<p class="text-sm text-gray-400 text-center py-6">No comments yet.</p>`}
    </div>

    <!-- Add comment -->
    <form onsubmit="submitComment(event, ${itemId}, ${wsId})" class="flex gap-3">
      <div class="w-7 h-7 rounded-full bg-kbi-100 flex items-center justify-center text-kbi-600 text-xs font-bold flex-shrink-0 mt-1">
        ${(State.user?.preferred_name || State.user?.display_name || '?').charAt(0).toUpperCase()}
      </div>
      <div class="flex-1">
        <textarea id="new-comment-${itemId}" rows="2" placeholder="Add a comment..." class="input resize-none text-sm w-full"></textarea>
        <div class="flex items-center gap-2 mt-2">
          <button type="submit" class="btn btn-primary text-xs py-1.5 px-3">Post Comment</button>
          <label class="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" id="comment-internal-${itemId}" class="rounded" />
            Internal only
          </label>
        </div>
      </div>
    </form>
  `;
}

async function submitComment(e, itemId, wsId) {
  e.preventDefault();
  const body = document.getElementById(`new-comment-${itemId}`)?.value.trim();
  if (!body) return;
  const isInternal = document.getElementById(`comment-internal-${itemId}`)?.checked;

  try {
    await POST(`/p2/engage/comments`, { work_item_id: itemId, body, is_internal: isInternal ? 1 : 0 });
    showToast('Comment added', 'success');
    // Refresh comments tab
    const d = await GET(`/p2/engage/comments/${itemId}`);
    document.getElementById('item-tab-content').innerHTML = renderComments(d.comments, itemId, wsId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderActivity(activity) {
  return `
    <div class="space-y-2">
      ${activity.length ? activity.map(a => `
        <div class="flex items-start gap-3 text-sm">
          <div class="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 mt-0.5">
            <i class="fas fa-${getActivityIcon(a.event_type)} text-xs text-gray-400"></i>
          </div>
          <div class="flex-1">
            <span class="font-medium text-gray-800 dark:text-gray-200">${a.actor_name || 'System'}</span>
            <span class="text-gray-500"> ${formatActivityEvent(a)}</span>
          </div>
          <span class="text-xs text-gray-400 flex-shrink-0">${dayjs(a.created_at).fromNow()}</span>
        </div>
      `).join('') : `<p class="text-sm text-gray-400 text-center py-6">No activity yet.</p>`}
    </div>
  `;
}

function getActivityIcon(type) {
  if (type?.includes('comment')) return 'comment';
  if (type?.includes('status')) return 'exchange-alt';
  if (type?.includes('assign')) return 'user-plus';
  if (type?.includes('attach')) return 'paperclip';
  if (type?.includes('create')) return 'plus-circle';
  return 'circle';
}

function formatActivityEvent(a) {
  switch (a.event_type) {
    case 'item.created':    return 'created this item';
    case 'status.changed':  return `changed status to "${a.new_value}"`;
    case 'priority.changed':return `changed priority to "${a.new_value}"`;
    case 'comment.added':   return 'added a comment';
    case 'attachment.added':return `attached "${a.new_value}"`;
    case 'assignee.added':  return `assigned "${a.new_value}"`;
    default: return a.note || a.event_type;
  }
}

function renderAttachments(attachments, itemId) {
  const canUpload = State.session?.isGodAdmin ||
    State.session?.roles?.some(r => ['god_admin','platform_admin','directorate_lead','workspace_admin','team_lead','standard_user'].includes(r));

  const mimeIcon = (m) => {
    if (!m) return 'fa-file';
    if (m.includes('image')) return 'fa-file-image';
    if (m.includes('pdf')) return 'fa-file-pdf';
    if (m.includes('spreadsheet') || m.includes('excel')) return 'fa-file-excel';
    if (m.includes('word')) return 'fa-file-word';
    return 'fa-file-alt';
  };

  return `
    <div class="space-y-2 mb-4">
      ${attachments.length ? attachments.map(a => `
        <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <i class="fas ${mimeIcon(a.mime_type)} text-kbi-400 text-lg flex-shrink-0"></i>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">${a.file_name}</div>
            <div class="text-xs text-gray-400">${formatBytes(a.file_size)} · ${a.uploader_name || '—'} · ${dayjs(a.uploaded_at).fromNow()}</div>
          </div>
          ${a.file_url ? `<a href="${a.file_url}" target="_blank" class="btn btn-secondary text-xs py-1 px-2"><i class="fas fa-download"></i></a>` : ''}
        </div>
      `).join('') : `<p class="text-sm text-gray-400 text-center py-6">No attachments yet.</p>`}
    </div>

    ${canUpload ? `
      <div class="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center">
        <i class="fas fa-cloud-upload-alt text-3xl text-gray-300 mb-2"></i>
        <p class="text-sm text-gray-400">File upload requires R2 storage configured in Cloudflare.</p>
        <p class="text-xs text-gray-300 mt-1">See deployment guide for R2 bucket setup.</p>
      </div>
    ` : ''}
  `;
}

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ═══════════════════════════════════════════════
// CREATE ITEM MODAL
// ═══════════════════════════════════════════════
async function showCreateItemModal(wsId, defaultStatus = '') {
  const [statusesData, prioritiesData, typesData] = await Promise.all([
    GET(`/p2/workspaces/${wsId}/statuses`).catch(() => ({ statuses: defaultStatuses() })),
    GET(`/p2/workspaces/${wsId}/priorities`).catch(() => ({ priorities: defaultPriorities() })),
    GET(`/p2/workspaces/${wsId}/types`).catch(() => ({ types: [] })),
  ]);

  const statuses   = statusesData.statuses || defaultStatuses();
  const priorities = prioritiesData.priorities || defaultPriorities();
  const types      = typesData.types || [];

  showModal(`
    <form onsubmit="submitCreateItem(event, ${wsId})" class="space-y-4">
      <div>
        <label class="text-xs text-gray-500 mb-1 block">Title*</label>
        <input name="title" required class="input" placeholder="What needs to be done?" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-xs text-gray-500 mb-1 block">Status</label>
          <select name="status_id" class="input">
            ${statuses.map(s => `<option value="${s.id}" ${s.slug === defaultStatus || s.is_default ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="text-xs text-gray-500 mb-1 block">Priority</label>
          <select name="priority_id" class="input">
            <option value="">No Priority</option>
            ${priorities.map(p => `<option value="${p.id}">${p.icon || ''} ${p.name}</option>`).join('')}
          </select>
        </div>
      </div>
      ${types.length ? `
        <div>
          <label class="text-xs text-gray-500 mb-1 block">Type</label>
          <select name="work_item_type_id" class="input">
            ${types.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
          </select>
        </div>
      ` : ''}
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-xs text-gray-500 mb-1 block">Start Date</label>
          <input name="start_at" type="date" class="input" />
        </div>
        <div>
          <label class="text-xs text-gray-500 mb-1 block">Due Date</label>
          <input name="due_at" type="date" class="input" />
        </div>
      </div>
      <div>
        <label class="text-xs text-gray-500 mb-1 block">Description (Markdown supported)</label>
        <textarea name="description" rows="4" class="input resize-none" placeholder="Add a description..."></textarea>
      </div>
      <button type="submit" class="btn btn-primary w-full justify-center">
        <i class="fas fa-plus"></i> Create Item
      </button>
    </form>
  `, 'New Work Item');
}

function showCreateItemModalWithStatus(wsId, statusSlug) {
  showCreateItemModal(wsId, statusSlug);
}

async function submitCreateItem(e, wsId) {
  e.preventDefault();
  const form = new FormData(e.target);
  const body = {
    workspace_id:       wsId,
    title:              form.get('title'),
    description:        form.get('description') || undefined,
    status_id:          parseInt(form.get('status_id')) || undefined,
    priority_id:        parseInt(form.get('priority_id')) || undefined,
    work_item_type_id:  parseInt(form.get('work_item_type_id')) || undefined,
    start_at:           form.get('start_at') || undefined,
    due_at:             form.get('due_at') || undefined,
  };

  try {
    const result = await POST('/p2/items', body);
    closeModal();
    showToast(`Item ${result.issued_id || ''} created!`, 'success');
    await loadWorkspaceView(wsId);
    await loadWorkspacesNav();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ═══════════════════════════════════════════════
// CREATE WORKSPACE MODAL
// ═══════════════════════════════════════════════
async function showCreateWorkspaceModal() {
  const dirsData = await GET('/directory/directorates').catch(() => ({ directorates: [] }));

  showModal(`
    <form onsubmit="submitCreateWorkspace(event)" class="space-y-4">
      <div>
        <label class="text-xs text-gray-500 mb-1 block">Workspace Name*</label>
        <input name="name" required class="input" placeholder="e.g. K1 Strategic Priorities" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-xs text-gray-500 mb-1 block">Code*</label>
          <input name="code" required class="input" placeholder="K1-PRIO" style="text-transform:uppercase" oninput="this.value=this.value.toUpperCase()" />
        </div>
        <div>
          <label class="text-xs text-gray-500 mb-1 block">Directorate</label>
          <select name="directorate_id" class="input">
            <option value="">None</option>
            ${dirsData.directorates.map(d => `<option value="${d.id}">${d.code} — ${d.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div>
        <label class="text-xs text-gray-500 mb-1 block">Default View</label>
        <select name="default_view" class="input">
          <option value="list">List</option>
          <option value="kanban">Kanban</option>
          <option value="gantt">Gantt</option>
          <option value="calendar">Calendar</option>
        </select>
      </div>
      <div>
        <label class="text-xs text-gray-500 mb-1 block">Icon (emoji)</label>
        <input name="icon" class="input" placeholder="📋" maxlength="4" />
      </div>
      <div>
        <label class="text-xs text-gray-500 mb-1 block">Description</label>
        <textarea name="description" rows="2" class="input resize-none"></textarea>
      </div>
      <button type="submit" class="btn btn-primary w-full justify-center">
        <i class="fas fa-plus"></i> Create Workspace
      </button>
    </form>
  `, 'New Workspace');
}

async function submitCreateWorkspace(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  const body = {
    name:           form.get('name'),
    code:           form.get('code'),
    directorate_id: parseInt(form.get('directorate_id')) || undefined,
    default_view:   form.get('default_view'),
    icon:           form.get('icon') || '📋',
    description:    form.get('description') || undefined,
  };
  try {
    await POST('/p2/workspaces', body);
    closeModal();
    showToast('Workspace created!', 'success');
    await renderWorkspaces();
    await loadWorkspacesNav();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ═══════════════════════════════════════════════
// P2 ADVANCED SEARCH PAGE
// ═══════════════════════════════════════════════
async function renderP2Search(params = {}) {
  document.getElementById('page-content').innerHTML = `
    <div class="space-y-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        <i class="fas fa-search-plus mr-3 text-kbi-500"></i>Advanced Search
      </h1>

      <div class="card space-y-4">
        <div class="flex gap-3">
          <input type="text" id="p2-search-input" placeholder="Search across all workspaces..."
            class="input flex-1 text-base" value="${params.q || ''}"
            onkeydown="if(event.key==='Enter') runP2Search()" />
          <button onclick="runP2Search()" class="btn btn-primary px-6">
            <i class="fas fa-search mr-2"></i>Search
          </button>
        </div>
        <div class="flex flex-wrap gap-3">
          <select id="p2-type-filter" class="input text-sm max-w-[140px]">
            <option value="">All Types</option>
            <option value="item">Work Items</option>
            <option value="comment">Comments</option>
            <option value="attachment">Attachments</option>
          </select>
          <select id="p2-ws-filter" class="input text-sm max-w-[200px]">
            <option value="">All Workspaces</option>
            ${State.workspaces.map(ws => `<option value="${ws.id}">${ws.code || ''} ${ws.name}</option>`).join('')}
          </select>
          <select id="p2-status-filter" class="input text-sm max-w-[140px]">
            <option value="">All Status</option>
            ${defaultStatuses().map(s => `<option value="${s.slug}">${s.name}</option>`).join('')}
          </select>
        </div>
      </div>

      <div id="p2-search-results">
        ${params.q ? '<div class="flex justify-center py-10"><div class="spinner"></div></div>' : '<p class="text-center text-gray-400 py-10">Enter a search query to find items, comments, and attachments across all your workspaces.</p>'}
      </div>
    </div>
  `;

  if (params.q) await runP2Search();
}

async function runP2Search() {
  const q       = document.getElementById('p2-search-input')?.value.trim();
  const type    = document.getElementById('p2-type-filter')?.value;
  const wsId    = document.getElementById('p2-ws-filter')?.value;
  const status  = document.getElementById('p2-status-filter')?.value;
  const results = document.getElementById('p2-search-results');

  if (!q || q.length < 2) {
    results.innerHTML = `<p class="text-center text-gray-400 py-10">Enter at least 2 characters to search.</p>`;
    return;
  }

  results.innerHTML = `<div class="flex justify-center py-10"><div class="spinner"></div></div>`;

  try {
    let url = `/p2/search?q=${encodeURIComponent(q)}`;
    if (type)  url += `&type=${type}`;
    if (wsId)  url += `&workspace_id=${wsId}`;
    if (status)url += `&status=${status}`;

    const data = await GET(url);

    if (!data.results.length) {
      results.innerHTML = `<div class="text-center py-16 text-gray-400"><i class="fas fa-search text-4xl mb-3"></i><p>No results for "${q}"</p></div>`;
      return;
    }

    const typeIcons = { item: 'fa-tasks', comment: 'fa-comment', attachment: 'fa-paperclip' };
    const typeColors = { item: 'text-kbi-500', comment: 'text-green-500', attachment: 'text-orange-500' };

    results.innerHTML = `
      <div class="mb-3 text-sm text-gray-500">${data.total} result${data.total !== 1 ? 's' : ''} for "<strong class="text-gray-800 dark:text-gray-200">${q}</strong>"</div>
      <div class="space-y-2">
        ${data.results.map(r => `
          <div onclick="${r.result_type === 'item' ? `openItemModal(${r.id}, null)` : '#'}"
            class="card cursor-pointer hover:border-kbi-300 transition-all flex items-start gap-4 ${r.result_type === 'item' ? 'cursor-pointer' : ''}">
            <div class="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
              <i class="fas ${typeIcons[r.result_type] || 'fa-search'} ${typeColors[r.result_type] || ''}"></i>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                ${r.reference ? `<code class="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 rounded">${r.reference}</code>` : ''}
                ${r.workspace_code ? `<span class="text-xs text-gray-400">${r.workspace_code}</span>` : ''}
                <span class="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded">${r.result_type}</span>
              </div>
              <div class="font-medium text-gray-900 dark:text-white text-sm truncate">${r.title || r.item_title || r.excerpt || '—'}</div>
              ${r.excerpt && r.excerpt !== r.title ? `<p class="text-xs text-gray-500 mt-0.5 line-clamp-2">${r.excerpt}</p>` : ''}
              <div class="flex items-center gap-2 mt-1 text-xs text-gray-400">
                ${r.status ? `<span>${r.status}</span>` : ''}
                ${r.owner_name ? `<span>· ${r.owner_name}</span>` : ''}
                ${r.date ? `<span>· ${dayjs(r.date).fromNow()}</span>` : ''}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (e) {
    results.innerHTML = `<p class="text-red-500 text-center py-10">${e.message}</p>`;
  }
}

// ═══════════════════════════════════════════════
// WORKSPACE EXPORT
// ═══════════════════════════════════════════════
async function exportWorkspaceCSV(wsId) {
  try {
    showToast('Preparing export...', 'info');
    const status   = document.getElementById('ws-status-filter')?.value || '';
    const priority = document.getElementById('ws-priority-filter')?.value || '';
    let url = `/p2/export/items?workspace_id=${wsId}&format=csv`;
    if (status)   url += `&status=${status}`;
    if (priority) url += `&priority=${priority}`;

    const blob = await api('GET', url);
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `workspace-${wsId}-${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
    URL.revokeObjectURL(blobUrl);
    showToast('CSV exported!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
function getItemTypeIcon(typeSlug) {
  const icons = {
    task: '<span class="text-kbi-500">✅</span>',
    milestone: '<span class="text-yellow-500">🎯</span>',
    decision: '<span class="text-green-500">📋</span>',
    issue: '<span class="text-red-500">⚠️</span>',
    risk: '<span class="text-red-600">🔴</span>',
    initiative: '<span class="text-purple-500">🚀</span>',
    contract: '<span class="text-blue-500">📜</span>',
    approval: '<span class="text-green-500">✅</span>',
  };
  return icons[typeSlug] || '<span class="text-gray-400">•</span>';
}

function getPriorityBadge(slug) {
  const badges = {
    critical: '🔴',
    high:     '🟠',
    medium:   '🔵',
    low:      '⚪',
  };
  return badges[slug] || '—';
}

function isDueSoon(dateStr) {
  if (!dateStr) return false;
  const due = dayjs(dateStr);
  const now = dayjs();
  return due.isBefore(now.add(3, 'day'));
}

function emptyState(msg) {
  return `
    <div class="text-center py-20 text-gray-400">
      <i class="fas fa-inbox text-5xl mb-4"></i>
      <p class="text-lg font-medium">${msg}</p>
    </div>
  `;
}
