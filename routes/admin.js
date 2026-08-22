const express = require('express');
const jwt = require('jsonwebtoken');
const { requireAdmin } = require('../middleware/auth');
const User = require('../models/User');
const Session = require('../models/Session');
const WhatsAppGroup = require('../models/WhatsAppGroup');
const TelegramGroup = require('../models/TelegramGroup');
const socketManager = require('../whatsapp/socketManager');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
  }

  const token = jwt.sign({ scope: 'admin', username }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ success: true, token });
});

router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const [totalUsers, activeSessions, bannedSessions, whatsappGroups, telegramGroups] = await Promise.all([
      User.countDocuments(),
      Session.countDocuments({ status: 'connected' }),
      Session.countDocuments({ status: 'banned' }),
      WhatsAppGroup.countDocuments(),
      TelegramGroup.countDocuments()
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        activeSessions,
        bannedSessions,
        totalGroups: whatsappGroups + telegramGroups,
        liveSocketCount: socketManager.getActiveSessionCount()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 }).lean();
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/sessions', requireAdmin, async (req, res) => {
  try {
    const sessions = await Session.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/sessions/revoke', requireAdmin, async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    await socketManager.disconnectSession(phoneNumber);
    res.json({ success: true, message: `Session for +${phoneNumber} has been revoked` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/users/:id/deactivate', requireAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: 'User account deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
