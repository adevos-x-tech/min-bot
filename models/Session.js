const mongoose = require('mongoose');

/**
 * Tracks a single WhatsApp Multi-Device session belonging to a user.
 * The actual Baileys auth credentials live in the WhatsAppAuth collection;
 * this document is only the operational record used by the dashboard,
 * the admin panel, and the pairing-validation logic.
 */
const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    status: {
      type: String,
      enum: ['pending', 'connected', 'disconnected', 'banned'],
      default: 'pending'
    },
    source: {
      type: String,
      enum: ['website', 'telegram', 'whatsapp'],
      default: 'website'
    },
    pairedAt: {
      type: Date,
      default: Date.now
    },
    lastSeenAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Session', sessionSchema);
