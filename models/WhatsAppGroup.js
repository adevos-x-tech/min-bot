const mongoose = require('mongoose');

const whatsAppGroupSchema = new mongoose.Schema(
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
      index: true
    },
    groupId: {
      type: String,
      required: true,
      unique: true
    },
    groupSubject: {
      type: String,
      default: ''
    },
    participantsCount: {
      type: Number,
      default: 0
    },
    botRole: {
      type: String,
      enum: ['member', 'admin', 'superadmin'],
      default: 'member'
    },
    settings: {
      autoWelcome: { type: Boolean, default: true },
      antiLink: { type: Boolean, default: false },
      antiLinkMode: { type: String, enum: ['delete', 'warn', 'kick'], default: 'delete' },
      isMuted: { type: Boolean, default: false },
      isLocked: { type: Boolean, default: false }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('WhatsAppGroup', whatsAppGroupSchema);
