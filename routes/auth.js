const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { comparePassword, hashPassword } = require('../utils/password');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const user = await User.findOne({ username: username.trim().toLowerCase() });
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    return res.json({
      success: true,
      token,
      user: {
        username: user.username,
        role: user.role,
        telegramId: user.telegramId,
        whatsappNumber: user.whatsappNumber
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Login failed', error: err.message });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    success: true,
    user: {
      username: req.user.username,
      role: req.user.role,
      telegramId: req.user.telegramId,
      whatsappNumber: req.user.whatsappNumber,
      createdVia: req.user.createdVia
    }
  });
});

router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
    }

    req.user.password = await hashPassword(newPassword);
    await req.user.save();

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update password', error: err.message });
  }
});

router.post('/change-username', requireAuth, async (req, res) => {
  try {
    const { newUsername } = req.body;
    if (!newUsername || newUsername.trim().length < 3) {
      return res.status(400).json({ success: false, message: 'Username must be at least 3 characters long' });
    }

    const normalized = newUsername.trim().toLowerCase();
    const taken = await User.findOne({ username: normalized, _id: { $ne: req.user._id } });
    if (taken) {
      return res.status(409).json({ success: false, message: 'That username is already taken' });
    }

    req.user.username = normalized;
    await req.user.save();

    res.json({ success: true, message: 'Username updated successfully', username: normalized });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update username', error: err.message });
  }
});

router.delete('/account', requireAuth, async (req, res) => {
  try {
    req.user.isActive = false;
    await req.user.save();
    res.json({ success: true, message: 'Account deactivated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete account', error: err.message });
  }
});

module.exports = router;
