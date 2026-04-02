// ═══════════════════════════════════════════════════════════════════════════
// KBI Platform — Phase 3 Frontend Extension (p3-app.js)
// Intelligence, Automation, Analytics & Advanced Workflow UI
// ═══════════════════════════════════════════════════════════════════════════

// ── Phase 3 Navigation Registration ──────────────────────────────────────
function registerP3Navigation() {
  const nav = document.getElementById('sidebar-nav')
  if (!nav || !window.currentUser) return

  const isAdmin = window.currentUser.isGodAdmin || window.currentUser.roles?.includes('god_admin') ||
    window.currentUser.roles?.includes('platform_admin')
  const isExec = isAdmin || window.currentUser.roles?.includes('executive')
  const isLead = isAdmin || window.currentUser.roles?.includes('directorate_lead')

  const section = document.createElement('div')
  section.id = 'p3-nav-section'
  section.innerHTML = `
    <div class="px-3 py-1.5 mt-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Intelligence</div>
    <a onclick="navigate('p3-requests')" class="nav-link flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-sm font-medium">
      <i class="fas fa-inbox w-4 text-center"></i> My Requests
    </a>
    <a onclick="navigate('p3-submit-request')" class="nav-link flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-sm font-medium">
      <i class="fas fa-plus-circle w-4 text-center text-green-500"></i> Submit Request
    </a>
    <a onclick="navigate('p3-knowledge')" class="nav-link flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-sm font-medium">
      <i class="fas fa-book-open w-4 text-center"></i> Knowledge Base
    </a>
    <a onclick="navigate('p3-accounts')" class="nav-link flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-sm font-medium">
      <i class="fas fa-handshake w-4 text-center"></i> Relationships
    </a>
    ${isExec ? `
    <div class="px-3 py-1.5 mt-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Analytics</div>
    <a onclick="navigate('p3-executive')" class="nav-link flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-sm font-medium">
      <i class="fas fa-chart-line w-4 text-center text-purple-500"></i> Executive Dashboard
    </a>
    ` : ''}
    ${isLead ? `
    <a onclick="navigate('p3-workflows')" class="nav-link flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-sm font-medium">
      <i class="fas fa-project-diagram w-4 text-center"></i> Workflow Center
    </a>
    ` : ''}
    ${isAdmin ? `
    <div class="px-3 py-1.5 mt-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Automation</div>
    <a onclick="navigate('p3-automation')" class="nav-link flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-sm font-medium">
      <i class="fas fa-robot w-4 text-center text-blue-500"></i> Automation Center
    </a>
    <a onclick="navigate('p3-connectors')" class="nav-link flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-sm font-medium">
      <i class="fas fa-plug w-4 text-center"></i> Connectors
    </a>
    <a onclick="navigate('p3-monitoring')" class="nav-link flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-sm font-medium">
      <i class="fas fa-shield-alt w-4 text-center text-red-500"></i> Monitoring
    </a>
    ` : ''}
  `

  const adminSection = document.getElementById('admin-nav-section')
  if (adminSection) nav.insertBefore(section, adminSection)
  else nav.appendChild(section)

  // Notification badge
  loadNotificationBadge()
}

// ── Notification Badge ─────────────────────────────────────────────────────
async function loadNotificationBadge() {
  try {
    const res = await fetch('/api/p3/automation/notifications/inbox?unread=true')
    const data = await res.json()
    const count = data.unread_count || 0
    const el = document.getElementById('notif-badge')
    if (!el && count > 0) {
      const notifBtn = document.querySelector('[onclick*="notifications"]')
      if (notifBtn) {
        notifBtn.innerHTML += `<span id="notif-badge" class="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">${count}</span>`
      }
    } else if (el) {
      if (count > 0) { el.textContent = count; el.style.display = '' }
      else el.style.display = 'none'
    }
  } catch {}
}

// ── Page Router (Phase 3 pages) ────────────────────────────────────────────
const p3PageHandlers = {
  'p3-requests':       renderP3RequestsPage,
  'p3-submit-request': renderP3SubmitRequestPage,
  'p3-request-detail': renderP3RequestDetailPage,
  'p3-knowledge':      renderP3KnowledgePage,
  'p3-knowledge-doc':  renderP3KnowledgeDocPage,
  'p3-accounts':       renderP3AccountsPage,
  'p3-account-detail': renderP3AccountDetailPage,
  'p3-executive':      renderP3ExecutivePage,
  'p3-workflows':      renderP3WorkflowsPage,
  'p3-workflow-detail':renderP3WorkflowDetailPage,
  'p3-automation':     renderP3AutomationPage,
  'p3-connectors':     renderP3ConnectorsPage,
  'p3-monitoring':     renderP3MonitoringPage,
  'p3-notifications':  renderP3NotificationsPage,
}

// Hook into the existing navigate function
const _originalP3Navigate = window.navigateTo
window.addEventListener('DOMContentLoaded', () => {
  const origNav = window.navigate
  if (origNav) {
    window.navigate = function(page, params) {
      if (p3PageHandlers[page]) {
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'))
        document.querySelectorAll(`.nav-link[onclick*="${page}"]`).forEach(l => l.classList.add('active'))
        window._p3NavParams = params
        p3PageHandlers[page](params)
      } else {
        origNav(page, params)
      }
    }
  }
})

// ── Shared Utility Functions ───────────────────────────────────────────────
function p3ShowPage(html) {
  const content = document.getElementById('page-content')
  if (content) content.innerHTML = html
}

function p3Toast(msg, type = 'success') {
  if (window.showToast) window.showToast(msg, type)
  else console.log(`[${type}] ${msg}`)
}

function p3StatusBadge(status) {
  const colors = {
    submitted: 'bg-blue-100 text-blue-800',
    under_review: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    withdrawn: 'bg-gray-100 text-gray-600',
    closed: 'bg-gray-100 text-gray-600',
    running: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-green-100 text-green-800',
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-600',
    pending: 'bg-blue-100 text-blue-800',
    success: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    draft: 'bg-gray-100 text-gray-600',
    open: 'bg-green-100 text-green-800',
    idle: 'bg-gray-100 text-gray-600',
  }
  const cls = colors[status] || 'bg-gray-100 text-gray-600'
  return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}">${status?.replace('_', ' ')}</span>`
}

function p3RelTime(dt) {
  if (!dt) return '—'
  if (window.dayjs) return dayjs(dt).fromNow()
  return new Date(dt).toLocaleDateString()
}

function p3FormatDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE: MY REQUESTS
// ═══════════════════════════════════════════════════════════════════════════
async function renderP3RequestsPage() {
  p3ShowPage(`<div class="flex items-center justify-center h-48"><i class="fas fa-spinner fa-spin text-kbi-600 text-2xl"></i></div>`)
  const [myRes, pendingRes] = await Promise.all([
    fetch('/api/p3/requests/my').then(r => r.json()).catch(() => ({ requests: [] })),
    fetch('/api/p3/requests/pending/mine').then(r => r.json()).catch(() => ({ pending_steps: [] })),
  ])
  const requests = myRes.requests || []
  const pendingSteps = pendingRes.pending_steps || []

  p3ShowPage(`
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">My Requests</h1>
          <p class="text-gray-500 text-sm mt-1">Track your submitted requests and approvals</p>
        </div>
        <button onclick="navigate('p3-submit-request')" class="flex items-center gap-2 bg-kbi-600 hover:bg-kbi-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
          <i class="fas fa-plus"></i> New Request
        </button>
      </div>

      ${pendingSteps.length > 0 ? `
      <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-5">
        <div class="flex items-center gap-2 mb-4">
          <i class="fas fa-clock text-amber-600"></i>
          <h2 class="font-semibold text-amber-900 dark:text-amber-300">Pending Your Approval (${pendingSteps.length})</h2>
        </div>
        <div class="space-y-3">
          ${pendingSteps.map(s => `
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div class="font-medium text-gray-900 dark:text-white">${s.request_title || 'Request'} <span class="text-gray-400 text-xs ml-1">${s.issued_id || ''}</span></div>
                <div class="text-sm text-gray-500">Step: ${s.step_name} · Submitted by ${s.requester_name || 'Unknown'}</div>
                <div class="text-xs text-gray-400 mt-1">Deadline: ${p3FormatDate(s.deadline_at)}</div>
              </div>
              <div class="flex gap-2">
                <button onclick="p3QuickAct(${s.workflow_run_id},'approved','Approved')" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium">Approve</button>
                <button onclick="p3QuickAct(${s.workflow_run_id},'rejected','')" class="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg text-xs font-medium">Reject</button>
                <button onclick="navigate('p3-workflow-detail',{id:${s.workflow_run_id}})" class="text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg text-xs">View</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h2 class="font-semibold text-gray-900 dark:text-white">My Submitted Requests</h2>
          <span class="text-sm text-gray-400">${requests.length} total</span>
        </div>
        ${requests.length === 0 ? `
          <div class="text-center py-12 text-gray-400">
            <i class="fas fa-inbox text-4xl mb-3"></i>
            <p>No requests yet. <a onclick="navigate('p3-submit-request')" class="text-kbi-600 cursor-pointer hover:underline">Submit your first request</a></p>
          </div>
        ` : `
          <div class="divide-y divide-gray-100 dark:divide-gray-700">
            ${requests.map(r => `
              <div class="px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onclick="navigate('p3-request-detail',{id:${r.id}})">
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-xl flex items-center justify-center" style="background:${r.type_color}20">
                    <i class="${r.type_icon}" style="color:${r.type_color}"></i>
                  </div>
                  <div>
                    <div class="font-medium text-gray-900 dark:text-white">${r.title}</div>
                    <div class="text-xs text-gray-400">${r.issued_id} · ${r.type_name} · ${p3RelTime(r.submitted_at)}</div>
                  </div>
                </div>
                <div class="flex items-center gap-2">${p3StatusBadge(r.status)}<i class="fas fa-chevron-right text-gray-300 ml-2"></i></div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </div>
  `)
}

async function p3QuickAct(runId, action, note) {
  if (action === 'rejected') {
    note = prompt('Reason for rejection:') || ''
    if (!note) return
  }
  try {
    const res = await fetch(`/api/p3/workflows/runs/${runId}/act`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, rationale: note })
    })
    const data = await res.json()
    if (data.success) { p3Toast(`Request ${action}`); renderP3RequestsPage() }
    else p3Toast(data.error || 'Failed', 'error')
  } catch { p3Toast('Action failed', 'error') }
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE: SUBMIT REQUEST
// ═══════════════════════════════════════════════════════════════════════════
async function renderP3SubmitRequestPage() {
  p3ShowPage(`<div class="flex items-center justify-center h-48"><i class="fas fa-spinner fa-spin text-kbi-600 text-2xl"></i></div>`)
  const data = await fetch('/api/p3/requests/types').then(r => r.json()).catch(() => ({ types: [] }))
  const types = data.types || []

  p3ShowPage(`
    <div class="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Submit a Request</h1>
        <p class="text-gray-500 text-sm mt-1">Choose the type of request to get started</p>
      </div>

      <div id="p3-type-selector" class="grid grid-cols-2 gap-3">
        ${types.map(t => `
          <button onclick="p3SelectRequestType('${t.slug}', ${t.id})"
            class="p-4 rounded-2xl border-2 border-gray-200 dark:border-gray-700 hover:border-kbi-400 dark:hover:border-kbi-500 text-left transition-all group">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style="background:${t.color}20">
              <i class="${t.icon}" style="color:${t.color}"></i>
            </div>
            <div class="font-medium text-gray-900 dark:text-white group-hover:text-kbi-600">${t.name}</div>
            <div class="text-xs text-gray-400 mt-1">${t.description || ''}</div>
          </button>
        `).join('')}
      </div>

      <div id="p3-request-form" class="hidden"></div>
    </div>
  `)
}

async function p3SelectRequestType(slug, typeId) {
  const data = await fetch(`/api/p3/requests/types/${slug}`).then(r => r.json()).catch(() => ({}))
  const type = data.type
  const fields = data.fields || []

  const formEl = document.getElementById('p3-request-form')
  const selectorEl = document.getElementById('p3-type-selector')
  if (selectorEl) selectorEl.style.display = 'none'
  if (!formEl) return

  formEl.classList.remove('hidden')
  formEl.innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      <div class="flex items-center gap-3 mb-6">
        <button onclick="navigate('p3-submit-request')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-arrow-left"></i></button>
        <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:${type?.color}20">
          <i class="${type?.icon}" style="color:${type?.color}"></i>
        </div>
        <div>
          <h2 class="font-semibold text-gray-900 dark:text-white">${type?.name}</h2>
          <p class="text-xs text-gray-400">${type?.description || ''}</p>
        </div>
      </div>
      <form id="p3-req-form" onsubmit="p3SubmitRequest(event, ${typeId})">
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject / Title *</label>
            <input name="title" required placeholder="Brief description of your request..."
              class="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-kbi-400 dark:bg-gray-700 dark:text-white" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
            <select name="priority" class="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-kbi-400 dark:bg-gray-700 dark:text-white">
              <option value="normal">Normal</option>
              <option value="low">Low</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea name="description" rows="3" placeholder="Additional context..."
              class="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-kbi-400 dark:bg-gray-700 dark:text-white resize-none"></textarea>
          </div>
          ${fields.map(f => `
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">${f.label} ${f.is_required ? '*' : ''}</label>
              ${f.field_type === 'textarea' ? `<textarea name="field_${f.id}" ${f.is_required ? 'required' : ''} placeholder="${f.placeholder || ''}" rows="3"
                class="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-kbi-400 dark:bg-gray-700 dark:text-white resize-none"></textarea>` :
              f.field_type === 'select' ? `<select name="field_${f.id}" ${f.is_required ? 'required' : ''}
                class="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-kbi-400 dark:bg-gray-700 dark:text-white">
                <option value="">Select...</option>
                ${JSON.parse(f.options || '[]').map(o => `<option value="${o}">${o}</option>`).join('')}
                </select>` :
              `<input type="${f.field_type === 'number' ? 'number' : f.field_type === 'date' ? 'date' : 'text'}" name="field_${f.id}" ${f.is_required ? 'required' : ''} placeholder="${f.placeholder || ''}"
                class="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-kbi-400 dark:bg-gray-700 dark:text-white" />`}
              ${f.help_text ? `<p class="text-xs text-gray-400 mt-1">${f.help_text}</p>` : ''}
            </div>
          `).join('')}
        </div>
        <div class="flex gap-3 mt-6">
          <button type="submit" class="flex-1 bg-kbi-600 hover:bg-kbi-700 text-white py-2.5 rounded-xl text-sm font-medium">
            <i class="fas fa-paper-plane mr-2"></i>Submit Request
          </button>
          <button type="button" onclick="navigate('p3-submit-request')" class="px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-600 dark:text-gray-300">Cancel</button>
        </div>
      </form>
    </div>
  `
}

async function p3SubmitRequest(e, typeId) {
  e.preventDefault()
  const form = e.target
  const fd = new FormData(form)
  const title = fd.get('title')
  const description = fd.get('description')
  const priority = fd.get('priority')

  const responses = []
  for (const [key, val] of fd.entries()) {
    if (key.startsWith('field_')) {
      const fieldId = parseInt(key.replace('field_', ''))
      responses.push({ field_id: fieldId, field_key: key, value_text: val })
    }
  }

  const submitBtn = form.querySelector('[type="submit"]')
  if (submitBtn) submitBtn.disabled = true

  try {
    const res = await fetch('/api/p3/requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_type_id: typeId, title, description, priority, responses })
    })
    const data = await res.json()
    if (data.success) {
      p3Toast(`Request ${data.issued_id} submitted successfully!`)
      navigate('p3-request-detail', { id: data.id })
    } else {
      p3Toast(data.error || 'Submission failed', 'error')
      if (submitBtn) submitBtn.disabled = false
    }
  } catch {
    p3Toast('Submission failed', 'error')
    if (submitBtn) submitBtn.disabled = false
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE: REQUEST DETAIL
// ═══════════════════════════════════════════════════════════════════════════
async function renderP3RequestDetailPage(params) {
  const id = params?.id || window._p3NavParams?.id
  if (!id) { navigate('p3-requests'); return }
  p3ShowPage(`<div class="flex items-center justify-center h-48"><i class="fas fa-spinner fa-spin text-kbi-600 text-2xl"></i></div>`)
  const data = await fetch(`/api/p3/requests/${id}`).then(r => r.json()).catch(() => ({}))
  const r = data.request
  if (!r) { p3ShowPage(`<div class="text-center py-16 text-gray-400"><i class="fas fa-exclamation-circle text-4xl mb-3"></i><p>Request not found</p></div>`); return }

  const wfRun = data.workflowRun
  const responses = data.responses || []
  const notifications = data.notifications || []

  p3ShowPage(`
    <div class="space-y-6 max-w-4xl mx-auto">
      <div class="flex items-center gap-3">
        <button onclick="navigate('p3-requests')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-arrow-left"></i></button>
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-bold text-gray-900 dark:text-white">${r.title}</h1>
            ${p3StatusBadge(r.status)}
          </div>
          <p class="text-sm text-gray-500">${r.issued_id} · ${r.type_name} · Submitted ${p3RelTime(r.submitted_at)}</p>
        </div>
        ${r.status === 'submitted' || r.status === 'under_review' ? `
          <button onclick="p3WithdrawRequest(${r.id})" class="text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-xl">Withdraw</button>
        ` : ''}
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="md:col-span-2 space-y-4">
          <!-- Details card -->
          <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            <h3 class="font-semibold text-gray-900 dark:text-white mb-4">Request Details</h3>
            <dl class="space-y-3">
              ${r.description ? `<div><dt class="text-xs text-gray-400 uppercase tracking-wide">Description</dt><dd class="text-sm text-gray-700 dark:text-gray-300 mt-1">${r.description}</dd></div>` : ''}
              ${responses.map(resp => `
                <div>
                  <dt class="text-xs text-gray-400 uppercase tracking-wide">${resp.label}</dt>
                  <dd class="text-sm text-gray-700 dark:text-gray-300 mt-1">${resp.value_text || '—'}</dd>
                </div>
              `).join('')}
              <div><dt class="text-xs text-gray-400 uppercase tracking-wide">Priority</dt><dd class="text-sm font-medium text-gray-700 dark:text-gray-300 mt-1 capitalize">${r.priority}</dd></div>
              <div><dt class="text-xs text-gray-400 uppercase tracking-wide">Submitted By</dt><dd class="text-sm text-gray-700 dark:text-gray-300 mt-1">${r.requester_name} (${r.requester_email})</dd></div>
              ${r.directorate_name ? `<div><dt class="text-xs text-gray-400 uppercase tracking-wide">Directorate</dt><dd class="text-sm text-gray-700 dark:text-gray-300 mt-1">${r.directorate_name}</dd></div>` : ''}
            </dl>
          </div>

          <!-- Workflow card -->
          ${wfRun ? `
          <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold text-gray-900 dark:text-white">Approval Workflow</h3>
              <button onclick="navigate('p3-workflow-detail',{id:${wfRun.id}})" class="text-xs text-kbi-600 hover:underline">View Full Detail</button>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-2.5 h-2.5 rounded-full ${wfRun.status === 'running' ? 'bg-yellow-400 animate-pulse' : wfRun.status === 'completed' ? 'bg-green-400' : 'bg-red-400'}"></div>
              <span class="text-sm font-medium capitalize">${wfRun.status}</span>
              <span class="text-xs text-gray-400">— ${wfRun.template_name}</span>
            </div>
          </div>
          ` : ''}

          <!-- Notifications -->
          ${notifications.length > 0 ? `
          <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            <h3 class="font-semibold text-gray-900 dark:text-white mb-4">Activity</h3>
            <div class="space-y-3">
              ${notifications.map(n => `
                <div class="flex items-start gap-3 text-sm">
                  <div class="w-6 h-6 rounded-full bg-kbi-100 flex items-center justify-center mt-0.5 flex-shrink-0">
                    <i class="fas fa-bell text-kbi-600 text-xs"></i>
                  </div>
                  <div>
                    <div class="text-gray-700 dark:text-gray-300">${n.body || n.subject}</div>
                    <div class="text-xs text-gray-400">${p3RelTime(n.created_at)}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          ` : ''}
        </div>

        <!-- Side panel -->
        <div class="space-y-4">
          <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            <h3 class="font-semibold text-gray-900 dark:text-white mb-4">Status</h3>
            <div class="text-center py-2">${p3StatusBadge(r.status)}</div>
            <div class="mt-4 space-y-2 text-xs text-gray-500">
              <div class="flex justify-between"><span>Submitted</span><span>${p3FormatDate(r.submitted_at)}</span></div>
              ${r.closed_at ? `<div class="flex justify-between"><span>Closed</span><span>${p3FormatDate(r.closed_at)}</span></div>` : ''}
            </div>
          </div>

          <!-- Admin actions -->
          ${window.currentUser?.isGodAdmin || window.currentUser?.roles?.includes('platform_admin') || window.currentUser?.roles?.includes('directorate_lead') ? `
          <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            <h3 class="font-semibold text-gray-900 dark:text-white mb-4">Admin Actions</h3>
            <div class="space-y-2">
              <button onclick="p3AdminUpdateStatus(${r.id},'approved')" class="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-xl text-sm font-medium">Approve</button>
              <button onclick="p3AdminUpdateStatus(${r.id},'rejected')" class="w-full bg-red-100 hover:bg-red-200 text-red-700 py-2 rounded-xl text-sm font-medium">Reject</button>
              <button onclick="p3AdminUpdateStatus(${r.id},'under_review')" class="w-full bg-yellow-100 hover:bg-yellow-200 text-yellow-700 py-2 rounded-xl text-sm font-medium">Mark Under Review</button>
            </div>
          </div>
          ` : ''}
        </div>
      </div>
    </div>
  `)
}

async function p3WithdrawRequest(id) {
  if (!confirm('Are you sure you want to withdraw this request?')) return
  const res = await fetch(`/api/p3/requests/${id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'withdrawn', note: 'Withdrawn by requester' })
  })
  const data = await res.json()
  if (data.success) { p3Toast('Request withdrawn'); renderP3RequestDetailPage({ id }) }
  else p3Toast(data.error || 'Failed', 'error')
}

async function p3AdminUpdateStatus(id, status) {
  let note = ''
  if (status === 'rejected') { note = prompt('Rejection reason:') || ''; if (!note) return }
  const res = await fetch(`/api/p3/requests/${id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, note })
  })
  const data = await res.json()
  if (data.success) { p3Toast(`Request ${status}`); renderP3RequestDetailPage({ id }) }
  else p3Toast(data.error || 'Failed', 'error')
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE: EXECUTIVE DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
async function renderP3ExecutivePage() {
  p3ShowPage(`<div class="flex items-center justify-center h-48"><i class="fas fa-spinner fa-spin text-purple-600 text-2xl"></i></div>`)
  const data = await fetch('/api/p3/analytics/executive').then(r => r.json()).catch(() => ({}))
  if (data.error) { p3ShowPage(`<div class="text-center py-16 text-gray-400"><i class="fas fa-lock text-4xl mb-3"></i><p>${data.error}</p></div>`); return }

  const p = data.platform || {}
  const dirs = data.by_directorate || []
  const pendingReqs = data.pending_requests || []
  const reqTrend = data.request_trend || []
  const wfPerf = data.workflow_performance || []
  const wsHealth = data.workspace_health || []
  const activity = data.recent_activity || []

  p3ShowPage(`
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Executive Dashboard</h1>
          <p class="text-gray-500 text-sm mt-1">Cross-directorate platform intelligence · Last updated ${new Date().toLocaleTimeString()}</p>
        </div>
        <button onclick="renderP3ExecutivePage()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-sync-alt"></i></button>
      </div>

      <!-- KPI Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        ${[
          { label: 'Active Users', value: p.users?.active || 0, sub: `of ${p.users?.total || 0} total`, icon: 'fas fa-users', color: 'bg-blue-500' },
          { label: 'Pending Requests', value: p.requests?.pending || 0, sub: `${p.requests?.approved || 0} approved`, icon: 'fas fa-inbox', color: 'bg-amber-500' },
          { label: 'Active Workflows', value: p.workflow_runs?.running || 0, sub: `${p.workflow_runs?.completed || 0} completed`, icon: 'fas fa-project-diagram', color: 'bg-purple-500' },
          { label: 'Active Work Items', value: p.work_items?.active || 0, sub: 'across all workspaces', icon: 'fas fa-tasks', color: 'bg-green-500' },
        ].map(k => `
          <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            <div class="flex items-center justify-between mb-3">
              <div class="w-10 h-10 ${k.color} rounded-xl flex items-center justify-center">
                <i class="${k.icon} text-white"></i>
              </div>
            </div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white">${k.value}</div>
            <div class="text-sm font-medium text-gray-600 dark:text-gray-300">${k.label}</div>
            <div class="text-xs text-gray-400">${k.sub}</div>
          </div>
        `).join('')}
      </div>

      <!-- Directorate Summary -->
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
        <h2 class="font-semibold text-gray-900 dark:text-white mb-4">Directorate Overview</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="text-xs text-gray-400 uppercase border-b dark:border-gray-700">
              <th class="pb-2 text-left">Directorate</th>
              <th class="pb-2 text-right">Requests</th>
              <th class="pb-2 text-right">Pending</th>
              <th class="pb-2 text-right">Work Items</th>
              <th class="pb-2 text-left pl-4">Activity</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-50 dark:divide-gray-700">
              ${dirs.map(d => `
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onclick="navigate('p3-directorate-analytics',{code:'${d.code}'})">
                  <td class="py-3">
                    <div class="flex items-center gap-2">
                      <div class="w-3 h-3 rounded-full" style="background:${d.color}"></div>
                      <span class="font-medium text-gray-900 dark:text-white">${d.code}</span>
                      <span class="text-gray-400 text-xs hidden md:inline">${d.name}</span>
                    </div>
                  </td>
                  <td class="py-3 text-right">${d.requests || 0}</td>
                  <td class="py-3 text-right">${d.pending > 0 ? `<span class="text-amber-600 font-medium">${d.pending}</span>` : '0'}</td>
                  <td class="py-3 text-right">${d.work_items || 0}</td>
                  <td class="py-3 pl-4">
                    <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 max-w-24">
                      <div class="h-1.5 rounded-full bg-kbi-500" style="width:${Math.min(100, ((d.requests || 0) / Math.max(...dirs.map(x => x.requests || 1), 1)) * 100)}%"></div>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Pending Requests -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <div class="flex items-center justify-between mb-4">
            <h2 class="font-semibold text-gray-900 dark:text-white">Pending Approval</h2>
            <a onclick="navigate('p3-requests')" class="text-xs text-kbi-600 cursor-pointer hover:underline">View all</a>
          </div>
          <div class="space-y-3">
            ${pendingReqs.length === 0 ? '<p class="text-sm text-gray-400 text-center py-4">No pending requests</p>' :
              pendingReqs.map(r => `
                <div onclick="navigate('p3-request-detail',{id:${r.id}})" class="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-xl cursor-pointer">
                  <div class="flex items-center gap-2">
                    <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background:${r.type_color}20">
                      <i class="${r.type_icon} text-xs" style="color:${r.type_color}"></i>
                    </div>
                    <div>
                      <div class="text-sm font-medium text-gray-900 dark:text-white">${r.title.slice(0, 45)}${r.title.length > 45 ? '...' : ''}</div>
                      <div class="text-xs text-gray-400">${r.requester_name} · ${p3RelTime(r.submitted_at)}</div>
                    </div>
                  </div>
                  ${r.priority === 'urgent' || r.priority === 'high' ? `<span class="text-xs text-red-500 font-medium">${r.priority}</span>` : ''}
                </div>
              `).join('')}
          </div>
        </div>

        <!-- Workflow Performance -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <h2 class="font-semibold text-gray-900 dark:text-white mb-4">Workflow Performance</h2>
          <div class="space-y-3">
            ${wfPerf.length === 0 ? '<p class="text-sm text-gray-400 text-center py-4">No workflow data</p>' :
              wfPerf.map(w => `
                <div>
                  <div class="flex justify-between text-sm mb-1">
                    <span class="text-gray-700 dark:text-gray-300">${w.name}</span>
                    <span class="text-gray-400">${w.completion_rate || 0}%</span>
                  </div>
                  <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                    <div class="h-2 rounded-full bg-kbi-500" style="width:${w.completion_rate || 0}%"></div>
                  </div>
                  <div class="text-xs text-gray-400 mt-1">${w.total} runs · avg ${w.avg_hours || '?'}h</div>
                </div>
              `).join('')}
          </div>
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
        <h2 class="font-semibold text-gray-900 dark:text-white mb-4">Recent Platform Activity</h2>
        <div class="space-y-2">
          ${activity.slice(0, 10).map(a => `
            <div class="flex items-center gap-3 text-sm py-1.5 border-b border-gray-50 dark:border-gray-700 last:border-0">
              <div class="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <i class="fas fa-circle text-xs ${a.severity === 'critical' ? 'text-red-500' : 'text-gray-400'}"></i>
              </div>
              <div class="flex-1 min-w-0">
                <span class="text-gray-700 dark:text-gray-300">${a.actor_name || a.actor_email || 'System'}</span>
                <span class="text-gray-400 mx-1">·</span>
                <span class="text-gray-500">${a.action?.replace(/_/g, ' ')}</span>
                ${a.module ? `<span class="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 rounded px-1.5 py-0.5 ml-1">${a.module}</span>` : ''}
              </div>
              <span class="text-xs text-gray-400 flex-shrink-0">${p3RelTime(a.created_at)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `)
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE: KNOWLEDGE BASE
// ═══════════════════════════════════════════════════════════════════════════
async function renderP3KnowledgePage() {
  p3ShowPage(`<div class="flex items-center justify-center h-48"><i class="fas fa-spinner fa-spin text-kbi-600 text-2xl"></i></div>`)
  const [docsRes, sourcesRes] = await Promise.all([
    fetch('/api/p3/knowledge/documents?page=1').then(r => r.json()).catch(() => ({ documents: [] })),
    fetch('/api/p3/knowledge/sources').then(r => r.json()).catch(() => ({ sources: [] })),
  ])
  const docs = docsRes.documents || []
  const sources = sourcesRes.sources || []

  p3ShowPage(`
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Knowledge Base</h1>
          <p class="text-gray-500 text-sm mt-1">Search and explore KBI knowledge documents</p>
        </div>
        <button onclick="p3ShowNewDocModal()" class="flex items-center gap-2 bg-kbi-600 hover:bg-kbi-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
          <i class="fas fa-plus"></i> Add Document
        </button>
      </div>

      <!-- Search -->
      <div class="relative">
        <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
        <input id="p3-kb-search" type="text" placeholder="Search knowledge base..." oninput="p3KBSearch(this.value)"
          class="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl pl-11 pr-5 py-3 text-sm focus:outline-none focus:border-kbi-400 shadow-sm" />
      </div>

      <div id="p3-kb-search-results" class="hidden"></div>

      <!-- Sources -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        ${sources.map(s => `
          <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
            <div class="flex items-center gap-2 mb-2">
              <i class="fas fa-database text-kbi-600"></i>
              <span class="font-medium text-sm text-gray-900 dark:text-white">${s.name}</span>
            </div>
            <div class="text-xs text-gray-400">${s.doc_count || 0} documents · ${s.source_type}</div>
            ${p3StatusBadge(s.sync_status)}
          </div>
        `).join('')}
      </div>

      <!-- Documents Grid -->
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 class="font-semibold text-gray-900 dark:text-white">All Documents (${docs.length})</h2>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-100 dark:divide-gray-700 p-6 gap-4">
          ${docs.length === 0 ? '<div class="col-span-3 text-center py-8 text-gray-400"><i class="fas fa-books text-4xl mb-3"></i><p>No documents yet</p></div>' :
            docs.map(d => `
              <div onclick="navigate('p3-knowledge-doc',{id:${d.id}})" class="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 cursor-pointer hover:bg-kbi-50 dark:hover:bg-gray-600 transition-colors">
                <div class="flex items-start justify-between mb-2">
                  <div class="w-8 h-8 rounded-lg bg-kbi-100 flex items-center justify-center">
                    <i class="fas fa-file-alt text-kbi-600 text-sm"></i>
                  </div>
                  <span class="text-xs text-gray-400 capitalize">${d.document_type}</span>
                </div>
                <h3 class="font-medium text-sm text-gray-900 dark:text-white mb-1 line-clamp-2">${d.title}</h3>
                <p class="text-xs text-gray-400">${d.source_name || 'Manual'} · ${p3RelTime(d.indexed_at)}</p>
                ${d.tags ? `<div class="mt-2 flex flex-wrap gap-1">${JSON.parse(d.tags||'[]').slice(0,3).map(t => `<span class="text-xs bg-kbi-100 text-kbi-700 rounded px-1.5 py-0.5">${t}</span>`).join('')}</div>` : ''}
              </div>
            `).join('')}
        </div>
      </div>
    </div>

    <!-- New Document Modal -->
    <div id="p3-new-doc-modal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h2 class="font-semibold text-gray-900 dark:text-white">Add Knowledge Document</h2>
          <button onclick="document.getElementById('p3-new-doc-modal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <form onsubmit="p3CreateDocument(event)" class="p-6 space-y-4">
          <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
            <input name="title" required class="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-kbi-400 dark:bg-gray-700 dark:text-white" /></div>
          <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
            <select name="document_type" class="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm dark:bg-gray-700 dark:text-white">
              <option value="article">Article</option><option value="policy">Policy</option>
              <option value="guide">Guide</option><option value="template">Template</option>
              <option value="reference">Reference</option><option value="note">Note</option>
            </select></div>
          <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Content (Markdown) *</label>
            <textarea name="content_text" required rows="8" placeholder="# Title\n\nWrite in Markdown format..."
              class="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-kbi-400 dark:bg-gray-700 dark:text-white resize-none"></textarea></div>
          <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tags (comma-separated)</label>
            <input name="tags" placeholder="policy, hr, operations" class="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-kbi-400 dark:bg-gray-700 dark:text-white" /></div>
          <div class="flex gap-3 pt-2">
            <button type="submit" class="flex-1 bg-kbi-600 hover:bg-kbi-700 text-white py-2.5 rounded-xl text-sm font-medium">Save Document</button>
            <button type="button" onclick="document.getElementById('p3-new-doc-modal').classList.add('hidden')" class="px-4 py-2.5 border border-gray-200 rounded-xl text-sm">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `)
}

function p3ShowNewDocModal() {
  document.getElementById('p3-new-doc-modal')?.classList.remove('hidden')
}

let _p3KBSearchTimer
function p3KBSearch(q) {
  clearTimeout(_p3KBSearchTimer)
  _p3KBSearchTimer = setTimeout(async () => {
    if (!q || q.length < 2) {
      document.getElementById('p3-kb-search-results')?.classList.add('hidden')
      return
    }
    const data = await fetch(`/api/p3/knowledge/search?q=${encodeURIComponent(q)}`).then(r => r.json()).catch(() => ({ results: [] }))
    const container = document.getElementById('p3-kb-search-results')
    if (!container) return
    if (!data.results?.length) {
      container.innerHTML = '<div class="text-center py-8 text-gray-400 text-sm">No results found</div>'
    } else {
      container.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <h3 class="font-medium text-gray-700 dark:text-gray-300 mb-3">Search Results for "${q}"</h3>
          <div class="space-y-3">
            ${data.results.map(r => `
              <div onclick="navigate('p3-knowledge-doc',{id:${r.id}})" class="flex items-start gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl cursor-pointer">
                <i class="fas fa-file-alt text-kbi-400 mt-0.5"></i>
                <div>
                  <div class="font-medium text-sm text-gray-900 dark:text-white">${r.title}</div>
                  <div class="text-xs text-gray-400">${r.document_type} · ${r.source_name || 'Manual'}</div>
                  <div class="text-xs text-gray-500 mt-1">${(r.excerpt || '').slice(0, 120)}...</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `
    }
    container.classList.remove('hidden')
  }, 350)
}

async function p3CreateDocument(e) {
  e.preventDefault()
  const fd = new FormData(e.target)
  const title = fd.get('title')
  const content_text = fd.get('content_text')
  const document_type = fd.get('document_type')
  const tagsRaw = fd.get('tags') || ''
  const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean)

  const res = await fetch('/api/p3/knowledge/documents', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content_text, document_type, tags, visibility_type: 'platform' })
  })
  const data = await res.json()
  if (data.success) {
    p3Toast('Document created successfully')
    document.getElementById('p3-new-doc-modal')?.classList.add('hidden')
    renderP3KnowledgePage()
  } else p3Toast(data.error || 'Failed to create document', 'error')
}

async function renderP3KnowledgeDocPage(params) {
  const id = params?.id || window._p3NavParams?.id
  if (!id) { navigate('p3-knowledge'); return }
  p3ShowPage(`<div class="flex items-center justify-center h-48"><i class="fas fa-spinner fa-spin text-kbi-600 text-2xl"></i></div>`)
  const data = await fetch(`/api/p3/knowledge/documents/${id}`).then(r => r.json()).catch(() => ({}))
  const doc = data.document
  if (!doc) { p3ShowPage(`<div class="text-center py-16 text-gray-400">Document not found</div>`); return }

  p3ShowPage(`
    <div class="max-w-4xl mx-auto space-y-6">
      <div class="flex items-center gap-3">
        <button onclick="navigate('p3-knowledge')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-arrow-left"></i></button>
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-bold text-gray-900 dark:text-white">${doc.title}</h1>
            <span class="text-xs bg-kbi-100 text-kbi-700 rounded-full px-2 py-0.5 capitalize">${doc.document_type}</span>
          </div>
          <p class="text-sm text-gray-500">${doc.source_name || 'Manual'} · Updated ${p3RelTime(doc.updated_at)}</p>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-8">
        <div id="p3-doc-content" class="prose prose-sm dark:prose-invert max-w-none"></div>
      </div>

      ${doc.tags ? `
        <div class="flex flex-wrap gap-2">
          ${JSON.parse(doc.tags || '[]').map(t => `<span class="text-xs bg-kbi-100 text-kbi-700 rounded-full px-3 py-1">${t}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `)

  // Render markdown
  const contentEl = document.getElementById('p3-doc-content')
  if (contentEl && window.marked) {
    contentEl.innerHTML = window.marked.parse(doc.content_text || '')
  } else if (contentEl) {
    contentEl.innerHTML = `<pre class="whitespace-pre-wrap text-sm">${doc.content_text || ''}</pre>`
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE: RELATIONSHIPS (ACCOUNTS)
// ═══════════════════════════════════════════════════════════════════════════
async function renderP3AccountsPage() {
  p3ShowPage(`<div class="flex items-center justify-center h-48"><i class="fas fa-spinner fa-spin text-kbi-600 text-2xl"></i></div>`)
  const [accountsRes, analyticsRes] = await Promise.all([
    fetch('/api/p3/accounts').then(r => r.json()).catch(() => ({ accounts: [] })),
    fetch('/api/p3/accounts/analytics').then(r => r.json()).catch(() => ({})),
  ])
  const accounts = accountsRes.accounts || []
  const analytics = analyticsRes

  p3ShowPage(`
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Relationship Intelligence</h1>
          <p class="text-gray-500 text-sm mt-1">Account management and engagement tracking</p>
        </div>
        <button onclick="p3ShowNewAccountModal()" class="flex items-center gap-2 bg-kbi-600 hover:bg-kbi-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
          <i class="fas fa-plus"></i> New Account
        </button>
      </div>

      <!-- Analytics Strip -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        ${[
          { label: 'Total Accounts', value: analytics.totals?.total || 0, icon: 'fas fa-building', color: 'text-blue-600 bg-blue-50' },
          { label: 'Active', value: analytics.totals?.active || 0, icon: 'fas fa-check-circle', color: 'text-green-600 bg-green-50' },
          { label: 'Strategic', value: analytics.totals?.strategic || 0, icon: 'fas fa-star', color: 'text-yellow-600 bg-yellow-50' },
          { label: 'Key Accounts', value: analytics.totals?.key_accounts || 0, icon: 'fas fa-key', color: 'text-purple-600 bg-purple-50' },
        ].map(k => `
          <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl ${k.color.split(' ')[1]} flex items-center justify-center">
              <i class="${k.icon} ${k.color.split(' ')[0]}"></i>
            </div>
            <div>
              <div class="text-xl font-bold text-gray-900 dark:text-white">${k.value}</div>
              <div class="text-xs text-gray-400">${k.label}</div>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Accounts Grid -->
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h2 class="font-semibold text-gray-900 dark:text-white">All Accounts</h2>
          <input type="text" placeholder="Search..." oninput="p3FilterAccounts(this.value)"
            class="border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-kbi-400 dark:bg-gray-700" />
        </div>
        <div class="divide-y divide-gray-100 dark:divide-gray-700" id="p3-accounts-list">
          ${accounts.length === 0 ? '<div class="text-center py-12 text-gray-400"><i class="fas fa-building text-4xl mb-3"></i><p>No accounts yet</p></div>' :
            accounts.map(a => `
              <div onclick="navigate('p3-account-detail',{id:${a.id}})"
                class="px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-kbi-100 to-kbi-200 flex items-center justify-center">
                    <span class="text-kbi-700 font-bold text-sm">${a.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <div class="font-medium text-gray-900 dark:text-white">${a.name}</div>
                    <div class="text-xs text-gray-400">${a.account_type} · ${a.sector || '—'} · ${a.contact_count || 0} contacts</div>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  ${a.tier === 'strategic' ? '<span class="text-xs bg-yellow-100 text-yellow-700 rounded-full px-2 py-0.5">Strategic</span>' :
                    a.tier === 'key' ? '<span class="text-xs bg-purple-100 text-purple-700 rounded-full px-2 py-0.5">Key</span>' : ''}
                  ${p3StatusBadge(a.status)}
                  <i class="fas fa-chevron-right text-gray-300"></i>
                </div>
              </div>
            `).join('')}
        </div>
      </div>
    </div>

    <!-- New Account Modal -->
    <div id="p3-new-account-modal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg">
        <div class="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h2 class="font-semibold text-gray-900 dark:text-white">New Account</h2>
          <button onclick="document.getElementById('p3-new-account-modal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <form onsubmit="p3CreateAccount(event)" class="p-6 space-y-4">
          <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
            <input name="name" required class="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-kbi-400 dark:bg-gray-700 dark:text-white" /></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
              <select name="account_type" class="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm dark:bg-gray-700 dark:text-white">
                <option value="partner">Partner</option><option value="funder">Funder</option>
                <option value="government">Government</option><option value="ngo">NGO</option>
                <option value="academic">Academic</option><option value="sponsor">Sponsor</option><option value="other">Other</option>
              </select></div>
            <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tier</label>
              <select name="tier" class="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm dark:bg-gray-700 dark:text-white">
                <option value="standard">Standard</option><option value="key">Key</option>
                <option value="strategic">Strategic</option><option value="historical">Historical</option>
              </select></div>
          </div>
          <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sector</label>
            <input name="sector" class="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-kbi-400 dark:bg-gray-700 dark:text-white" /></div>
          <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea name="description" rows="3" class="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-kbi-400 dark:bg-gray-700 dark:text-white resize-none"></textarea></div>
          <div class="flex gap-3">
            <button type="submit" class="flex-1 bg-kbi-600 hover:bg-kbi-700 text-white py-2.5 rounded-xl text-sm font-medium">Create Account</button>
            <button type="button" onclick="document.getElementById('p3-new-account-modal').classList.add('hidden')" class="px-4 border border-gray-200 rounded-xl text-sm">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `)
}

function p3ShowNewAccountModal() {
  document.getElementById('p3-new-account-modal')?.classList.remove('hidden')
}

async function p3CreateAccount(e) {
  e.preventDefault()
  const fd = new FormData(e.target)
  const body = { name: fd.get('name'), account_type: fd.get('account_type'), tier: fd.get('tier'), sector: fd.get('sector'), description: fd.get('description') }
  const res = await fetch('/api/p3/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (data.success) {
    p3Toast('Account created')
    document.getElementById('p3-new-account-modal')?.classList.add('hidden')
    renderP3AccountsPage()
  } else p3Toast(data.error || 'Failed', 'error')
}

async function renderP3AccountDetailPage(params) {
  const id = params?.id || window._p3NavParams?.id
  if (!id) { navigate('p3-accounts'); return }
  p3ShowPage(`<div class="flex items-center justify-center h-48"><i class="fas fa-spinner fa-spin text-kbi-600 text-2xl"></i></div>`)
  const data = await fetch(`/api/p3/accounts/${id}`).then(r => r.json()).catch(() => ({}))
  const a = data.account
  if (!a) { p3ShowPage('<div class="text-center py-16 text-gray-400">Account not found</div>'); return }
  const engagements = data.engagements || []
  const contacts = data.contacts || []

  p3ShowPage(`
    <div class="space-y-6 max-w-4xl mx-auto">
      <div class="flex items-center gap-3">
        <button onclick="navigate('p3-accounts')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-arrow-left"></i></button>
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-bold text-gray-900 dark:text-white">${a.name}</h1>
            ${a.tier === 'strategic' ? '<span class="text-xs bg-yellow-100 text-yellow-700 rounded-full px-2 py-0.5">Strategic</span>' : ''}
            ${p3StatusBadge(a.status)}
          </div>
          <p class="text-sm text-gray-500">${a.account_type} · ${a.sector || '—'} · Owner: ${a.owner_name || '—'}</p>
        </div>
        <button onclick="p3ShowEngagementModal(${a.id})" class="flex items-center gap-2 bg-kbi-600 hover:bg-kbi-700 text-white px-3 py-1.5 rounded-xl text-sm font-medium">
          <i class="fas fa-plus"></i> Log Engagement
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="md:col-span-2 space-y-4">
          ${a.description ? `<div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5"><p class="text-sm text-gray-700 dark:text-gray-300">${a.description}</p></div>` : ''}

          <!-- Engagements -->
          <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            <h3 class="font-semibold text-gray-900 dark:text-white mb-4">Engagement History</h3>
            ${engagements.length === 0 ? '<p class="text-sm text-gray-400 text-center py-4">No engagements logged yet</p>' :
              `<div class="space-y-3">${engagements.map(e => `
                <div class="border-l-2 border-kbi-200 pl-4 py-1">
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium text-gray-900 dark:text-white capitalize">${e.engagement_type}: ${e.subject || e.summary.slice(0,50)}</span>
                    <span class="text-xs text-gray-400">${p3FormatDate(e.occurred_at)}</span>
                  </div>
                  <p class="text-xs text-gray-500 mt-1">${e.summary}</p>
                  ${e.next_follow_up_at ? `<p class="text-xs text-amber-600 mt-1"><i class="fas fa-bell mr-1"></i>Follow-up: ${p3FormatDate(e.next_follow_up_at)}</p>` : ''}
                </div>
              `).join('')}</div>`}
          </div>
        </div>

        <!-- Contacts -->
        <div class="space-y-4">
          <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            <h3 class="font-semibold text-gray-900 dark:text-white mb-4">Contacts (${contacts.length})</h3>
            ${contacts.length === 0 ? '<p class="text-sm text-gray-400 text-center py-2">No contacts</p>' :
              contacts.map(c => `
                <div class="flex items-center gap-2 py-2 border-b border-gray-50 dark:border-gray-700 last:border-0">
                  <div class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                    <span class="text-sm font-medium text-gray-600">${c.full_name.charAt(0)}</span>
                  </div>
                  <div>
                    <div class="text-sm font-medium text-gray-900 dark:text-white">${c.full_name} ${c.is_primary ? '<span class="text-xs text-kbi-600">Primary</span>' : ''}</div>
                    <div class="text-xs text-gray-400">${c.title || '—'} · ${c.email || '—'}</div>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- Engagement Modal -->
    <div id="p3-engagement-modal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg">
        <div class="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h2 class="font-semibold">Log Engagement</h2>
          <button onclick="document.getElementById('p3-engagement-modal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <form onsubmit="p3LogEngagement(event, ${a.id})" class="p-6 space-y-4">
          <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
            <select name="engagement_type" class="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm dark:bg-gray-700 dark:text-white">
              <option value="meeting">Meeting</option><option value="email">Email</option>
              <option value="call">Call</option><option value="event">Event</option>
              <option value="proposal">Proposal</option><option value="mou">MOU</option><option value="other">Other</option>
            </select></div>
          <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
            <input name="subject" class="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-kbi-400 dark:bg-gray-700 dark:text-white" /></div>
          <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Summary *</label>
            <textarea name="summary" required rows="3" class="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-kbi-400 dark:bg-gray-700 dark:text-white resize-none"></textarea></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date *</label>
              <input name="occurred_at" type="date" required value="${new Date().toISOString().split('T')[0]}" class="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm dark:bg-gray-700 dark:text-white" /></div>
            <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Follow-up Date</label>
              <input name="next_follow_up_at" type="date" class="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm dark:bg-gray-700 dark:text-white" /></div>
          </div>
          <div class="flex gap-3">
            <button type="submit" class="flex-1 bg-kbi-600 hover:bg-kbi-700 text-white py-2.5 rounded-xl text-sm font-medium">Log Engagement</button>
            <button type="button" onclick="document.getElementById('p3-engagement-modal').classList.add('hidden')" class="px-4 border border-gray-200 rounded-xl text-sm">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `)
}

function p3ShowEngagementModal(accountId) {
  document.getElementById('p3-engagement-modal')?.classList.remove('hidden')
}

async function p3LogEngagement(e, accountId) {
  e.preventDefault()
  const fd = new FormData(e.target)
  const body = { account_id: accountId, engagement_type: fd.get('engagement_type'), subject: fd.get('subject'), summary: fd.get('summary'), occurred_at: fd.get('occurred_at'), next_follow_up_at: fd.get('next_follow_up_at') || null }
  const res = await fetch('/api/p3/accounts/engagements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (data.success) {
    p3Toast('Engagement logged')
    document.getElementById('p3-engagement-modal')?.classList.add('hidden')
    renderP3AccountDetailPage({ id: accountId })
  } else p3Toast(data.error || 'Failed', 'error')
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE: WORKFLOW CENTER
// ═══════════════════════════════════════════════════════════════════════════
async function renderP3WorkflowsPage() {
  p3ShowPage(`<div class="flex items-center justify-center h-48"><i class="fas fa-spinner fa-spin text-kbi-600 text-2xl"></i></div>`)
  const [runsRes, templatesRes] = await Promise.all([
    fetch('/api/p3/workflows/runs?status=running').then(r => r.json()).catch(() => ({ runs: [] })),
    fetch('/api/p3/workflows/templates').then(r => r.json()).catch(() => ({ templates: [] })),
  ])

  p3ShowPage(`
    <div class="space-y-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Workflow Center</h1>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
            <h2 class="font-semibold text-gray-900 dark:text-white">Active Workflows</h2>
          </div>
          <div class="divide-y divide-gray-100 dark:divide-gray-700">
            ${(runsRes.runs || []).length === 0 ? '<div class="text-center py-8 text-gray-400 text-sm">No active workflows</div>' :
              (runsRes.runs || []).map(r => `
                <div onclick="navigate('p3-workflow-detail',{id:${r.id}})" class="px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                  <div>
                    <div class="font-medium text-sm text-gray-900 dark:text-white">${r.request_title || `Run #${r.id}`}</div>
                    <div class="text-xs text-gray-400">${r.template_name} · Step ${r.current_step_order}</div>
                  </div>
                  <div class="flex items-center gap-2">${p3StatusBadge(r.status)}<i class="fas fa-chevron-right text-gray-300"></i></div>
                </div>
              `).join('')}
          </div>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
            <h2 class="font-semibold text-gray-900 dark:text-white">Workflow Templates</h2>
          </div>
          <div class="divide-y divide-gray-100 dark:divide-gray-700">
            ${(templatesRes.templates || []).map(t => `
              <div class="px-6 py-4 flex items-center justify-between">
                <div>
                  <div class="font-medium text-sm text-gray-900 dark:text-white">${t.name}</div>
                  <div class="text-xs text-gray-400">${t.step_count} steps · ${t.run_count || 0} runs · SLA ${t.sla_hours}h</div>
                </div>
                ${p3StatusBadge(t.is_active ? 'active' : 'inactive')}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `)
}

async function renderP3WorkflowDetailPage(params) {
  const id = params?.id || window._p3NavParams?.id
  if (!id) { navigate('p3-workflows'); return }
  p3ShowPage(`<div class="flex items-center justify-center h-48"><i class="fas fa-spinner fa-spin text-kbi-600 text-2xl"></i></div>`)
  const data = await fetch(`/api/p3/workflows/runs/${id}`).then(r => r.json()).catch(() => ({}))
  const run = data.run
  if (!run) { p3ShowPage('<div class="text-center py-16 text-gray-400">Workflow not found</div>'); return }

  const steps = data.steps || []
  const events = data.events || []

  p3ShowPage(`
    <div class="max-w-3xl mx-auto space-y-6">
      <div class="flex items-center gap-3">
        <button onclick="navigate('p3-workflows')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-arrow-left"></i></button>
        <div class="flex-1">
          <h1 class="text-xl font-bold text-gray-900 dark:text-white">${run.request_title || `Workflow Run #${run.id}`}</h1>
          <p class="text-sm text-gray-500">${run.template_name} · Started ${p3RelTime(run.started_at)}</p>
        </div>
        ${p3StatusBadge(run.status)}
      </div>

      <!-- Steps Progress -->
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h3 class="font-semibold text-gray-900 dark:text-white mb-5">Approval Steps</h3>
        <div class="space-y-4">
          ${steps.map((s, i) => `
            <div class="flex items-start gap-4">
              <div class="flex-shrink-0 flex flex-col items-center">
                <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                  ${s.status === 'approved' ? 'bg-green-100 text-green-700' :
                    s.status === 'rejected' ? 'bg-red-100 text-red-700' :
                    s.status === 'active' ? 'bg-yellow-100 text-yellow-700 ring-2 ring-yellow-400 animate-pulse' :
                    s.status === 'skipped' ? 'bg-gray-100 text-gray-400' :
                    'bg-gray-100 text-gray-400'}">
                  ${s.status === 'approved' ? '<i class="fas fa-check"></i>' :
                    s.status === 'rejected' ? '<i class="fas fa-times"></i>' :
                    s.status === 'active' ? s.step_order :
                    s.step_order}
                </div>
                ${i < steps.length - 1 ? `<div class="w-0.5 h-8 ${s.status === 'approved' ? 'bg-green-200' : 'bg-gray-200'} mt-1"></div>` : ''}
              </div>
              <div class="flex-1 pb-4">
                <div class="flex items-center justify-between">
                  <span class="font-medium text-sm text-gray-900 dark:text-white">${s.step_name}</span>
                  ${p3StatusBadge(s.status)}
                </div>
                <div class="text-xs text-gray-400 mt-1">
                  ${s.assigned_user_name ? `Assigned to: ${s.assigned_user_name}` : `Approver: ${s.approver_type}`}
                  ${s.deadline_at ? ` · Due: ${p3FormatDate(s.deadline_at)}` : ''}
                </div>
                ${s.rationale ? `<div class="text-xs text-gray-500 mt-1 italic">"${s.rationale}"</div>` : ''}
                ${s.status === 'active' && window.currentUser ? `
                  <div class="flex gap-2 mt-3">
                    <button onclick="p3QuickAct(${run.id},'approved','Approved')" class="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700">Approve</button>
                    <button onclick="p3QuickAct(${run.id},'rejected','')" class="bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-200">Reject</button>
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Events Log -->
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h3 class="font-semibold text-gray-900 dark:text-white mb-4">Activity Log</h3>
        <div class="space-y-2">
          ${events.map(e => `
            <div class="flex items-center gap-3 text-sm py-1.5">
              <i class="fas fa-circle text-xs ${e.event_type === 'approved' || e.event_type === 'completed' ? 'text-green-400' : e.event_type === 'rejected' ? 'text-red-400' : 'text-gray-300'}"></i>
              <span class="text-gray-500 capitalize">${e.event_type?.replace(/_/g, ' ')}</span>
              ${e.actor_name ? `<span class="text-gray-400">by ${e.actor_name}</span>` : ''}
              ${e.description ? `<span class="text-gray-400 text-xs">— ${e.description}</span>` : ''}
              <span class="ml-auto text-xs text-gray-400">${p3RelTime(e.occurred_at)}</span>
            </div>
          `).join('')}
        </div>
      </div>

      ${(window.currentUser?.isGodAdmin || window.currentUser?.roles?.includes('god_admin')) && run.status === 'running' ? `
      <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-2xl p-5">
        <h3 class="font-semibold text-red-800 dark:text-red-300 mb-3"><i class="fas fa-crown mr-2"></i>God Admin Override</h3>
        <p class="text-sm text-red-700 dark:text-red-400 mb-4">This action is logged and audited. Use only when necessary.</p>
        <div class="flex gap-2">
          <button onclick="p3GodAdminOverride(${run.id},'force_approve')" class="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700">Force Approve</button>
          <button onclick="p3GodAdminOverride(${run.id},'force_reject')" class="bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-red-700">Force Reject</button>
        </div>
      </div>
      ` : ''}
    </div>
  `)
}

async function p3GodAdminOverride(runId, action) {
  const justification = prompt(`Justification for ${action.replace('_', ' ')} (required, min 10 chars):`)
  if (!justification || justification.length < 10) { alert('Justification too short'); return }
  const res = await fetch(`/api/p3/workflows/runs/${runId}/override`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, justification })
  })
  const data = await res.json()
  if (data.success) { p3Toast(`Override applied: ${action}`); renderP3WorkflowDetailPage({ id: runId }) }
  else p3Toast(data.error || 'Failed', 'error')
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE: AUTOMATION CENTER
// ═══════════════════════════════════════════════════════════════════════════
async function renderP3AutomationPage() {
  p3ShowPage(`<div class="flex items-center justify-center h-48"><i class="fas fa-spinner fa-spin text-kbi-600 text-2xl"></i></div>`)
  const data = await fetch('/api/p3/automation/rules').then(r => r.json()).catch(() => ({}))
  if (data.error) { p3ShowPage(`<div class="text-center py-16 text-gray-400"><i class="fas fa-lock text-4xl mb-3"></i><p>${data.error}</p></div>`); return }
  const rules = data.rules || []

  p3ShowPage(`
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Automation Center</h1>
          <p class="text-gray-500 text-sm mt-1">Manage automated rules, triggers, and notifications</p>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 class="font-semibold text-gray-900 dark:text-white">Automation Rules (${rules.length})</h2>
        </div>
        <div class="divide-y divide-gray-100 dark:divide-gray-700">
          ${rules.map(r => `
            <div class="px-6 py-4 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl ${r.is_active ? 'bg-blue-50' : 'bg-gray-50'} flex items-center justify-center">
                  <i class="fas fa-robot ${r.is_active ? 'text-blue-600' : 'text-gray-400'}"></i>
                </div>
                <div>
                  <div class="font-medium text-sm text-gray-900 dark:text-white">${r.name}</div>
                  <div class="text-xs text-gray-400">Trigger: ${r.trigger_type} · Action: ${r.action_type}</div>
                  <div class="text-xs text-gray-400">${r.total_runs || 0} runs · ${r.successful_runs || 0} successful · Last: ${r.last_run_at ? p3RelTime(r.last_run_at) : 'Never'}</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                ${p3StatusBadge(r.is_active ? 'active' : 'inactive')}
                <button onclick="p3TriggerRule(${r.id})" class="text-xs text-kbi-600 hover:underline px-2">Run</button>
                <button onclick="p3ToggleRule(${r.id})" class="text-xs text-gray-500 hover:text-gray-700 px-2">${r.is_active ? 'Disable' : 'Enable'}</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `)
}

async function p3TriggerRule(id) {
  const res = await fetch(`/api/p3/automation/rules/${id}/trigger`, { method: 'POST' })
  const data = await res.json()
  if (data.success) p3Toast(`Rule triggered: ${data.actions_taken?.join(', ') || 'completed'}`)
  else p3Toast(data.error || 'Failed', 'error')
}

async function p3ToggleRule(id) {
  const res = await fetch(`/api/p3/automation/rules/${id}/toggle`, { method: 'PATCH' })
  const data = await res.json()
  if (data.success) { p3Toast(`Rule ${data.is_active ? 'enabled' : 'disabled'}`); renderP3AutomationPage() }
  else p3Toast(data.error || 'Failed', 'error')
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE: MONITORING (GOD ADMIN)
// ═══════════════════════════════════════════════════════════════════════════
async function renderP3MonitoringPage() {
  p3ShowPage(`<div class="flex items-center justify-center h-48"><i class="fas fa-spinner fa-spin text-red-600 text-2xl"></i></div>`)
  const data = await fetch('/api/p3/monitoring/summary').then(r => r.json()).catch(() => ({}))
  if (data.error) { p3ShowPage(`<div class="text-center py-16 text-gray-400"><i class="fas fa-lock text-4xl mb-3"></i><p>${data.error}</p></div>`); return }

  const [flagsRes] = await Promise.all([
    fetch('/api/p3/monitoring/flags').then(r => r.json()).catch(() => ({ flags: [] })),
  ])
  const flags = flagsRes.flags || []

  p3ShowPage(`
    <div class="space-y-6">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
          <i class="fas fa-crown text-yellow-600"></i>
        </div>
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">God Admin Monitoring</h1>
          <p class="text-gray-500 text-sm">Platform-wide oversight, audit, and control</p>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        ${[
          { label: 'Total Users', value: data.users?.total || 0, sub: `${data.users?.active || 0} active`, color: 'bg-blue-500' },
          { label: 'Open Flags', value: data.open_flags?.total || 0, sub: 'executive attention needed', color: 'bg-amber-500' },
          { label: 'Active Workflows', value: data.workflows?.running || 0, sub: `${data.workflows?.completed || 0} completed`, color: 'bg-purple-500' },
          { label: 'Critical Events (24h)', value: data.audit_24h?.critical || 0, sub: `${data.audit_24h?.total || 0} total actions`, color: 'bg-red-500' },
        ].map(k => `
          <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            <div class="w-10 h-10 ${k.color} rounded-xl flex items-center justify-center mb-3">
              <i class="fas fa-circle text-white"></i>
            </div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white">${k.value}</div>
            <div class="text-sm font-medium text-gray-600 dark:text-gray-300">${k.label}</div>
            <div class="text-xs text-gray-400">${k.sub}</div>
          </div>
        `).join('')}
      </div>

      <!-- Open Executive Flags -->
      ${flags.length > 0 ? `
      <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-5">
        <h2 class="font-semibold text-amber-900 dark:text-amber-300 mb-4"><i class="fas fa-flag mr-2"></i>Open Executive Flags (${flags.length})</h2>
        <div class="space-y-3">
          ${flags.map(f => `
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div class="text-sm font-medium text-gray-900 dark:text-white">${f.flag_reason}</div>
                <div class="text-xs text-gray-400">${f.record_type} #${f.record_id} · Flagged by ${f.flagged_by_name} · ${p3RelTime(f.created_at)}</div>
              </div>
              <div class="flex gap-2">
                <button onclick="p3AcknowledgeFlag(${f.id})" class="text-xs bg-kbi-600 text-white px-3 py-1.5 rounded-lg hover:bg-kbi-700">Acknowledge</button>
                <button onclick="p3ResolveFlag(${f.id})" class="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700">Resolve</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Recent God Admin Actions -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <div class="flex items-center justify-between mb-4">
            <h2 class="font-semibold text-gray-900 dark:text-white">Recent Admin Actions</h2>
            <a onclick="navigate('p3-audit')" class="text-xs text-kbi-600 cursor-pointer hover:underline">Full Audit Log</a>
          </div>
          ${(data.recent_god_admin_actions || []).length === 0 ? '<p class="text-sm text-gray-400 text-center py-4">No admin actions recorded</p>' :
            `<div class="space-y-3">${(data.recent_god_admin_actions || []).slice(0,6).map(a => `
              <div class="flex items-start gap-2 text-sm border-b border-gray-50 dark:border-gray-700 pb-2">
                <i class="fas fa-crown text-yellow-500 mt-0.5"></i>
                <div>
                  <span class="font-medium">${a.admin_name}</span>
                  <span class="text-gray-500 mx-1">·</span>
                  <span class="text-gray-600 dark:text-gray-300 capitalize">${a.action_type?.replace(/_/g,' ')}</span>
                  <div class="text-xs text-gray-400">${p3RelTime(a.created_at)}</div>
                </div>
              </div>
            `).join('')}</div>`}
        </div>

        <!-- Critical Audit Events -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <h2 class="font-semibold text-gray-900 dark:text-white mb-4">Critical Audit Events</h2>
          ${(data.critical_audit_log || []).length === 0 ? '<p class="text-sm text-gray-400 text-center py-4">No critical events</p>' :
            `<div class="space-y-2">${(data.critical_audit_log || []).slice(0,8).map(a => `
              <div class="flex items-start gap-2 text-sm py-1">
                <i class="fas fa-exclamation-triangle text-red-500 mt-0.5 text-xs"></i>
                <div>
                  <span class="text-gray-700 dark:text-gray-300 capitalize">${a.action?.replace(/_/g,' ')}</span>
                  <span class="text-gray-400 mx-1">by</span>
                  <span class="text-gray-600 dark:text-gray-400">${a.actor_name || a.actor_email || 'System'}</span>
                  <div class="text-xs text-gray-400">${p3RelTime(a.created_at)}</div>
                </div>
              </div>
            `).join('')}</div>`}
        </div>
      </div>

      <!-- User Management Quick Access -->
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
        <h2 class="font-semibold text-gray-900 dark:text-white mb-1">Platform Stats</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-center">
          ${[
            { label: 'Active Users', value: data.users?.active || 0 },
            { label: 'Pending Users', value: data.users?.pending || 0 },
            { label: 'Pending Requests', value: data.requests?.pending || 0 },
            { label: 'Active Rules', value: data.automation?.active || 0 },
          ].map(k => `
            <div class="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
              <div class="text-2xl font-bold text-gray-900 dark:text-white">${k.value}</div>
              <div class="text-xs text-gray-400 mt-1">${k.label}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `)
}

async function p3AcknowledgeFlag(id) {
  const note = prompt('Acknowledgement note (optional):') || ''
  const res = await fetch(`/api/p3/monitoring/flags/${id}/acknowledge`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolution_note: note }) })
  const data = await res.json()
  if (data.success) { p3Toast('Flag acknowledged'); renderP3MonitoringPage() }
  else p3Toast(data.error || 'Failed', 'error')
}

async function p3ResolveFlag(id) {
  const note = prompt('Resolution note:') || ''
  const res = await fetch(`/api/p3/monitoring/flags/${id}/resolve`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolution_note: note }) })
  const data = await res.json()
  if (data.success) { p3Toast('Flag resolved'); renderP3MonitoringPage() }
  else p3Toast(data.error || 'Failed', 'error')
}

// ── Connectors Page ────────────────────────────────────────────────────────
async function renderP3ConnectorsPage() {
  const data = await fetch('/api/p3/automation/connectors').then(r => r.json()).catch(() => ({}))
  if (data.error) { p3ShowPage(`<div class="text-center py-16 text-gray-400"><i class="fas fa-lock text-4xl mb-3"></i><p>${data.error}</p></div>`); return }
  const connectors = data.connectors || []

  p3ShowPage(`
    <div class="space-y-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">External Connectors</h1>
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="divide-y divide-gray-100 dark:divide-gray-700">
          ${connectors.map(c => `
            <div class="px-6 py-4 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
                  <i class="fas fa-plug text-gray-500"></i>
                </div>
                <div>
                  <div class="font-medium text-sm text-gray-900 dark:text-white">${c.name}</div>
                  <div class="text-xs text-gray-400">${c.connector_type} · ${c.sync_frequency} · ${c.sync_count || 0} syncs</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                ${p3StatusBadge(c.sync_status)}
                ${c.is_active ? `<button onclick="p3SyncConnector(${c.id})" class="text-xs bg-kbi-600 text-white px-3 py-1.5 rounded-lg hover:bg-kbi-700">Sync Now</button>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `)
}

async function p3SyncConnector(id) {
  const res = await fetch(`/api/p3/automation/connectors/${id}/sync`, { method: 'POST' })
  const data = await res.json()
  if (data.success) { p3Toast('Sync initiated'); renderP3ConnectorsPage() }
  else p3Toast(data.error || 'Sync failed', 'error')
}

// ── Notifications Page ─────────────────────────────────────────────────────
async function renderP3NotificationsPage() {
  const data = await fetch('/api/p3/automation/notifications/inbox').then(r => r.json()).catch(() => ({ notifications: [] }))
  const notifs = data.notifications || []

  p3ShowPage(`
    <div class="space-y-6 max-w-2xl mx-auto">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Notifications</h1>
        ${data.unread_count > 0 ? `<button onclick="p3MarkAllRead()" class="text-sm text-kbi-600 hover:underline">Mark all read</button>` : ''}
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
        ${notifs.length === 0 ? '<div class="text-center py-12 text-gray-400"><i class="fas fa-bell-slash text-4xl mb-3"></i><p>No notifications</p></div>' :
          notifs.map(n => `
            <div onclick="p3MarkNotifRead(${n.id}, this)" class="px-5 py-4 flex items-start gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 ${n.is_read ? 'opacity-60' : ''}">
              <div class="w-9 h-9 rounded-full bg-kbi-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <i class="fas fa-bell text-kbi-600 text-sm"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-gray-900 dark:text-white">${n.subject || 'Notification'}</span>
                  ${!n.is_read ? '<div class="w-2 h-2 rounded-full bg-kbi-500"></div>' : ''}
                </div>
                <p class="text-sm text-gray-500 mt-0.5 line-clamp-2">${n.body || ''}</p>
                <p class="text-xs text-gray-400 mt-1">${p3RelTime(n.created_at)}</p>
              </div>
            </div>
          `).join('')}
      </div>
    </div>
  `)
}

async function p3MarkNotifRead(id, el) {
  await fetch(`/api/p3/automation/notifications/${id}/read`, { method: 'PATCH' })
  if (el) el.classList.add('opacity-60')
  loadNotificationBadge()
}

async function p3MarkAllRead() {
  await fetch('/api/p3/automation/notifications/mark-all-read', { method: 'POST' })
  p3Toast('All notifications marked as read')
  renderP3NotificationsPage()
  loadNotificationBadge()
}

// ── Init ──────────────────────────────────────────────────────────────────
// Wait for Phase 1/2 app to initialize first
let _p3InitAttempts = 0
function p3Init() {
  if (window.currentUser) {
    registerP3Navigation()
    // Add notification bell to sidebar if not exists
    const userFooter = document.querySelector('[onclick*="profile"]')
    if (userFooter && !document.getElementById('notif-btn')) {
      const btn = document.createElement('button')
      btn.id = 'notif-btn'
      btn.className = 'text-gray-400 hover:text-kbi-600 p-1 relative'
      btn.title = 'Notifications'
      btn.onclick = () => navigate('p3-notifications')
      btn.innerHTML = '<i class="fas fa-bell"></i>'
      userFooter.parentElement.insertBefore(btn, userFooter)
    }
  } else if (_p3InitAttempts < 20) {
    _p3InitAttempts++
    setTimeout(p3Init, 500)
  }
}

// Hook into app ready event
document.addEventListener('DOMContentLoaded', () => setTimeout(p3Init, 1000))
if (document.readyState !== 'loading') setTimeout(p3Init, 1000)
