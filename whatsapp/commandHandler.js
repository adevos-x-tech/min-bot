const User = require('../models/User');
const Session = require('../models/Session');
const WhatsAppGroup = require('../models/WhatsAppGroup');
const Settings = require('../models/Settings');
const { hashPassword, generateRandomPassword } = require('../utils/password');
const logger = require('../utils/logger');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function extractText(message) {
  return (
    message.message?.conversation ||
    message.message?.extendedTextMessage?.text ||
    message.message?.imageMessage?.caption ||
    message.message?.videoMessage?.caption ||
    ''
  );
}

function getPrefix(text) {
  const prefix = '.';
  return text.startsWith(prefix) ? prefix : null;
}

/**
 * Minimal, secure command set for the WhatsApp side of the platform.
 * Every command here mirrors an action also available on the website,
 * reading and writing the same MongoDB collections so both surfaces
 * always agree on the current state.
 */
async function handleWhatsAppCommand(socket, message, { userId, phoneNumber }) {
  const remoteJid = message.key.remoteJid;
  const isGroup = remoteJid.endsWith('@g.us');
  const senderJid = isGroup ? message.key.participant : remoteJid;
  const senderNumber = (senderJid || '').replace(/[^0-9]/g, '');
  const text = extractText(message);

  if (!text) return;
  const prefix = getPrefix(text);
  if (!prefix) return;

  const body = text.slice(prefix.length).trim();
  const [rawCommand, ...args] = body.split(/\s+/);
  const command = (rawCommand || '').toLowerCase();
  const argText = args.join(' ');

  const reply = (content) => socket.sendMessage(remoteJid, { text: content }, { quoted: message });

  switch (command) {
    case 'menu':
    case 'help':
      return reply(buildMenuText());

    case 'ping':
      return reply('Adevos Min-Bot is online and responding.');

    case 'createlogins': {
      if (isGroup) {
        return reply('This command can only be used in a private chat with the bot for security reasons.');
      }
      if (!args[0]) {
        return reply('Please provide a username.\nExample: .createlogins myname');
      }
      return createWebLogins({ platform: 'whatsapp', identifier: senderNumber, username: args[0], reply });
    }

    case 'set': {
      if (!isGroup) return reply('Group settings can only be changed inside a group chat.');
      return handleGroupSettingCommand({ socket, groupId: remoteJid, senderJid, args, reply });
    }

    case 'groupinfo': {
      if (!isGroup) return reply('This command only works inside a group.');
      const group = await WhatsAppGroup.findOne({ groupId: remoteJid });
      if (!group) return reply('This group has not been indexed yet. Try again in a moment.');
      return reply(
        `Group: ${group.groupSubject}\n` +
          `Members: ${group.participantsCount}\n` +
          `Bot role: ${group.botRole}\n` +
          `Anti-link: ${group.settings.antiLink ? 'on' : 'off'}\n` +
          `Muted: ${group.settings.isMuted ? 'yes' : 'no'}`
      );
    }

    case 'dashboard':
      return reply(`Manage this bot from the web dashboard: ${BASE_URL}/dashboard`);

    default:
      return; // Unknown commands are silently ignored to avoid noise in groups.
  }
}

function buildMenuText() {
  return [
    'Adevos Min-Bot - Command Menu',
    '',
    '.menu - show this menu',
    '.ping - check bot response time',
    '.createlogins <username> - create website login credentials (private chat only)',
    '.set <option> <on/off> - change group settings (group admins only)',
    '.groupinfo - show information about the current group',
    '.dashboard - get a link to the web dashboard'
  ].join('\n');
}

/**
 * Creates website login credentials for a WhatsApp user, following the
 * same "chat-first" account creation flow used by the Telegram bot:
 * the raw password is shown exactly once, then only the hash is stored.
 */
async function createWebLogins({ platform, identifier, username, reply }) {
  try {
    const existingUsername = await User.findOne({ username: username.toLowerCase() });
    if (existingUsername) {
      return reply('That username is already taken. Please choose a different one.');
    }

    const query = platform === 'whatsapp' ? { whatsappNumber: identifier } : { telegramId: identifier };
    let user = await User.findOne(query);
    const rawPassword = generateRandomPassword();
    const hashedPassword = await hashPassword(rawPassword);

    if (user) {
      user.username = username.toLowerCase();
      user.password = hashedPassword;
      await user.save();
    } else {
      user = await User.create({
        username: username.toLowerCase(),
        password: hashedPassword,
        createdVia: platform,
        ...(platform === 'whatsapp' ? { whatsappNumber: identifier } : { telegramId: identifier })
      });
    }

    return reply(
      'Website login created successfully.\n\n' +
        `Website: ${BASE_URL}/login\n` +
        `Username: ${username.toLowerCase()}\n` +
        `Password: ${rawPassword}\n\n` +
        'Save this password now, it will not be shown again.'
    );
  } catch (err) {
    logger.error('whatsapp', `createWebLogins error: ${err.message}`);
    return reply('Something went wrong while creating your login credentials. Please try again.');
  }
}

async function handleGroupSettingCommand({ socket, groupId, senderJid, args, reply }) {
  const metadata = await socket.groupMetadata(groupId);
  const isAdmin = metadata.participants.some((p) => p.id === senderJid && p.admin);
  if (!isAdmin) return reply('Only group admins can change settings.');

  const [option, value] = args;
  if (!option || !['on', 'off'].includes(value)) {
    return reply('Usage: .set <antilink|welcome|mute> <on/off>');
  }

  const boolValue = value === 'on';
  const fieldMap = {
    antilink: 'settings.antiLink',
    welcome: 'settings.autoWelcome',
    mute: 'settings.isMuted'
  };

  const field = fieldMap[option.toLowerCase()];
  if (!field) return reply('Unknown setting. Available options: antilink, welcome, mute');

  await WhatsAppGroup.updateOne({ groupId }, { $set: { [field]: boolValue } }, { upsert: true });

  if (option.toLowerCase() === 'mute') {
    await socket.groupSettingUpdate(groupId, boolValue ? 'announcement' : 'not_announcement');
  }

  return reply(`Setting "${option}" is now ${value.toUpperCase()}.`);
}

module.exports = { handleWhatsAppCommand };
