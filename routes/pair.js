const express = require('express');
const { requireAuth } = require('../middleware/auth');
const socketManager = require('../whatsapp/socketManager');
const Session = require('../models/Session');

const router = express.Router();

router.post('/', requireAuth, async (req, res) => {
  try {
    const { number } = req.body;
    const cleanNumber = String(number || '').replace(/[^0-9]/g, '');

    if (cleanNumber.length < 8) {
      return res.status(400).json({ success: false, message: 'Please provide a valid phone number with country code' });
    }

    const existing = await Session.findOne({ phoneNumber: cleanNumber });
    if (existing && existing.userId.toString() !== req.user._id.toString()) {
      return res.status(409).json({ success: false, message: 'This WhatsApp number is already linked to another account' });
    }

    const { pairingCode } = await socketManager.startSession(cleanNumber, {
      userId: req.user._id,
      source: 'website'
    });

    if (!req.user.whatsappNumber) {
      req.user.whatsappNumber = cleanNumber;
      await req.user.save();
    }

    res.json({ success: true, code: pairingCode.replace(/-/g, '') });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
