import mongoose from 'mongoose';

const imageEntrySchema = new mongoose.Schema(
  {
    url: { type: String, default: '' },
    public_id: { type: String, default: '' },
  },
  { _id: false }
);

const sizeEntrySchema = new mongoose.Schema(
  {
    size: { type: String, required: true, trim: true },
    stock: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    category: { type: String, required: true, trim: true, maxlength: 80, index: true },
    description: { type: String, default: '', maxlength: 5000 },
    price: { type: Number, required: true, min: 0 },
    oldPrice: { type: Number, min: 0, default: 0 },
    discount: { type: Number, min: 0, max: 100, default: 0 },
    image: { type: String, default: '' },
    imagePublicId: { type: String, default: '' },
    images: { type: [imageEntrySchema], default: [] },
    sizes: { type: [sizeEntrySchema], default: [] },
    stock: { type: Number, required: true, min: 0, default: 0 },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

productSchema.pre('save', function syncLegacyFields(next) {
  const primary = (this.images || []).find((entry) => entry && typeof entry.url === 'string' && entry.url.trim());
  if (primary) {
    this.image = primary.url;
    this.imagePublicId = primary.public_id || '';
  } else if (!this.image) {
    this.image = '';
    this.imagePublicId = '';
  }

  if (Array.isArray(this.sizes) && this.sizes.length > 0) {
    this.stock = this.sizes.reduce((sum, entry) => sum + Math.max(0, Number(entry && entry.stock) || 0), 0);
  } else {
    this.stock = Math.max(0, Number(this.stock) || 0);
  }

  next();
});

productSchema.index({ name: 'text', category: 'text' });

export default mongoose.model('Product', productSchema);
