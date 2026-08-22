const express = require('express');
const { requireAuth } = require('../middleware/auth');
const Session = require('../models/Session');
const socketManager = require('../whatsapp/socketManager');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const sessions = await Session.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({
      success: true,
      sessions: sessions.map((s) => ({
        sessionId: s.phoneNumber,
        status: s.status,
        isActive: s.status === 'connected',
        source: s.source,
        lastSeen: s.lastSeenAt
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:sessionId', requireAuth, async (req, res) => {
  try {
    const session = await Session.findOne({ phoneNumber: req.params.sessionId });
    if (!session || session.userId.toString() !== req.user._id.toString()) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    await socketManager.disconnectSession(req.params.sessionId);
    res.json({ success: true, message: 'Session disconnected successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
