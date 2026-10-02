import mongoose from 'mongoose';

const adminPushSubscriptionSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, maxlength: 2048 },
    keys: {
      p256dh: { type: String, required: true, maxlength: 256 },
      auth: { type: String, required: true, maxlength: 128 },
    },
    expirationTime: { type: Number, default: null },
    userAgent: { type: String, maxlength: 300, default: '' },
    lastUsedAt: { type: Date },
  },
  { timestamps: true }
);

adminPushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
adminPushSubscriptionSchema.index({ adminId: 1, createdAt: -1 });

export default mongoose.model('AdminPushSubscription', adminPushSubscriptionSchema);
