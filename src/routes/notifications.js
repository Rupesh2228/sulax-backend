import { Router } from 'express';
import { z } from 'zod';
import Notification from '../models/Notification.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../middleware/schemas.js';
import { AppError, asyncHandler } from '../utils/helpers.js';
import { getIO } from '../socket.js';
import AdminPushSubscription from '../models/AdminPushSubscription.js';
import { env } from '../config/env.js';
import { pushSubscriptionRemovalSchema, pushSubscriptionSchema } from '../middleware/schemas.js';

const router = Router();
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

router.use(requireAuth, requireAdmin);

router.get('/push-config', (_req, res) => {
  res.json({
    enabled: Boolean(env.webPush),
    publicKey: env.webPush?.publicKey || null,
  });
});

const pushStatusQuery = z.object({
  endpoint: z.string().url().max(2048).optional(),
});

router.get('/push-status', validate(pushStatusQuery, 'query'), asyncHandler(async (req, res) => {
  const devices = await AdminPushSubscription.countDocuments({ adminId: req.user._id });
  const currentBrowserRegistered = req.query.endpoint
    ? Boolean(await AdminPushSubscription.exists({ adminId: req.user._id, endpoint: req.query.endpoint }))
    : false;
  res.json({ devices, currentBrowserRegistered, enabled: Boolean(env.webPush) });
}));

router.post('/push-subscription', validate(pushSubscriptionSchema), asyncHandler(async (req, res) => {
  if (!env.webPush) throw new AppError(503, 'Desktop push notifications are not configured on this server.');
  const { endpoint, keys, expirationTime } = req.body;
  const existing = await AdminPushSubscription.findOne({ endpoint }).select('adminId');
  if (existing && !existing.adminId.equals(req.user._id)) {
    throw new AppError(409, 'This browser subscription is associated with another admin account.');
  }
  let subscription;
  try {
    subscription = await AdminPushSubscription.findOneAndUpdate(
      { endpoint, adminId: req.user._id },
      {
        $set: {
          endpoint,
          keys,
          expirationTime: expirationTime ?? null,
          userAgent: (req.get('user-agent') || '').slice(0, 300),
        },
        $setOnInsert: { adminId: req.user._id },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err.code === 11000) {
      throw new AppError(409, 'This browser subscription is associated with another admin account.');
    }
    throw err;
  }
  res.status(201).json({ message: 'This browser is registered for desktop notifications.', subscriptionId: subscription._id });
}));

router.delete('/push-subscription', validate(pushSubscriptionRemovalSchema), asyncHandler(async (req, res) => {
  const result = await AdminPushSubscription.deleteOne({
    endpoint: req.body.endpoint,
    adminId: req.user._id,
  });
  res.json({ removed: result.deletedCount > 0 });
}));

router.get('/', validate(listQuery, 'query'), asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const filter = { recipientId: req.user._id };
  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...filter, isRead: false }),
  ]);

  res.json({ notifications, page, limit, total, hasMore: page * limit < total, unreadCount });
}));

router.get('/unread-count', asyncHandler(async (req, res) => {
  const unreadCount = await Notification.countDocuments({ recipientId: req.user._id, isRead: false });
  res.json({ unreadCount });
}));

router.patch('/read-all', asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { recipientId: req.user._id, isRead: false },
    { $set: { isRead: true } }
  );
  getIO()?.to(`user:${req.user._id.toString()}`).emit('notification:changed', { action: 'read-all' });
  res.json({ modifiedCount: result.modifiedCount });
}));

router.delete('/', asyncHandler(async (req, res) => {
  const result = await Notification.deleteMany({ recipientId: req.user._id });
  getIO()?.to(`user:${req.user._id.toString()}`).emit('notification:changed', { action: 'clear' });
  res.json({ deletedCount: result.deletedCount });
}));

router.patch('/:id/read', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipientId: req.user._id },
    { $set: { isRead: true } },
    { new: true }
  );
  if (!notification) throw new AppError(404, 'Notification not found.');
  getIO()?.to(`user:${req.user._id.toString()}`).emit('notification:changed', {
    action: 'read',
    notificationId: notification._id.toString(),
  });
  res.json({ notification });
}));

router.delete('/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndDelete({
    _id: req.params.id,
    recipientId: req.user._id,
  });
  if (!notification) throw new AppError(404, 'Notification not found.');
  getIO()?.to(`user:${req.user._id.toString()}`).emit('notification:changed', {
    action: 'delete',
    notificationId: notification._id.toString(),
  });
  res.json({ message: 'Notification deleted.' });
}));

export default router;
