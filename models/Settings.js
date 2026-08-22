const mongoose = require('mongoose');

/**
 * Per-user configurable bot settings. A single document per user id
 * (or "global" for the platform-wide default) holds every setting that
 * both the website and the bots read before executing an action, so
 * there is exactly one source of truth regardless of which surface
 * made the change.
 */
const settingsSchema = new mongoose.Schema(
  {
    ownerId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    botName: {
      type: String,
      default: 'Adevos Min-Bot'
    },
    prefix: {
      type: String,
      default: '.'
    },
    welcomeMessage: {
      type: String,
      default: 'Welcome to the group. Please follow the rules and enjoy your stay.'
    },
    antiLink: {
      type: Boolean,
      default: false
    },
    groupProtection: {
      type: Boolean,
      default: true
    },
    autoStatusView: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
