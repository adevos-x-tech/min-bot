const mongoose = require('mongoose');

const telegramGroupSchema = new mongoose.Schema(
  {
    telegramId: {
      type: String,
      required: true,
      index: true
    },
    groupId: {
      type: String,
      required: true,
      unique: true
    },
    groupName: {
      type: String,
      default: ''
    },
    role: {
      type: String,
      enum: ['member', 'administrator', 'creator'],
      default: 'member'
    },
    memberCount: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('TelegramGroup', telegramGroupSchema);
