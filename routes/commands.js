const express = require('express');
const { requireAuth } = require('../middleware/auth');
const Session = require('../models/Session');
const socketManager = require('../whatsapp/socketManager');
const { getTelegramBotInstance } = require('../telegram/bot');

const router = express.Router();

/**
 * Lets a logged-in user send a command to their own bot instance directly
 * from the website and see the response inline. For WhatsApp this sends
 * the command as a message-to-self on the user's connected session; for
 * Telegram it returns instructions since a bot cannot message a user who
 * has not started a chat with it first.
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { command, platform } = req.body;
    if (!command) return res.status(400).json({ success: false, response: 'Please enter a command.' });

    if (platform === 'telegram') {
      const bot = getTelegramBotInstance();
      if (!bot || !req.user.telegramId) {
        return res.json({ success: true, response: 'Connect your Telegram account first, then send commands directly to the bot in a private chat.' });
      }
      return res.json({ success: true, response: `Open your private chat with the Telegram bot and send: ${command}` });
    }

    if (!req.user.whatsappNumber) {
      return res.json({ success: true, response: 'No WhatsApp number is linked to your account yet.' });
    }

    const session = await Session.findOne({ phoneNumber: req.user.whatsappNumber });
    if (!session || session.status !== 'connected') {
      return res.json({ success: true, response: 'Your WhatsApp session is not currently connected.' });
    }

    const socket = socketManager.getSocket(req.user.whatsappNumber);
    if (!socket) {
      return res.json({ success: true, response: 'Your WhatsApp session is not active on this server instance.' });
    }

    const selfJid = `${req.user.whatsappNumber}@s.whatsapp.net`;
    await socket.sendMessage(selfJid, { text: command });

    return res.json({ success: true, response: `Command "${command}" sent to your own WhatsApp chat. Check your phone for the bot's reply.` });
  } catch (err) {
    res.status(500).json({ success: false, response: `Error: ${err.message}` });
  }
});

module.exports = router;
