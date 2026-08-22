const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');
const WhatsAppAuth = require('../models/WhatsAppAuth');

/**
 * Drop-in replacement for Baileys' useMultiFileAuthState that persists
 * credentials and signal keys in MongoDB instead of the local disk.
 * This keeps the server stateless: sessions survive restarts and can be
 * moved to a fresh VPS by cloning the code and reconnecting the database.
 */
async function useMongoAuthState(sessionId) {
  const readState = async () => {
    const doc = await WhatsAppAuth.findOne({ sessionId }).lean();
    if (!doc) return null;
    return JSON.parse(JSON.stringify(doc), BufferJSON.reviver);
  };

  const writeState = async (creds, keys) => {
    await WhatsAppAuth.updateOne(
      { sessionId },
      {
        $set: {
          creds: JSON.parse(JSON.stringify(creds, BufferJSON.replacer)),
          keys: JSON.parse(JSON.stringify(keys, BufferJSON.replacer))
        }
      },
      { upsert: true }
    );
  };

  const existing = await readState();
  const creds = existing?.creds || initAuthCreds();
  const keys = existing?.keys || {};

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result = {};
          for (const id of ids) {
            let value = keys[type]?.[id];
            if (value) {
              if (type === 'app-state-sync-key') {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              result[id] = value;
            }
          }
          return result;
        },
        set: async (data) => {
          for (const category in data) {
            keys[category] = keys[category] || {};
            Object.assign(keys[category], data[category]);
          }
          await writeState(creds, keys);
        }
      }
    },
    saveCreds: async () => {
      await writeState(creds, keys);
    },
    removeState: async () => {
      await WhatsAppAuth.deleteOne({ sessionId });
    }
  };
}

module.exports = { useMongoAuthState };
