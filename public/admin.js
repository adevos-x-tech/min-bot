const adminState = {
  token: localStorage.getItem('adevos_admin_token') || null
};

function adminAuthHeaders() {
  return adminState.token ? { Authorization: `Bearer ${adminState.token}` } : {};
}

function showAdminView(view) {
  document.getElementById('admin-login-view').classList.toggle('hidden', view !== 'login');
  document.getElementById('admin-dashboard-view').classList.toggle('hidden', view !== 'dashboard');
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const username = document.getElementById('admin-user').value.trim();
  const password = document.getElementById('admin-pass').value.trim();
  const btn = document.getElementById('admin-login-btn');

  btn.disabled = true;
  btn.textContent = 'Verifying...';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.success) {
      adminState.token = data.token;
      localStorage.setItem('adevos_admin_token', data.token);
      showAdminView('dashboard');
      loadAdminStats();
      loadAdminSessions();
      loadAdminUsers();
      showToast('Signed in successfully', 'success');
    } else {
      showToast(data.message || 'Invalid credentials', 'error');
    }
  } catch (err) {
    showToast('Login error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

function handleAdminLogout() {
  adminState.token = null;
  localStorage.removeItem('adevos_admin_token');
  showAdminView('login');
}

async function loadAdminStats() {
  try {
    const res = await fetch('/api/admin/stats', { headers: adminAuthHeaders() });
    const data = await res.json();
    if (!data.success) return handleAdminLogout();

    document.getElementById('admin-stat-users').textContent = data.stats.totalUsers;
    document.getElementById('admin-stat-active').textContent = data.stats.activeSessions;
    document.getElementById('admin-stat-banned').textContent = data.stats.bannedSessions;
    document.getElementById('admin-stat-groups').textContent = data.stats.totalGroups;
    document.getElementById('admin-stat-sockets').textContent = data.stats.liveSocketCount;
  } catch (err) {
    console.error('loadAdminStats error:', err);
  }
}

async function loadAdminSessions() {
  try {
    const res = await fetch('/api/admin/sessions', { headers: adminAuthHeaders() });
    const data = await res.json();
    const tbody = document.getElementById('admin-sessions-body');
    if (!data.success) return;

    if (data.sessions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-500">No sessions registered.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.sessions.map((s) => `
      <tr>
        <td class="py-3 px-4 font-mono font-semibold text-white">+${escapeHtmlAdmin(s.phoneNumber)}</td>
        <td class="py-3 px-4">${escapeHtmlAdmin(s.status)}</td>
        <td class="py-3 px-4 capitalize">${escapeHtmlAdmin(s.source)}</td>
        <td class="py-3 px-4 text-slate-400">${new Date(s.lastSeenAt).toLocaleString()}</td>
        <td class="py-3 px-4 text-right"><button onclick="revokeSession('${s.phoneNumber}')" class="px-2.5 py-1 rounded-lg bg-red-950/40 text-red-400 hover:bg-red-900/60 border border-red-800/30 text-[11px] font-semibold">Revoke</button></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('loadAdminSessions error:', err);
  }
}

async function revokeSession(phoneNumber) {
  try {
    const res = await fetch('/api/admin/sessions/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
      body: JSON.stringify({ phoneNumber })
    });
    const data = await res.json();
    showToast(data.message || 'Session revoked', data.success ? 'success' : 'error');
    loadAdminSessions();
    loadAdminStats();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function loadAdminUsers() {
  try {
    const res = await fetch('/api/admin/users', { headers: adminAuthHeaders() });
    const data = await res.json();
    const tbody = document.getElementById('admin-users-body');
    if (!data.success) return;

    tbody.innerHTML = data.users.map((u) => `
      <tr>
        <td class="py-3 px-4 font-semibold text-white">${escapeHtmlAdmin(u.username)}</td>
        <td class="py-3 px-4 text-slate-400">${u.telegramId ? escapeHtmlAdmin(u.telegramId) : '-'}</td>
        <td class="py-3 px-4 text-slate-400">${u.whatsappNumber ? '+' + escapeHtmlAdmin(u.whatsappNumber) : '-'}</td>
        <td class="py-3 px-4">${u.isActive ? '<span class="text-emerald-400">active</span>' : '<span class="text-red-400">deactivated</span>'}</td>
        <td class="py-3 px-4 text-right">${u.isActive ? `<button onclick="deactivateUser('${u._id}')" class="px-2.5 py-1 rounded-lg bg-red-950/40 text-red-400 hover:bg-red-900/60 border border-red-800/30 text-[11px] font-semibold">Deactivate</button>` : ''}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('loadAdminUsers error:', err);
  }
}

async function deactivateUser(id) {
  try {
    const res = await fetch(`/api/admin/users/${id}/deactivate`, { method: 'POST', headers: adminAuthHeaders() });
    const data = await res.json();
    showToast(data.message || 'User deactivated', data.success ? 'success' : 'error');
    loadAdminUsers();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const color = type === 'success' ? 'border-emerald-500/50 bg-slate-900/95 text-emerald-300'
    : type === 'error' ? 'border-red-500/50 bg-slate-900/95 text-red-300'
    : 'border-amber-500/50 bg-slate-900/95 text-amber-300';
  toast.className = `p-3.5 rounded-xl border shadow-xl text-xs font-medium pointer-events-auto ${color}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
}

function escapeHtmlAdmin(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
  if (adminState.token) {
    showAdminView('dashboard');
    loadAdminStats();
    loadAdminSessions();
    loadAdminUsers();
  } else {
    showAdminView('login');
  }
});
