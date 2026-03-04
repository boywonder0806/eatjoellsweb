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

    if (canView('menu'))     loadMenus();
    if (canView('hours'))    loadHours();
    if (canView('settings')) loadSettings();
    if (canView('users'))    loadUsers();
    if (canView('about'))  { loadAboutPage(); loadTeam(); }
    if (canView('messages')) loadMessages();
    loadRoles(); // always load for badge colors; management UI only visible to admin
  })
  .catch(() => window.location.href = '/admin/login');

// ── Role gating ──────────────────────────────
function applyRoleGating(data) {
  const PANELS  = ['menu', 'hours', 'settings', 'about', 'messages', 'users', 'roles'];
  const isAdmin = data.role === 'admin';
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

    // Hide the "Admin" sidebar section label if both users and roles are hidden
    const adminPanels = ['users', 'roles'];
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
    document.getElementById('panel-' + btn.dataset.panel).classList.add('active');
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
let currentMenuId = null;
let allMenuItems  = [];
let activeCat     = 'all';
let menuSortCol   = null;
let menuSortDir   = 'asc';

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
  const isAdmin = currentUser?.role === 'admin';
  const setLiveBtn    = document.getElementById('setLiveBtn');
  const deleteMenuBtn = document.getElementById('deleteMenuBtn');
  if (setLiveBtn)    setLiveBtn.style.display    = (menu && !menu.active && isAdmin) ? '' : 'none';
  if (deleteMenuBtn) deleteMenuBtn.style.display = (allMenus.length > 1 && isAdmin)  ? '' : 'none';
  renderCategoryBar(menu);
  activeCat = 'all';
  await loadMenuItems(id);
}

function renderCategoryBar(menu) {
  const catTagsEl   = document.getElementById('catTags');
  const catTabsEl   = document.getElementById('catTabs');
  const catSelectEl = document.getElementById('addItemCategory');
  const cats        = menu ? (menu.categories || []) : [];
  const isAdmin     = currentUser?.role === 'admin';
  const cap         = s => s.charAt(0).toUpperCase() + s.slice(1);

  if (catTagsEl) {
    catTagsEl.innerHTML = cats.length
      ? cats.map(cat => `
          <span class="cat-chip">
            ${esc(cap(cat))}
            ${isAdmin ? `<button class="cat-chip__remove" onclick="removeCategory('${esc(cat)}')" title="Remove">×</button>` : ''}
          </span>`).join('')
      : '<span class="cat-empty-hint">No categories yet.</span>';
  }

  if (catTabsEl) {
    catTabsEl.innerHTML = '<button class="cat-tab active" data-cat="all">All</button>' +
      cats.map(cat => `<button class="cat-tab" data-cat="${esc(cat)}">${esc(cap(cat))}</button>`).join('');
  }

  if (catSelectEl) {
    catSelectEl.innerHTML = cats.length
      ? cats.map(cat => `<option value="${esc(cat)}">${esc(cap(cat))}</option>`).join('')
      : '<option value="" disabled selected>Add a category first</option>';
  }
}

async function loadMenuItems(menuId) {
  const res = await fetch(`/api/admin/menus/${menuId}/items`);
  if (!res.ok) return;
  allMenuItems = await res.json();
  renderMenuTable();
}

function renderMenuTable() {
  const tbody = document.getElementById('menuTbody');
  const empty = document.getElementById('menuEmpty');
  let items = activeCat === 'all'
    ? [...allMenuItems]
    : allMenuItems.filter(i => i.category === activeCat);

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
    return;
  }
  empty.classList.add('hidden');

  tbody.innerHTML = items.map(item => `
    <tr data-id="${item.id}"${item.available === false ? ' style="opacity:0.6"' : ''}>
      <td><span class="badge badge--${esc(item.category)}">${esc(item.category)}</span></td>
      <td${item.available === false ? ' style="text-decoration:line-through;color:var(--muted)"' : ''}>${esc(item.name)}</td>
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
          <button class="btn-edit" onclick="editMenuRow(${item.id})">Edit</button>
          <button class="btn-delete" onclick="deleteMenuItem(${item.id})">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function editMenuRow(id) {
  const item = allMenuItems.find(i => i.id === id);
  if (!item) return;
  const menu = allMenus.find(m => m.id === currentMenuId);
  const cats = menu ? menu.categories : [];
  const tr   = document.querySelector(`#menuTbody tr[data-id="${id}"]`);
  tr.classList.add('editing');
  tr.innerHTML = `
    <td>
      <select data-field="category">
        ${cats.map(c => `<option value="${c}" ${item.category === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
    </td>
    <td><input data-field="name" value="${esc(item.name)}" /></td>
    <td><input data-field="description" value="${esc(item.description)}" /></td>
    <td><input data-field="price" value="${esc(item.price)}" style="width:90px" /></td>
    <td></td>
    <td>
      <div class="action-btns">
        <button class="btn-save" onclick="saveMenuRow(${id})">Save</button>
        <button class="btn-cancel" onclick="renderMenuTable()">Cancel</button>
      </div>
    </td>
  `;
}

async function saveMenuRow(id) {
  const tr      = document.querySelector(`#menuTbody tr[data-id="${id}"]`);
  const fields  = tr.querySelectorAll('[data-field]');
  const payload = {};
  fields.forEach(f => payload[f.dataset.field] = f.value.trim());
  const res = await fetch(`/api/admin/menus/${currentMenuId}/items/${id}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload)
  });
  if (res.ok) await loadMenuItems(currentMenuId);
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
    if (activeCat === catName) activeCat = 'all';
    renderCategoryBar(menu);
    renderMenuTable();
  }
}

// ── Add item form ─────────────────────────────

document.getElementById('addItemBtn').addEventListener('click', () => {
  document.getElementById('addItemForm').classList.remove('hidden');
  document.getElementById('addItemBtn').classList.add('hidden');
});

document.getElementById('cancelAddBtn').addEventListener('click', () => {
  document.getElementById('addItemForm').classList.add('hidden');
  document.getElementById('addItemBtn').classList.remove('hidden');
  document.getElementById('addItemForm').reset();
});

document.getElementById('addItemForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd  = new FormData(e.target);
  const res = await fetch(`/api/admin/menus/${currentMenuId}/items`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(Object.fromEntries(fd))
  });
  if (res.ok) {
    e.target.reset();
    document.getElementById('addItemForm').classList.add('hidden');
    document.getElementById('addItemBtn').classList.remove('hidden');
    // Re-populate category select after reset
    const menu = allMenus.find(m => m.id === currentMenuId);
    if (menu) renderCategoryBar(menu);
    await loadMenuItems(currentMenuId);
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
  renderMenuTable();
});

// Category filter tabs (event delegation)
document.getElementById('catTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.cat-tab');
  if (!btn) return;
  document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeCat = btn.dataset.cat;
  renderMenuTable();
});

// Menu selector pills (event delegation)
document.getElementById('menuSelector').addEventListener('click', (e) => {
  const pill = e.target.closest('.menu-pill');
  if (!pill) return;
  selectMenu(parseInt(pill.dataset.menuId, 10));
});

// New menu
document.getElementById('addMenuBtn').addEventListener('click', () => {
  const name = prompt('Enter a name for the new menu:');
  if (name && name.trim()) createMenu(name.trim());
});

// Set as Live
document.getElementById('setLiveBtn').addEventListener('click', activateCurrentMenu);

// Delete menu
document.getElementById('deleteMenuBtn').addEventListener('click', deleteCurrentMenu);

// Add category
document.getElementById('addCatBtn').addEventListener('click', () => {
  const input = document.getElementById('newCatInput');
  addCategory(input.value);
  input.value = '';
});

document.getElementById('newCatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const input = document.getElementById('newCatInput');
    addCategory(input.value);
    input.value = '';
  }
});

// ── HOURS ─────────────────────────────────────

async function loadHours() {
  const res   = await fetch('/api/admin/hours');
  const hours = await res.json();
  renderHoursTable(hours);
}

function renderHoursTable(hours) {
  const tbody = document.getElementById('hoursTbody');
  tbody.innerHTML = hours.map(row => `
    <tr data-id="${row.id}">
      <td>${esc(row.days)}</td>
      <td>${esc(row.time_range)}</td>
      <td>
        <div class="action-btns">
          <button class="btn-edit" onclick="editHoursRow(${row.id}, '${esc(row.days)}', '${esc(row.time_range)}')">Edit</button>
          <button class="btn-delete" onclick="deleteHoursRow(${row.id})">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function editHoursRow(id, days, timeRange) {
  const tr = document.querySelector(`#hoursTbody tr[data-id="${id}"]`);
  tr.classList.add('editing');
  tr.innerHTML = `
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

async function loadSettings() {
  const res  = await fetch('/api/admin/settings');
  const data = await res.json();
  document.getElementById('s-address').value = data.address || '';
  document.getElementById('s-phone').value   = data.phone   || '';
  document.getElementById('s-email').value   = data.email   || '';
}

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd  = new FormData(e.target);
  const res = await fetch('/api/admin/settings', {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(Object.fromEntries(fd))
  });
  const msg = document.getElementById('settingsMsg');
  if (res.ok) {
    showMsg(msg, '✓ Saved successfully');
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
      <td><span class="role-badge" ${roleBadgeStyle(role.name)}>${esc(role.name)}</span></td>
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

  const PANELS = ['menu', 'hours', 'settings', 'about', 'messages', 'users', 'roles'];
  const LABELS = { hidden: 'None', view: 'View', full: 'Edit' };
  const PANEL_LABELS = { menu: 'Menu Items', hours: 'Hours', settings: 'Settings', about: 'About Page', messages: 'Messages', users: 'Users', roles: 'Roles' };

  document.getElementById('editRolePermsGrid').innerHTML = PANELS.map(p => `
    <div class="role-perm-row">
      <span class="role-perm-label">${PANEL_LABELS[p]}</span>
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

  document.getElementById('editRoleModal').classList.remove('hidden');
}

async function saveRolePermissions() {
  const PANELS = ['menu', 'hours', 'settings', 'about', 'users', 'roles'];
  const permissions = {};
  PANELS.forEach(p => {
    const checked = document.querySelector(`input[name="perm-${p}"]:checked`);
    permissions[p] = checked ? checked.value : 'hidden';
  });

  const res = await fetch(`/api/admin/roles/${editingRoleId}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ permissions })
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
