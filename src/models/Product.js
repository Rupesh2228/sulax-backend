import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    category: { type: String, required: true, trim: true, maxlength: 80, index: true },
    description: { type: String, default: '', maxlength: 5000 },
    price: { type: Number, required: true, min: 0 },
    oldPrice: { type: Number, min: 0, default: 0 },
    discount: { type: Number, min: 0, max: 100, default: 0 },
    image: { type: String, default: '' }, // Full URL or filename
    imagePublicId: { type: String, default: '' }, // Cloudinary public_id for image deletion
    stock: { type: Number, required: true, min: 0, default: 0 },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

productSchema.index({ name: 'text', category: 'text' });

export default mongoose.model('Product', productSchema);
