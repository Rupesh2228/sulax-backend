import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema(
  {
    image: { type: String, required: true, trim: true },
    imagePublicId: { type: String, default: '', trim: true },
    alt: { type: String, default: 'Sulax Shoes banner', trim: true, maxlength: 200 },
    link: { type: String, default: '', trim: true, maxlength: 500 },
    order: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('Banner', bannerSchema);
