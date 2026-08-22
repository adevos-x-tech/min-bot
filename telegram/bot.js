const TelegramBot = require('node-telegram-bot-api');
const User = require('../models/User');
const Session = require('../models/Session');
const TelegramGroup = require('../models/TelegramGroup');
const socketManager = require('../whatsapp/socketManager');
const { hashPassword, generateRandomPassword } = require('../utils/password');
const logger = require('../utils/logger');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OWNER_IDS = (process.env.TELEGRAM_OWNER_IDS || '').split(',').map((v) => v.trim()).filter(Boolean);
const REQUIRED_CHANNELS = (process.env.TELEGRAM_REQUIRED_CHANNELS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

let bot = null;

function startTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn('telegram', 'TELEGRAM_BOT_TOKEN is not set. Telegram bot will not start.');
    return null;
  }

  bot = new TelegramBot(token, { polling: true });
  logger.success('telegram', 'Telegram bot is now polling for updates');

  registerCommands(bot);
  registerMembershipTracking(bot);

  return bot;
}

/**
 * Verifies the user has joined every required channel before allowing
 * bot usage. This is the "chat-first" gate described in the platform
 * requirements: it keeps the user database free of accounts created by
 * people who never actually engage with the community channels.
 */
async function isMemberOfAllRequiredChannels(userId) {
  if (REQUIRED_CHANNELS.length === 0) return true;

  const checks = await Promise.all(
    REQUIRED_CHANNELS.map((channel) =>
      bot.getChatMember(channel, userId).catch(() => null)
    )
  );

  const validStatuses = ['member', 'administrator', 'creator'];
  return checks.every((member) => member && validStatuses.includes(member.status));
}

function sendJoinPrompt(chatId) {
  const buttons = REQUIRED_CHANNELS.map((channel) => [
    { text: `Join ${channel}`, url: `https://t.me/${channel.replace('@', '')}` }
  ]);
  buttons.push([{ text: 'I have joined - verify again', callback_data: 'verify_membership' }]);

  return bot.sendMessage(
    chatId,
    'Please join all required channels below before using this bot.',
    { reply_markup: { inline_keyboard: buttons } }
  );
}

function withMembershipGate(handler) {
  return async (msg, match) => {
    const userId = msg.from.id;
    if (OWNER_IDS.includes(String(userId))) return handler(msg, match);

    const isMember = await isMemberOfAllRequiredChannels(userId);
    if (!isMember) return sendJoinPrompt(msg.chat.id);

    return handler(msg, match);
  };
}

function registerCommands(bot) {
  bot.onText(/^\/start$/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      'Welcome to Adevos Min-Bot.\n\n' +
        'This bot manages your WhatsApp and Telegram automation from one platform.\n\n' +
        'Available commands:\n' +
        '/createlogins <username> - create your website login\n' +
        '/pair <number> - generate a WhatsApp pairing code\n' +
        '/wa_status - check your WhatsApp connection status\n' +
        '/link - link this Telegram account to an existing website account\n' +
        '/help - show this message again'
    );
  });

  bot.onText(/^\/help$/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      'Commands:\n' +
        '/createlogins <username>\n' +
        '/pair <number>\n' +
        '/wa_status\n' +
        '/link <username>\n' +
        `Dashboard: ${BASE_URL}/dashboard`
    );
  });

  bot.onText(/^\/createlogins (.+)$/, withMembershipGate(async (msg, match) => {
    if (msg.chat.type !== 'private') {
      return bot.sendMessage(msg.chat.id, 'For your security, please use this command in a private chat with the bot.');
    }

    const username = match[1].trim().toLowerCase();
    const telegramId = String(msg.from.id);

    try {
      const usernameTaken = await User.findOne({ username });
      if (usernameTaken && usernameTaken.telegramId !== telegramId) {
        return bot.sendMessage(msg.chat.id, 'That username is already taken. Please choose a different one.');
      }

      const rawPassword = generateRandomPassword();
      const hashedPassword = await hashPassword(rawPassword);

      let user = await User.findOne({ telegramId });
      if (user) {
        user.username = username;
        user.password = hashedPassword;
        await user.save();
      } else {
        user = await User.create({
          username,
          password: hashedPassword,
          telegramId,
          telegramUsername: msg.from.username || null,
          createdVia: 'telegram'
        });
      }

      await bot.sendMessage(
        msg.chat.id,
        'Website login created successfully.\n\n' +
          `Website: ${BASE_URL}/login\n` +
          `Username: ${username}\n` +
          `Password: ${rawPassword}\n\n` +
          'This message is private to you. Save the password now, it will not be shown again.'
      );
    } catch (err) {
      logger.error('telegram', `createlogins error: ${err.message}`);
      await bot.sendMessage(msg.chat.id, 'Something went wrong while creating your login. Please try again.');
    }
  }));

  bot.onText(/^\/pair (.+)$/, withMembershipGate(async (msg, match) => {
    const rawNumber = match[1].replace(/[^0-9]/g, '');
    if (rawNumber.length < 8) {
      return bot.sendMessage(msg.chat.id, 'Please provide a valid phone number with country code, e.g. /pair 255712345678');
    }

    if (socketManager.isSessionLimitReached()) {
      return bot.sendMessage(msg.chat.id, 'This server has reached its session limit. Please try again later.');
    }

    const telegramId = String(msg.from.id);
    const user = await User.findOne({ telegramId });
    if (!user) {
      return bot.sendMessage(msg.chat.id, 'Please create a website login first using /createlogins <username>.');
    }

    try {
      await bot.sendMessage(msg.chat.id, 'Generating your WhatsApp pairing code, please wait...');
      const { pairingCode } = await socketManager.startSession(rawNumber, {
        userId: user._id,
        source: 'telegram'
      });

      user.whatsappNumber = user.whatsappNumber || rawNumber;
      await user.save();

      await bot.sendMessage(
        msg.chat.id,
        'Pairing code generated.\n\n' +
          `Number: +${rawNumber}\n` +
          `Code: ${pairingCode}\n\n` +
          'Open WhatsApp on that phone, go to Linked Devices, choose Link with phone number instead, and enter this code.'
      );
    } catch (err) {
      logger.error('telegram', `pair error: ${err.message}`);
      await bot.sendMessage(msg.chat.id, `Failed to generate pairing code: ${err.message}`);
    }
  }));

  bot.onText(/^\/wa_status$/, withMembershipGate(async (msg) => {
    const telegramId = String(msg.from.id);
    const user = await User.findOne({ telegramId });
    if (!user || !user.whatsappNumber) {
      return bot.sendMessage(msg.chat.id, 'No WhatsApp number is linked to your account yet. Use /pair <number> to connect one.');
    }

    const session = await Session.findOne({ phoneNumber: user.whatsappNumber });
    const status = session?.status || 'unknown';
    await bot.sendMessage(msg.chat.id, `WhatsApp number: +${user.whatsappNumber}\nStatus: ${status}`);
  }));

  bot.onText(/^\/link (.+)$/, withMembershipGate(async (msg, match) => {
    const username = match[1].trim().toLowerCase();
    const telegramId = String(msg.from.id);

    const target = await User.findOne({ username });
    if (!target) return bot.sendMessage(msg.chat.id, 'No website account found with that username.');
    if (target.telegramId && target.telegramId !== telegramId) {
      return bot.sendMessage(msg.chat.id, 'That account is already linked to a different Telegram user.');
    }

    target.telegramId = telegramId;
    target.telegramUsername = msg.from.username || null;
    await target.save();

    await bot.sendMessage(msg.chat.id, `Your Telegram account is now linked to website account "${username}".`);
  }));

  bot.onText(/^\/stats$/, (msg) => {
    if (!OWNER_IDS.includes(String(msg.from.id))) return;
    bot.sendMessage(msg.chat.id, `Active WhatsApp sessions: ${socketManager.getActiveSessionCount()}`);
  });

  bot.on('callback_query', async (query) => {
    if (query.data !== 'verify_membership') return;
    const isMember = await isMemberOfAllRequiredChannels(query.from.id);

    await bot.answerCallbackQuery(query.id, {
      text: isMember ? 'Membership verified. You can now use the bot.' : 'You have not joined all required channels yet.'
    });

    if (isMember) {
      await bot.editMessageText('Membership verified. Send /help to see available commands.', {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id
      });
    }
  });
}

/**
 * Tracks which Telegram user added the bot to which group, using the
 * my_chat_member update. This is what makes it possible to show each
 * user only the groups they personally manage on the website dashboard.
 */
function registerMembershipTracking(bot) {
  bot.on('my_chat_member', async (update) => {
    const chat = update.chat;
    const actorId = String(update.from.id);
    const oldStatus = update.old_chat_member.status;
    const newStatus = update.new_chat_member.status;

    const wasAdded = ['left', 'kicked'].includes(oldStatus) && ['member', 'administrator'].includes(newStatus);
    const wasRemoved = ['left', 'kicked'].includes(newStatus);

    if (wasAdded) {
      await TelegramGroup.updateOne(
        { groupId: String(chat.id) },
        {
          $set: {
            telegramId: actorId,
            groupId: String(chat.id),
            groupName: chat.title || '',
            role: newStatus
          }
        },
        { upsert: true }
      );
      logger.info('telegram', `Bot added to group "${chat.title}" by ${actorId}`);
    } else if (wasRemoved) {
      await TelegramGroup.deleteOne({ groupId: String(chat.id) });
      logger.info('telegram', `Bot removed from group "${chat.title}"`);
    }
  });
}

function getTelegramBotInstance() {
  return bot;
}

module.exports = { startTelegramBot, getTelegramBotInstance };
