const express = require('express');
const { isDatabaseConnected } = require('../config/database');
const socketManager = require('../whatsapp/socketManager');
const { getTelegramBotInstance } = require('../telegram/bot');
const User = require('../models/User');
const WhatsAppGroup = require('../models/WhatsAppGroup');
const TelegramGroup = require('../models/TelegramGroup');

const router = express.Router();

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

router.get('/', async (req, res) => {
  try {
    const [totalUsers, totalWhatsAppGroups, totalTelegramGroups] = await Promise.all([
      User.countDocuments({ isActive: true }),
      WhatsAppGroup.countDocuments(),
      TelegramGroup.countDocuments()
    ]);

    res.json({
      success: true,
      uptime: { seconds: process.uptime(), formatted: formatUptime(process.uptime()) },
      memory: process.memoryUsage(),
      isMongoConnected: isDatabaseConnected(),
      activeWhatsAppSessions: { count: socketManager.getActiveSessionCount() },
      telegramBotActive: Boolean(getTelegramBotInstance()),
      totals: {
        users: totalUsers,
        whatsappGroups: totalWhatsAppGroups,
        telegramGroups: totalTelegramGroups,
        groups: totalWhatsAppGroups + totalTelegramGroups
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Public, non-sensitive configuration the frontend needs at load time.
// Nothing secret is ever exposed here; only display-oriented values.
router.get('/public-config', (req, res) => {
  res.json({
    success: true,
    telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || null,
    baseUrl: process.env.BASE_URL || null
  });
});

module.exports = router;
