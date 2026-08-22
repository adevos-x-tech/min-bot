const mongoose = require('mongoose');

/**
 * Master user record.
 * A single user document may be linked to a Telegram account, a WhatsApp
 * number, or both. Website credentials (username/password) are generated
 * through either bot and are never created directly on the public website.
 */
const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true
    },
    password: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ['owner', 'operator'],
      default: 'operator'
    },

    // Platform identities. Both are optional and nullable so a user can
    // start from either platform and link the other one later.
    telegramId: {
      type: String,
      default: null,
      unique: true,
      sparse: true,
      index: true
    },
    telegramUsername: {
      type: String,
      default: null
    },
    whatsappNumber: {
      type: String,
      default: null,
      unique: true,
      sparse: true,
      index: true
    },

    createdVia: {
      type: String,
      enum: ['telegram', 'whatsapp', 'website'],
      required: true
    },

    isActive: {
      type: Boolean,
      default: true
    },
    lastLoginAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
