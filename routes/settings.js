const express = require('express');
const { requireAuth } = require('../middleware/auth');
const Settings = require('../models/Settings');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const settings = await Settings.findOne({ ownerId: String(req.user._id) }).lean();
    res.json({ success: true, settings: settings || {} });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { botName, prefix, welcomeMessage, antiLink, groupProtection, autoStatusView } = req.body;

    const settings = await Settings.findOneAndUpdate(
      { ownerId: String(req.user._id) },
      {
        $set: {
          ...(botName !== undefined && { botName }),
          ...(prefix !== undefined && { prefix }),
          ...(welcomeMessage !== undefined && { welcomeMessage }),
          ...(antiLink !== undefined && { antiLink }),
          ...(groupProtection !== undefined && { groupProtection }),
          ...(autoStatusView !== undefined && { autoStatusView })
        }
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: 'Settings saved successfully', settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
