// KBI Internal Operations Platform — Frontend App
// app.js — SPA routing, page renderers, API layer

'use strict';

// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
const State = {
  user: null,
  session: null,
  currentPage: 'home',
  darkMode: localStorage.getItem('kbi_dark') === '1',
  searchTimer: null,
};

dayjs.extend(dayjs_plugin_relativeTime);

// ═══════════════════════════════════════════════
// API HELPERS
// ═══════════════════════════════════════════════
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  const ct = res.headers.get('Content-Type') || '';
  if (ct.includes('text/csv')) return res.blob();
  return res.json().catch(() => ({}));
}
const GET    = (p) => api('GET', p);
const POST   = (p, b) => api('POST', p, b);
const PUT    = (p, b) => api('PUT', p, b);
const DELETE = (p) => api('DELETE', p);

// ═══════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════
function showToast(msg, type = 'info') {
  let tc = document.getElementById('toast-container');
  if (!tc) { tc = document.createElement('div'); tc.id = 'toast-container'; document.body.appendChild(tc); }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  const icons = { success: 'check-circle', error: 'exclamation-circle', info: 'info-circle' };
  t.innerHTML = `<i class="fas fa-${icons[type] || 'info-circle'} mr-2"></i>${msg}`;
  tc.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ═══════════════════════════════════════════════
// DARK MODE
// ═══════════════════════════════════════════════
function applyDark() {
  document.documentElement.classList.toggle('dark', State.darkMode);
  const icon = document.getElementById('dark-icon');
  if (icon) icon.className = State.darkMode ? 'fas fa-sun' : 'fas fa-moon';
}
function toggleDark() {
  State.darkMode = !State.darkMode;
  localStorage.setItem('kbi_dark', State.darkMode ? '1' : '0');
  applyDark();
}

// ═══════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}
function closeSidebarOnMobile() {
  if (window.innerWidth < 1024) document.getElementById('sidebar')?.classList.remove('open');
}

// ═══════════════════════════════════════════════
// CONFIDENTIALITY POPUP
// ═══════════════════════════════════════════════
function checkConfidentiality() {
  if (!sessionStorage.getItem('kbi_accepted')) {
    document.getElementById('confidentiality-popup').classList.remove('hidden');
  }
}
function acceptConfidentiality() {
  sessionStorage.setItem('kbi_accepted', '1');
  document.getElementById('confidentiality-popup').classList.add('hidden');
}

// ═══════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════
async function initApp() {
  applyDark();
  checkConfidentiality();

  try {
    const data = await GET('/auth/me');
    if (data.authenticated && data.user) {
      State.user = data.user;
      State.session = data.session;
      showApp();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
  // Show dev login in non-prod
  if (location.hostname === 'localhost' || location.hostname.includes('127.') || location.hostname.includes('.workers.dev')) {
    document.getElementById('dev-login-section').classList.remove('hidden');
  }
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  updateUserUI();
  navigate('home');
}

function updateUserUI() {
  const u = State.user;
  if (!u) return;
  document.getElementById('user-display-name').textContent = u.preferred_name || u.display_name || u.email;
  document.getElementById('user-email-display').textContent = u.email;

  const roleBadge = document.getElementById('user-role-badge');
  if (State.session?.isGodAdmin || u.is_god_admin) {
    roleBadge.textContent = '⚡ God Admin';
    roleBadge.className = 'text-xs text-yellow-500 font-semibold';
    document.getElementById('admin-nav-section').classList.remove('hidden');
  } else if (State.session?.roles?.includes('platform_admin')) {
    roleBadge.textContent = 'Platform Admin';
    roleBadge.className = 'text-xs text-purple-500';
    document.getElementById('admin-nav-section').classList.remove('hidden');
  } else if (State.session?.roles?.includes('directorate_lead')) {
    roleBadge.textContent = 'Directorate Lead';
    roleBadge.className = 'text-xs text-blue-500';
    document.getElementById('admin-nav-section').classList.remove('hidden');
  } else {
    const role = State.session?.roles?.[0] ?? 'standard_user';
    roleBadge.textContent = role.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    roleBadge.className = 'text-xs text-gray-400';
  }

  if (u.avatar_url) {
    document.getElementById('user-avatar').outerHTML = `<img id="user-avatar" src="${u.avatar_url}" class="w-8 h-8 rounded-full object-cover" />`;
  }
}

function loginWithGoogle() {
  // In production this redirects to Cloudflare Access / Google OAuth flow
  showToast('Redirecting to Google Workspace login...', 'info');
  setTimeout(() => { window.location.href = '/auth/login'; }, 800);
}

async function devLogin() {
  const email = document.getElementById('dev-email').value.trim();
  if (!email) return showToast('Enter an email', 'error');
  try {
    await POST('/auth/dev-login', { email });
    const data = await GET('/auth/me');
    State.user = data.user;
    State.session = data.session;
    showApp();
    showToast('Logged in as ' + email, 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function logout() {
  try { await POST('/auth/logout'); } catch {}
  State.user = null;
  State.session = null;
  showLogin();
  showToast('Logged out', 'info');
}

// ═══════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════
function navigate(page, params = {}) {
  State.currentPage = page;
  closeSidebarOnMobile();

  // Update active nav link
  document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
  const matching = [...document.querySelectorAll('.nav-link')].find(el =>
    el.getAttribute('onclick')?.includes(`'${page}'`)
  );
  if (matching) matching.classList.add('active');

  const content = document.getElementById('page-content');
  content.innerHTML = `<div class="flex justify-center py-20"><div class="spinner"></div></div>`;

  const pages = {
    home:       renderHome,
    directory:  renderDirectory,
    'org-chart': renderOrgChart,
    calendar:   renderCalendar,
    guides:     renderGuides,
    'brand-kit': renderBrandKit,
    admin:      renderAdmin,
    profile:    renderProfile,
  };
  const fn = pages[page];
  if (fn) fn(params).catch(e => {
    content.innerHTML = `<div class="text-center py-20 text-red-500"><i class="fas fa-exclamation-triangle text-3xl mb-4"></i><p>${e.message}</p></div>`;
  });
}

// ═══════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════
function debounceSearch(val) {
  clearTimeout(State.searchTimer);
  if (val.length < 2) { document.getElementById('search-results').classList.add('hidden'); return; }
  State.searchTimer = setTimeout(() => performSearch(val), 300);
}

async function performSearch(q) {
  try {
    const data = await GET(`/search?q=${encodeURIComponent(q)}`);
    const el = document.getElementById('search-results');
    if (!data.results.length) { el.classList.add('hidden'); return; }

    const icons = { person: 'user', article: 'book', event: 'calendar', announcement: 'bullhorn', brand: 'palette' };
    el.innerHTML = data.results.map(r => `
      <div onclick="handleSearchClick('${r.type}','${r.url}')" class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
        <i class="fas fa-${icons[r.type] || 'search'} w-4 text-kbi-500 text-sm"></i>
        <div>
          <div class="text-sm font-medium text-gray-900 dark:text-white">${r.title}</div>
          <div class="text-xs text-gray-400">${r.subtitle || r.type}</div>
        </div>
        <span class="ml-auto text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 px-2 py-0.5 rounded-full">${r.type}</span>
      </div>
    `).join('');
    el.classList.remove('hidden');
  } catch {}
}

function handleSearchClick(type, url) {
  document.getElementById('search-results').classList.add('hidden');
  document.getElementById('global-search').value = '';
  const page = url.split('/')[1]?.split('?')[0];
  if (page) navigate(page);
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#global-search') && !e.target.closest('#search-results')) {
    document.getElementById('search-results')?.classList.add('hidden');
  }
});

// ═══════════════════════════════════════════════
// HOME PAGE
// ═══════════════════════════════════════════════
async function renderHome() {
  const [announcementsData, linksData, eventsData] = await Promise.all([
    GET('/content/announcements').catch(() => ({ announcements: [] })),
    GET('/content/links').catch(() => ({ links: [] })),
    GET('/calendar/events?start=' + dayjs().format('YYYY-MM-DD')).catch(() => ({ events: [] })),
  ]);

  const user = State.user;
  const isAdmin = State.session?.isGodAdmin || State.session?.roles?.some(r => ['god_admin','platform_admin'].includes(r));

  const pinnedAnn = announcementsData.announcements.filter(a => a.is_pinned);
  const regularAnn = announcementsData.announcements.filter(a => !a.is_pinned);
  const upcomingEvents = eventsData.events.slice(0, 5);

  document.getElementById('page-content').innerHTML = `
    <div class="space-y-6">
      <!-- Welcome Banner -->
      <div class="bg-gradient-to-r from-kbi-600 to-indigo-700 rounded-2xl p-6 text-white">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
            <i class="fas fa-building text-white text-xl"></i>
          </div>
          <div>
            <h1 class="text-2xl font-bold">Good ${getGreeting()}, ${user?.preferred_name || user?.display_name?.split(' ')[0] || 'there'} 👋</h1>
            <p class="text-indigo-200 text-sm mt-0.5">Welcome to the KBI Internal Operations Platform</p>
          </div>
        </div>
        ${user?.status === 'pending' ? `
          <div class="mt-4 bg-yellow-500/20 border border-yellow-400/30 rounded-xl p-3 text-sm">
            <i class="fas fa-clock mr-2"></i>Your account is pending admin approval. Some features may be limited.
          </div>
        ` : ''}
      </div>

      <!-- Stats Row (admin only) -->
      ${isAdmin ? await renderHomeStats() : ''}

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Announcements (2/3 width) -->
        <div class="lg:col-span-2 space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
              <i class="fas fa-bullhorn mr-2 text-kbi-500"></i>Announcements
            </h2>
            ${isAdmin ? `<button onclick="showAddAnnouncement()" class="btn btn-primary text-xs py-1.5 px-3">+ New</button>` : ''}
          </div>

          ${pinnedAnn.map(a => renderAnnouncementCard(a, true)).join('')}
          ${regularAnn.slice(0,5).map(a => renderAnnouncementCard(a, false)).join('')}
          ${!announcementsData.announcements.length ? `<div class="card text-center text-gray-400 py-10"><i class="fas fa-inbox text-4xl mb-3"></i><p>No announcements</p></div>` : ''}
        </div>

        <!-- Right Sidebar (1/3) -->
        <div class="space-y-4">
          <!-- Upcoming Events -->
          <div class="card">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold text-gray-900 dark:text-white text-sm">
                <i class="fas fa-calendar mr-2 text-kbi-500"></i>Upcoming Events
              </h3>
              <a onclick="navigate('calendar')" class="text-xs text-kbi-600 hover:underline cursor-pointer">View all</a>
            </div>
            ${upcomingEvents.length ? upcomingEvents.map(e => `
              <div class="flex gap-3 py-2 border-b border-gray-50 dark:border-gray-800 last:border-0">
                <div class="flex-shrink-0 w-10 text-center">
                  <div class="text-xs text-gray-400">${dayjs(e.start_at).format('MMM')}</div>
                  <div class="text-lg font-bold text-kbi-600 leading-none">${dayjs(e.start_at).format('D')}</div>
                </div>
                <div>
                  <div class="text-sm font-medium text-gray-900 dark:text-white">${e.title}</div>
                  <div class="text-xs text-gray-400">${e.event_type}${e.directorate_name ? ' · ' + e.directorate_name : ''}</div>
                </div>
              </div>
            `).join('') : `<p class="text-sm text-gray-400 text-center py-4">No upcoming events</p>`}
          </div>

          <!-- Quick Links -->
          <div class="card">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm mb-4">
              <i class="fas fa-link mr-2 text-kbi-500"></i>Quick Links
            </h3>
            <div class="space-y-2">
              ${linksData.links.slice(0,8).map(l => `
                <a href="${l.url}" target="_blank" class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group">
                  <i class="${l.icon || 'fas fa-link'} text-kbi-500 w-4 text-center text-sm"></i>
                  <span class="text-sm text-gray-700 dark:text-gray-300 group-hover:text-kbi-600">${l.title}</span>
                  <i class="fas fa-external-link-alt text-gray-300 group-hover:text-kbi-400 text-xs ml-auto"></i>
                </a>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function renderHomeStats() {
  try {
    const data = await GET('/admin/stats');
    const s = data.stats;
    return `
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        ${[
          { label: 'Total Users', value: s.totalUsers,   icon: 'users',   color: 'text-blue-500' },
          { label: 'Active',      value: s.activeUsers,  icon: 'check',   color: 'text-green-500' },
          { label: 'Pending',     value: s.pendingUsers, icon: 'clock',   color: 'text-yellow-500' },
          { label: 'Requests',    value: s.pendingRequests, icon: 'bell', color: 'text-red-500' },
        ].map(s => `
          <div class="card flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
              <i class="fas fa-${s.icon} ${s.color}"></i>
            </div>
            <div>
              <div class="text-2xl font-bold text-gray-900 dark:text-white">${s.value}</div>
              <div class="text-xs text-gray-400">${s.label}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch { return ''; }
}

function renderAnnouncementCard(a, pinned) {
  return `
    <div class="card ${pinned ? 'border-l-4 border-l-kbi-500' : ''}">
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            ${pinned ? `<span class="badge badge-active text-xs">📌 Pinned</span>` : ''}
            ${a.directorate_code ? `<span class="badge" style="background:${a.directorate_code ? '#EEF2FF' : '#F3F4F6'};color:#4F46E5">${a.directorate_code}</span>` : ''}
          </div>
          <h3 class="font-semibold text-gray-900 dark:text-white">${a.title}</h3>
          ${a.body ? `<p class="text-sm text-gray-500 mt-1 line-clamp-2">${a.body}</p>` : ''}
          <p class="text-xs text-gray-400 mt-2">${a.author_name || 'Admin'} · ${dayjs(a.published_at).fromNow()}</p>
        </div>
      </div>
    </div>
  `;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

// ═══════════════════════════════════════════════
// PEOPLE DIRECTORY
// ═══════════════════════════════════════════════
async function renderDirectory(params = {}) {
  const dirsData = await GET('/directory/directorates').catch(() => ({ directorates: [] }));

  document.getElementById('page-content').innerHTML = `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          <i class="fas fa-users mr-3 text-kbi-500"></i>People Directory
        </h1>
        <button onclick="exportCSV('/export/directory')" class="btn btn-secondary text-sm">
          <i class="fas fa-download"></i> Export
        </button>
      </div>

      <!-- Filters -->
      <div class="card flex flex-col sm:flex-row gap-3">
        <input id="dir-search" type="text" placeholder="Search by name, title, email..."
          oninput="filterDirectory()" class="input flex-1" />
        <select id="dir-filter" onchange="filterDirectory()" class="input sm:w-48">
          <option value="">All Directorates</option>
          ${dirsData.directorates.map(d => `<option value="${d.id}">${d.code} — ${d.name}</option>`).join('')}
        </select>
      </div>

      <!-- Directorate Filters (pills) -->
      <div class="flex flex-wrap gap-2">
        <button onclick="setDirFilter('')" class="dir-pill-btn active text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 font-medium transition-all">All</button>
        ${dirsData.directorates.map(d => `
          <button onclick="setDirFilter('${d.id}')"
            style="background:${d.color}15;border-color:${d.color}40;color:${d.color}"
            class="dir-pill-btn text-xs px-3 py-1.5 rounded-full border font-medium transition-all">${d.code}</button>
        `).join('')}
      </div>

      <!-- Results -->
      <div id="directory-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <div class="flex justify-center py-10 col-span-full"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  await loadDirectory();
}

async function loadDirectory() {
  const search = document.getElementById('dir-search')?.value ?? '';
  const dirId  = document.getElementById('dir-filter')?.value ?? '';
  try {
    let url = `/directory?limit=60`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (dirId) url += `&directorate_id=${dirId}`;
    const data = await GET(url);
    renderDirectoryGrid(data.people);
  } catch(e) {
    document.getElementById('directory-grid').innerHTML = `<p class="text-red-500 col-span-full">${e.message}</p>`;
  }
}

function filterDirectory() {
  clearTimeout(State.searchTimer);
  State.searchTimer = setTimeout(loadDirectory, 300);
}

function setDirFilter(id) {
  const sel = document.getElementById('dir-filter');
  if (sel) sel.value = id;
  document.querySelectorAll('.dir-pill-btn').forEach(b => b.classList.remove('active', 'ring-2'));
  event.target.classList.add('active', 'ring-2');
  loadDirectory();
}

function renderDirectoryGrid(people) {
  const grid = document.getElementById('directory-grid');
  if (!people.length) {
    grid.innerHTML = `<div class="col-span-full text-center py-16 text-gray-400"><i class="fas fa-users text-4xl mb-3"></i><p>No people found</p></div>`;
    return;
  }
  grid.innerHTML = people.map(p => `
    <div onclick="showPersonModal(${p.id})" class="card cursor-pointer hover:border-kbi-300 transition-all">
      <div class="flex flex-col items-center text-center">
        <div class="w-16 h-16 rounded-2xl bg-kbi-100 dark:bg-kbi-900 flex items-center justify-center mb-3 text-kbi-600 text-xl font-bold overflow-hidden">
          ${p.profile_photo_key || p.avatar_url
            ? `<img src="${p.avatar_url || '/static/placeholder.png'}" class="w-16 h-16 object-cover rounded-2xl" />`
            : (p.preferred_name || p.display_name || '?').charAt(0).toUpperCase()}
        </div>
        <div class="font-semibold text-gray-900 dark:text-white text-sm">${p.preferred_name || p.display_name || p.email}</div>
        <div class="text-xs text-gray-400 mt-0.5">${p.kbi_title || 'KBI Member'}</div>
        <div class="text-xs text-gray-400">${p.location || ''}</div>
        <div class="flex flex-wrap justify-center gap-1 mt-2">
          ${(p.directorates || []).map(d => `<span class="dir-pill" style="background:${d.color}">${d.code}</span>`).join('')}
        </div>
      </div>
    </div>
  `).join('');
}

async function showPersonModal(userId) {
  try {
    const p = await GET(`/users/${userId}`);
    const skills = JSON.parse(p.skills || '[]');
    showModal(`
      <div class="flex items-start gap-4 mb-6">
        <div class="w-16 h-16 rounded-2xl bg-kbi-100 flex items-center justify-center text-kbi-600 text-2xl font-bold flex-shrink-0">
          ${p.avatar_url ? `<img src="${p.avatar_url}" class="w-16 h-16 rounded-2xl object-cover"/>` : (p.preferred_name || p.display_name || '?').charAt(0).toUpperCase()}
        </div>
        <div class="flex-1">
          <h2 class="text-xl font-bold text-gray-900 dark:text-white">${p.preferred_name || p.display_name}</h2>
          <p class="text-kbi-600 text-sm">${p.kbi_title || ''}</p>
          <p class="text-gray-400 text-sm">${p.email}</p>
          <div class="flex flex-wrap gap-1 mt-2">
            ${(p.directorates || []).map(d => `<span class="dir-pill" style="background:${d.color}">${d.code}</span>`).join('')}
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4 text-sm mb-4">
        ${p.location  ? `<div><span class="text-gray-400"><i class="fas fa-map-marker-alt mr-1"></i>Location</span><p class="font-medium">${p.location}</p></div>` : ''}
        ${p.timezone  ? `<div><span class="text-gray-400"><i class="fas fa-clock mr-1"></i>Timezone</span><p class="font-medium">${p.timezone}</p></div>` : ''}
        ${p.start_date? `<div><span class="text-gray-400"><i class="fas fa-calendar mr-1"></i>Started</span><p class="font-medium">${p.start_date}</p></div>` : ''}
        ${p.pronouns  ? `<div><span class="text-gray-400"><i class="fas fa-user mr-1"></i>Pronouns</span><p class="font-medium">${p.pronouns}</p></div>` : ''}
      </div>

      ${p.bio ? `<div class="mb-4"><p class="text-gray-400 text-xs uppercase font-semibold tracking-wide mb-1">Bio</p><p class="text-sm text-gray-700 dark:text-gray-300">${p.bio}</p></div>` : ''}

      ${skills.length ? `<div class="mb-4"><p class="text-gray-400 text-xs uppercase font-semibold tracking-wide mb-2">Skills</p><div class="flex flex-wrap gap-1">${skills.map(s => `<span class="badge badge-active">${s}</span>`).join('')}</div></div>` : ''}

      ${p.linkedin_url ? `<a href="${p.linkedin_url}" target="_blank" class="btn btn-secondary w-full justify-center text-sm"><i class="fab fa-linkedin text-blue-600"></i> LinkedIn Profile</a>` : ''}
    `, p.preferred_name || p.display_name);
  } catch(e) { showToast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════
// ORG CHART
// ═══════════════════════════════════════════════
async function renderOrgChart() {
  document.getElementById('page-content').innerHTML = `
    <div class="space-y-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        <i class="fas fa-sitemap mr-3 text-kbi-500"></i>Organisation Chart
      </h1>
      <div id="org-chart-container" class="card overflow-x-auto">
        <div class="flex justify-center py-10"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  try {
    const data = await GET('/directory/org-chart');
    const container = document.getElementById('org-chart-container');
    if (!data.chart.length) {
      container.innerHTML = `<p class="text-center text-gray-400 py-10">No org chart data available. Ensure people profiles have managers assigned.</p>`;
      return;
    }
    container.innerHTML = `<div class="org-tree p-6 min-w-max">${data.chart.map(node => renderOrgNode(node)).join('')}</div>`;
  } catch(e) {
    document.getElementById('org-chart-container').innerHTML = `<p class="text-red-500 text-center py-10">${e.message}</p>`;
  }
}

function renderOrgNode(node, depth = 0) {
  const hasReports = node.reports && node.reports.length > 0;
  return `
    <div class="org-node" style="margin: 0 8px;">
      <div class="org-node-card" onclick="showPersonModal(${node.id})">
        <div class="w-10 h-10 rounded-xl bg-kbi-100 flex items-center justify-center mx-auto mb-2 text-kbi-600 font-bold text-sm">
          ${(node.preferred_name || node.display_name || '?').charAt(0).toUpperCase()}
        </div>
        <div class="text-xs font-semibold text-gray-900 dark:text-white">${node.preferred_name || node.display_name}</div>
        <div class="text-xs text-gray-400">${node.kbi_title || 'KBI'}</div>
      </div>
      ${hasReports ? `
        <div class="org-children flex-wrap justify-center">
          ${node.reports.map(child => renderOrgNode(child, depth + 1)).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

// ═══════════════════════════════════════════════
// CALENDAR
// ═══════════════════════════════════════════════
async function renderCalendar() {
  const now = new Date();
  State.calYear  = State.calYear  || now.getFullYear();
  State.calMonth = State.calMonth || now.getMonth();

  document.getElementById('page-content').innerHTML = `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          <i class="fas fa-calendar mr-3 text-kbi-500"></i>KBI Calendar
        </h1>
        ${(State.session?.isGodAdmin || State.session?.roles?.some(r => ['god_admin','platform_admin','directorate_lead'].includes(r))) ? `
          <button onclick="showAddEventModal()" class="btn btn-primary text-sm">
            <i class="fas fa-plus"></i> Add Event
          </button>
        ` : ''}
      </div>

      <!-- Month Navigation -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <button onclick="changeCalMonth(-1)" class="btn btn-secondary"><i class="fas fa-chevron-left"></i></button>
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white" id="cal-title"></h2>
          <button onclick="changeCalMonth(1)"  class="btn btn-secondary"><i class="fas fa-chevron-right"></i></button>
        </div>
        <div id="calendar-grid"></div>
      </div>
    </div>
  `;
  await loadCalendar();
}

async function loadCalendar() {
  const year = State.calYear, month = State.calMonth;
  const start = new Date(year, month, 1);
  const end   = new Date(year, month + 1, 0);

  document.getElementById('cal-title').textContent = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  try {
    const data = await GET(`/calendar/events?start=${dayjs(start).format('YYYY-MM-DD')}&end=${dayjs(end).format('YYYY-MM-DD')}`);
    renderCalendarGrid(year, month, data.events);
  } catch(e) {
    document.getElementById('calendar-grid').innerHTML = `<p class="text-red-500">${e.message}</p>`;
  }
}

function renderCalendarGrid(year, month, events) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const today = new Date();

  const eventMap = {};
  events.forEach(e => {
    const d = dayjs(e.start_at).format('YYYY-MM-DD');
    if (!eventMap[d]) eventMap[d] = [];
    eventMap[d].push(e);
  });

  let html = `<div class="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 rounded-xl overflow-hidden">`;
  // Headers
  days.forEach(d => {
    html += `<div class="bg-gray-50 dark:bg-gray-800 text-center text-xs font-semibold text-gray-500 py-2">${d}</div>`;
  });
  // Empty cells
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="bg-white dark:bg-gray-900 cal-cell"></div>`;
  }
  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = today.getDate() === d && today.getMonth() === month && today.getFullYear() === year;
    const dayEvents = eventMap[dateStr] || [];

    html += `<div class="bg-white dark:bg-gray-900 cal-cell ${isToday ? 'ring-2 ring-kbi-400 ring-inset' : ''}">
      <div class="text-xs ${isToday ? 'w-6 h-6 bg-kbi-600 text-white rounded-full flex items-center justify-center font-bold' : 'text-gray-500 dark:text-gray-400 font-medium'} mb-1">${d}</div>
      ${dayEvents.slice(0,2).map(e => `
        <div onclick="showEventModal(${e.id})" class="cal-event text-white rounded cursor-pointer" style="background:${getEventColor(e.event_type)}" title="${e.title}">
          ${e.title}
        </div>
      `).join('')}
      ${dayEvents.length > 2 ? `<div class="text-xs text-gray-400">+${dayEvents.length - 2} more</div>` : ''}
    </div>`;
  }
  html += `</div>`;

  // Upcoming List
  html += `
    <div class="mt-6">
      <h3 class="font-semibold text-gray-900 dark:text-white mb-3 text-sm">All Events This Month</h3>
      ${events.length ? events.map(e => `
        <div onclick="showEventModal(${e.id})" class="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer border-b border-gray-50 dark:border-gray-800">
          <div class="w-2 h-10 rounded-full flex-shrink-0" style="background:${getEventColor(e.event_type)}"></div>
          <div class="flex-1">
            <div class="text-sm font-medium text-gray-900 dark:text-white">${e.title}</div>
            <div class="text-xs text-gray-400">${dayjs(e.start_at).format('ddd, MMM D')} ${e.all_day ? '(All day)' : dayjs(e.start_at).format('· h:mm A')}</div>
          </div>
          ${e.directorate_name ? `<span class="text-xs text-gray-400">${e.directorate_code}</span>` : ''}
        </div>
      `).join('') : `<p class="text-gray-400 text-sm text-center py-6">No events this month</p>`}
    </div>
  `;

  document.getElementById('calendar-grid').innerHTML = html;
}

function getEventColor(type) {
  const colors = { general: '#6366F1', directorate: '#0891B2', chapter: '#059669', collaboration: '#D97706' };
  return colors[type] || '#6366F1';
}

function changeCalMonth(dir) {
  State.calMonth += dir;
  if (State.calMonth < 0)  { State.calMonth = 11; State.calYear--; }
  if (State.calMonth > 11) { State.calMonth = 0;  State.calYear++; }
  loadCalendar();
}

async function showEventModal(eventId) {
  try {
    const e = await GET(`/calendar/events/${eventId}`);
    showModal(`
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:${getEventColor(e.event_type)}20">
          <i class="fas fa-calendar" style="color:${getEventColor(e.event_type)}"></i>
        </div>
        <div>
          <span class="text-xs px-2 py-0.5 rounded-full text-white" style="background:${getEventColor(e.event_type)}">${e.event_type}</span>
        </div>
      </div>
      <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">${e.title}</h2>
      <div class="space-y-3 text-sm">
        <div class="flex gap-3"><i class="fas fa-clock text-gray-400 mt-0.5"></i><div><div class="font-medium">${dayjs(e.start_at).format('dddd, MMMM D, YYYY')}</div>${!e.all_day ? `<div class="text-gray-400">${dayjs(e.start_at).format('h:mm A')}${e.end_at ? ' – ' + dayjs(e.end_at).format('h:mm A') : ''}</div>` : '<div class="text-gray-400">All day</div>'}</div></div>
        ${e.location ? `<div class="flex gap-3"><i class="fas fa-map-marker-alt text-gray-400 mt-0.5"></i><div>${e.location}</div></div>` : ''}
        ${e.directorate_name ? `<div class="flex gap-3"><i class="fas fa-building text-gray-400 mt-0.5"></i><div>${e.directorate_name}</div></div>` : ''}
        ${e.description ? `<div class="flex gap-3"><i class="fas fa-align-left text-gray-400 mt-0.5"></i><div>${e.description}</div></div>` : ''}
      </div>
    `, e.title);
  } catch(err) { showToast(err.message, 'error'); }
}

// ═══════════════════════════════════════════════
// GUIDES
// ═══════════════════════════════════════════════
async function renderGuides() {
  document.getElementById('page-content').innerHTML = `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          <i class="fas fa-book mr-3 text-kbi-500"></i>Guides & Knowledge Base
        </h1>
        ${State.session?.isGodAdmin || State.session?.roles?.some(r => ['god_admin','platform_admin'].includes(r)) ? `
          <button onclick="showAddArticleModal()" class="btn btn-primary text-sm"><i class="fas fa-plus"></i> New Article</button>
        ` : ''}
      </div>

      <div class="card">
        <input type="text" id="guides-search" placeholder="Search guides..." oninput="filterGuides()" class="input mb-4" />
        <div class="flex flex-wrap gap-2 mb-4" id="guide-categories">
          <button onclick="setGuideCategory('')"   class="btn btn-secondary text-xs active">All</button>
          <button onclick="setGuideCategory('onboarding')"  class="btn btn-secondary text-xs">Onboarding</button>
          <button onclick="setGuideCategory('policy')"      class="btn btn-secondary text-xs">Policy</button>
          <button onclick="setGuideCategory('access')"      class="btn btn-secondary text-xs">Access</button>
          <button onclick="setGuideCategory('general')"     class="btn btn-secondary text-xs">General</button>
        </div>
        <div id="articles-list"><div class="flex justify-center py-10"><div class="spinner"></div></div></div>
      </div>
    </div>
  `;
  await loadArticles();
}

let currentGuideCategory = '';
async function loadArticles() {
  const search = document.getElementById('guides-search')?.value ?? '';
  try {
    let url = `/content/articles?`;
    if (currentGuideCategory) url += `category=${currentGuideCategory}&`;
    if (search) url += `search=${encodeURIComponent(search)}&`;
    const data = await GET(url);
    renderArticlesList(data.articles);
  } catch(e) {
    document.getElementById('articles-list').innerHTML = `<p class="text-red-500">${e.message}</p>`;
  }
}

function filterGuides() {
  clearTimeout(State.searchTimer);
  State.searchTimer = setTimeout(loadArticles, 300);
}

function setGuideCategory(cat) {
  currentGuideCategory = cat;
  document.querySelectorAll('#guide-categories button').forEach(b => b.classList.remove('btn-primary'));
  event.target.classList.add('btn-primary');
  loadArticles();
}

function renderArticlesList(articles) {
  const el = document.getElementById('articles-list');
  if (!articles.length) {
    el.innerHTML = `<p class="text-gray-400 text-center py-10">No articles found</p>`;
    return;
  }
  el.innerHTML = articles.map(a => `
    <div onclick="showArticle('${a.slug}')" class="flex items-start gap-4 p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer border-b border-gray-50 dark:border-gray-800 last:border-0 transition-colors">
      <div class="w-10 h-10 rounded-xl bg-kbi-50 dark:bg-kbi-900 flex items-center justify-center flex-shrink-0">
        <i class="fas fa-file-alt text-kbi-500 text-sm"></i>
      </div>
      <div class="flex-1">
        <div class="font-medium text-gray-900 dark:text-white">${a.title}</div>
        <div class="text-xs text-gray-400 mt-0.5">${a.category} · ${a.author_name || 'Admin'} · ${dayjs(a.updated_at).fromNow()} · ${a.view_count} views</div>
        ${a.tags ? `<div class="flex flex-wrap gap-1 mt-1">${JSON.parse(a.tags).map(t => `<span class="badge badge-active">${t}</span>`).join('')}</div>` : ''}
      </div>
      <i class="fas fa-chevron-right text-gray-300 mt-1"></i>
    </div>
  `).join('');
}

async function showArticle(slug) {
  try {
    const a = await GET(`/content/articles/${slug}`);
    const html = marked.parse(a.content || '*No content yet.*');
    showModal(`
      <div class="mb-4">
        <span class="badge badge-active mb-2">${a.category}</span>
        <h2 class="text-xl font-bold text-gray-900 dark:text-white mt-1">${a.title}</h2>
        <p class="text-xs text-gray-400 mt-1">${a.author_name || 'Admin'} · Updated ${dayjs(a.updated_at).fromNow()}</p>
      </div>
      <div class="prose dark:prose-invert max-w-none text-sm text-gray-700 dark:text-gray-300 leading-relaxed">${html}</div>
    `, a.title);
  } catch(e) { showToast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════
// BRAND KIT
// ═══════════════════════════════════════════════
async function renderBrandKit() {
  document.getElementById('page-content').innerHTML = `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          <i class="fas fa-palette mr-3 text-kbi-500"></i>Brand Kit
        </h1>
        ${State.session?.isGodAdmin || State.session?.roles?.some(r => ['god_admin','platform_admin'].includes(r)) ? `
          <button onclick="showAddBrandModal()" class="btn btn-primary text-sm"><i class="fas fa-plus"></i> Add Resource</button>
        ` : ''}
      </div>

      <!-- Category tabs -->
      <div class="flex flex-wrap gap-2">
        ${['All','Logo','Font','Template','Color Palette','Icon'].map((cat, i) => `
          <button onclick="loadBrandResources('${i === 0 ? '' : cat.toLowerCase().replace(' ','_')}')"
            class="btn btn-secondary text-xs">${cat}</button>
        `).join('')}
      </div>

      <div id="brand-resources-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="flex justify-center py-10 col-span-full"><div class="spinner"></div></div>
      </div>
    </div>
  `;
  await loadBrandResources('');
}

async function loadBrandResources(category) {
  try {
    const data = await GET(`/content/brand${category ? '?category=' + category : ''}`);
    const grid = document.getElementById('brand-resources-grid');
    if (!data.resources.length) {
      grid.innerHTML = `<div class="col-span-full text-center text-gray-400 py-16"><i class="fas fa-palette text-4xl mb-3"></i><p>No brand resources yet</p></div>`;
      return;
    }
    const catIcons = { logo: 'fa-star', font: 'fa-font', template: 'fa-file-alt', color_palette: 'fa-swatchbook', icon: 'fa-shapes', general: 'fa-cube' };
    grid.innerHTML = data.resources.map(r => `
      <div class="card group">
        <div class="w-full h-32 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center mb-4 overflow-hidden">
          ${r.file_url && r.mime_type?.startsWith('image')
            ? `<img src="${r.file_url}" class="w-full h-full object-contain" />`
            : `<i class="fas ${catIcons[r.category] || 'fa-cube'} text-4xl text-gray-400"></i>`
          }
        </div>
        <div class="flex items-start justify-between">
          <div>
            <div class="font-semibold text-gray-900 dark:text-white text-sm">${r.name}</div>
            ${r.description ? `<p class="text-xs text-gray-400 mt-0.5">${r.description}</p>` : ''}
            <div class="flex items-center gap-2 mt-1">
              <span class="badge badge-active">${r.category}</span>
              ${r.version ? `<span class="text-xs text-gray-400">v${r.version}</span>` : ''}
            </div>
          </div>
          ${r.file_url ? `<a href="${r.file_url}" download target="_blank" class="btn btn-secondary text-xs py-1.5 px-2"><i class="fas fa-download"></i></a>` : ''}
        </div>
      </div>
    `).join('');
  } catch(e) {
    document.getElementById('brand-resources-grid').innerHTML = `<p class="text-red-500 col-span-full">${e.message}</p>`;
  }
}

// ═══════════════════════════════════════════════
// GOD ADMIN DASHBOARD
// ═══════════════════════════════════════════════
async function renderAdmin() {
  const isAdmin = State.session?.isGodAdmin || State.session?.roles?.some(r => ['god_admin','platform_admin','directorate_lead'].includes(r));
  if (!isAdmin) {
    document.getElementById('page-content').innerHTML = `<div class="text-center py-20 text-red-500"><i class="fas fa-lock text-4xl mb-4"></i><p>Access Denied</p></div>`;
    return;
  }

  document.getElementById('page-content').innerHTML = `
    <div class="space-y-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        <i class="fas fa-crown mr-3 text-yellow-500"></i>God Admin Dashboard
      </h1>

      <!-- Admin Tabs -->
      <div class="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
        ${['Overview','Pending Users','Directorate Requests','Users','Audit Log'].map((tab, i) => `
          <button onclick="switchAdminTab(${i})" id="admin-tab-${i}"
            class="btn ${i === 0 ? 'btn-primary' : 'btn-secondary'} text-sm admin-tab-btn">${tab}</button>
        `).join('')}
      </div>

      <div id="admin-tab-content">
        <div class="flex justify-center py-10"><div class="spinner"></div></div>
      </div>
    </div>
  `;
  await switchAdminTab(0);
}

async function switchAdminTab(idx) {
  document.querySelectorAll('.admin-tab-btn').forEach((b, i) => {
    b.className = `btn ${i === idx ? 'btn-primary' : 'btn-secondary'} text-sm admin-tab-btn`;
  });

  const content = document.getElementById('admin-tab-content');
  content.innerHTML = `<div class="flex justify-center py-10"><div class="spinner"></div></div>`;

  const tabs = [loadAdminOverview, loadPendingUsers, loadDirectorateRequests, loadAllUsers, loadAuditLog];
  if (tabs[idx]) await tabs[idx]().catch(e => {
    content.innerHTML = `<p class="text-red-500">${e.message}</p>`;
  });
}

async function loadAdminOverview() {
  const data = await GET('/admin/stats');
  const s = data.stats;
  document.getElementById('admin-tab-content').innerHTML = `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      ${[
        { label: 'Total Users',      value: s.totalUsers,      icon: 'users',        color: 'from-blue-500 to-blue-600' },
        { label: 'Active Users',     value: s.activeUsers,     icon: 'check-circle', color: 'from-green-500 to-green-600' },
        { label: 'Pending Approval', value: s.pendingUsers,    icon: 'clock',        color: 'from-yellow-500 to-yellow-600' },
        { label: 'Pending Requests', value: s.pendingRequests, icon: 'bell',         color: 'from-red-500 to-red-600' },
      ].map(st => `
        <div class="rounded-2xl bg-gradient-to-br ${st.color} p-5 text-white">
          <i class="fas fa-${st.icon} text-white/70 text-xl mb-2"></i>
          <div class="text-3xl font-bold">${st.value}</div>
          <div class="text-white/80 text-xs mt-0.5">${st.label}</div>
        </div>
      `).join('')}
    </div>

    <div class="card">
      <h3 class="font-semibold text-gray-900 dark:text-white mb-4">Recent Activity</h3>
      <div class="space-y-3">
        ${data.recentActivity.map(log => `
          <div class="flex items-center gap-3 text-sm">
            <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
              <i class="fas fa-${getActionIcon(log.action)} text-xs text-gray-500"></i>
            </div>
            <div class="flex-1">
              <span class="font-medium text-gray-800 dark:text-gray-200">${log.actor_name || log.actor_email || 'System'}</span>
              <span class="text-gray-400"> · ${log.action}</span>
            </div>
            <span class="text-xs text-gray-400">${dayjs(log.created_at).fromNow()}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function getActionIcon(action) {
  if (action.includes('user')) return 'user';
  if (action.includes('role')) return 'shield';
  if (action.includes('event')) return 'calendar';
  if (action.includes('export')) return 'download';
  return 'activity';
}

async function loadPendingUsers() {
  const data = await GET('/admin/pending-users');
  const content = document.getElementById('admin-tab-content');
  if (!data.users.length) {
    content.innerHTML = `<div class="text-center py-16 text-gray-400"><i class="fas fa-check-circle text-4xl mb-3 text-green-400"></i><p>No pending users</p></div>`;
    return;
  }
  content.innerHTML = `
    <div class="card">
      <h3 class="font-semibold text-gray-900 dark:text-white mb-4">Pending User Approvals</h3>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>User</th><th>Email</th><th>Title</th><th>Joined</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${data.users.map(u => `
              <tr>
                <td>
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-kbi-100 flex items-center justify-center text-kbi-600 text-xs font-bold">
                      ${(u.preferred_name || u.display_name || u.email).charAt(0).toUpperCase()}
                    </div>
                    <span class="font-medium">${u.preferred_name || u.display_name || '—'}</span>
                  </div>
                </td>
                <td class="text-gray-500">${u.email}</td>
                <td class="text-gray-500">${u.kbi_title || '—'}</td>
                <td class="text-gray-500 text-xs">${dayjs(u.created_at).fromNow()}</td>
                <td>
                  <div class="flex gap-2">
                    <button onclick="approveUser(${u.id})" class="btn btn-success text-xs py-1.5 px-3">
                      <i class="fas fa-check"></i> Approve
                    </button>
                    <button onclick="rejectUser(${u.id})" class="btn btn-danger text-xs py-1.5 px-3">
                      <i class="fas fa-times"></i> Reject
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function approveUser(userId) {
  try {
    await POST('/admin/approve-user', { userId });
    showToast('User approved', 'success');
    await loadPendingUsers();
  } catch(e) { showToast(e.message, 'error'); }
}

async function rejectUser(userId) {
  const reason = prompt('Reason for rejection (optional):');
  try {
    await POST('/admin/reject-user', { userId, reason });
    showToast('User rejected', 'info');
    await loadPendingUsers();
  } catch(e) { showToast(e.message, 'error'); }
}

async function loadDirectorateRequests() {
  const data = await GET('/admin/directorate-requests');
  const content = document.getElementById('admin-tab-content');
  if (!data.requests.length) {
    content.innerHTML = `<div class="text-center py-16 text-gray-400"><i class="fas fa-check-circle text-4xl mb-3 text-green-400"></i><p>No pending directorate requests</p></div>`;
    return;
  }
  content.innerHTML = `
    <div class="card">
      <h3 class="font-semibold text-gray-900 dark:text-white mb-4">Directorate Access Requests</h3>
      <div class="space-y-3">
        ${data.requests.map(r => `
          <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div>
              <div class="font-medium text-gray-900 dark:text-white text-sm">${r.display_name || r.email}</div>
              <div class="text-xs text-gray-400">Requesting: <strong>${r.directorate_code} — ${r.directorate_name}</strong></div>
              ${r.reason ? `<div class="text-xs text-gray-500 mt-0.5">Reason: ${r.reason}</div>` : ''}
              <div class="text-xs text-gray-400">${dayjs(r.created_at).fromNow()}</div>
            </div>
            <div class="flex gap-2 ml-4">
              <button onclick="approveDirectorateRequest(${r.id})" class="btn btn-success text-xs py-1.5 px-3">
                <i class="fas fa-check"></i> Approve
              </button>
              <button onclick="rejectDirectorateRequest(${r.id})" class="btn btn-danger text-xs py-1.5 px-3">
                <i class="fas fa-times"></i> Reject
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

async function approveDirectorateRequest(requestId) {
  try {
    await POST('/admin/approve-directorate-request', { requestId });
    showToast('Request approved', 'success');
    await loadDirectorateRequests();
  } catch(e) { showToast(e.message, 'error'); }
}

async function rejectDirectorateRequest(requestId) {
  const reason = prompt('Reason for rejection:');
  try {
    await POST('/admin/reject-directorate-request', { requestId, reason });
    showToast('Request rejected', 'info');
    await loadDirectorateRequests();
  } catch(e) { showToast(e.message, 'error'); }
}

async function loadAllUsers() {
  const data = await GET('/users?status=all&limit=100');
  const content = document.getElementById('admin-tab-content');
  content.innerHTML = `
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-semibold text-gray-900 dark:text-white">All Users</h3>
        <button onclick="exportCSV('/export/users')" class="btn btn-secondary text-xs">
          <i class="fas fa-download"></i> Export CSV
        </button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>User</th><th>Email</th><th>Status</th><th>Role</th><th>Last Login</th><th>Actions</th></tr></thead>
          <tbody>
            ${data.users.map(u => `
              <tr>
                <td>
                  <div class="flex items-center gap-3">
                    ${u.avatar_url ? `<img src="${u.avatar_url}" class="w-8 h-8 rounded-full object-cover" />` : `<div class="w-8 h-8 rounded-full bg-kbi-100 flex items-center justify-center text-kbi-600 text-xs font-bold">${(u.preferred_name||u.display_name||u.email).charAt(0).toUpperCase()}</div>`}
                    <div>
                      <div class="font-medium text-sm">${u.preferred_name || u.display_name || '—'}</div>
                      ${u.kbi_title ? `<div class="text-xs text-gray-400">${u.kbi_title}</div>` : ''}
                    </div>
                  </div>
                </td>
                <td class="text-gray-500 text-sm">${u.email}</td>
                <td><span class="badge badge-${u.status}">${u.status}</span>${u.is_god_admin ? ' <span class="badge" style="background:#FEF9C3;color:#854D0E">⚡ God</span>' : ''}</td>
                <td class="text-gray-500 text-xs">${u.kbi_title || '—'}</td>
                <td class="text-gray-500 text-xs">${u.last_login_at ? dayjs(u.last_login_at).fromNow() : 'Never'}</td>
                <td>
                  <div class="flex gap-1">
                    ${u.status === 'pending' ? `<button onclick="approveUser(${u.id})" class="btn btn-success text-xs py-1 px-2"><i class="fas fa-check"></i></button>` : ''}
                    ${u.status === 'active' ? `<button onclick="suspendUser(${u.id})" class="btn btn-danger text-xs py-1 px-2"><i class="fas fa-ban"></i></button>` : ''}
                    ${u.status === 'suspended' ? `<button onclick="reactivateUser(${u.id})" class="btn btn-success text-xs py-1 px-2"><i class="fas fa-undo"></i></button>` : ''}
                    <button onclick="showPersonModal(${u.id})" class="btn btn-secondary text-xs py-1 px-2"><i class="fas fa-eye"></i></button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function suspendUser(userId) {
  if (!confirm('Suspend this user?')) return;
  try {
    await PUT(`/users/${userId}/status`, { status: 'suspended' });
    showToast('User suspended', 'info');
    await loadAllUsers();
  } catch(e) { showToast(e.message, 'error'); }
}

async function reactivateUser(userId) {
  try {
    await PUT(`/users/${userId}/status`, { status: 'active' });
    showToast('User reactivated', 'success');
    await loadAllUsers();
  } catch(e) { showToast(e.message, 'error'); }
}

async function loadAuditLog() {
  const data = await GET('/admin/audit-logs?limit=100');
  const content = document.getElementById('admin-tab-content');
  content.innerHTML = `
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-semibold text-gray-900 dark:text-white">Audit Log</h3>
        <button onclick="exportCSV('/export/audit-logs')" class="btn btn-secondary text-xs"><i class="fas fa-download"></i> Export</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>IP</th></tr></thead>
          <tbody>
            ${data.logs.map(l => `
              <tr>
                <td class="text-xs text-gray-400 whitespace-nowrap">${dayjs(l.created_at).format('MMM D, HH:mm')}</td>
                <td class="text-sm">${l.actor_name || l.actor_email || 'System'}</td>
                <td><code class="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">${l.action}</code></td>
                <td class="text-xs text-gray-500">${l.target_type ? `${l.target_type}:${l.target_id}` : '—'}</td>
                <td class="text-xs text-gray-400">${l.ip_address || '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════
// PROFILE PAGE
// ═══════════════════════════════════════════════
async function renderProfile() {
  try {
    const user = await GET(`/users/${State.user.id}`);
    const skills = JSON.parse(user.skills || '[]');

    document.getElementById('page-content').innerHTML = `
      <div class="space-y-6 max-w-2xl">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          <i class="fas fa-user mr-3 text-kbi-500"></i>My Profile
        </h1>

        <!-- Profile Header -->
        <div class="card flex items-start gap-6">
          <div class="w-20 h-20 rounded-2xl bg-kbi-100 flex items-center justify-center text-kbi-600 text-3xl font-bold flex-shrink-0">
            ${user.avatar_url ? `<img src="${user.avatar_url}" class="w-20 h-20 rounded-2xl object-cover" />` : (user.preferred_name||user.display_name||user.email).charAt(0).toUpperCase()}
          </div>
          <div class="flex-1">
            <div class="text-xl font-bold text-gray-900 dark:text-white">${user.preferred_name || user.display_name}</div>
            <div class="text-kbi-600">${user.kbi_title || 'KBI Member'}</div>
            <div class="text-sm text-gray-400">${user.email}</div>
            <div class="flex flex-wrap gap-1 mt-2">
              ${(user.directorates||[]).map(d => `<span class="dir-pill" style="background:${d.color}">${d.code} ${d.name}</span>`).join('')}
            </div>
          </div>
          <span class="badge badge-${user.status}">${user.status}</span>
        </div>

        <!-- Edit Form -->
        <form class="card space-y-4" onsubmit="saveProfile(event)">
          <h3 class="font-semibold text-gray-900 dark:text-white">Edit Profile</h3>
          <div class="grid grid-cols-2 gap-4">
            <div><label class="text-xs text-gray-500 mb-1 block">Preferred Name</label>
              <input name="preferred_name" value="${user.preferred_name||''}" class="input" /></div>
            <div><label class="text-xs text-gray-500 mb-1 block">KBI Title / Role</label>
              <input name="kbi_title" value="${user.kbi_title||''}" class="input" /></div>
            <div><label class="text-xs text-gray-500 mb-1 block">Department</label>
              <input name="department" value="${user.department||''}" class="input" /></div>
            <div><label class="text-xs text-gray-500 mb-1 block">Location</label>
              <input name="location" value="${user.location||''}" class="input" /></div>
            <div><label class="text-xs text-gray-500 mb-1 block">Phone</label>
              <input name="phone" value="${user.phone||''}" class="input" /></div>
            <div><label class="text-xs text-gray-500 mb-1 block">Timezone</label>
              <input name="timezone" value="${user.timezone||'UTC'}" class="input" /></div>
            <div><label class="text-xs text-gray-500 mb-1 block">Pronouns</label>
              <input name="pronouns" value="${user.pronouns||''}" class="input" /></div>
            <div><label class="text-xs text-gray-500 mb-1 block">LinkedIn URL</label>
              <input name="linkedin_url" value="${user.linkedin_url||''}" class="input" /></div>
          </div>
          <div><label class="text-xs text-gray-500 mb-1 block">Bio</label>
            <textarea name="bio" rows="3" class="input resize-none">${user.bio||''}</textarea></div>
          <div><label class="text-xs text-gray-500 mb-1 block">Skills (comma separated)</label>
            <input name="skills" value="${skills.join(', ')}" class="input" /></div>
          <div class="flex items-center gap-3">
            <input type="checkbox" name="is_profile_public" id="public-toggle" ${user.is_profile_public ? 'checked' : ''} class="rounded" />
            <label for="public-toggle" class="text-sm text-gray-700 dark:text-gray-300">Public profile (visible in People Directory)</label>
          </div>
          <button type="submit" class="btn btn-primary w-full justify-center">
            <i class="fas fa-save"></i> Save Profile
          </button>
        </form>

        <!-- Directorate Membership -->
        <div class="card">
          <h3 class="font-semibold text-gray-900 dark:text-white mb-4">Directorate Membership</h3>
          <div class="space-y-2 mb-4">
            ${(user.directorates||[]).length ? user.directorates.map(d => `
              <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div class="flex items-center gap-2">
                  <span class="dir-pill" style="background:${d.color}">${d.code}</span>
                  <span class="text-sm font-medium">${d.name}</span>
                  ${d.is_primary ? '<span class="badge badge-active">Primary</span>' : ''}
                </div>
              </div>
            `).join('') : '<p class="text-gray-400 text-sm">Not in any directorate yet.</p>'}
          </div>
          <button onclick="showJoinDirectorateModal()" class="btn btn-secondary text-sm">
            <i class="fas fa-plus"></i> Request Directorate Access
          </button>
        </div>
      </div>
    `;
  } catch(e) {
    document.getElementById('page-content').innerHTML = `<p class="text-red-500">${e.message}</p>`;
  }
}

async function saveProfile(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  const skills = form.get('skills').split(',').map(s => s.trim()).filter(Boolean);
  const body = {
    preferred_name: form.get('preferred_name'),
    kbi_title: form.get('kbi_title'),
    department: form.get('department'),
    location: form.get('location'),
    phone: form.get('phone'),
    timezone: form.get('timezone'),
    pronouns: form.get('pronouns'),
    linkedin_url: form.get('linkedin_url'),
    bio: form.get('bio'),
    skills: JSON.stringify(skills),
    is_profile_public: form.get('is_profile_public') === 'on' ? 1 : 0,
  };
  try {
    await PUT(`/users/${State.user.id}/profile`, body);
    showToast('Profile saved!', 'success');
    // Refresh user state
    const data = await GET('/auth/me');
    State.user = data.user;
    updateUserUI();
  } catch(err) { showToast(err.message, 'error'); }
}

// ═══════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════
function showModal(bodyHTML, title = '') {
  let backdrop = document.getElementById('modal-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'modal-backdrop';
    backdrop.className = 'modal-backdrop';
    backdrop.onclick = (e) => { if (e.target === backdrop) closeModal(); };
    document.body.appendChild(backdrop);
  }
  backdrop.innerHTML = `
    <div class="modal-box">
      <div class="flex items-center justify-between mb-4">
        ${title ? `<h3 class="text-lg font-semibold text-gray-900 dark:text-white">${title}</h3>` : '<div></div>'}
        <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ml-4">
          <i class="fas fa-times text-lg"></i>
        </button>
      </div>
      ${bodyHTML}
    </div>
  `;
  backdrop.classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-backdrop')?.classList.add('hidden');
}

function showAddAnnouncement() {
  showModal(`
    <form onsubmit="submitAnnouncement(event)">
      <div class="space-y-4">
        <div><label class="text-xs text-gray-500 mb-1 block">Title*</label><input name="title" required class="input" /></div>
        <div><label class="text-xs text-gray-500 mb-1 block">Body</label><textarea name="body" rows="3" class="input resize-none"></textarea></div>
        <div class="flex items-center gap-3">
          <input type="checkbox" name="is_pinned" id="pin-toggle" />
          <label for="pin-toggle" class="text-sm">Pin this announcement</label>
        </div>
        <button type="submit" class="btn btn-primary w-full justify-center">Post Announcement</button>
      </div>
    </form>
  `, 'New Announcement');
}

async function submitAnnouncement(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    await POST('/content/announcements', {
      title: form.get('title'),
      body: form.get('body'),
      is_pinned: form.get('is_pinned') === 'on',
    });
    closeModal();
    showToast('Announcement posted!', 'success');
    navigate('home');
  } catch(err) { showToast(err.message, 'error'); }
}

function showAddEventModal() {
  showModal(`
    <form onsubmit="submitEvent(event)">
      <div class="space-y-4">
        <div><label class="text-xs text-gray-500 mb-1 block">Title*</label><input name="title" required class="input" /></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs text-gray-500 mb-1 block">Start Date/Time*</label><input name="start_at" type="datetime-local" required class="input" /></div>
          <div><label class="text-xs text-gray-500 mb-1 block">End Date/Time</label><input name="end_at" type="datetime-local" class="input" /></div>
        </div>
        <div><label class="text-xs text-gray-500 mb-1 block">Location</label><input name="location" class="input" /></div>
        <div><label class="text-xs text-gray-500 mb-1 block">Event Type</label>
          <select name="event_type" class="input">
            <option value="general">General</option>
            <option value="directorate">Directorate</option>
            <option value="chapter">Chapter</option>
            <option value="collaboration">Collaboration</option>
          </select></div>
        <div><label class="text-xs text-gray-500 mb-1 block">Description</label><textarea name="description" rows="2" class="input resize-none"></textarea></div>
        <button type="submit" class="btn btn-primary w-full justify-center">Create Event</button>
      </div>
    </form>
  `, 'New Event');
}

async function submitEvent(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    await POST('/calendar/events', {
      title: form.get('title'),
      start_at: form.get('start_at'),
      end_at: form.get('end_at') || undefined,
      location: form.get('location') || undefined,
      event_type: form.get('event_type'),
      description: form.get('description') || undefined,
    });
    closeModal();
    showToast('Event created!', 'success');
    navigate('calendar');
  } catch(err) { showToast(err.message, 'error'); }
}

async function showJoinDirectorateModal() {
  const data = await GET('/directory/directorates').catch(() => ({ directorates: [] }));
  showModal(`
    <form onsubmit="submitDirectorateRequest(event)">
      <p class="text-sm text-gray-500 mb-4">Select the directorate you'd like to join. Your request will be reviewed by the Directorate Lead or God Admin.</p>
      <div class="space-y-3">
        <div><label class="text-xs text-gray-500 mb-1 block">Directorate*</label>
          <select name="directorate_id" required class="input">
            <option value="">Select...</option>
            ${data.directorates.map(d => `<option value="${d.id}">${d.code} — ${d.name}</option>`).join('')}
          </select>
        </div>
        <div><label class="text-xs text-gray-500 mb-1 block">Reason</label>
          <textarea name="reason" rows="2" placeholder="Why are you joining this directorate?" class="input resize-none"></textarea>
        </div>
        <button type="submit" class="btn btn-primary w-full justify-center">Submit Request</button>
      </div>
    </form>
  `, 'Request Directorate Access');
}

async function submitDirectorateRequest(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    await POST('/directory/request-directorate', {
      directorate_id: parseInt(form.get('directorate_id')),
      reason: form.get('reason') || undefined,
    });
    closeModal();
    showToast('Request submitted!', 'success');
  } catch(err) { showToast(err.message, 'error'); }
}

function showAddArticleModal() {
  showModal(`
    <form onsubmit="submitArticle(event)">
      <div class="space-y-3">
        <div><label class="text-xs text-gray-500 mb-1 block">Title*</label><input name="title" required class="input" /></div>
        <div><label class="text-xs text-gray-500 mb-1 block">Slug* (URL-friendly)</label><input name="slug" required class="input" placeholder="my-article-title" /></div>
        <div><label class="text-xs text-gray-500 mb-1 block">Category</label>
          <select name="category" class="input">
            <option value="general">General</option>
            <option value="onboarding">Onboarding</option>
            <option value="policy">Policy</option>
            <option value="access">Access</option>
          </select>
        </div>
        <div><label class="text-xs text-gray-500 mb-1 block">Content (Markdown)</label>
          <textarea name="content_body" rows="8" class="input resize-none font-mono text-xs" placeholder="# Title&#10;&#10;Your markdown content here..."></textarea></div>
        <button type="submit" class="btn btn-primary w-full justify-center">Publish Article</button>
      </div>
    </form>
  `, 'New Knowledge Article');
}

async function submitArticle(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    await POST('/content/articles', {
      title: form.get('title'),
      slug: form.get('slug'),
      category: form.get('category'),
      content_body: form.get('content_body'),
    });
    closeModal();
    showToast('Article published!', 'success');
    navigate('guides');
  } catch(err) { showToast(err.message, 'error'); }
}

function showAddBrandModal() {
  showModal(`
    <form onsubmit="submitBrandResource(event)">
      <div class="space-y-3">
        <div><label class="text-xs text-gray-500 mb-1 block">Name*</label><input name="name" required class="input" /></div>
        <div><label class="text-xs text-gray-500 mb-1 block">Category</label>
          <select name="category" class="input">
            <option value="logo">Logo</option>
            <option value="font">Font</option>
            <option value="template">Template</option>
            <option value="color_palette">Color Palette</option>
            <option value="icon">Icon</option>
            <option value="general">General</option>
          </select>
        </div>
        <div><label class="text-xs text-gray-500 mb-1 block">File URL</label><input name="file_url" type="url" class="input" placeholder="https://..." /></div>
        <div><label class="text-xs text-gray-500 mb-1 block">Description</label><textarea name="description" rows="2" class="input resize-none"></textarea></div>
        <div><label class="text-xs text-gray-500 mb-1 block">Version</label><input name="version" value="1.0" class="input" /></div>
        <button type="submit" class="btn btn-primary w-full justify-center">Add Resource</button>
      </div>
    </form>
  `, 'Add Brand Resource');
}

async function submitBrandResource(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    await POST('/content/brand', {
      name: form.get('name'),
      category: form.get('category'),
      file_url: form.get('file_url') || undefined,
      description: form.get('description') || undefined,
      version: form.get('version'),
    });
    closeModal();
    showToast('Resource added!', 'success');
    navigate('brand-kit');
  } catch(err) { showToast(err.message, 'error'); }
}

// ═══════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════
async function exportCSV(path) {
  try {
    showToast('Preparing export...', 'info');
    const blob = await api('GET', path);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = path.split('/').pop() + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Export downloaded!', 'success');
  } catch(e) { showToast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', initApp);
