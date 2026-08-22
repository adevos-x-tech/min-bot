const mongoose = require('mongoose');

/**
 * Stores the Baileys authentication state (credentials and signal keys)
 * for a WhatsApp session directly in MongoDB instead of the local
 * filesystem. This keeps the server stateless: if the process restarts
 * on a new machine, every session reconnects without re-pairing.
 */
const whatsAppAuthSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    creds: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    keys: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('WhatsAppAuth', whatsAppAuthSchema);
