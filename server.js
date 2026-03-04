const express = require('express');
const session = require('express-session');
const bcrypt  = require('bcryptjs');
const path    = require('path');
const { readData, writeData } = require('./db/store');

const app = express();

// ── First-run / migration setup ────────────────────────────────────────────
(function init() {
  const data = readData();
  if (data.admin) {
    // Migrate legacy single-admin format → users array
    const hash = data.admin.passwordHash || bcrypt.hashSync('joelles2026', 10);
    data.users = [{
      id:                1,
      username:          data.admin.username || 'admin',
      email:             'admin@joelleslounge.com',
      role:              'admin',
      passwordHash:      hash,
      active:            true,
      mustChangePassword: false,
      createdAt:         new Date().toISOString()
    }];
    delete data.admin;
    writeData(data);
    console.log('✓ Migrated to multi-user system. Existing admin password preserved.');
  } else if (!data.users) {
    data.users = [{
      id:                1,
      username:          'admin',
      email:             'admin@joelleslounge.com',
      role:              'admin',
      passwordHash:      bcrypt.hashSync('joelles2026', 10),
      active:            true,
      mustChangePassword: false,
      createdAt:         new Date().toISOString()
    }];
    writeData(data);
    console.log('✓ Admin account initialised. Login: admin / joelles2026');
  }

  // ── Multi-menu migration ──────────────────────────────────────────────────
  if (!data.menus) {
    data.menus = [{
      id:         1,
      name:       'Regular Menu',
      categories: ['starters', 'mains', 'desserts', 'drinks'],
      items:      data.menu || []
    }];
    data.active_menu_id = 1;
    delete data.menu;
    writeData(data);
    console.log('✓ Migrated to multi-menu system.');
  }

  // ── User profile fields migration ────────────────────────────────────────
  const dataP = readData();
  let profileMigrated = false;
  (dataP.users || []).forEach(u => {
    if (u.firstName     === undefined) { u.firstName     = ''; profileMigrated = true; }
    if (u.lastName      === undefined) { u.lastName      = ''; profileMigrated = true; }
    if (u.phone         === undefined) { u.phone         = ''; profileMigrated = true; }
    if (u.profilePicture === undefined) { u.profilePicture = ''; profileMigrated = true; }
  });
  if (profileMigrated) { writeData(dataP); console.log('✓ User profile fields added.'); }

  // ── Roles migration ───────────────────────────────────────────────────────
  const data2 = readData();
  if (!data2.roles) {
    data2.roles = [{
      id:          1,
      name:        'manager',
      description: 'Restaurant manager with limited admin access',
      color:       '#7b8fa1',
      permissions: {
        menu: 'full', hours: 'full',
        settings: 'view', about: 'view',
        users: 'hidden', roles: 'hidden',
        messages: 'view'
      }
    }];
    writeData(data2);
    console.log('✓ Roles system initialised.');
  } else {
    // Add color field to any existing roles that don't have one
    let roleMigrated = false;
    (data2.roles || []).forEach(r => {
      if (r.color === undefined) { r.color = '#9a9088'; roleMigrated = true; }
    });
    if (roleMigrated) { writeData(data2); console.log('✓ Role fields migrated.'); }
  }

  // ── Messages migration ────────────────────────────────────────────────────
  const data3 = readData();
  if (!data3.messages) {
    data3.messages = [];
    writeData(data3);
    console.log('✓ Messages system initialised.');
  }
})();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret:            'joells-lounge-change-me-in-production',
  resave:            false,
  saveUninitialized: false,
  cookie:            { maxAge: 8 * 60 * 60 * 1000 } // 8 hours
}));

// ── Public API routes ───────────────────────────────────────────────────────
app.use('/api',       require('./routes/api'));
app.use('/api/admin', require('./routes/admin'));

// ── Admin HTML routes (auth-gated) ─────────────────────────────────────────

// Redirect direct file access back through the auth-gated route
app.get('/admin/index.html', (req, res) => res.redirect(301, '/admin'));
app.get('/admin/login.html', (req, res) => res.redirect(301, '/admin/login'));

app.get('/admin/login', (req, res) => {
  if (req.session.userId) return res.redirect('/admin');
  res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

app.get('/admin', (req, res) => {
  if (!req.session.userId) return res.redirect('/admin/login');
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// Serve admin CSS/JS without auth (they contain no sensitive data)
app.use('/admin', express.static(path.join(__dirname, 'admin'), { index: false }));

// ── Public static files ─────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname), { index: false }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, 'about.html')));

// ── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\nJoelle's Lounge is running!`);
  console.log(`  Public site : http://localhost:${PORT}`);
  console.log(`  Admin panel : http://localhost:${PORT}/admin\n`);
});
