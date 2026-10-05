import { Router } from 'express';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Wishlist from '../models/Wishlist.js';
import ContactMessage from '../models/ContactMessage.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import SEO from '../models/SEO.js';
import Banner from '../models/Banner.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  adminUserUpdateSchema, bannerBodySchema, bannerStatusSchema, idParam, orderItemParam, productBodySchema, seoBodySchema, seoPageParam,
  statusSchema, userRoleSchema,
} from '../middleware/schemas.js';
import { uploadBanner, uploadImage } from '../middleware/upload.js';
import { adminActionLimiter } from '../middleware/rateLimit.js';
import { destroyCloudinaryImage } from '../config/cloudinary.js';

import { AppError, asyncHandler } from '../utils/helpers.js';
import { calculateOrderTotal, restoreStock } from '../utils/orders.js';
import { LOW_STOCK_THRESHOLD } from '../utils/inventory.js';
import { getIO } from '../socket.js';
import AdminPushSubscription from '../models/AdminPushSubscription.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// Delete a product image from Cloudinary using its stored public_id.
// Silently skips if the product has no image or if Cloudinary is unreachable.
const removeImage = (publicId) => destroyCloudinaryImage(publicId);


// ---- Dashboard ----
router.get('/stats', asyncHandler(async (_req, res) => {
  const [products, orders, customers, lowStock, revenueResult] = await Promise.all([
    Product.countDocuments(), Order.countDocuments(),
    User.countDocuments({ role: 'user' }),
    Product.find({ stock: { $lte: LOW_STOCK_THRESHOLD } }).select('name stock'),
    Order.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$totalAmount', '$total'] } } } },
    ]),
  ]);
  res.json({
    products,
    orders,
    customers,
    lowStock,
    revenue: revenueResult[0]?.total || 0,
  });
}));

// ---- Products ----
router.get('/products', asyncHandler(async (_req, res) => {
  const products = await Product.find().sort({ createdAt: -1 });
  res.json({ products });
}));

// multer must run first for multipart bodies, then zod validates the text fields.
router.post('/products', uploadImage, validate(productBodySchema), asyncHandler(async (req, res) => {
  const imageFiles = Array.isArray(req.files) ? req.files : [];
  const images = imageFiles.map((file) => ({ url: file.path, public_id: file.filename }));
  const product = await Product.create({
    ...req.body,
    image: images[0]?.url || req.body.image || '',
    imagePublicId: images[0]?.public_id || req.body.imagePublicId || '',
    images: images.length ? images : (Array.isArray(req.body.images) ? req.body.images : []),
  });
  res.status(201).json({ product });
}));

router.put('/products/:id', validate(idParam, 'params'), uploadImage, validate(productBodySchema),
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product) throw new AppError(404, 'Product not found.');

    const uploadedImages = Array.isArray(req.files) ? req.files : [];
    const nextImages = uploadedImages.length
      ? uploadedImages.map((file) => ({ url: file.path, public_id: file.filename }))
      : Array.isArray(req.body.images) ? req.body.images : product.images || [];

    Object.assign(product, req.body, {
      image: nextImages[0]?.url || req.body.image || product.image || '',
      imagePublicId: nextImages[0]?.public_id || req.body.imagePublicId || product.imagePublicId || '',
      images: nextImages,
    });

    if (uploadedImages.length && product.imagePublicId) {
      await removeImage(product.imagePublicId);
    }

    await product.save();
    res.json({ product });
  })
);

router.delete('/products/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) throw new AppError(404, 'Product not found.');

  const cloudinaryTargets = [product.imagePublicId, ...(product.images || []).map((image) => image.public_id).filter(Boolean)];
  await Promise.all([
    ...cloudinaryTargets.map((publicId) => removeImage(publicId)),
    Wishlist.deleteMany({ product: product._id }),
  ]);
  res.json({ message: 'Product deleted.' });
}));

// ---- Homepage banners ----
router.get('/banners', asyncHandler(async (_req, res) => {
  const banners = await Banner.find().sort({ order: 1, createdAt: 1 });
  res.json({ banners });
}));

router.post('/banners', uploadBanner, validate(bannerBodySchema), asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(400, 'Choose a banner image to upload.');
  const lastBanner = await Banner.findOne().sort({ order: -1 }).select('order');
  const banner = await Banner.create({
    ...req.body,
    image: req.file.path,
    imagePublicId: req.file.filename,
    order: lastBanner ? lastBanner.order + 1 : 0,
  });
  res.status(201).json({ banner });
}));

router.patch('/banners/:id/status', validate(idParam, 'params'), validate(bannerStatusSchema), asyncHandler(async (req, res) => {
  const banner = await Banner.findByIdAndUpdate(
    req.params.id,
    { isActive: req.body.isActive },
    { new: true, runValidators: true }
  );
  if (!banner) throw new AppError(404, 'Banner not found.');
  res.json({ banner });
}));

router.delete('/banners/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const banner = await Banner.findByIdAndDelete(req.params.id);
  if (!banner) throw new AppError(404, 'Banner not found.');
  await removeImage(banner.imagePublicId);
  res.json({ message: 'Banner deleted.' });
}));

// ---- Orders ----
router.get('/orders', asyncHandler(async (_req, res) => {
  const orders = await Order.find().sort({ _id: -1 }).limit(200).populate('user', 'name email');
  res.json({ orders });
}));

router.delete('/orders/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new AppError(404, 'Order not found.');

  const deletedOrder = await Order.findOneAndDelete({
    _id: order._id,
    __v: order.__v,
    status: order.status,
  });
  if (!deletedOrder) {
    throw new AppError(409, 'This order changed while you were deleting it. Refresh and try again.');
  }

  const stockRestored = ['Pending', 'Processing'].includes(deletedOrder.status);
  if (stockRestored) {
    try {
      await restoreStock(deletedOrder);
    } catch (err) {
      console.error(`Order ${deletedOrder._id} was deleted, but stock restoration failed:`, err);
      throw new AppError(500, 'The order was deleted, but inventory could not be fully restored. Please reconcile stock.');
    }
  }

  res.json({ message: 'Order deleted.', stockRestored });
}));

router.patch('/orders/:id/status', validate(idParam, 'params'), validate(statusSchema),
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) throw new AppError(404, 'Order not found.');
    if (order.status === 'Cancelled') throw new AppError(400, 'A cancelled order cannot be changed.');
    const cancelling = req.body.status === 'Cancelled';
    order.status = req.body.status;
    await order.save();
    if (cancelling) await restoreStock(order);
    res.json({ order });
  })
);

router.delete('/orders/:id/items/:index', validate(orderItemParam, 'params'),
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) throw new AppError(404, 'Order not found.');
    const itemIndex = req.params.index;
    if (itemIndex >= order.items.length) throw new AppError(404, 'Order item not found.');
    if (order.items.length <= 1) {
      throw new AppError(400, 'The last item cannot be removed. Keep the order record intact.');
    }

    const removedItem = order.items[itemIndex];
    const remainingItems = order.items.filter((_item, index) => index !== itemIndex);
    const nextTotal = calculateOrderTotal(remainingItems, order.deliveryCharge);
    const shouldRestoreStock = ['Pending', 'Processing'].includes(order.status);

    if (shouldRestoreStock) {
      await Product.updateOne(
        { _id: removedItem.product, 'sizes.size': removedItem.size },
        { $inc: { 'sizes.$.stock': removedItem.quantity, stock: removedItem.quantity } }
      );
    }

    let updatedOrder;
    try {
      updatedOrder = await Order.findOneAndUpdate(
        { _id: order._id, __v: order.__v, status: order.status },
        {
          $set: { items: remainingItems, totalAmount: nextTotal },
          $inc: { __v: 1 },
        },
        { new: true, runValidators: true }
      );
      if (!updatedOrder) {
        throw new AppError(409, 'This order changed while you were editing it. Refresh and try again.');
      }
    } catch (err) {
      if (shouldRestoreStock) {
        await Product.updateOne(
          { _id: removedItem.product, 'sizes.size': removedItem.size },
          { $inc: { 'sizes.$.stock': -removedItem.quantity, stock: -removedItem.quantity } }
        );
      }
      throw err;
    }

    res.json({
      order: updatedOrder,
      removedItem: {
        productName: removedItem.productName,
        quantity: removedItem.quantity,
      },
      stockRestored: shouldRestoreStock,
    });
  })
);

// ---- Customers & user management ----
router.get('/customers', asyncHandler(async (_req, res) => {
  const customers = await User.find({ role: 'user' }).sort({ createdAt: -1 }).select('name email phone createdAt');
  res.json({ customers });
}));
router.get('/users', asyncHandler(async (_req, res) => {
  const users = await User.find().sort({ createdAt: -1 })
    .select('name email phone address role createdAt');
  res.json({ users });
}));

router.put('/users/:id', adminActionLimiter, validate(idParam, 'params'), validate(adminUserUpdateSchema), asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError(404, 'User not found.');
  if (await User.exists({ email: req.body.email, _id: { $ne: user._id } })) {
    throw new AppError(409, 'That email address is already in use.');
  }
  Object.assign(user, req.body);
  await user.save();
  res.json({ user: user.toSafeJSON(), message: 'User updated.' });
}));

async function changeUserRole(targetId, role, actingAdminId) {
  if (targetId === actingAdminId.toString()) {
    throw new AppError(400, 'You cannot change your own admin role.');
  }
  const user = await User.findById(targetId);
  if (!user) throw new AppError(404, 'User not found.');

  if (user.role === 'admin' && role !== 'admin') {
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount <= 1) throw new AppError(400, 'The last administrator cannot be demoted.');
  }

  if (user.role !== role) {
    user.role = role;
    if (role !== 'admin') user.tokenVersion += 1;
    await user.save();
    const userRoom = `user:${user._id.toString()}`;
    getIO()?.to(userRoom).emit('auth:role-changed');
    if (role !== 'admin') {
      await AdminPushSubscription.deleteMany({ adminId: user._id });
      getIO()?.in(userRoom).disconnectSockets(true);
    }
  }
  return user;
}

router.patch('/customers/:id/role', adminActionLimiter, validate(idParam, 'params'), validate(userRoleSchema),
  asyncHandler(async (req, res) => {
    const user = await changeUserRole(req.params.id, req.body.role, req.user._id);
    res.json({ user: user.toSafeJSON(), message: 'User role updated.' });
  })
);

router.patch('/users/:id/role', adminActionLimiter, validate(idParam, 'params'), validate(userRoleSchema),
  asyncHandler(async (req, res) => {
    const user = await changeUserRole(req.params.id, req.body.role, req.user._id);
    res.json({ user: user.toSafeJSON(), message: 'User role updated.' });
  })
);

// Delete a user (admin can remove any user)
router.delete('/users/:id', adminActionLimiter, validate(idParam, 'params'), asyncHandler(async (req, res) => {

  if (req.params.id === req.user._id.toString()) {
    throw new AppError(400, 'You cannot delete your own account from this screen.');
  }
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError(404, 'User not found.');
  if (user.role === 'admin' && await User.countDocuments({ role: 'admin' }) <= 1) {
    throw new AppError(400, 'The last administrator cannot be deleted.');
  }
  const conversations = await Conversation.find({ customer: user._id }).select('_id');
  const conversationIds = conversations.map((conversation) => conversation._id);
  if (conversationIds.length) {
    await Message.deleteMany({ conversationId: { $in: conversationIds } });
    await Conversation.deleteMany({ _id: { $in: conversationIds } });
    const removal = {
      conversationIds: conversationIds.map((id) => id.toString()),
      customerId: user._id.toString(),
    };
    getIO()?.to('admin_room').emit('conversations_removed', removal);
    getIO()?.to(`user:${user._id.toString()}`).emit('conversations_removed', removal);
  }
  await User.deleteOne({ _id: user._id });
  await AdminPushSubscription.deleteMany({ adminId: user._id });
  getIO()?.in(`user:${user._id.toString()}`).disconnectSockets(true);
  res.json({ message: 'User deleted.' });
}));

router.get('/messages', asyncHandler(async (_req, res) => {
  res.json({ messages: await ContactMessage.find().sort({ createdAt: -1 }).limit(200) });
}));

router.patch('/messages/:id/read', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await ContactMessage.updateOne({ _id: req.params.id }, { isRead: true });
  res.json({ message: 'Marked as read.' });
}));

// ---- SEO Settings ----
router.get('/seo', asyncHandler(async (_req, res) => {
  const seo = await SEO.find().sort({ createdAt: 1 });
  res.json({ seo });
}));

router.put('/seo/:page', validate(seoPageParam, 'params'), validate(seoBodySchema), asyncHandler(async (req, res) => {
  const page = req.params.page.toLowerCase();
  const updated = await SEO.findOneAndUpdate(
    { page },
    { ...req.body, pageName: req.body.pageName || page, page },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  res.json({ seo: updated, message: 'SEO settings saved successfully.' });
}));

export default router;
