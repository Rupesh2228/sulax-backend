import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    lastMessage: {
      text: { type: String, default: '' },
      sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      senderRole: { type: String, enum: ['user', 'admin'] },
      createdAt: { type: Date, default: Date.now },
    },
    unreadCountAdmin: {
      type: Number,
      default: 0,
      min: 0,
    },
    unreadCountCustomer: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: ['open', 'archived'],
      default: 'open',
    },
  },
  { timestamps: true }
);

conversationSchema.index({ lastMessageAt: -1 });

export default mongoose.model('Conversation', conversationSchema);
