import mongoose from 'mongoose';

const slugify = (value = '') =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'product';

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
    price: { type: Number, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const attributeEntrySchema = new mongoose.Schema(
  {
    key: { type: String, trim: true, maxlength: 80 },
    value: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false }
);

const variantEntrySchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 80 },
    value: { type: String, trim: true, maxlength: 200 },
    sku: { type: String, trim: true, maxlength: 80 },
    price: { type: Number, min: 0, default: 0 },
    stock: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const seoEntrySchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: 150, default: '' },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    image: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, trim: true, lowercase: true, maxlength: 160 },
    sku: { type: String, trim: true, uppercase: true, maxlength: 80 },
    category: { type: String, required: true, trim: true, maxlength: 80, index: true },
    subcategory: { type: String, trim: true, maxlength: 80, default: '' },
    bagType: { type: String, trim: true, maxlength: 500, default: '' },
    sizeOptions: { type: String, trim: true, maxlength: 500, default: '' },
    shortDescription: { type: String, default: '', maxlength: 600 },
    description: { type: String, default: '', maxlength: 5000 },
    brand: { type: String, default: '', trim: true, maxlength: 80 },
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'active' },
    featured: { type: Boolean, default: false },
    tags: { type: [String], default: [] },
    price: { type: Number, required: true, min: 0 },
    oldPrice: { type: Number, min: 0, default: 0 },
    discount: { type: Number, min: 0, max: 100, default: 0 },
    image: { type: String, default: '' },
    imagePublicId: { type: String, default: '' },
    images: { type: [imageEntrySchema], default: [] },
    sizes: { type: [sizeEntrySchema], default: [] },
    attributes: { type: [attributeEntrySchema], default: [] },
    variants: { type: [variantEntrySchema], default: [] },
    seo: { type: seoEntrySchema, default: () => ({}) },
    shipping: {
      weight: { type: Number, min: 0, default: 0 },
      dimensions: { type: String, trim: true, default: '' },
      requiresShipping: { type: Boolean, default: true },
    },
    stock: { type: Number, required: true, min: 0, default: 0 },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

productSchema.pre('save', function syncLegacyFields(next) {
  const readableSlug = this.slug || this.name;
  this.slug = slugify(readableSlug);

  if (!this.sku && this.name) {
    const base = slugify(this.name).replace(/-/g, '').slice(0, 12).toUpperCase();
    this.sku = `${base || 'SKU'}-${Date.now().toString().slice(-6)}`;
  }

  const primary = (this.images || []).find((entry) => entry && typeof entry.url === 'string' && entry.url.trim());
  if (primary) {
    this.image = primary.url;
    this.imagePublicId = primary.public_id || this.imagePublicId || '';
  } else if (!this.image) {
    this.image = '';
    this.imagePublicId = '';
  }

  if (Array.isArray(this.sizes) && this.sizes.length > 0) {
    this.stock = this.sizes.reduce((sum, entry) => sum + Math.max(0, Number(entry && entry.stock) || 0), 0);
  } else {
    this.stock = Math.max(0, Number(this.stock) || 0);
  }

  if (this.oldPrice > 0 && this.price > 0 && this.oldPrice > this.price) {
    this.discount = Math.min(100, Math.round(((this.oldPrice - this.price) / this.oldPrice) * 100));
  } else if (this.discount > 0 && this.oldPrice <= 0) {
    this.discount = 0;
  }

  next();
});

productSchema.index({ name: 'text', category: 'text', slug: 'text' });
productSchema.index({ slug: 1 }, { unique: true, sparse: true });
productSchema.index({ sku: 1 }, { unique: true, sparse: true });

export default mongoose.model('Product', productSchema);
