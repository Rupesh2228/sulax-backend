import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['order', 'message', 'registration', 'inventory', 'payment', 'system'],
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 300 },
    relatedOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    relatedMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    relatedConversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
    relatedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    relatedProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    eventKey: { type: String, required: true, maxlength: 160 },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, eventKey: 1 }, { unique: true });

export default mongoose.model('Notification', notificationSchema);
