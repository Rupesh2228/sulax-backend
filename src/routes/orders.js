import { Router } from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam, orderSchema } from '../middleware/schemas.js';
import { orderLimiter } from '../middleware/rateLimit.js';
import { AppError, asyncHandler } from '../utils/helpers.js';
import { restoreStock } from '../utils/orders.js';
import { LOW_STOCK_THRESHOLD } from '../utils/inventory.js';
import { notifyAdminOfLowStock, notifyAdminOfOrder } from '../services/adminNotifications.js';

const router = Router();
const DELIVERY_CHARGE = 100;
const money = (n) => Math.round(n * 100) / 100;

router.use(requireAuth);

const getSizeStock = (product, size) => {
  const entry = (product?.sizes || []).find((item) => String(item.size) === String(size));
  return entry ? Math.max(0, Number(entry.stock) || 0) : 0;
};

router.post('/', orderLimiter, validate(orderSchema), asyncHandler(async (req, res) => {
  const { name, phone, address, payment, items } = req.body;

  const merged = new Map();
  for (const it of items) {
    const key = `${it.productId}:${it.size}`;
    merged.set(key, { ...it, quantity: (merged.get(key)?.quantity || 0) + it.quantity });
  }
  const lines = [...merged.values()];

  const products = await Product.find({ _id: { $in: [...new Set(lines.map((line) => line.productId))] } });
  const byId = new Map(products.map((p) => [p.id, p]));

  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) throw new AppError(400, 'Product not found.');
    const available = getSizeStock(product, line.size);
    if (available < line.quantity) {
      throw new AppError(409, `Sorry! ${product.name} only has ${available} item(s) left for size ${line.size}.`);
    }
  }

  const reserved = [];
  const stockAfterReservation = new Map();
  let order;

  try {
    for (const line of lines) {
      const product = byId.get(line.productId);
      const updatedProduct = await Product.findOneAndUpdate(
        { _id: line.productId, 'sizes.size': line.size, 'sizes.$.stock': { $gte: line.quantity } },
        { $inc: { 'sizes.$.stock': -line.quantity, stock: -line.quantity } },
        { new: true }
      );
      if (!updatedProduct) {
        throw new AppError(409, `${product.name} is no longer available in size ${line.size}.`);
      }
      reserved.push([line.productId, line.size, line.quantity]);
      stockAfterReservation.set(`${line.productId}:${line.size}`, getSizeStock(updatedProduct, line.size));
    }

    const orderItems = lines.map((line) => {
      const product = byId.get(line.productId);
      return { product: product._id, productName: product.name, price: product.price, size: line.size, quantity: line.quantity };
    });
    const itemsTotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    order = await Order.create({
      user: req.user._id,
      customerName: name,
      phone,
      address,
      paymentMethod: payment,
      items: orderItems,
      deliveryCharge: DELIVERY_CHARGE,
      totalAmount: money(itemsTotal + DELIVERY_CHARGE),
    });
  } catch (err) {
    await Promise.all(
      reserved.map(async ([productId, size, quantity]) => {
        await Product.updateOne(
          { _id: productId, 'sizes.size': size },
          { $inc: { 'sizes.$.stock': quantity, stock: quantity } }
        );
      })
    );
    throw err;
  }

  try {
    await notifyAdminOfOrder(order);
  } catch (err) {
    console.error('Order was saved, but admin notification could not be saved:', err);
  }

  for (const line of lines) {
    const product = byId.get(line.productId);
    const remainingStock = stockAfterReservation.get(`${line.productId}:${line.size}`) || 0;
    const previousStock = remainingStock + line.quantity;
    if (previousStock > LOW_STOCK_THRESHOLD && remainingStock <= LOW_STOCK_THRESHOLD) {
      try {
        await notifyAdminOfLowStock(order, product, remainingStock);
      } catch (err) {
        console.error(`Order was saved, but low-stock notification for product ${line.productId} could not be saved:`, err);
      }
    }
  }

  res.status(201).json({ order });
}));

router.get('/', asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ _id: -1 });
  res.json({ orders });
}));

router.get('/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
  if (!order) throw new AppError(404, 'Order not found.');
  res.json({ order });
}));

router.post('/:id/cancel', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id, status: 'Pending' },
    { status: 'Cancelled' },
    { new: true }
  );
  if (!order) throw new AppError(400, 'This order can no longer be cancelled.');
  await restoreStock(order);
  res.json({ order, message: 'Order cancelled successfully and stock was restored.' });
}));

export default router;
