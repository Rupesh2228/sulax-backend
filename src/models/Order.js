import mongoose from 'mongoose';

export const ORDER_STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

const itemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    price: { type: Number, required: true },
    size: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    customerName: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    paymentMethod: { type: String, enum: ['Cash on Delivery', 'Online Payment'], required: true },
    items: { type: [itemSchema], validate: (v) => v.length > 0 },
    deliveryCharge: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    status: { type: String, enum: ORDER_STATUSES, default: 'Pending', index: true },
  },
  { timestamps: true }
);

export default mongoose.model('Order', orderSchema);
