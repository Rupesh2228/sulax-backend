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

// Place order. The client sends ONLY product ids / size / qty -> prices, names and
// totals are always taken from the database, never from the browser.
router.post('/', orderLimiter, validate(orderSchema), asyncHandler(async (req, res) => {
  const { name, phone, address, payment, items } = req.body;

  // merge duplicate product+size lines
  const merged = new Map();
  for (const it of items) {
    const key = `${it.productId}:${it.size}`;
    merged.set(key, { ...it, quantity: (merged.get(key)?.quantity || 0) + it.quantity });
  }
  const lines = [...merged.values()];

  const perProduct = new Map();
  for (const l of lines) perProduct.set(l.productId, (perProduct.get(l.productId) || 0) + l.quantity);

  const products = await Product.find({ _id: { $in: [...perProduct.keys()] } });
  const byId = new Map(products.map((p) => [p.id, p]));

  for (const [pid, qty] of perProduct) {
    const p = byId.get(pid);
    if (!p) throw new AppError(400, 'Product not found.');
    if (p.stock < qty) throw new AppError(409, `Sorry! ${p.name} has only ${p.stock} item(s) available.`);
  }

  // Atomic stock reservation (stock >= qty is checked inside the update itself, so two
  // simultaneous buyers can never oversell). Rolled back if anything fails.
  const reserved = [];
  const stockAfterReservation = new Map();
  let order;
  try {
    for (const [pid, qty] of perProduct) {
      const updatedProduct = await Product.findOneAndUpdate(
        { _id: pid, stock: { $gte: qty } },
        { $inc: { stock: -qty } },
        { new: true }
      );
      if (!updatedProduct) {
        throw new AppError(409, `${byId.get(pid).name} is no longer available in that quantity.`);
      }
      reserved.push([pid, qty]);
      stockAfterReservation.set(pid, updatedProduct.stock);
    }

    const orderItems = lines.map((l) => {
      const p = byId.get(l.productId);
      return { product: p._id, productName: p.name, price: p.price, size: l.size, quantity: l.quantity };
    });
    const itemsTotal = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);

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
    await Promise.all(reserved.map(([pid, qty]) => Product.updateOne({ _id: pid }, { $inc: { stock: qty } })));
    throw err;
  }

  try {
    await notifyAdminOfOrder(order);
  } catch (err) {
    console.error('Order was saved, but admin notification could not be saved:', err);
  }
  for (const [productId, quantity] of perProduct) {
    const product = byId.get(productId);
    const remainingStock = stockAfterReservation.get(productId);
    const previousStock = remainingStock + quantity;
    if (previousStock > LOW_STOCK_THRESHOLD && remainingStock <= LOW_STOCK_THRESHOLD) {
      try {
        await notifyAdminOfLowStock(order, product, remainingStock);
      } catch (err) {
        console.error(`Order was saved, but low-stock notification for product ${productId} could not be saved:`, err);
      }
    }
  }
  res.status(201).json({ order });
}));

router.get('/', asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ _id: -1 });
  res.json({ orders });
}));

// IDOR protection: the query always includes the logged-in user's id.
router.get('/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
  if (!order) throw new AppError(404, 'Order not found.');
  res.json({ order });
}));

router.post('/:id/cancel', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  // Only pending orders can be cancelled; the status flip prevents double stock restoration.
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
