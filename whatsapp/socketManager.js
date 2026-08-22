const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const { useMongoAuthState } = require('./mongoAuthState');
const Session = require('../models/Session');
const WhatsAppGroup = require('../models/WhatsAppGroup');
const { handleWhatsAppCommand } = require('./commandHandler');
const logger = require('../utils/logger');

// sessionId (phone number) -> live socket + metadata
const activeSockets = new Map();

const MAX_SESSIONS = Number(process.env.WHATSAPP_MAX_SESSIONS || 50);
const AUTOJOIN_GROUPS = (process.env.WHATSAPP_AUTOJOIN_GROUPS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
const AUTOFOLLOW_CHANNELS = (process.env.WHATSAPP_AUTOFOLLOW_CHANNELS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

function getActiveSessionCount() {
  return activeSockets.size;
}

function getSocket(phoneNumber) {
  return activeSockets.get(phoneNumber)?.socket || null;
}

function isSessionLimitReached() {
  return activeSockets.size >= MAX_SESSIONS;
}

/**
 * Starts (or resumes) a WhatsApp Multi-Device session for the given
 * phone number and requests a pairing code. The socket persists its
 * auth state in MongoDB via useMongoAuthState, so the process can be
 * restarted or moved to another server without losing the connection.
 */
async function startSession(phoneNumber, { userId, source = 'website' } = {}) {
  if (isSessionLimitReached()) {
    throw new Error('Server session limit reached. Please try again later or contact the administrator.');
  }

  const { state, saveCreds } = await useMongoAuthState(phoneNumber);
  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['Adevos Min-Bot', 'Chrome', '2.0.0'],
    markOnlineOnConnect: false
  });

  activeSockets.set(phoneNumber, { socket, userId, connected: false });

  let pairingCode = null;
  if (!state.creds.registered) {
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    pairingCode = await socket.requestPairingCode(cleanNumber);
    pairingCode = pairingCode?.match(/.{1,4}/g)?.join('-') || pairingCode;
  }

  socket.ev.on('creds.update', saveCreds);

  socket.ev.on('connection.update', async (update) => {
    await handleConnectionUpdate(phoneNumber, userId, socket, update);
  });

  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const message = messages[0];
    if (!message?.message || message.key.fromMe) return;
    try {
      await handleWhatsAppCommand(socket, message, { userId, phoneNumber });
    } catch (err) {
      logger.error('whatsapp', `Command handler error for ${phoneNumber}: ${err.message}`);
    }
  });

  socket.ev.on('groups.update', async ([update]) => {
    if (!update?.id) return;
    await syncGroupMetadata(socket, phoneNumber, update.id).catch(() => {});
  });

  socket.ev.on('group-participants.update', async (update) => {
    await syncGroupMetadata(socket, phoneNumber, update.id).catch(() => {});
  });

  await Session.updateOne(
    { phoneNumber },
    { $set: { userId, phoneNumber, source, status: 'pending', lastSeenAt: new Date() } },
    { upsert: true }
  );

  return { pairingCode };
}

async function handleConnectionUpdate(phoneNumber, userId, socket, update) {
  const { connection, lastDisconnect } = update;
  const entry = activeSockets.get(phoneNumber);

  if (connection === 'open') {
    if (entry) entry.connected = true;
    logger.success('whatsapp', `Session connected: ${phoneNumber}`);

    await Session.updateOne(
      { phoneNumber },
      { $set: { status: 'connected', lastSeenAt: new Date() } }
    );

    await runPostConnectAutomation(socket, phoneNumber);
    return;
  }

  if (connection === 'close') {
    const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
    const loggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;

    if (loggedOut) {
      logger.warn('whatsapp', `Session logged out / banned: ${phoneNumber}`);
      await Session.updateOne({ phoneNumber }, { $set: { status: 'banned' } });
      activeSockets.delete(phoneNumber);
      return;
    }

    logger.warn('whatsapp', `Session disconnected (code ${statusCode}), attempting reconnect: ${phoneNumber}`);
    await Session.updateOne({ phoneNumber }, { $set: { status: 'disconnected' } });
    activeSockets.delete(phoneNumber);

    setTimeout(() => {
      startSession(phoneNumber, { userId, source: 'website' }).catch((err) => {
        logger.error('whatsapp', `Reconnect failed for ${phoneNumber}: ${err.message}`);
      });
    }, 3000);
  }
}

async function runPostConnectAutomation(socket, phoneNumber) {
  for (const inviteCode of AUTOJOIN_GROUPS) {
    try {
      await socket.groupAcceptInvite(inviteCode);
    } catch (err) {
      logger.warn('whatsapp', `Auto-join failed for ${inviteCode}: ${err.message}`);
    }
  }

  for (const channelJid of AUTOFOLLOW_CHANNELS) {
    try {
      await socket.newsletterFollow(channelJid);
    } catch (err) {
      logger.warn('whatsapp', `Auto-follow failed for ${channelJid}: ${err.message}`);
    }
  }
}

/**
 * Reads current group metadata from WhatsApp and mirrors it into MongoDB
 * so the website dashboard can display group name, member count, and the
 * bot's role without needing a live socket call on every page load.
 */
async function syncGroupMetadata(socket, phoneNumber, groupId) {
  const metadata = await socket.groupMetadata(groupId);
  const botJid = socket.user?.id?.split(':')[0] + '@s.whatsapp.net';
  const botParticipant = metadata.participants.find((p) => p.id === botJid);
  const role = botParticipant?.admin === 'superadmin' ? 'superadmin' : botParticipant?.admin === 'admin' ? 'admin' : 'member';

  const session = await Session.findOne({ phoneNumber });

  await WhatsAppGroup.updateOne(
    { groupId },
    {
      $set: {
        userId: session?.userId,
        phoneNumber,
        groupSubject: metadata.subject,
        participantsCount: metadata.participants.length,
        botRole: role
      }
    },
    { upsert: true }
  );
}

async function disconnectSession(phoneNumber) {
  const entry = activeSockets.get(phoneNumber);
  if (entry?.socket) {
    try {
      await entry.socket.logout();
    } catch (err) {
      // socket may already be closed
    }
    entry.socket.end?.();
  }
  activeSockets.delete(phoneNumber);
  await Session.deleteOne({ phoneNumber });
  await WhatsAppGroup.deleteMany({ phoneNumber });
}

/**
 * Reconnects every session that was previously marked as connected.
 * Should be called once on server startup so existing users do not
 * need to re-pair after a deployment or restart.
 */
async function resumeAllSessions() {
  const sessions = await Session.find({ status: { $in: ['connected', 'pending'] } });
  for (const session of sessions) {
    startSession(session.phoneNumber, { userId: session.userId, source: session.source }).catch((err) => {
      logger.error('whatsapp', `Failed to resume session ${session.phoneNumber}: ${err.message}`);
    });
  }
  logger.info('whatsapp', `Resuming ${sessions.length} previously connected session(s)`);
}

module.exports = {
  startSession,
  disconnectSession,
  resumeAllSessions,
  getSocket,
  getActiveSessionCount,
  isSessionLimitReached
};
