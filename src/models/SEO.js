import mongoose from 'mongoose';

const seoSchema = new mongoose.Schema(
  {
    page: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    pageName: { type: String, required: true, trim: true },
    metaTitle: { type: String, required: true, trim: true, maxlength: 150 },
    metaDescription: { type: String, required: true, trim: true, maxlength: 160 },
    h1: { type: String, default: '', trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 5000 },
    faq: { type: String, default: '', trim: true, maxlength: 5000 },
  },
  { timestamps: true }
);

export default mongoose.model('SEO', seoSchema);
