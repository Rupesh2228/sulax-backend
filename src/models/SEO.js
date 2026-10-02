import mongoose from 'mongoose';

const seoSchema = new mongoose.Schema(
  {
    page: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    pageName: { type: String, required: true, trim: true },
    metaTitle: { type: String, required: true, trim: true, maxlength: 150 },
    metaDescription: { type: String, default: '', trim: true, maxlength: 500 },
    metaKeywords: { type: String, default: '', trim: true, maxlength: 500 },
    canonicalUrl: { type: String, default: '', trim: true, maxlength: 500 },
    robots: { type: String, default: 'index, follow', trim: true, maxlength: 100 },
    ogTitle: { type: String, default: '', trim: true, maxlength: 150 },
    ogDescription: { type: String, default: '', trim: true, maxlength: 500 },
    ogImage: { type: String, default: '', trim: true, maxlength: 500 },
    twitterCard: { type: String, default: 'summary_large_image', trim: true, maxlength: 50 },
    schemaJson: { type: String, default: '', trim: true, maxlength: 10000 },
    focusKeyword: { type: String, default: '', trim: true, maxlength: 100 },
  },
  { timestamps: true }
);

export default mongoose.model('SEO', seoSchema);
