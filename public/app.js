// Adevos Min-Bot - Client Application Logic

const state = {
  user: JSON.parse(localStorage.getItem('adevos_user') || 'null'),
  token: localStorage.getItem('adevos_token') || null,
  theme: localStorage.getItem('adevos_theme') || 'dark',
  activePage: 'home',
  cmdPlatform: 'whatsapp',
  publicConfig: { telegramBotUsername: null }
};

const PROTECTED_PAGES = ['dashboard', 'groups', 'commands', 'settings'];

function authHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

// ---------- Service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('pwa-install-btn');
  if (btn) {
    btn.classList.remove('hidden');
    btn.onclick = () => {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => btn.classList.add('hidden'));
    };
  }
});

// ---------- Navigation ----------
function navigateTo(pageId, subParam = null) {
  if (PROTECTED_PAGES.includes(pageId) && !state.token) {
    showToast('Please log in to access this page', 'error');
    pageId = 'login';
  }

  document.querySelectorAll('.page-view').forEach((el) => el.classList.add('hidden'));
  const target = document.getElementById(`page-${pageId}`);
  if (target) target.classList.remove('hidden');

  state.activePage = pageId;

  document.querySelectorAll('nav button').forEach((b) => b.classList.remove('active-nav'));
  const activeNavBtn = document.getElementById(`nav-${pageId}`);
  if (activeNavBtn) activeNavBtn.classList.add('active-nav');

  if (pageId === 'connect' && subParam) setConnectTab(subParam);
  if (pageId === 'stats') fetchPublicStatus();
  if (pageId === 'dashboard') { fetchMe(); fetchSessions(); }
  if (pageId === 'groups') fetchGroups();
  if (pageId === 'settings') fetchSettings();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMobileMenu(force) {
  const menu = document.getElementById('mobile-menu');
  if (force !== undefined) {
    force ? menu.classList.remove('hidden') : menu.classList.add('hidden');
  } else {
    menu.classList.toggle('hidden');
  }
}

// ---------- Auth ----------
function updateAuthUI() {
  const authBtn = document.getElementById('auth-header-btn');
  const profileBtn = document.getElementById('header-profile-btn');
  const authText = document.getElementById('auth-btn-text');

  if (state.user && state.token) {
    authText.textContent = state.user.username;
    authBtn.onclick = () => toggleProfileModal(true);
    if (profileBtn) profileBtn.classList.remove('hidden');
  } else {
    authText.textContent = 'Login';
    authBtn.onclick = () => navigateTo('login');
    if (profileBtn) profileBtn.classList.add('hidden');
  }
}

function handleAuthClick() {
  state.user ? toggleProfileModal(true) : navigateTo('login');
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value.trim();
  const btn = document.getElementById('login-btn');

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Verifying...</span>';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.success) {
      state.user = data.user;
      state.token = data.token;
      localStorage.setItem('adevos_user', JSON.stringify(data.user));
      localStorage.setItem('adevos_token', data.token);
      updateAuthUI();
      showToast(`Welcome back, ${data.user.username}`, 'success');
      navigateTo('dashboard');
    } else {
      showToast(data.message || 'Authentication failed', 'error');
    }
  } catch (err) {
    showToast('Login request error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> <span>Authenticate</span>';
  }
}

function handleLogout() {
  state.user = null;
  state.token = null;
  localStorage.removeItem('adevos_user');
  localStorage.removeItem('adevos_token');
  updateAuthUI();
  toggleProfileModal(false);
  showToast('Logged out successfully', 'info');
  navigateTo('home');
}

async function fetchMe() {
  if (!state.token) return;
  try {
    const res = await fetch('/api/auth/me', { headers: authHeaders() });
    const data = await res.json();
    if (!data.success) return handleLogout();

    state.user = data.user;
    localStorage.setItem('adevos_user', JSON.stringify(data.user));

    document.getElementById('dash-wa-number').textContent = data.user.whatsappNumber ? `+${data.user.whatsappNumber}` : 'Not connected';
    document.getElementById('dash-tg-id').textContent = data.user.telegramId ? `Linked (ID ${data.user.telegramId})` : 'Not linked';
    document.getElementById('link-wa-status').textContent = data.user.whatsappNumber ? `Connected (+${data.user.whatsappNumber})` : 'Not connected';
    document.getElementById('link-tg-status').textContent = data.user.telegramId ? 'Connected' : 'Not connected';

    const waBadge = document.getElementById('dash-wa-status-badge');
    waBadge.textContent = data.user.whatsappNumber ? 'LINKED' : 'NOT LINKED';
    const tgBadge = document.getElementById('dash-tg-status-badge');
    tgBadge.textContent = data.user.telegramId ? 'LINKED' : 'NOT LINKED';

    if (state.publicConfig.telegramBotUsername) {
      document.getElementById('dash-tg-open-link').href = `https://t.me/${state.publicConfig.telegramBotUsername}`;
    }
  } catch (err) {
    console.error('fetchMe error:', err);
  }
}

function toggleProfileModal(show) {
  const modal = document.getElementById('profile-modal');
  if (show) {
    if (state.user) {
      document.getElementById('profile-username').textContent = state.user.username;
      document.getElementById('profile-role').textContent = state.user.role || 'operator';
      document.getElementById('link-wa-status').textContent = state.user.whatsappNumber ? `Connected (+${state.user.whatsappNumber})` : 'Not connected';
      document.getElementById('link-tg-status').textContent = state.user.telegramId ? 'Connected' : 'Not connected';
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  } else {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

async function handleChangePassword() {
  const input = document.getElementById('change-pass-input');
  if (!input.value.trim() || input.value.trim().length < 6) {
    return showToast('Password must be at least 6 characters', 'error');
  }
  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ newPassword: input.value.trim() })
    });
    const data = await res.json();
    showToast(data.message || 'Password updated', data.success ? 'success' : 'error');
    if (data.success) input.value = '';
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function handleChangeUsername() {
  const input = document.getElementById('change-username-input');
  if (!input.value.trim()) return showToast('Please enter a new username', 'error');
  try {
    const res = await fetch('/api/auth/change-username', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ newUsername: input.value.trim() })
    });
    const data = await res.json();
    showToast(data.message || 'Username updated', data.success ? 'success' : 'error');
    if (data.success) { input.value = ''; fetchMe(); }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

function handleDeleteAccount() {
  showConfirmModal('Delete Account', 'This will deactivate your account and disconnect your bots. Continue?', async () => {
    try {
      const res = await fetch('/api/auth/account', { method: 'DELETE', headers: authHeaders() });
      const data = await res.json();
      if (data.success) { handleLogout(); showToast('Account deleted', 'info'); }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

// ---------- Theme ----------
function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem('adevos_theme', theme);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (theme === 'dark' || (theme === 'system' && prefersDark)) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  showToast(`Theme changed to ${theme}`, 'info');
}

// ---------- Connect tabs ----------
function setConnectTab(tab) {
  const btnWa = document.getElementById('tab-btn-wa');
  const btnTg = document.getElementById('tab-btn-tg');
  const contentWa = document.getElementById('connect-wa-content');
  const contentTg = document.getElementById('connect-tg-content');

  if (tab === 'whatsapp') {
    btnWa.className = 'pb-3 px-2 text-sm font-bold text-emerald-400 border-b-2 border-emerald-400 flex items-center space-x-2';
    btnTg.className = 'pb-3 px-2 text-sm font-bold text-slate-400 hover:text-white border-b-2 border-transparent flex items-center space-x-2';
    contentWa.classList.remove('hidden');
    contentTg.classList.add('hidden');
  } else {
    btnTg.className = 'pb-3 px-2 text-sm font-bold text-sky-400 border-b-2 border-sky-400 flex items-center space-x-2';
    btnWa.className = 'pb-3 px-2 text-sm font-bold text-slate-400 hover:text-white border-b-2 border-transparent flex items-center space-x-2';
    contentTg.classList.remove('hidden');
    contentWa.classList.add('hidden');
  }
}

async function requestPairCode() {
  if (!state.token) { showToast('Please log in first', 'error'); return navigateTo('login'); }

  const phoneInput = document.getElementById('pair-phone-input');
  const rawNum = phoneInput.value.replace(/[^0-9]/g, '');
  if (!rawNum || rawNum.length < 8) return showToast('Please enter a valid phone number with country code', 'error');

  const btn = document.getElementById('pair-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Generating...</span>';

  try {
    const res = await fetch('/api/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ number: rawNum })
    });
    const data = await res.json();

    if (data.success && data.code) {
      const formatted = `${data.code.slice(0, 4)}-${data.code.slice(4)}`;
      document.getElementById('pair-code-display').textContent = formatted;
      document.getElementById('pair-result-area').classList.remove('hidden');
      showToast('Pairing code generated', 'success');
    } else {
      showToast(data.message || 'Failed to generate code', 'error');
    }
  } catch (err) {
    showToast('Pairing request error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-link"></i> <span>Generate Pairing Code</span>';
  }
}

function copyPairCode() {
  const code = document.getElementById('pair-code-display').textContent.replace('-', '');
  navigator.clipboard.writeText(code).then(() => showToast('Pairing code copied', 'success'));
}

// ---------- Public status ----------
async function fetchPublicStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (!data.success) return;

    document.getElementById('stat-total-users').textContent = data.totals.users;
    document.getElementById('stat-wa-sessions').textContent = data.activeWhatsAppSessions.count;
    document.getElementById('stat-tg-bots').textContent = data.telegramBotActive ? '1' : '0';
    document.getElementById('stat-total-groups').textContent = data.totals.groups;
    document.getElementById('stat-uptime').textContent = data.uptime.formatted;
    document.getElementById('stat-mongo-state').textContent = data.isMongoConnected ? 'MongoDB Connected' : 'Local Memory Only';
  } catch (err) {
    console.error('fetchPublicStatus error:', err);
  }
}

// ---------- Sessions ----------
async function fetchSessions() {
  if (!state.token) return;
  try {
    const res = await fetch('/api/sessions', { headers: authHeaders() });
    const data = await res.json();
    const tbody = document.getElementById('sessions-table-body');
    const label = document.getElementById('session-count-label');
    if (!data.success) return;

    label.textContent = `${data.sessions.length} session(s)`;

    if (data.sessions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-500">No WhatsApp sessions yet. Use "Add Number" to connect one.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.sessions.map((s) => `
      <tr class="hover:bg-slate-900/40">
        <td class="py-3 px-4 font-mono font-semibold text-white">+${escapeHtml(s.sessionId)}</td>
        <td class="py-3 px-4"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${s.isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'}">${s.status.toUpperCase()}</span></td>
        <td class="py-3 px-4 text-slate-400 capitalize">${escapeHtml(s.source || 'website')}</td>
        <td class="py-3 px-4 text-slate-400">${new Date(s.lastSeen).toLocaleString()}</td>
        <td class="py-3 px-4 text-right"><button onclick="disconnectSession('${s.sessionId}')" class="px-2.5 py-1 rounded-lg bg-red-950/40 text-red-400 hover:bg-red-900/60 border border-red-800/30 text-[11px] font-semibold">Disconnect</button></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('fetchSessions error:', err);
  }
}

function disconnectSession(sid) {
  showConfirmModal('Disconnect Session', `Disconnect and remove session +${sid}?`, async () => {
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sid)}`, { method: 'DELETE', headers: authHeaders() });
      const data = await res.json();
      if (data.success) { showToast('Session disconnected', 'success'); fetchSessions(); fetchMe(); }
      else showToast(data.error || 'Failed to disconnect', 'error');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

// ---------- Groups ----------
async function fetchGroups() {
  if (!state.token) return;
  try {
    const res = await fetch('/api/groups', { headers: authHeaders() });
    const data = await res.json();
    const grid = document.getElementById('groups-grid');
    if (!data.success) return;

    if (data.groups.length === 0) {
      grid.innerHTML = `<div class="col-span-2 text-slate-500 text-sm">No groups found yet. Add your bot to a group to see it listed here.</div>`;
      return;
    }

    grid.innerHTML = data.groups.map((g) => `
      <div class="glass-card rounded-2xl p-5 border border-slate-800 space-y-4">
        <div class="flex items-start justify-between">
          <div>
            <h4 class="font-bold text-white text-base">${escapeHtml(g.name || 'Untitled group')}</h4>
            <span class="text-[11px] font-mono text-slate-500">${escapeHtml(g.id)}</span>
            <span class="text-[11px] ml-2 uppercase text-slate-500">${escapeHtml(g.platform)}</span>
          </div>
          <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold ${g.botRole === 'Owner' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-brand-500/10 text-brand-400 border border-brand-500/20'}">${g.botRole}</span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div class="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800"><span class="text-slate-400 block">Members</span><span class="font-semibold text-white">${g.membersCount}</span></div>
          <div class="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800"><span class="text-slate-400 block">Chat State</span><span class="font-semibold ${g.isMuted ? 'text-amber-400' : 'text-emerald-400'}">${g.isMuted ? 'Muted' : 'Active'}</span></div>
        </div>
        ${g.platform === 'whatsapp' ? `
        <div class="border-t border-slate-800/80 pt-3 flex flex-wrap gap-2">
          <button onclick="handleGroupAction('${g.id}', '${g.isMuted ? 'unmute' : 'mute'}')" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200">${g.isMuted ? 'Unmute' : 'Mute'}</button>
          <button onclick="handleGroupAction('${g.id}', '${g.isLocked ? 'unlock' : 'lock'}')" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200">${g.isLocked ? 'Unlock' : 'Lock'}</button>
          <button onclick="handleGroupAction('${g.id}', 'leave')" class="px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-800/30 text-xs font-medium">Leave</button>
        </div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    console.error('fetchGroups error:', err);
  }
}

async function handleGroupAction(id, action) {
  try {
    const res = await fetch(`/api/groups/${encodeURIComponent(id)}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    showToast(data.message || `Action ${action} executed`, data.success ? 'success' : 'error');
    fetchGroups();
  } catch (err) {
    showToast('Group action error: ' + err.message, 'error');
  }
}

// ---------- Command terminal ----------
function setCmdPlatform(p) {
  state.cmdPlatform = p;
  const btnWa = document.getElementById('cmd-platform-wa');
  const btnTg = document.getElementById('cmd-platform-tg');
  if (p === 'whatsapp') {
    btnWa.className = 'px-3 py-1.5 rounded-lg font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1.5';
    btnTg.className = 'px-3 py-1.5 rounded-lg font-semibold bg-slate-900 text-slate-400 border border-slate-800 hover:text-white flex items-center space-x-1.5';
  } else {
    btnTg.className = 'px-3 py-1.5 rounded-lg font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center space-x-1.5';
    btnWa.className = 'px-3 py-1.5 rounded-lg font-semibold bg-slate-900 text-slate-400 border border-slate-800 hover:text-white flex items-center space-x-1.5';
  }
}

async function executeCommand() {
  if (!state.token) { showToast('Please log in first', 'error'); return navigateTo('login'); }

  const input = document.getElementById('cmd-input');
  const output = document.getElementById('cmd-output');
  const cmd = input.value.trim();
  if (!cmd) return;

  const time = new Date().toLocaleTimeString();
  const platformIcon = state.cmdPlatform === 'whatsapp' ? 'fa-brands fa-whatsapp text-emerald-400' : 'fa-brands fa-telegram text-sky-400';

  output.innerHTML += `<div class="text-slate-400 border-t border-slate-800/80 pt-2 mt-2"><span class="text-slate-600">[${time}]</span> <i class="${platformIcon} mr-1"></i><span class="text-white font-bold">&gt; ${escapeHtml(cmd)}</span></div>`;
  input.value = '';
  output.scrollTop = output.scrollHeight;

  try {
    const res = await fetch('/api/test-command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ command: cmd, platform: state.cmdPlatform })
    });
    const data = await res.json();
    output.innerHTML += `<div class="text-emerald-300 whitespace-pre-wrap pl-4 border-l-2 border-emerald-500/40 my-1">${escapeHtml(data.response || 'Command acknowledged.')}</div>`;
  } catch (err) {
    output.innerHTML += `<div class="text-red-400 whitespace-pre-wrap pl-4 border-l-2 border-red-500/40 my-1">Error executing command: ${escapeHtml(err.message)}</div>`;
  }
  output.scrollTop = output.scrollHeight;
}

// ---------- Bot settings ----------
async function fetchSettings() {
  if (!state.token) return;
  try {
    const res = await fetch('/api/settings', { headers: authHeaders() });
    const data = await res.json();
    if (!data.success) return;
    const s = data.settings || {};
    document.getElementById('set-bot-name').value = s.botName || 'Adevos Min-Bot';
    document.getElementById('set-bot-prefix').value = s.prefix || '.';
    document.getElementById('set-bot-welcome').value = s.welcomeMessage || '';
    document.getElementById('set-antilink').checked = Boolean(s.antiLink);
    document.getElementById('set-groupprotect').checked = s.groupProtection !== false;
    document.getElementById('set-autostatus').checked = Boolean(s.autoStatusView);
  } catch (err) {
    console.error('fetchSettings error:', err);
  }
}

async function saveBotSettings() {
  const payload = {
    botName: document.getElementById('set-bot-name').value,
    prefix: document.getElementById('set-bot-prefix').value,
    welcomeMessage: document.getElementById('set-bot-welcome').value,
    antiLink: document.getElementById('set-antilink').checked,
    groupProtection: document.getElementById('set-groupprotect').checked,
    autoStatusView: document.getElementById('set-autostatus').checked
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    showToast(data.message || 'Settings saved', data.success ? 'success' : 'error');
  } catch (err) {
    showToast('Settings error: ' + err.message, 'error');
  }
}

// ---------- UI helpers ----------
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const color = type === 'success' ? 'border-emerald-500/50 bg-slate-900/95 text-emerald-300'
    : type === 'error' ? 'border-red-500/50 bg-slate-900/95 text-red-300'
    : 'border-sky-500/50 bg-slate-900/95 text-sky-300';
  const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-info';

  toast.className = `p-3.5 rounded-xl border shadow-xl flex items-center space-x-3 text-xs font-medium pointer-events-auto transition duration-300 ${color}`;
  toast.innerHTML = `<i class="fa-solid ${icon} text-sm"></i> <span>${escapeHtml(msg)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function showConfirmModal(title, msg, onConfirm) {
  const modal = document.getElementById('confirm-modal');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-msg').textContent = msg;
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  document.getElementById('modal-cancel-btn').onclick = () => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  };
  document.getElementById('modal-confirm-btn').onclick = () => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    onConfirm();
  };
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- Initialization ----------
async function loadPublicConfig() {
  try {
    const res = await fetch('/api/status/public-config');
    const data = await res.json();
    if (data.success) {
      state.publicConfig = data;
      if (data.telegramBotUsername) {
        const link = `https://t.me/${data.telegramBotUsername}`;
        document.getElementById('tg-launch-link').href = link;
        const dashLink = document.getElementById('dash-tg-open-link');
        if (dashLink) dashLink.href = link;
      }
    }
  } catch (err) {
    console.error('loadPublicConfig error:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setTheme(state.theme);
  updateAuthUI();
  loadPublicConfig();
  fetchPublicStatus();
  if (state.token) fetchMe();
  setInterval(fetchPublicStatus, 15000);
});
