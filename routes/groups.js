const express = require('express');
const { requireAuth } = require('../middleware/auth');
const WhatsAppGroup = require('../models/WhatsAppGroup');
const TelegramGroup = require('../models/TelegramGroup');
const socketManager = require('../whatsapp/socketManager');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const [waGroups, tgGroups] = await Promise.all([
      WhatsAppGroup.find({ userId: req.user._id }).lean(),
      req.user.telegramId ? TelegramGroup.find({ telegramId: req.user.telegramId }).lean() : []
    ]);

    const groups = [
      ...waGroups.map((g) => ({
        id: g.groupId,
        platform: 'whatsapp',
        name: g.groupSubject,
        botRole: g.botRole === 'superadmin' ? 'Owner' : g.botRole === 'admin' ? 'Admin' : 'Member',
        membersCount: g.participantsCount,
        isMuted: g.settings.isMuted,
        isLocked: g.settings.isLocked
      })),
      ...tgGroups.map((g) => ({
        id: g.groupId,
        platform: 'telegram',
        name: g.groupName,
        botRole: g.role === 'creator' ? 'Owner' : g.role === 'administrator' ? 'Admin' : 'Member',
        membersCount: g.memberCount,
        isMuted: false,
        isLocked: false
      }))
    ];

    res.json({ success: true, groups });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:groupId/action', requireAuth, async (req, res) => {
  try {
    const { action } = req.body;
    const group = await WhatsAppGroup.findOne({ groupId: req.params.groupId, userId: req.user._id });
    if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

    const socket = socketManager.getSocket(group.phoneNumber);
    if (!socket) return res.status(409).json({ success: false, message: 'The WhatsApp session for this group is not currently connected' });

    switch (action) {
      case 'mute':
      case 'unmute':
        await socket.groupSettingUpdate(group.groupId, action === 'mute' ? 'announcement' : 'not_announcement');
        group.settings.isMuted = action === 'mute';
        break;
      case 'lock':
      case 'unlock':
        group.settings.isLocked = action === 'lock';
        break;
      case 'leave':
        await socket.groupLeave(group.groupId);
        await group.deleteOne();
        return res.json({ success: true, message: 'Left the group successfully' });
      default:
        return res.status(400).json({ success: false, message: 'Unknown action' });
    }

    await group.save();
    res.json({ success: true, message: `Action "${action}" completed successfully` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
