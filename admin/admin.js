/* =============================================
   JOELLE'S LOUNGE — admin.js
   ============================================= */

// ── Auth check ───────────────────────────────
let currentUser = null;

fetch('/api/admin/check')
  .then(r => {
    if (!r.ok) window.location.href = '/admin/login';
    return r.json();
  })
  .then(async data => {
    currentUser = data;

    // Load full profile to get firstName/lastName/profilePicture
    const profRes = await fetch('/api/admin/profile');
    if (profRes.ok) Object.assign(currentUser, await profRes.json());

    document.getElementById('adminUsername').textContent =
      (currentUser.firstName && currentUser.lastName)
        ? `${currentUser.firstName} ${currentUser.lastName}`
        : currentUser.username;
    updateSidebarAvatar(currentUser);

    const roleBadge = document.getElementById('roleBadge');
    if (roleBadge) {
      roleBadge.textContent = data.role === 'admin' ? 'Admin' : data.role.charAt(0).toUpperCase() + data.role.slice(1);
      roleBadge.className   = `role-badge role-badge--${data.role}`;
    }

    applyRoleGating(data);

    if (data.mustChangePassword) {
      showChangePwModal(true); // forced — no cancel
    }

    const perms = data.permissions; // null = admin
    const canView = (panel) => data.role === 'admin' || (perms?.[panel] === 'view' || perms?.[panel] === 'full');

    loadDashboard();

    if (canView('menu'))     loadMenus();
    if (canView('hours'))    loadHours();
    if (canView('settings')) loadSettings();
    if (canView('users'))    loadUsers();
    if (canView('about'))  { loadAboutPage(); loadTeam(); }
    if (canView('messages'))  loadMessages();
    if (canView('security'))  loadLogs();
    if (canView('events'))    loadEvents();
    loadRoles(); // always load for badge colors; management UI only visible to admin
  })
  .catch(() => window.location.href = '/admin/login');

// ── Dashboard ────────────────────────────────
let _dashClockInterval = null;
let _dashHours = [];

async function loadDashboard() {
  const user = currentUser;
  updateDashboardAvatar(user);
  document.getElementById('dashName').textContent = user.firstName || user.username;

  try {
    const res = await fetch('/api/hours');
    if (res.ok) _dashHours = await res.json();
  } catch (_) { /* hours unavailable */ }

  tickDashboardClock();
  clearInterval(_dashClockInterval);
  _dashClockInterval = setInterval(tickDashboardClock, 1000);

  loadDashboardMetrics();
  loadDashboardWeather();
}

// ── Dashboard weather (Open-Meteo, Baton Rouge LA) ────────────────────────────

async function loadDashboardWeather() {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast' +
      '?latitude=30.4515&longitude=-91.1871' +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m' +
      '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FChicago';
    const res  = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    const c    = data.current;
    const { icon, label } = _weatherInfo(c.weather_code);
    document.getElementById('dashWeatherIcon').textContent      = icon;
    document.getElementById('dashWeatherTemp').textContent      = `${Math.round(c.temperature_2m)}°F`;
    document.getElementById('dashWeatherCondition').textContent = label;
    document.getElementById('dashWeatherDetails').textContent   =
      `Feels like ${Math.round(c.apparent_temperature)}°  ·  ${c.relative_humidity_2m}% humidity  ·  ${Math.round(c.wind_speed_10m)} mph`;
  } catch (_) { /* weather unavailable — leave placeholder */ }
}

function _weatherInfo(code) {
  if (code === 0)  return { icon: '☀️',  label: 'Clear Sky' };
  if (code === 1)  return { icon: '🌤️',  label: 'Mainly Clear' };
  if (code === 2)  return { icon: '⛅',  label: 'Partly Cloudy' };
  if (code === 3)  return { icon: '☁️',  label: 'Overcast' };
  if (code <= 48)  return { icon: '🌫️',  label: 'Foggy' };
  if (code <= 55)  return { icon: '🌦️',  label: 'Drizzle' };
  if (code <= 65)  return { icon: '🌧️',  label: 'Rain' };
  if (code <= 75)  return { icon: '❄️',  label: 'Snow' };
  if (code <= 82)  return { icon: '🌧️',  label: 'Rain Showers' };
  if (code <= 99)  return { icon: '⛈️',  label: 'Thunderstorm' };
  return           { icon: '🌡️',  label: 'Unknown' };
}

// ── Dashboard metrics (Toast POS) ────────────────────────────────────────────

async function loadDashboardMetrics() {
  const grid   = document.getElementById('dashMetricsGrid');
  const notice = document.getElementById('dashMetricsNotice');
  if (!grid) return;

  // Show loading state
  grid.querySelectorAll('.dash-metric-value').forEach(el => { el.textContent = '…'; });

  try {
    const res  = await fetch('/api/admin/toast/metrics');
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();

    if (!data.configured) {
      grid.classList.add('hidden');
      notice.classList.remove('hidden');
      return;
    }

    grid.classList.remove('hidden');
    notice.classList.add('hidden');

    if (data.error) {
      grid.querySelectorAll('.dash-metric-value').forEach(el => { el.textContent = '—'; });
      return;
    }

    const fmt$ = v => v != null ? '$' + Number(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '—';
    const fmtN = v => v != null ? Number(v).toLocaleString() : '—';
    const fmtH = v => v != null ? Number(v).toFixed(1) + 'h' : '—';

    const ms = Array.isArray(data.metrics) ? data.metrics : (data.metrics ? [data.metrics] : []);
    const ls = Array.isArray(data.labor)   ? data.labor   : (data.labor   ? [data.labor]   : []);
    const sum = (arr, key) => arr.reduce((acc, r) => acc + (r[key] || 0), 0);

    const totalNet    = sum(ms, 'netSalesAmount');
    const totalOrders = sum(ms, 'ordersCount');

    document.getElementById('dm-netSales').textContent   = fmt$(totalNet);
    document.getElementById('dm-grossSales').textContent = fmt$(sum(ms, 'grossSalesAmount'));
    document.getElementById('dm-avgOrder').textContent   = totalOrders ? fmt$(totalNet / totalOrders) : '—';
    document.getElementById('dm-guests').textContent     = fmtN(sum(ms, 'guestCount'));
    document.getElementById('dm-orders').textContent     = fmtN(totalOrders);
    document.getElementById('dm-laborHours').textContent = fmtH(sum(ls, 'totalHours'));
    document.getElementById('dm-laborCost').textContent  = fmt$(sum(ls, 'totalCost'));
    document.getElementById('dm-discounts').textContent  = fmt$(sum(ms, 'discountAmount'));
    document.getElementById('dm-voids').textContent      = fmt$(sum(ms, 'voidOrdersAmount'));

  } catch (_) {
    if (grid) grid.querySelectorAll('.dash-metric-value').forEach(el => { el.textContent = '—'; });
  }
}

document.getElementById('dashMetricsRefresh')?.addEventListener('click', loadDashboardMetrics);

function updateDashboardAvatar(user) {
  const el = document.getElementById('dashAvatar');
  if (!el) return;
  if (user.profilePicture) {
    el.style.backgroundImage    = `url(${user.profilePicture})`;
    el.style.backgroundSize     = 'cover';
    el.style.backgroundPosition = 'center';
    el.textContent = '';
  } else {
    el.style.backgroundImage = '';
    el.textContent = (user.firstName && user.lastName)
      ? (user.firstName[0] + user.lastName[0]).toUpperCase()
      : user.username.charAt(0).toUpperCase();
  }
}

function tickDashboardClock() {
  const now     = new Date();
  const timeEl  = document.getElementById('dashTime');
  const dateEl  = document.getElementById('dashDate');
  if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (dateEl) dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  updateDashboardStatus(now);
}

// ── Open/closed helpers ───────────────────────
const _DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

function _parseTime12(str) {
  const m = str.trim().match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

function _dayInRange(daysStr, dow) {
  // Split on en/em dash or spaced hyphen
  const parts = daysStr.split(/\s*[–—]\s*|\s+-\s+/).map(s => s.trim().toLowerCase());
  if (parts.length === 1) return parts[0] === _DAYS[dow];
  const s = _DAYS.indexOf(parts[0]), e = _DAYS.indexOf(parts[1]);
  if (s === -1 || e === -1) return false;
  return s <= e ? (dow >= s && dow <= e) : (dow >= s || dow <= e);
}

function updateDashboardStatus(now) {
  const badge = document.getElementById('dashStatus');
  if (!badge || !_dashHours.length) return;
  const dow = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  let open = false;
  for (const row of _dashHours) {
    if (!_dayInRange(row.days, dow)) continue;
    const parts = row.time_range.split(/\s*[–—]\s*|\s+-\s+/);
    if (parts.length < 2) continue;
    const o = _parseTime12(parts[0]), c = _parseTime12(parts[1]);
    if (o !== null && c !== null && mins >= o && mins < c) { open = true; break; }
  }
  badge.textContent = open ? 'RESTAURANT OPEN' : 'RESTAURANT CLOSED';
  badge.className = `dashboard-status dashboard-status--${open ? 'open' : 'closed'}`;
}

// ── Role gating ──────────────────────────────
function applyRoleGating(data) {
  const PANELS  = ['menu', 'hours', 'settings', 'about', 'messages', 'events', 'users', 'roles', 'security'];
  const isAdmin = data.role === 'admin' || !!data.isSystemAdmin;
  const perms   = data.permissions; // null = admin

  PANELS.forEach(panel => {
    const level      = isAdmin ? 'full' : (perms?.[panel] ?? 'hidden');
    const sidebarBtn = document.querySelector(`.sidebar__link[data-panel="${panel}"]`);
    const section    = document.getElementById(`panel-${panel}`);

    if (level === 'hidden') {
      if (sidebarBtn) sidebarBtn.style.display = 'none';
      if (section)    section.classList.add('panel--hidden');
    } else if (level === 'view') {
      if (section) section.classList.add('panel--readonly');
    }
  });

  if (!isAdmin) {
    document.querySelectorAll('[data-admin-only]').forEach(el => { el.style.display = 'none'; });

    // Hide the "Admin" sidebar section label if all admin panels are hidden
    const adminPanels = ['users', 'roles', 'security'];
    const allHidden   = adminPanels.every(p => (perms?.[p] ?? 'hidden') === 'hidden');
    const label       = document.getElementById('sidebarAdminSection');
    if (label) label.style.display = allHidden ? 'none' : '';
  }
}

// ── Avatar helper ────────────────────────────
function updateSidebarAvatar(user) {
  const avatar = document.getElementById('adminAvatar');
  if (!avatar) return;
  if (user.profilePicture) {
    avatar.style.backgroundImage = `url(${CSS.escape ? user.profilePicture : user.profilePicture})`;
    avatar.style.backgroundSize  = 'cover';
    avatar.style.backgroundPosition = 'center';
    avatar.textContent = '';
  } else {
    avatar.style.backgroundImage = '';
    const initials = (user.firstName && user.lastName)
      ? (user.firstName[0] + user.lastName[0]).toUpperCase()
      : user.username.charAt(0).toUpperCase();
    avatar.textContent = initials;
  }
}

// ── Profile Modal (self only) ──────────────────
let pendingProfilePicture = null; // base64 data URL, '' to clear, null = unchanged

function openProfileModal() {
  pendingProfilePicture = null;
  const user = currentUser;
  if (!user) return;

  document.getElementById('profileFirstName').value   = user.firstName || '';
  document.getElementById('profileLastName').value    = user.lastName  || '';
  document.getElementById('profileEmail').value       = user.email     || '';
  document.getElementById('profilePhone').value       = user.phone     || '';
  document.getElementById('profilePictureFile').value = '';
  document.getElementById('profileError').textContent = '';

  document.getElementById('profilePicRemoveBtn').style.display = user.profilePicture ? 'block' : 'none';
  updateProfileAvatarPreview(user.profilePicture || '', user);
  document.getElementById('profileModal').classList.remove('hidden');
}

function updateProfileAvatarPreview(url, user) {
  const preview = document.getElementById('profileAvatarPreview');
  if (!preview) return;
  if (url) {
    preview.style.backgroundImage    = `url(${url})`;
    preview.style.backgroundSize     = 'cover';
    preview.style.backgroundPosition = 'center';
    preview.querySelector('.profile-upload-overlay').style.opacity = '0';
  } else {
    preview.style.backgroundImage = '';
    preview.querySelector('.profile-upload-overlay').style.opacity = '';
    const u = user || currentUser;
    const initials = (u.firstName && u.lastName)
      ? (u.firstName[0] + u.lastName[0]).toUpperCase()
      : (u.username || '?').charAt(0).toUpperCase();
    preview.dataset.initials = initials;
  }
}

document.getElementById('profilePictureFile')?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    pendingProfilePicture = ev.target.result;
    updateProfileAvatarPreview(pendingProfilePicture, null);
    document.getElementById('profilePicRemoveBtn').style.display = 'block';
  };
  reader.readAsDataURL(file);
});

document.getElementById('profilePicRemoveBtn')?.addEventListener('click', () => {
  pendingProfilePicture = '';
  document.getElementById('profilePictureFile').value = '';
  updateProfileAvatarPreview('', currentUser);
  document.getElementById('profilePicRemoveBtn').style.display = 'none';
});

document.getElementById('profileSaveBtn')?.addEventListener('click', async () => {
  const payload = {
    firstName: document.getElementById('profileFirstName').value.trim(),
    lastName:  document.getElementById('profileLastName').value.trim(),
    email:     document.getElementById('profileEmail').value.trim(),
    phone:     document.getElementById('profilePhone').value.trim()
  };
  if (pendingProfilePicture !== null) payload.profilePicture = pendingProfilePicture;

  const res = await fetch('/api/admin/profile', {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload)
  });

  if (!res.ok) {
    const d = await res.json();
    document.getElementById('profileError').textContent = d.error || 'Failed to save';
    return;
  }

  const saved = await res.json();
  document.getElementById('profileModal').classList.add('hidden');
  Object.assign(currentUser, saved);
  document.getElementById('adminUsername').textContent =
    (saved.firstName && saved.lastName) ? `${saved.firstName} ${saved.lastName}` : saved.username;
  updateSidebarAvatar(saved);
  updateDashboardAvatar(saved);
  const dashName = document.getElementById('dashName');
  if (dashName) dashName.textContent = saved.firstName || saved.username;
});

document.getElementById('profileCancelBtn')?.addEventListener('click', () => {
  document.getElementById('profileModal').classList.add('hidden');
});
document.getElementById('profileModal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});

document.getElementById('profileBtn')?.addEventListener('click', () => openProfileModal());

// ── Manage User Modal ──────────────────────────
let manageUserId = null;
let managePendingPicture = null;

function openManageUserModal(id) {
  manageUserId = id;
  managePendingPicture = null;
  const user = allUsers.find(u => u.id === id);
  if (!user) return;

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  document.getElementById('manageUserTitle').textContent = fullName || user.username;
  document.getElementById('manageUserSub').textContent =
    `@${user.username} · ${user.role} · ${user.active ? 'Active' : 'Locked'}`;

  document.getElementById('manageFirstName').value = user.firstName || '';
  document.getElementById('manageLastName').value  = user.lastName  || '';
  document.getElementById('manageEmail').value     = user.email     || '';
  document.getElementById('managePhone').value     = user.phone     || '';
  document.getElementById('manageUsername').value  = user.username  || '';

  const roleSelect = document.getElementById('manageRole');
  roleSelect.innerHTML = [...allRoles.map(r => r.name), 'admin'].map(rn =>
    `<option value="${rn}"${user.role === rn ? ' selected' : ''}>${rn}</option>`
  ).join('');

  const lockBtn = document.getElementById('manageLockBtn');
  lockBtn.textContent = user.active ? 'Lock Account' : 'Unlock Account';
  lockBtn.classList.toggle('btn-ghost--warning', !user.active);

  updateManageAvatarPreview(user.profilePicture || '', user);
  document.getElementById('managePicRemoveBtn').style.display = user.profilePicture ? 'block' : 'none';
  document.getElementById('manageProfilePictureFile').value = '';
  document.getElementById('manageResetPwForm').classList.add('hidden');
  document.getElementById('manageTempPw').value = '';
  document.getElementById('manageUserError').textContent = '';
  document.getElementById('manageUserModal').classList.remove('hidden');
}

function updateManageAvatarPreview(url, user) {
  const preview = document.getElementById('manageAvatarPreview');
  if (!preview) return;
  if (url) {
    preview.style.backgroundImage    = `url(${url})`;
    preview.style.backgroundSize     = 'cover';
    preview.style.backgroundPosition = 'center';
    preview.querySelector('.profile-upload-overlay').style.opacity = '0';
  } else {
    preview.style.backgroundImage = '';
    preview.querySelector('.profile-upload-overlay').style.opacity = '';
    const u = user || allUsers.find(u => u.id === manageUserId);
    const initials = (u?.firstName && u?.lastName)
      ? (u.firstName[0] + u.lastName[0]).toUpperCase()
      : (u?.username || '?').charAt(0).toUpperCase();
    preview.dataset.initials = initials;
  }
}

function closeManageUserModal() {
  document.getElementById('manageUserModal').classList.add('hidden');
}

document.getElementById('manageUserCloseBtn').addEventListener('click', closeManageUserModal);
document.getElementById('manageUserCancelBtn').addEventListener('click', closeManageUserModal);
document.getElementById('manageUserModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeManageUserModal();
});

document.getElementById('manageProfilePictureFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    managePendingPicture = ev.target.result;
    updateManageAvatarPreview(managePendingPicture, null);
    document.getElementById('managePicRemoveBtn').style.display = 'block';
  };
  reader.readAsDataURL(file);
});

document.getElementById('managePicRemoveBtn').addEventListener('click', () => {
  managePendingPicture = '';
  document.getElementById('manageProfilePictureFile').value = '';
  const user = allUsers.find(u => u.id === manageUserId);
  updateManageAvatarPreview('', user);
  document.getElementById('managePicRemoveBtn').style.display = 'none';
});

document.getElementById('manageUserSaveBtn').addEventListener('click', async () => {
  const payload = {
    firstName: document.getElementById('manageFirstName').value.trim(),
    lastName:  document.getElementById('manageLastName').value.trim(),
    email:     document.getElementById('manageEmail').value.trim(),
    phone:     document.getElementById('managePhone').value.trim(),
    username:  document.getElementById('manageUsername').value.trim(),
    role:      document.getElementById('manageRole').value,
  };
  if (managePendingPicture !== null) payload.profilePicture = managePendingPicture;

  const res = await fetch(`/api/admin/users/${manageUserId}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload)
  });
  if (res.ok) {
    closeManageUserModal();
    await loadUsers();
  } else {
    const d = await res.json();
    document.getElementById('manageUserError').textContent = d.error || 'Failed to save changes';
  }
});

document.getElementById('manageResetPwToggle').addEventListener('click', () => {
  document.getElementById('manageResetPwForm').classList.toggle('hidden');
});

document.getElementById('manageResetPwSubmit').addEventListener('click', async () => {
  const tempPw = document.getElementById('manageTempPw').value.trim();
  if (!tempPw) return;
  const res = await fetch(`/api/admin/users/${manageUserId}/reset-password`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ tempPassword: tempPw })
  });
  const errEl = document.getElementById('manageUserError');
  if (res.ok) {
    document.getElementById('manageTempPw').value = '';
    document.getElementById('manageResetPwForm').classList.add('hidden');
    errEl.style.color = 'var(--gold)';
    errEl.textContent = '✓ Password reset — user must change on next login';
    setTimeout(() => { errEl.textContent = ''; errEl.style.color = ''; }, 3000);
  } else {
    const d = await res.json();
    errEl.style.color = '';
    errEl.textContent = d.error || 'Failed to reset password';
  }
});

document.getElementById('manageLockBtn').addEventListener('click', async () => {
  const user = allUsers.find(u => u.id === manageUserId);
  const res = await fetch(`/api/admin/users/${manageUserId}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ active: !user.active })
  });
  if (res.ok) {
    await loadUsers();
    openManageUserModal(manageUserId);
  } else {
    const d = await res.json();
    document.getElementById('manageUserError').textContent = d.error || 'Failed to update status';
  }
});

document.getElementById('manageDeleteBtn').addEventListener('click', async () => {
  const user = allUsers.find(u => u.id === manageUserId);
  const ok = await showConfirm({
    title:       'Delete Account',
    message:     `Permanently delete @${user.username}? All their data will be removed and cannot be recovered.`,
    confirmText: 'Delete Account',
    type:        'danger'
  });
  if (!ok) return;
  const res = await fetch(`/api/admin/users/${manageUserId}`, { method: 'DELETE' });
  if (res.ok) {
    closeManageUserModal();
    await loadUsers();
  } else {
    const d = await res.json();
    document.getElementById('manageUserError').textContent = d.error || 'Failed to delete user';
  }
});

// ── Sidebar navigation ───────────────────────
document.querySelectorAll('.sidebar__link').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sidebar__link').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const panelId = btn.dataset.panel;
    document.getElementById('panel-' + panelId).classList.add('active');
    if (panelId === 'events') loadEvents();
  });
});

// ── Logout ───────────────────────────────────
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  window.location.href = '/admin/login';
});

// ── Helpers ──────────────────────────────────
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function showMsg(el, text, isError = false) {
  el.textContent = text;
  el.style.color = isError ? 'var(--danger-lt)' : 'var(--success)';
  setTimeout(() => { el.textContent = ''; }, 3500);
}

// ── Role badge color helpers ──────────────────
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Returns an inline style string for a role badge, or '' for admin (uses CSS)
function roleBadgeStyle(roleName) {
  if (roleName === 'admin') return '';
  const role = allRoles.find(r => r.name === roleName);
  if (!role?.color) return '';
  const hex = role.color;
  return `style="background:${hexToRgba(hex, 0.12)};color:${hex};border-color:${hexToRgba(hex, 0.3)}"`;
}

// Update the sidebar role badge for the currently logged-in user
function refreshSidebarRoleBadge() {
  const badge = document.getElementById('roleBadge');
  if (!badge || !currentUser || currentUser.role === 'admin') return;
  const role = allRoles.find(r => r.name === currentUser.role);
  if (!role?.color) return;
  const hex = role.color;
  badge.style.background  = hexToRgba(hex, 0.12);
  badge.style.color       = hex;
  badge.style.borderColor = hexToRgba(hex, 0.3);
}

// ── Custom confirm dialog ─────────────────────
function showConfirm({ title, message, confirmText = 'Confirm', type = 'danger' }) {
  return new Promise(resolve => {
    document.getElementById('confirmTitle').textContent   = title;
    document.getElementById('confirmMessage').textContent = message;

    const icon  = document.getElementById('confirmIcon');
    icon.textContent = type === 'warning' ? '⚠' : '!';
    icon.className   = `confirm-icon confirm-icon--${type}`;

    const okBtn = document.getElementById('confirmOkBtn');
    okBtn.textContent = confirmText;
    okBtn.className   = type === 'warning' ? 'btn-gold' : 'btn-ghost btn-ghost--danger';

    document.getElementById('confirmModal').classList.remove('hidden');

    function cleanup() {
      document.getElementById('confirmModal').classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      document.getElementById('confirmCancelBtn').removeEventListener('click', onCancel);
    }
    function onOk()     { cleanup(); resolve(true);  }
    function onCancel() { cleanup(); resolve(false); }

    okBtn.addEventListener('click', onOk);
    document.getElementById('confirmCancelBtn').addEventListener('click', onCancel);
  });
}

// ── Change Password Modal ─────────────────────

function showChangePwModal(forced = false) {
  const modal     = document.getElementById('changePwModal');
  const cancelBtn = document.getElementById('changePwCancel');
  const sub       = document.getElementById('changePwSub');

  if (forced) {
    cancelBtn.classList.add('hidden');
    sub.textContent = 'You must set a new password before you can continue.';
  } else {
    cancelBtn.classList.remove('hidden');
    sub.textContent = 'Choose a new password for your account.';
  }

  document.getElementById('changePwError').textContent = '';
  document.getElementById('changePwForm').reset();
  modal.classList.remove('hidden');
  document.getElementById('newPassword').focus();
}

document.getElementById('changePwCancel').addEventListener('click', () => {
  document.getElementById('changePwModal').classList.add('hidden');
  document.getElementById('changePwForm').reset();
  document.getElementById('changePwError').textContent = '';
});

document.getElementById('changePwBtn').addEventListener('click', () => {
  showChangePwModal(false);
});

document.getElementById('changePwForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const newPw  = document.getElementById('newPassword').value;
  const confPw = document.getElementById('confirmPassword').value;
  const errEl  = document.getElementById('changePwError');

  errEl.textContent = '';

  if (newPw !== confPw) { errEl.textContent = 'Passwords do not match'; return; }
  if (newPw.length < 8)  { errEl.textContent = 'Password must be at least 8 characters'; return; }

  const res = await fetch('/api/admin/change-password', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ newPassword: newPw })
  });

  if (res.ok) {
    document.getElementById('changePwModal').classList.add('hidden');
    document.getElementById('changePwForm').reset();
    if (currentUser) currentUser.mustChangePassword = false;
  } else {
    const data = await res.json();
    errEl.textContent = data.error || 'Failed to update password';
  }
});

// ── MENU ─────────────────────────────────────

let allMenus      = [];
let currentMenuId    = null;
let allMenuItems     = [];
let menuSortCol      = null;
let menuSortDir      = 'asc';
let menuPage         = 1;
const MENU_PAGE_SIZE = 10;

async function loadMenus() {
  const res = await fetch('/api/admin/menus');
  if (!res.ok) return;
  allMenus = await res.json();
  renderMenuSelector();
  const active = allMenus.find(m => m.active) || allMenus[0];
  if (active) await selectMenu(active.id);
}

function renderMenuSelector() {
  const sel = document.getElementById('menuSelector');
  if (!sel) return;
  sel.innerHTML = allMenus.map(m => `
    <button class="menu-pill${m.id === currentMenuId ? ' active' : ''}" data-menu-id="${m.id}">
      ${esc(m.name)}${m.active ? ' <span class="live-badge">LIVE</span>' : ''}
    </button>
  `).join('');
}

async function selectMenu(id) {
  currentMenuId = id;
  renderMenuSelector();
  const menu    = allMenus.find(m => m.id === id);
  const isAdmin = currentUser?.role === 'admin' || !!currentUser?.isSystemAdmin;
  const editMenuBtn   = document.getElementById('editMenuBtn');
  const setLiveBtn    = document.getElementById('setLiveBtn');
  const deleteMenuBtn = document.getElementById('deleteMenuBtn');
  if (editMenuBtn)   editMenuBtn.style.display   = menu ? '' : 'none';
  if (setLiveBtn)    setLiveBtn.style.display    = (menu && !menu.active && isAdmin) ? '' : 'none';
  if (deleteMenuBtn) deleteMenuBtn.style.display = (allMenus.length > 1 && isAdmin)  ? '' : 'none';
  renderCategoryBar(menu);
  await loadMenuItems(id);
}

function renderCategoryBar(menu) {
  const catSelectEl = document.getElementById('modalItemCategory');
  const cats        = menu ? (menu.categories || []) : [];
  const cap         = s => s.charAt(0).toUpperCase() + s.slice(1);

  if (catSelectEl) {
    catSelectEl.innerHTML = cats.length
      ? cats.map(cat => `<option value="${esc(cat)}">${esc(cap(cat))}</option>`).join('')
      : '<option value="" disabled selected>Add a category first</option>';
  }

  renderEditMenuCategories(menu);
}

function renderEditMenuCategories(menu) {
  const el      = document.getElementById('editMenuCategories');
  if (!el) return;
  const cats    = menu ? (menu.categories || []) : [];
  const isAdmin = currentUser?.role === 'admin' || !!currentUser?.isSystemAdmin;
  const cap     = s => s.charAt(0).toUpperCase() + s.slice(1);
  el.innerHTML  = cats.length
    ? cats.map(cat => `
        <span class="cat-chip">
          ${esc(cap(cat))}
          ${isAdmin ? `<button class="cat-chip__remove" onclick="removeCategory('${esc(cat)}')" title="Remove">×</button>` : ''}
        </span>`).join('')
    : '<span class="cat-empty-hint">No categories yet.</span>';
}

async function loadMenuItems(menuId) {
  const res = await fetch(`/api/admin/menus/${menuId}/items`);
  if (!res.ok) return;
  allMenuItems = await res.json();
  menuPage = 1;
  renderMenuTable();
}

function renderMenuTable() {
  const tbody = document.getElementById('menuTbody');
  const empty = document.getElementById('menuEmpty');
  let items = [...allMenuItems];

  // ── Sort ──────────────────────────────────────
  if (menuSortCol) {
    items.sort((a, b) => {
      let va, vb;
      if (menuSortCol === 'price') {
        const parse = s => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
        va = parse(a.price); vb = parse(b.price);
      } else if (menuSortCol === 'available') {
        va = a.available === false ? 1 : 0;
        vb = b.available === false ? 1 : 0;
      } else {
        va = (a[menuSortCol] || '').toLowerCase();
        vb = (b[menuSortCol] || '').toLowerCase();
      }
      if (va < vb) return menuSortDir === 'asc' ? -1 : 1;
      if (va > vb) return menuSortDir === 'asc' ?  1 : -1;
      return 0;
    });
  }

  // ── Update sort icons ─────────────────────────
  document.querySelectorAll('#panel-menu .th-sort').forEach(th => {
    th.querySelector('.sort-icon').textContent =
      th.dataset.sort === menuSortCol ? (menuSortDir === 'asc' ? ' ▲' : ' ▼') : '';
  });

  if (items.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    renderMenuPagination(0, 0);
    return;
  }
  empty.classList.add('hidden');

  const totalPages = Math.ceil(items.length / MENU_PAGE_SIZE);
  if (menuPage > totalPages) menuPage = totalPages;
  const pageItems = items.slice((menuPage - 1) * MENU_PAGE_SIZE, menuPage * MENU_PAGE_SIZE);
  renderMenuPagination(items.length, totalPages);

  tbody.innerHTML = pageItems.map(item => `
    <tr data-id="${item.id}"${item.available === false ? ' style="opacity:0.6"' : ''}>
      <td>${item.image ? `<img class="item-thumb" src="/uploads/menu/${esc(item.image)}" alt="${esc(item.name)}">` : '<span class="item-thumb-empty">—</span>'}</td>
      <td><span class="badge badge--${esc(item.category)}">${esc(item.category)}</span></td>
      <td${item.available === false ? ' style="text-decoration:line-through;color:var(--muted)"' : ''}>
        ${esc(item.name)}
        ${(item.dietary || []).map(d => `<span class="badge-dietary badge-dietary--${esc(d)}">${dietaryLabel(d)}</span>`).join('')}
      </td>
      <td style="color:var(--muted)">${esc(item.description)}</td>
      <td style="color:var(--gold)">${esc(item.price)}</td>
      <td>
        <button class="${item.available === false ? 'btn-toggle-unavail' : 'btn-toggle-avail'}"
                onclick="toggleMenuAvailability(${item.id})">
          ${item.available === false ? '✗ Out of Stock' : '✓ In Stock'}
        </button>
      </td>
      <td>
        <div class="action-btns">
          <button class="btn-edit" onclick="openMenuItemModal(${item.id})">Edit</button>
          <button class="btn-delete" onclick="deleteMenuItem(${item.id})">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderMenuPagination(total, totalPages) {
  const el = document.getElementById('menuPagination');
  if (!el) return;
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <button class="page-btn" onclick="menuGoToPage(${menuPage - 1})" ${menuPage <= 1 ? 'disabled' : ''}>&#8592; Prev</button>
    <span class="page-info">Page ${menuPage} of ${totalPages} <span class="page-total">(${total} items)</span></span>
    <button class="page-btn" onclick="menuGoToPage(${menuPage + 1})" ${menuPage >= totalPages ? 'disabled' : ''}>Next &#8594;</button>
  `;
}

function menuGoToPage(page) {
  menuPage = page;
  renderMenuTable();
}

const DIETARY_LABELS = { gf: 'GF', v: 'V', vg: 'VG', spicy: '🌶', nuts: '⚠' };
function dietaryLabel(key) { return DIETARY_LABELS[key] || key; }

function openMenuItemModal(id = null) {
  const modal   = document.getElementById('menuItemModal');
  const title   = document.getElementById('menuItemModalTitle');
  const saveBtn = document.getElementById('menuItemModalSaveBtn');
  const errEl   = document.getElementById('menuItemModalError');

  // Populate category select
  const menu = allMenus.find(m => m.id === currentMenuId);
  const cats = menu ? (menu.categories || []) : [];
  const catSel = document.getElementById('modalItemCategory');
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  catSel.innerHTML = cats.length
    ? cats.map(c => `<option value="${esc(c)}">${esc(cap(c))}</option>`).join('')
    : '<option value="" disabled selected>Add a category first</option>';

  // Reset form state
  document.getElementById('menuItemForm').reset();
  document.getElementById('modalItemId').value   = '';
  document.getElementById('modalItemImageValue').value = '';
  document.getElementById('modalImagePreview').innerHTML = '';
  document.querySelectorAll('.dietary-cb').forEach(cb => cb.checked = false);
  document.getElementById('modalItemAvailable').checked = true;
  errEl.textContent = '';
  errEl.classList.add('hidden');

  if (id === null) {
    title.textContent    = 'Add Menu Item';
    saveBtn.textContent  = 'Add Item';
  } else {
    const item = allMenuItems.find(i => i.id === id);
    if (!item) return;
    title.textContent   = 'Edit Menu Item';
    saveBtn.textContent = 'Save Changes';
    document.getElementById('modalItemId').value          = id;
    catSel.value = item.category;
    document.getElementById('modalItemName').value        = item.name || '';
    document.getElementById('modalItemPrice').value       = item.price || '';
    document.getElementById('modalItemDescription').value = item.description || '';
    document.getElementById('modalItemAvailable').checked = item.available !== false;
    if (item.image) {
      document.getElementById('modalItemImageValue').value = item.image;
      document.getElementById('modalImagePreview').innerHTML =
        `<img src="/uploads/menu/${esc(item.image)}" alt="${esc(item.name)}" />`;
    }
    (item.dietary || []).forEach(d => {
      const cb = document.querySelector(`.dietary-cb[value="${d}"]`);
      if (cb) cb.checked = true;
    });
  }

  modal.classList.remove('hidden');
}

function closeMenuItemModal() {
  document.getElementById('menuItemModal').classList.add('hidden');
  document.getElementById('menuItemForm').reset();
  document.getElementById('modalItemImageValue').value = '';
  document.getElementById('modalImagePreview').innerHTML = '';
}

async function deleteMenuItem(id) {
  const ok = await showConfirm({
    title:       'Delete Menu Item',
    message:     'This item will be permanently removed from the menu.',
    confirmText: 'Delete',
    type:        'danger'
  });
  if (!ok) return;
  await fetch(`/api/admin/menus/${currentMenuId}/items/${id}`, { method: 'DELETE' });
  await loadMenuItems(currentMenuId);
}

async function toggleMenuAvailability(id) {
  const item = allMenuItems.find(i => i.id === id);
  if (!item) return;
  await fetch(`/api/admin/menus/${currentMenuId}/items/${id}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ available: item.available === false })
  });
  await loadMenuItems(currentMenuId);
}

// ── Menu management ───────────────────────────

async function createMenu(name) {
  const res = await fetch('/api/admin/menus', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name })
  });
  if (res.ok) {
    const newMenu = await res.json();
    allMenus.push({ ...newMenu, active: false });
    await selectMenu(newMenu.id);
    renderMenuSelector();
  }
}

async function activateCurrentMenu() {
  if (!currentMenuId) return;
  const res = await fetch(`/api/admin/menus/${currentMenuId}/activate`, { method: 'PUT' });
  if (res.ok) {
    allMenus.forEach(m => m.active = m.id === currentMenuId);
    renderMenuSelector();
    const setLiveBtn = document.getElementById('setLiveBtn');
    if (setLiveBtn) setLiveBtn.style.display = 'none';
  }
}

async function deleteCurrentMenu() {
  const menu = allMenus.find(m => m.id === currentMenuId);
  if (!menu) return;
  const ok = await showConfirm({
    title:       `Delete "${menu.name}"`,
    message:     'All items in this menu will be permanently removed. This cannot be undone.',
    confirmText: 'Delete Menu',
    type:        'danger'
  });
  if (!ok) return;
  const res = await fetch(`/api/admin/menus/${currentMenuId}`, { method: 'DELETE' });
  if (res.ok) {
    allMenus      = allMenus.filter(m => m.id !== currentMenuId);
    currentMenuId = null;
    const next = allMenus.find(m => m.active) || allMenus[0];
    renderMenuSelector();
    if (next) await selectMenu(next.id);
  } else {
    const d = await res.json();
    alert(d.error || 'Cannot delete this menu');
  }
}

async function addCategory(catName) {
  catName = (catName || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (!catName) return;
  const menu = allMenus.find(m => m.id === currentMenuId);
  if (!menu || menu.categories.includes(catName)) return;
  const updated = [...menu.categories, catName];
  const res = await fetch(`/api/admin/menus/${currentMenuId}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ categories: updated })
  });
  if (res.ok) {
    menu.categories = updated;
    renderCategoryBar(menu);
  }
}

async function removeCategory(catName) {
  const menu = allMenus.find(m => m.id === currentMenuId);
  if (!menu) return;
  const hasItems = allMenuItems.some(i => i.category === catName);
  if (hasItems) {
    const ok = await showConfirm({
      title:       'Remove Category',
      message:     `"${catName}" still has items in it. Removing the category will hide those items. Continue?`,
      confirmText: 'Remove Anyway',
      type:        'warning'
    });
    if (!ok) return;
  }
  const updated = menu.categories.filter(c => c !== catName);
  const res = await fetch(`/api/admin/menus/${currentMenuId}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ categories: updated })
  });
  if (res.ok) {
    menu.categories = updated;
    renderCategoryBar(menu);
  }
}

// ── Menu item modal ───────────────────────────

document.getElementById('addItemBtn').addEventListener('click', () => openMenuItemModal());

document.getElementById('menuItemModalCancelBtn').addEventListener('click', closeMenuItemModal);

document.getElementById('menuItemModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('menuItemModal')) closeMenuItemModal();
});

document.getElementById('modalItemImage').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch('/api/admin/upload/menu-image', { method: 'POST', body: fd });
  if (!res.ok) { e.target.value = ''; return; }
  const { filename } = await res.json();
  document.getElementById('modalItemImageValue').value = filename;
  document.getElementById('modalImagePreview').innerHTML =
    `<img src="/uploads/menu/${filename}" alt="preview" />`;
});

document.getElementById('menuItemForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id       = document.getElementById('modalItemId').value;
  const isEdit   = id !== '';
  const errEl    = document.getElementById('menuItemModalError');
  const dietary  = [...document.querySelectorAll('.dietary-cb:checked')].map(cb => cb.value);
  const payload  = {
    category:    document.getElementById('modalItemCategory').value,
    name:        document.getElementById('modalItemName').value.trim(),
    price:       document.getElementById('modalItemPrice').value.trim(),
    description: document.getElementById('modalItemDescription').value.trim(),
    available:   document.getElementById('modalItemAvailable').checked,
    dietary
  };
  const imgVal = document.getElementById('modalItemImageValue').value;
  if (imgVal) payload.image = imgVal;

  const url    = isEdit
    ? `/api/admin/menus/${currentMenuId}/items/${id}`
    : `/api/admin/menus/${currentMenuId}/items`;
  const method = isEdit ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload)
  });

  if (res.ok) {
    closeMenuItemModal();
    await loadMenuItems(currentMenuId);
  } else {
    const data = await res.json().catch(() => ({}));
    errEl.textContent = data.error || 'Something went wrong.';
    errEl.classList.remove('hidden');
  }
});

// Column sort
document.querySelector('#panel-menu .data-table thead').addEventListener('click', (e) => {
  const th = e.target.closest('.th-sort');
  if (!th) return;
  const col = th.dataset.sort;
  if (menuSortCol === col) {
    menuSortDir = menuSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    menuSortCol = col;
    menuSortDir = 'asc';
  }
  menuPage = 1;
  renderMenuTable();
});

// (Category filter tabs removed — use table column sort instead)

// Menu selector pills (event delegation)
document.getElementById('menuSelector').addEventListener('click', (e) => {
  const pill = e.target.closest('.menu-pill');
  if (!pill) return;
  selectMenu(parseInt(pill.dataset.menuId, 10));
});

// New menu modal
function openNewMenuModal() {
  document.getElementById('newMenuNameInput').value = '';
  document.getElementById('newMenuError').textContent = '';
  document.getElementById('newMenuError').classList.add('hidden');
  document.getElementById('newMenuModal').classList.remove('hidden');
  document.getElementById('newMenuNameInput').focus();
}
function closeNewMenuModal() {
  document.getElementById('newMenuModal').classList.add('hidden');
}

document.getElementById('addMenuBtn').addEventListener('click', openNewMenuModal);
document.getElementById('newMenuCancelBtn').addEventListener('click', closeNewMenuModal);
document.getElementById('newMenuModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('newMenuModal')) closeNewMenuModal();
});
document.getElementById('newMenuForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name  = document.getElementById('newMenuNameInput').value.trim();
  const errEl = document.getElementById('newMenuError');
  if (!name) return;
  const duplicate = allMenus.some(m => m.name.toLowerCase() === name.toLowerCase());
  if (duplicate) {
    errEl.textContent = 'A menu with that name already exists.';
    errEl.classList.remove('hidden');
    return;
  }
  closeNewMenuModal();
  createMenu(name);
});

// Set as Live
document.getElementById('setLiveBtn').addEventListener('click', activateCurrentMenu);

// Delete menu
document.getElementById('deleteMenuBtn').addEventListener('click', deleteCurrentMenu);

// Edit menu modal
function openEditMenuModal() {
  const menu = allMenus.find(m => m.id === currentMenuId);
  if (!menu) return;
  document.getElementById('editMenuNameInput').value = menu.name || '';
  renderEditMenuCategories(menu);
  document.getElementById('editMenuModal').classList.remove('hidden');
}

function closeEditMenuModal() {
  document.getElementById('editMenuModal').classList.add('hidden');
  document.getElementById('editMenuNewCatInput').value = '';
}

document.getElementById('editMenuBtn').addEventListener('click', openEditMenuModal);
document.getElementById('editMenuModalCloseBtn').addEventListener('click', closeEditMenuModal);
document.getElementById('editMenuModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('editMenuModal')) closeEditMenuModal();
});

document.getElementById('editMenuNameSaveBtn').addEventListener('click', async () => {
  const name = document.getElementById('editMenuNameInput').value.trim();
  if (!name) return;
  const res = await fetch(`/api/admin/menus/${currentMenuId}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name })
  });
  if (res.ok) {
    const menu = allMenus.find(m => m.id === currentMenuId);
    if (menu) menu.name = name;
    renderMenuSelector();
  }
});

function editMenuAddCategory() {
  const input = document.getElementById('editMenuNewCatInput');
  addCategory(input.value);
  input.value = '';
}

document.getElementById('editMenuAddCatBtn').addEventListener('click', editMenuAddCategory);
document.getElementById('editMenuNewCatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); editMenuAddCategory(); }
});

// ── HOURS ─────────────────────────────────────

async function loadHours() {
  const res   = await fetch('/api/admin/hours');
  const hours = await res.json();
  _dashHours  = hours; // keep dashboard status in sync
  renderHoursTable(hours);
  loadClosure();
}

async function loadClosure() {
  const res  = await fetch('/api/admin/closure');
  if (!res.ok) return;
  const c    = await res.json();
  const activeEl  = document.getElementById('closureActive');
  const reasonEl  = document.getElementById('closureReason');
  const messageEl = document.getElementById('closureMessage');
  const untilEl   = document.getElementById('closureUntil');
  const saveBtn   = document.getElementById('saveClosureBtn');
  if (!activeEl) return;

  activeEl.checked    = !!c.active;
  reasonEl.value      = c.reason  || 'power_outage';
  messageEl.value     = c.message || '';

  if (c.until) {
    // Convert stored UTC to CST for datetime-local display
    const exp = new Date(c.until);
    const cstParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(exp);
    const p = Object.fromEntries(cstParts.map(x => [x.type, x.value]));
    untilEl.value = `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
  } else {
    untilEl.value = '';
  }

  _updateClosureCardState(!!c.active);
  saveBtn.textContent = c.active ? 'Update Closure' : 'Activate Closure';
}

function _updateClosureCardState(active) {
  const card = document.getElementById('closureCard');
  if (!card) return;
  if (active) {
    card.classList.add('closure-card--active');
  } else {
    card.classList.remove('closure-card--active');
  }
}

document.getElementById('closureActive')?.addEventListener('change', function () {
  _updateClosureCardState(this.checked);
  const saveBtn = document.getElementById('saveClosureBtn');
  if (saveBtn) saveBtn.textContent = this.checked ? 'Activate Closure' : 'Save';
});

document.getElementById('saveClosureBtn')?.addEventListener('click', async () => {
  const payload = {
    active:  document.getElementById('closureActive').checked,
    reason:  document.getElementById('closureReason').value,
    message: document.getElementById('closureMessage').value.trim(),
    until:   _cstInputToIso(document.getElementById('closureUntil').value)
  };
  const res = await fetch('/api/admin/closure', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const msg = document.getElementById('closureMsg');
  if (res.ok) {
    showMsg(msg, payload.active ? '✓ Closure activated' : '✓ Saved');
    document.getElementById('saveClosureBtn').textContent = payload.active ? 'Update Closure' : 'Activate Closure';
  } else {
    showMsg(msg, '✗ Failed', true);
  }
});

document.getElementById('liftClosureBtn')?.addEventListener('click', async () => {
  const res = await fetch('/api/admin/closure', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active: false, until: '' })
  });
  const msg = document.getElementById('closureMsg');
  if (res.ok) {
    document.getElementById('closureActive').checked = false;
    _updateClosureCardState(false);
    document.getElementById('saveClosureBtn').textContent = 'Activate Closure';
    showMsg(msg, '✓ Closure lifted');
  } else {
    showMsg(msg, '✗ Failed', true);
  }
});

const _ADMIN_DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
function _adminRowMatchesToday(daysStr) {
  const today = _ADMIN_DAY_NAMES[new Date().getDay()];
  const s     = daysStr.toLowerCase().trim();
  const abbr  = d => _ADMIN_DAY_NAMES.find(n => n.startsWith(d.trim().slice(0,3)));
  // comma-separated list
  if (s.includes(',')) return s.split(',').map(abbr).includes(today);
  // range with dash/en-dash/em-dash
  const rangeMatch = s.match(/^(\w+)\s*[–—-]\s*(\w+)$/);
  if (rangeMatch) {
    const from = abbr(rangeMatch[1]);
    const to   = abbr(rangeMatch[2]);
    if (!from || !to) return false;
    const fi = _ADMIN_DAY_NAMES.indexOf(from);
    const ti = _ADMIN_DAY_NAMES.indexOf(to);
    const ci = _ADMIN_DAY_NAMES.indexOf(today);
    if (fi <= ti) return ci >= fi && ci <= ti;
    // week-wrap (e.g. Fri–Sun)
    return ci >= fi || ci <= ti;
  }
  // single day
  return abbr(s) === today;
}

function renderHoursTable(hours) {
  const tbody = document.getElementById('hoursTbody');
  tbody.innerHTML = hours.map(row => {
    const isToday = _adminRowMatchesToday(row.days || '');
    return `
    <tr data-id="${row.id}" draggable="true"${isToday ? ' class="hours-row--today"' : ''}>
      <td class="hours-drag-handle" title="Drag to reorder">
        <span class="drag-dots"></span>
      </td>
      <td>${esc(row.days)}</td>
      <td>${esc(row.time_range)}</td>
      <td>
        <div class="action-btns">
          <button class="btn-edit" onclick="editHoursRow(${row.id}, '${esc(row.days)}', '${esc(row.time_range)}')">Edit</button>
          <button class="btn-delete" onclick="deleteHoursRow(${row.id})">Delete</button>
        </div>
      </td>
    </tr>
  `;
  }).join('');
  _initHoursDrag(tbody);
}

function _initHoursDrag(tbody) {
  let dragSrc = null;

  tbody.querySelectorAll('tr[draggable]').forEach(tr => {
    tr.addEventListener('dragstart', e => {
      dragSrc = tr;
      tr.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    tr.addEventListener('dragend', () => {
      tr.classList.remove('dragging');
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over'));
      const order = [...tbody.querySelectorAll('tr[data-id]')].map((r, i) => ({
        id:         parseInt(r.dataset.id, 10),
        sort_order: i
      }));
      fetch('/api/admin/hours/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });
    });
    tr.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (tr !== dragSrc) {
        tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over'));
        tr.classList.add('drag-over');
      }
    });
    tr.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragSrc || dragSrc === tr) return;
      const rows   = [...tbody.querySelectorAll('tr[data-id]')];
      const srcIdx = rows.indexOf(dragSrc);
      const tgtIdx = rows.indexOf(tr);
      if (srcIdx < tgtIdx) tr.after(dragSrc);
      else                  tr.before(dragSrc);
    });
  });
}

function editHoursRow(id, days, timeRange) {
  const tr = document.querySelector(`#hoursTbody tr[data-id="${id}"]`);
  tr.classList.add('editing');
  tr.innerHTML = `
    <td class="hours-drag-handle"><span class="drag-dots"></span></td>
    <td><input data-field="days" value="${days}" /></td>
    <td><input data-field="time_range" value="${timeRange}" /></td>
    <td>
      <div class="action-btns">
        <button class="btn-save" onclick="saveHoursRow(${id})">Save</button>
        <button class="btn-cancel" onclick="loadHours()">Cancel</button>
      </div>
    </td>
  `;
}

async function saveHoursRow(id) {
  const tr      = document.querySelector(`#hoursTbody tr[data-id="${id}"]`);
  const fields  = tr.querySelectorAll('[data-field]');
  const payload = {};
  fields.forEach(f => payload[f.dataset.field] = f.value.trim());

  await fetch(`/api/admin/hours/${id}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload)
  });
  await loadHours();
}

async function deleteHoursRow(id) {
  const ok = await showConfirm({
    title:       'Delete Hours',
    message:     'This hours entry will be permanently removed.',
    confirmText: 'Delete',
    type:        'danger'
  });
  if (!ok) return;
  await fetch(`/api/admin/hours/${id}`, { method: 'DELETE' });
  await loadHours();
}

document.getElementById('addHoursBtn').addEventListener('click', () => {
  const tbody  = document.getElementById('hoursTbody');
  const tempId = 'new-' + Date.now();
  const tr     = document.createElement('tr');
  tr.dataset.id = tempId;
  tr.classList.add('editing');
  tr.innerHTML = `
    <td><input data-field="days" placeholder="e.g. Monday – Friday" /></td>
    <td><input data-field="time_range" placeholder="e.g. 5:00 PM – 10:00 PM" /></td>
    <td>
      <div class="action-btns">
        <button class="btn-save" onclick="saveNewHoursRow(this)">Save</button>
        <button class="btn-cancel" onclick="this.closest('tr').remove()">Cancel</button>
      </div>
    </td>
  `;
  tbody.appendChild(tr);
  tr.querySelector('input').focus();
});

async function saveNewHoursRow(btn) {
  const tr      = btn.closest('tr');
  const fields  = tr.querySelectorAll('[data-field]');
  const payload = {};
  fields.forEach(f => payload[f.dataset.field] = f.value.trim());
  if (!payload.days || !payload.time_range) return;

  await fetch('/api/admin/hours', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload)
  });
  await loadHours();
}

// ── SETTINGS ──────────────────────────────────

let _bannerCountdownInterval = null;

// Convert a "YYYY-MM-DDTHH:MM" string entered in CST to a UTC ISO string
function _cstInputToIso(val) {
  if (!val) return '';
  const [datePart, timePart] = val.split('T');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi]    = timePart.split(':').map(Number);
  // Rough UTC anchor — close enough to determine the CST DST offset
  const roughUtc = new Date(Date.UTC(y, mo - 1, d, h, mi));
  const tzLabel  = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', timeZoneName: 'shortOffset'
  }).formatToParts(roughUtc).find(p => p.type === 'timeZoneName')?.value || 'GMT-6';
  const m = tzLabel.match(/GMT([+-])(\d+)(?::(\d+))?/);
  const offsetMs = m
    ? (m[1] === '+' ? 1 : -1) * (parseInt(m[2]) * 60 + parseInt(m[3] || '0')) * 60000
    : -6 * 3600000;
  return new Date(roughUtc.getTime() - offsetMs).toISOString();
}

function _startBannerCountdown(expiryIso) {
  const box     = document.getElementById('bannerCountdown');
  const timerEl = document.getElementById('bannerCountdownTimer');
  if (_bannerCountdownInterval) clearInterval(_bannerCountdownInterval);
  if (!expiryIso) { box.style.display = 'none'; return; }

  const exp = new Date(expiryIso);

  function _fmt(ms) {
    if (ms <= 0) return 'Expired';
    const totalSec = Math.floor(ms / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  }

  function _tick() {
    const remaining = exp - new Date();
    timerEl.textContent = _fmt(remaining);
    if (remaining <= 0) {
      clearInterval(_bannerCountdownInterval);
      // Banner has expired — reload settings to reflect cleared state
      loadSettings();
    }
  }

  box.style.display = '';
  _tick();
  _bannerCountdownInterval = setInterval(_tick, 1000);
}

async function loadSettings() {
  const res  = await fetch('/api/admin/settings');
  const data = await res.json();
  document.getElementById('s-address').value       = data.address    || '';
  document.getElementById('s-phone').value         = data.phone      || '';
  document.getElementById('s-email').value         = data.email      || '';
  document.getElementById('b-enabled').checked     = !!data.banner_enabled;
  document.getElementById('b-dismissable').checked = data.banner_dismissable !== false; // default true
  document.getElementById('b-text').value          = data.banner_text || '';
  document.getElementById('b-type').value          = data.banner_type || 'info';

  // Expiry
  const expiry     = data.banner_expiry || '';
  const expiryEl   = document.getElementById('b-expiry');
  const expiryHint = document.getElementById('b-expiry-hint');
  // Convert UTC ISO to CST local string for datetime-local input (YYYY-MM-DDTHH:MM)
  if (expiry) {
    const exp = new Date(expiry);
    // Format as YYYY-MM-DDTHH:MM in America/Chicago (CST/CDT)
    const cstParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(exp);
    const p = Object.fromEntries(cstParts.map(x => [x.type, x.value]));
    expiryEl.value = `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`;

    const now = new Date();
    if (exp <= now) {
      expiryHint.textContent = `⚠ Expired — banner was auto-cleared on ${exp.toLocaleString('en-US', { timeZone: 'America/Chicago' })} CST`;
      expiryHint.style.color = 'var(--danger, #e74c3c)';
    } else {
      expiryHint.textContent = `Clears on ${exp.toLocaleString('en-US', { timeZone: 'America/Chicago' })} CST`;
      expiryHint.style.color = 'var(--muted)';
    }
  } else {
    expiryEl.value         = '';
    expiryHint.textContent = '';
  }
  _startBannerCountdown(expiry);

  // Load Toast config (admin only)
  try {
    const tcRes = await fetch('/api/admin/toast/config');
    if (tcRes.ok) {
      const cfg = await tcRes.json();
      document.getElementById('t-apiBaseUrl').value     = cfg.apiBaseUrl     || 'https://ws-api.toasttab.com';
      document.getElementById('t-clientId').value       = cfg.clientId       || '';
      document.getElementById('t-clientSecret').value   = cfg.clientSecret   || '';
      document.getElementById('t-restaurantGuid').value = cfg.restaurantGuid || '';
    }
  } catch (_) { /* non-admin users won't have access */ }
}

document.getElementById('contactForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    address: document.getElementById('s-address').value.trim(),
    phone:   document.getElementById('s-phone').value.trim(),
    email:   document.getElementById('s-email').value.trim()
  };
  const res = await fetch('/api/admin/settings', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const msg = document.getElementById('contactMsg');
  if (res.ok) { showMsg(msg, '✓ Saved'); } else { showMsg(msg, '✗ Save failed', true); }
});

document.getElementById('bannerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const expiryVal = document.getElementById('b-expiry').value;
  const payload = {
    banner_enabled:     document.getElementById('b-enabled').checked,
    banner_dismissable: document.getElementById('b-dismissable').checked,
    banner_text:        document.getElementById('b-text').value.trim(),
    banner_type:        document.getElementById('b-type').value,
    banner_expiry:      _cstInputToIso(expiryVal)
  };
  const res = await fetch('/api/admin/settings', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const msg = document.getElementById('bannerMsg');
  if (res.ok) {
    showMsg(msg, '✓ Saved');
    _startBannerCountdown(payload.banner_expiry);
  } else {
    showMsg(msg, '✗ Save failed', true);
  }
});

document.getElementById('b-clear-expiry').addEventListener('click', async () => {
  document.getElementById('b-expiry').value          = '';
  document.getElementById('b-expiry-hint').textContent = '';
  _startBannerCountdown('');
  const res = await fetch('/api/admin/settings', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ banner_expiry: '' })
  });
  const msg = document.getElementById('bannerMsg');
  if (res.ok) { showMsg(msg, '✓ Expiry cleared'); } else { showMsg(msg, '✗ Failed', true); }
});

document.getElementById('toastConfigForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    apiBaseUrl:     document.getElementById('t-apiBaseUrl').value.trim(),
    clientId:       document.getElementById('t-clientId').value.trim(),
    clientSecret:   document.getElementById('t-clientSecret').value.trim(),
    restaurantGuid: document.getElementById('t-restaurantGuid').value.trim()
  };
  const res = await fetch('/api/admin/toast/config', {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload)
  });
  const msg = document.getElementById('toastConfigMsg');
  if (res.ok) {
    showMsg(msg, '✓ Saved — dashboard will use new credentials');
    document.getElementById('t-clientSecret').value = ''; // clear after save
  } else {
    showMsg(msg, '✗ Save failed', true);
  }
});

// ── USERS ─────────────────────────────────────

let allUsers = [];

async function loadUsers() {
  const res = await fetch('/api/admin/users');
  if (!res.ok) return;
  allUsers = await res.json();
  renderUsersTable();
}

function renderUsersTable() {
  const tbody = document.getElementById('usersTbody');
  const empty = document.getElementById('usersEmpty');

  if (!allUsers.length) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  tbody.innerHTML = allUsers.map(u => {
    const fullName = (u.firstName || u.lastName)
      ? `${u.firstName || ''} ${u.lastName || ''}`.trim()
      : '';
    return `
    <tr data-id="${u.id}">
      <td>
        ${fullName ? `<div>${esc(fullName)}</div><div style="color:var(--muted);font-size:0.82rem">${esc(u.username)}</div>` : esc(u.username)}
      </td>
      <td style="color:var(--muted)">${esc(u.email)}</td>
      <td><span class="role-badge role-badge--${esc(u.role)}" ${roleBadgeStyle(u.role)}>${esc(u.role)}</span></td>
      <td><span class="badge badge--${u.active ? 'active' : 'inactive'}">${u.active ? 'Active' : 'Locked'}</span></td>
      <td>
        <button class="btn-edit" onclick="openManageUserModal(${u.id})">Manage</button>
      </td>
    </tr>
  `; }).join('');
}

// Add user form
document.getElementById('addUserBtn').addEventListener('click', () => {
  document.getElementById('addUserForm').classList.remove('hidden');
  document.getElementById('addUserBtn').classList.add('hidden');
});

document.getElementById('cancelAddUserBtn').addEventListener('click', () => {
  document.getElementById('addUserForm').classList.add('hidden');
  document.getElementById('addUserBtn').classList.remove('hidden');
  document.getElementById('addUserForm').reset();
});

document.getElementById('addUserForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd  = new FormData(e.target);
  const res = await fetch('/api/admin/users', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(Object.fromEntries(fd))
  });
  const msg = document.getElementById('usersMsg');
  if (res.ok) {
    e.target.reset();
    document.getElementById('addUserForm').classList.add('hidden');
    document.getElementById('addUserBtn').classList.remove('hidden');
    await loadUsers();
    showMsg(msg, '✓ User created — they must change password on first login');
  } else {
    const data = await res.json();
    showMsg(msg, data.error || 'Failed to create user', true);
  }
});

// ── MESSAGES ──────────────────────────────────

let allMessages = [];

async function loadMessages() {
  const res = await fetch('/api/admin/messages');
  if (!res.ok) return;
  allMessages = await res.json();
  renderMessages();
  updateUnreadBadge();
}

function updateUnreadBadge() {
  const badge   = document.getElementById('unreadBadge');
  if (!badge) return;
  const unread  = allMessages.filter(m => !m.read).length;
  if (unread > 0) {
    badge.textContent = unread;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function renderMessages() {
  const list  = document.getElementById('messagesList');
  const empty = document.getElementById('messagesEmpty');
  if (!list) return;

  if (!allMessages.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = allMessages.map(m => {
    const date = new Date(m.createdAt).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
    return `
    <div class="msg-card ${m.read ? '' : 'msg-card--unread'}" data-msg-id="${m.id}">
      <div class="msg-card__header">
        <div class="msg-card__from">
          ${!m.read ? '<span class="msg-unread-dot"></span>' : ''}
          <strong>${esc(m.name)}</strong>
          <span class="msg-meta">${esc(m.email)}${m.phone ? ' · ' + esc(m.phone) : ''}</span>
        </div>
        <span class="msg-date">${date}</span>
      </div>
      <p class="msg-body">${esc(m.message)}</p>
      <div class="msg-actions">
        <button class="btn-ghost btn-sm" onclick="toggleMessageRead(${m.id})">${m.read ? 'Mark Unread' : 'Mark as Read'}</button>
        <button class="btn-ghost btn-sm btn-ghost--danger" onclick="deleteMessage(${m.id})">Delete</button>
      </div>
    </div>
  `;
  }).join('');
}

async function toggleMessageRead(id) {
  const res = await fetch(`/api/admin/messages/${id}/read`, { method: 'PUT' });
  if (res.ok) {
    const updated = await res.json();
    const idx = allMessages.findIndex(m => m.id === id);
    if (idx !== -1) allMessages[idx] = updated;
    renderMessages();
    updateUnreadBadge();
  }
}

async function deleteMessage(id) {
  const ok = await showConfirm({
    title:       'Delete Message',
    message:     'This message will be permanently deleted.',
    confirmText: 'Delete',
    type:        'danger'
  });
  if (!ok) return;
  const res = await fetch(`/api/admin/messages/${id}`, { method: 'DELETE' });
  if (res.ok) {
    allMessages = allMessages.filter(m => m.id !== id);
    renderMessages();
    updateUnreadBadge();
  }
}

// ── ABOUT PAGE ────────────────────────────────

async function loadAboutPage() {
  const res = await fetch('/api/admin/about-page');
  const d   = await res.json();
  document.getElementById('ap-headline').value      = d.headline       || '';
  document.getElementById('ap-tagline').value       = d.tagline        || '';
  document.getElementById('ap-overview').value      = d.overview       || '';
  document.getElementById('ap-overview-img').value  = d.overview_image || '';
}

document.getElementById('aboutPageForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd  = new FormData(e.target);
  const res = await fetch('/api/admin/about-page', {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(Object.fromEntries(fd))
  });
  const msg = document.getElementById('aboutPageMsg');
  if (res.ok) {
    showMsg(msg, '✓ Saved successfully');
  } else {
    showMsg(msg, '✗ Save failed', true);
  }
});

// ── TEAM MEMBERS ──────────────────────────────

let allTeam = [];

async function loadTeam() {
  const res = await fetch('/api/admin/team');
  allTeam   = await res.json();
  renderTeamTable();
}

function renderTeamTable() {
  const tbody = document.getElementById('teamTbody');
  const empty = document.getElementById('teamEmpty');

  if (!allTeam.length) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  tbody.innerHTML = allTeam.map(m => `
    <tr data-id="${m.id}">
      <td>${esc(m.name)}</td>
      <td style="color:var(--muted)">${esc(m.role)}</td>
      <td>${m.image_url
        ? `<img src="${esc(m.image_url)}" alt="${esc(m.name)}" style="width:48px;height:48px;object-fit:cover;border-radius:4px;" onerror="this.replaceWith(document.createTextNode('—'))">`
        : '—'}</td>
      <td style="color:var(--muted);font-size:0.83rem">${esc(m.blurb).substring(0, 80)}${m.blurb.length > 80 ? '…' : ''}</td>
      <td>
        <div class="action-btns">
          <button class="btn-edit" onclick="editTeamRow(${m.id})">Edit</button>
          <button class="btn-delete" onclick="deleteTeamMember(${m.id})">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function editTeamRow(id) {
  const m = allTeam.find(x => x.id === id);
  if (!m) return;
  const tr = document.querySelector(`#teamTbody tr[data-id="${id}"]`);
  tr.classList.add('editing');
  tr.innerHTML = `
    <td><input data-field="name" value="${esc(m.name)}" placeholder="Full name" /></td>
    <td><input data-field="role" value="${esc(m.role)}" placeholder="e.g. Head Chef" /></td>
    <td><input data-field="image_url" value="${esc(m.image_url)}" placeholder="https://..." style="width:120px" /></td>
    <td><textarea data-field="blurb" rows="3" style="width:100%">${esc(m.blurb)}</textarea></td>
    <td>
      <div class="action-btns">
        <button class="btn-save" onclick="saveTeamRow(${id})">Save</button>
        <button class="btn-cancel" onclick="renderTeamTable()">Cancel</button>
      </div>
    </td>
  `;
}

async function saveTeamRow(id) {
  const tr      = document.querySelector(`#teamTbody tr[data-id="${id}"]`);
  const fields  = tr.querySelectorAll('[data-field]');
  const payload = {};
  fields.forEach(f => payload[f.dataset.field] = f.value.trim());

  const res = await fetch(`/api/admin/team/${id}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload)
  });
  if (res.ok) await loadTeam();
}

async function deleteTeamMember(id) {
  const ok = await showConfirm({
    title:       'Remove Team Member',
    message:     'This person will be removed from the About page team section.',
    confirmText: 'Remove',
    type:        'danger'
  });
  if (!ok) return;
  await fetch(`/api/admin/team/${id}`, { method: 'DELETE' });
  await loadTeam();
}

document.getElementById('addTeamMemberBtn').addEventListener('click', () => {
  const tbody  = document.getElementById('teamTbody');
  const tempId = 'new-' + Date.now();
  const tr     = document.createElement('tr');
  tr.dataset.id = tempId;
  tr.classList.add('editing');
  tr.innerHTML = `
    <td><input data-field="name" placeholder="Full name" /></td>
    <td><input data-field="role" placeholder="e.g. Head Chef" /></td>
    <td><input data-field="image_url" placeholder="https://..." style="width:120px" /></td>
    <td><textarea data-field="blurb" rows="3" style="width:100%" placeholder="Brief bio..."></textarea></td>
    <td>
      <div class="action-btns">
        <button class="btn-save" onclick="saveNewTeamMember(this)">Save</button>
        <button class="btn-cancel" onclick="this.closest('tr').remove()">Cancel</button>
      </div>
    </td>
  `;
  document.getElementById('teamEmpty').classList.add('hidden');
  tbody.appendChild(tr);
  tr.querySelector('input').focus();
});

async function saveNewTeamMember(btn) {
  const tr      = btn.closest('tr');
  const fields  = tr.querySelectorAll('[data-field]');
  const payload = {};
  fields.forEach(f => payload[f.dataset.field] = f.value.trim());
  if (!payload.name || !payload.role) return;

  await fetch('/api/admin/team', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload)
  });
  await loadTeam();
}

// ── ROLES ──────────────────────────────────────

let allRoles = [];
const ROLE_PERMISSION_PANELS = ['menu', 'hours', 'settings', 'about', 'messages', 'events', 'users', 'roles', 'security'];
const ROLE_PERMISSION_LABELS = {
  menu: 'Menu Items',
  hours: 'Hours',
  settings: 'Settings',
  about: 'About Page',
  messages: 'Messages',
  users: 'Users',
  roles: 'Roles',
  security: 'Security'
};

async function loadRoles() {
  const res = await fetch('/api/admin/roles');
  if (!res.ok) return;
  allRoles = await res.json();
  refreshSidebarRoleBadge();
  renderRolesTable();
  populateRoleDropdown();
  if (allUsers.length) renderUsersTable();
}

function renderRolesTable() {
  const tbody = document.getElementById('rolesTbody');
  const empty = document.getElementById('rolesEmpty');
  if (!tbody) return;

  tbody.innerHTML = allRoles.map(role => {
    const color = role.color || '#9a9088';
    return `
    <tr data-role-id="${role.id}">
      <td>
        <span class="role-badge" ${roleBadgeStyle(role.name)}>${esc(role.name)}</span>
        ${role.isSystemAdmin ? '<span class="badge-sysadmin">SYS ADMIN</span>' : ''}
      </td>
      <td class="role-desc-cell">${esc(role.description)}</td>
      <td>
        <div class="color-swatch-wrap">
          <input type="color" class="color-swatch" value="${color}"
            onchange="saveRoleColor(${role.id}, this.value)"
            title="Change badge color" />
        </div>
      </td>
      <td>
        <div class="action-btns">
          <button class="btn-edit" onclick="openRoleEditModal(${role.id})">Edit</button>
          <button class="btn-delete" onclick="deleteRole(${role.id})">Delete</button>
        </div>
      </td>
    </tr>
  `;
  }).join('');

  empty.classList.toggle('hidden', allRoles.length > 0);
}

async function saveRoleColor(roleId, color) {
  await fetch(`/api/admin/roles/${roleId}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ color })
  });
  const role = allRoles.find(r => r.id === roleId);
  if (role) {
    role.color = color;
    renderRolesTable();
    refreshSidebarRoleBadge();
    if (allUsers.length) renderUsersTable();
  }
}

// ── Edit Permissions Modal ────────────────────
let editingRoleId = null;

function openRoleEditModal(roleId) {
  const role = allRoles.find(r => r.id === roleId);
  if (!role) return;
  editingRoleId = roleId;

  document.getElementById('editRoleModalTitle').textContent = `Edit Permissions — ${role.name}`;
  document.getElementById('editRoleModalSub').textContent   = role.description || '';
  document.getElementById('editRoleError').textContent      = '';

  const sysAdminChk = document.getElementById('roleIsSystemAdmin');
  sysAdminChk.checked = !!role.isSystemAdmin;

  const LABELS = { hidden: 'None', view: 'View', full: 'Edit' };

  document.getElementById('editRolePermsGrid').innerHTML = ROLE_PERMISSION_PANELS.map(p => `
    <div class="role-perm-row">
      <span class="role-perm-label">${ROLE_PERMISSION_LABELS[p]}</span>
      <div class="role-perm-options">
        ${['hidden', 'view', 'full'].map(lv => `
          <label class="perm-radio">
            <input type="radio" name="perm-${p}" value="${lv}" ${(role.permissions[p] ?? 'hidden') === lv ? 'checked' : ''} />
            <span>${LABELS[lv]}</span>
          </label>
        `).join('')}
      </div>
    </div>
  `).join('');

  _applySystemAdminLock(sysAdminChk.checked);
  document.getElementById('editRoleModal').classList.remove('hidden');
}

function _applySystemAdminLock(isLocked) {
  document.querySelectorAll('#editRolePermsGrid input[type="radio"]').forEach(r => {
    if (isLocked) {
      // Force all to 'full' and disable
      if (r.value === 'full') r.checked = true;
      r.disabled = true;
    } else {
      r.disabled = false;
    }
  });
  document.getElementById('editRolePermsGrid').classList.toggle('role-perms-grid--locked', isLocked);
}

document.getElementById('roleIsSystemAdmin')?.addEventListener('change', function () {
  _applySystemAdminLock(this.checked);
});

async function saveRolePermissions() {
  const isSystemAdmin = document.getElementById('roleIsSystemAdmin').checked;
  const permissions   = {};
  ROLE_PERMISSION_PANELS.forEach(p => {
    const checked = document.querySelector(`input[name="perm-${p}"]:checked`);
    permissions[p] = checked ? checked.value : 'hidden';
  });

  const res = await fetch(`/api/admin/roles/${editingRoleId}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ isSystemAdmin, permissions })
  });
  const msg = document.getElementById('rolesMsg');
  if (res.ok) {
    document.getElementById('editRoleModal').classList.add('hidden');
    showMsg(msg, '✓ Saved');
    await loadRoles();
  } else {
    const data = await res.json();
    document.getElementById('editRoleError').textContent = data.error || 'Failed to save';
  }
}

document.getElementById('editRoleSaveBtn')?.addEventListener('click', saveRolePermissions);
document.getElementById('editRoleCancelBtn')?.addEventListener('click', () => {
  document.getElementById('editRoleModal').classList.add('hidden');
});
document.getElementById('editRoleModal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});

async function deleteRole(roleId) {
  const ok = await showConfirm({
    title:       'Delete Role',
    message:     'This role will be permanently deleted and can no longer be assigned to users.',
    confirmText: 'Delete Role',
    type:        'danger'
  });
  if (!ok) return;
  const res = await fetch(`/api/admin/roles/${roleId}`, { method: 'DELETE' });
  const msg = document.getElementById('rolesMsg');
  if (res.ok) {
    await loadRoles();
  } else {
    const data = await res.json();
    showMsg(msg, data.error || 'Failed to delete role', true);
  }
}

function populateRoleDropdown() {
  const sel = document.querySelector('#addUserForm select[name="role"]');
  if (!sel) return;
  sel.innerHTML = [
    ...allRoles.map(r => `<option value="${esc(r.name)}">${esc(r.name)}</option>`),
    `<option value="admin">admin</option>`
  ].join('');
}

document.getElementById('addRoleBtn')?.addEventListener('click', () => {
  document.getElementById('addRoleForm').classList.remove('hidden');
});

document.getElementById('cancelAddRoleBtn')?.addEventListener('click', () => {
  document.getElementById('addRoleForm').classList.add('hidden');
  document.getElementById('addRoleForm').reset();
});

document.getElementById('addRoleForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd  = new FormData(e.target);
  const res = await fetch('/api/admin/roles', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name: fd.get('name').trim(), description: fd.get('description').trim() })
  });
  const msg = document.getElementById('rolesMsg');
  if (res.ok) {
    e.target.reset();
    document.getElementById('addRoleForm').classList.add('hidden');
    await loadRoles();
    showMsg(msg, '✓ Role created');
  } else {
    const data = await res.json();
    showMsg(msg, data.error || 'Failed to create role', true);
  }
});

// ── SECURITY / AUDIT LOG ───────────────────────

let allLogs     = [];
let logSortCol  = 'timestamp';
let logSortDir  = 'desc';

const LOG_ACTION_COLORS = {
  'auth':     '#4a9eff',
  'user':     '#c9a84c',
  'menu':     '#2ecc71',
  'hours':    '#27ae8f',
  'settings': '#9b59b6',
  'about':    '#e67e22',
  'team':     '#e67e22',
  'role':     '#c9a84c',
  'messages': '#27ae8f',
  'security': '#e74c3c',
};

function logActionColor(action) {
  const prefix = action.split('.')[0];
  return LOG_ACTION_COLORS[prefix] || '#9a9088';
}

function logActionLabel(action) {
  return action.replace('.', ' › ').replace(/_/g, ' ');
}

async function loadLogs() {
  const res = await fetch('/api/admin/logs');
  if (!res.ok) return;
  allLogs = await res.json();
  renderLogs();
}

function renderLogs(filter) {
  const tbody = document.getElementById('logsTbody');
  const empty = document.getElementById('logsEmpty');
  if (!tbody) return;

  const query = (filter ?? document.getElementById('logSearch')?.value ?? '').toLowerCase();
  let logs = query
    ? allLogs.filter(l =>
        (l.username || '').toLowerCase().includes(query) ||
        (l.action   || '').toLowerCase().includes(query) ||
        (l.details  || '').toLowerCase().includes(query) ||
        (l.ip       || '').toLowerCase().includes(query)
      )
    : [...allLogs];

  // ── Sort ──────────────────────────────────────
  logs.sort((a, b) => {
    const va = (a[logSortCol] || '').toString().toLowerCase();
    const vb = (b[logSortCol] || '').toString().toLowerCase();
    if (va < vb) return logSortDir === 'asc' ? -1 : 1;
    if (va > vb) return logSortDir === 'asc' ?  1 : -1;
    return 0;
  });

  // ── Update sort icons ─────────────────────────
  document.querySelectorAll('#panel-security .th-sort').forEach(th => {
    th.querySelector('.sort-icon').textContent =
      th.dataset.sort === logSortCol ? (logSortDir === 'asc' ? ' ▲' : ' ▼') : '';
  });

  empty.classList.toggle('hidden', logs.length > 0);

  tbody.innerHTML = logs.map(l => {
    const dt     = new Date(l.timestamp);
    const dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    const color  = logActionColor(l.action);
    return `
      <tr>
        <td class="log-ts"><span>${dateStr}</span><span class="log-time">${timeStr}</span></td>
        <td><strong>${esc(l.username || '—')}</strong></td>
        <td><span class="role-badge" style="background:rgba(154,144,136,0.15);color:#9a9088;border:1px solid rgba(154,144,136,0.25)">${esc(l.role || '—')}</span></td>
        <td class="log-ip">${esc(l.ip || '—')}</td>
        <td><span class="log-action-badge" style="background:${color}22;color:${color};border:1px solid ${color}44">${logActionLabel(l.action)}</span></td>
        <td class="log-details">${esc(l.details || '')}</td>
      </tr>
    `;
  }).join('');
}

document.getElementById('logSearch')?.addEventListener('input', e => renderLogs(e.target.value));

document.querySelector('#panel-security .data-table thead')?.addEventListener('click', (e) => {
  const th = e.target.closest('.th-sort');
  if (!th) return;
  const col = th.dataset.sort;
  if (logSortCol === col) {
    logSortDir = logSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    logSortCol = col;
    logSortDir = 'asc';
  }
  renderLogs();
});

document.getElementById('clearLogsBtn')?.addEventListener('click', async () => {
  const ok = await showConfirm({
    title:       'Clear Audit Log',
    message:     'All log entries will be permanently deleted. This action cannot be undone.',
    confirmText: 'Clear All',
    type:        'danger'
  });
  if (!ok) return;
  const res = await fetch('/api/admin/logs', { method: 'DELETE' });
  const msg = document.getElementById('securityMsg');
  if (res.ok) {
    allLogs = [];
    renderLogs();
    showMsg(msg, '✓ Log cleared');
  } else {
    showMsg(msg, '✗ Failed to clear log', true);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// EVENTS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

let _allEvents = [];

async function loadEvents() {
  const res = await fetch('/api/admin/events');
  if (!res.ok) return;
  _allEvents = await res.json();
  renderEventsTable(_allEvents);
}

function renderEventsTable(events) {
  const tbody = document.getElementById('eventsTbody');
  if (!tbody) return;
  if (events.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:2rem">No events yet. Click &ldquo;+ Add Event&rdquo; to create one.</td></tr>';
    return;
  }
  tbody.innerHTML = events.map(ev => {
    const d = new Date(ev.date + 'T12:00:00');
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = [ev.startTime, ev.endTime].filter(Boolean).join(' – ') || '—';
    return `
    <tr data-id="${ev.id}" class="${ev.cancelled ? 'ev-row--cancelled' : ''}">
      <td style="white-space:nowrap">${esc(dateStr)}</td>
      <td>
        ${ev.image ? '<img src="' + esc(ev.image) + '" style="width:36px;height:36px;object-fit:cover;border-radius:4px;margin-right:8px;vertical-align:middle;opacity:' + (ev.cancelled ? '0.4' : '1') + '" />' : ''}
        ${esc(ev.title)}
      </td>
      <td style="font-size:0.82rem;color:var(--muted)">${esc(timeStr)}</td>
      <td>${ev.featured ? '<span class="ev-featured-badge">&#9733; Yes</span>' : '<span style="color:var(--muted);font-size:0.8rem">—</span>'}</td>
      <td>${ev.cancelled ? '<span class="ev-cancelled-badge">&#10005; Yes</span>' : '<span style="color:var(--muted);font-size:0.8rem">—</span>'}</td>
      <td style="text-align:right">
        <div class="action-btns" style="justify-content:flex-end">
          <button class="btn-edit" onclick="openEventModal(${ev.id})">Edit</button>
          <button class="btn-delete" onclick="deleteEvent(${ev.id})">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── Modal open/close ──────────────────────────────────────────────────────
function openEventModal(id) {
  const ev = id != null ? _allEvents.find(e => e.id === id) : null;
  document.getElementById('evModalTitle').textContent = ev ? 'Edit Event' : 'Add Event';
  document.getElementById('evId').value        = ev ? ev.id : '';
  document.getElementById('evTitle').value     = ev ? ev.title       : '';
  document.getElementById('evDate').value      = ev ? ev.date        : '';
  document.getElementById('evStartTime').value = ev ? _timeToInput(ev.startTime) : '';
  document.getElementById('evEndTime').value   = ev ? _timeToInput(ev.endTime)   : '';
  document.getElementById('evDesc').value      = ev ? ev.description : '';
  document.getElementById('evFeatured').checked   = !!(ev && ev.featured);
  document.getElementById('evCancelled').checked  = !!(ev && ev.cancelled);
  document.getElementById('evSaveMsg').textContent = '';

  // Image preview
  _evImgUrl = ev ? ev.image : '';
  _refreshImgPreview();

  document.getElementById('evModalBackdrop').classList.remove('hidden');
  document.getElementById('evTitle').focus();
}

function closeEventModal() {
  document.getElementById('evModalBackdrop').classList.add('hidden');
  _evImgUrl = '';
}

// ── Image handling ────────────────────────────────────────────────────────
let _evImgUrl = ''; // URL path to uploaded file on server

function _refreshImgPreview() {
  const preview = document.getElementById('evImgPreview');
  const label   = document.getElementById('evImgLabel');
  const img     = document.getElementById('evImgPreviewImg');
  if (_evImgUrl) {
    img.src = _evImgUrl;
    preview.style.display = 'block';
    label.style.display   = 'none';
  } else {
    preview.style.display = 'none';
    label.style.display   = '';
  }
}

document.getElementById('evImage').addEventListener('change', async function () {
  const file = this.files[0];
  if (!file) return;
  const label = document.getElementById('evImgLabel');
  label.style.opacity = '0.5';
  const form = new FormData();
  form.append('image', file);
  const res = await fetch('/api/admin/upload/event-image', { method: 'POST', body: form });
  label.style.opacity = '';
  if (res.ok) {
    const data = await res.json();
    _evImgUrl = data.url;
    _refreshImgPreview();
  }
  this.value = '';
});

document.getElementById('evImgRemove').addEventListener('click', () => {
  _evImgUrl = '';
  _refreshImgPreview();
});

// ── Save ──────────────────────────────────────────────────────────────────
document.getElementById('evModalSave').addEventListener('click', async () => {
  const id    = document.getElementById('evId').value;
  const title = document.getElementById('evTitle').value.trim();
  const date  = document.getElementById('evDate').value;
  const msg   = document.getElementById('evSaveMsg');

  if (!title || !date) {
    msg.textContent = 'Title and date are required.';
    msg.style.color = '#e87060';
    return;
  }

  const payload = {
    title,
    date,
    startTime:   _inputToTime(document.getElementById('evStartTime').value),
    endTime:     _inputToTime(document.getElementById('evEndTime').value),
    description: document.getElementById('evDesc').value.trim(),
    image:       _evImgUrl,
    featured:    document.getElementById('evFeatured').checked,
    cancelled:   document.getElementById('evCancelled').checked
  };

  const url    = id ? '/api/admin/events/' + id : '/api/admin/events';
  const method = id ? 'PUT' : 'POST';
  const res    = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    closeEventModal();
    loadEvents();
  } else {
    msg.textContent = 'Failed to save.';
    msg.style.color = '#e87060';
  }
});

async function deleteEvent(id) {
  if (!confirm('Delete this event?')) return;
  const res = await fetch('/api/admin/events/' + id, { method: 'DELETE' });
  if (res.ok) loadEvents();
}

// ── Time helpers: HH:MM ↔ "7:00 PM" ─────────────────────────────────────
function _timeToInput(str) {
  if (!str) return '';
  const m = str.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return '';
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return String(h).padStart(2,'0') + ':' + min;
}

function _inputToTime(val) {
  if (!val) return '';
  const [h, m] = val.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return h12 + ':' + String(m).padStart(2,'0') + ' ' + ampm;
}

// ── Wire up modal buttons + Add button ───────────────────────────────────
document.getElementById('addEventBtn').addEventListener('click', () => openEventModal(null));
document.getElementById('evModalClose').addEventListener('click', closeEventModal);
document.getElementById('evModalCancel').addEventListener('click', closeEventModal);
document.getElementById('evModalBackdrop').addEventListener('click', function (e) {
  if (e.target === this) closeEventModal();
});
