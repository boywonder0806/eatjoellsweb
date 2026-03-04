const express = require('express');
const router  = express.Router();
const { readData, writeData, getNextId } = require('../db/store');

// GET /api/menu — active menu items grouped by category
router.get('/menu', (req, res) => {
  const data   = readData();
  const active = (data.menus || []).find(m => m.id === data.active_menu_id) || (data.menus || [])[0];
  if (!active) return res.json({ categories: [], grouped: {}, menuName: '' });
  const grouped = {};
  active.categories.forEach(cat => { grouped[cat] = []; });
  (active.items || [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .forEach(item => { if (grouped[item.category]) grouped[item.category].push(item); });
  res.json({ categories: active.categories, grouped, menuName: active.name });
});

// GET /api/hours
router.get('/hours', (req, res) => {
  const { hours } = readData();
  res.json(hours.sort((a, b) => a.sort_order - b.sort_order));
});

// GET /api/settings
router.get('/settings', (req, res) => {
  const { settings } = readData();
  res.json(settings);
});

// GET /api/about
router.get('/about', (_req, res) => {
  const data = readData();
  res.json({
    about_page: data.about_page || {},
    team: (data.team || []).sort((a, b) => a.sort_order - b.sort_order)
  });
});

// POST /api/contact
router.post('/contact', (req, res) => {
  const { name, email, phone, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required' });
  }
  const data = readData();
  data.messages = data.messages || [];
  data.messages.push({
    id:        getNextId(data.messages),
    name:      name.trim(),
    email:     email.trim(),
    phone:     (phone || '').trim(),
    message:   message.trim(),
    read:      false,
    createdAt: new Date().toISOString()
  });
  writeData(data);
  res.json({ success: true });
});

module.exports = router;
