import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 100 },
    email: { type: String, required: true, maxlength: 200 },
    subject: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 3000 },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model('ContactMessage', contactSchema);
