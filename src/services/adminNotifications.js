import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { sendAdminPushNotification } from './webPush.js';

export async function createAdminNotification({
  type,
  title,
  message,
  eventKey,
  relatedOrderId,
  relatedMessageId,
  relatedConversationId,
  relatedUserId,
  relatedProductId,
}) {
  const admins = await User.find({ role: 'admin' }).select('_id');
  const created = [];

  for (const admin of admins) {
    const notificationData = {
      recipientId: admin._id,
      type,
      title,
      message: message.slice(0, 300),
      eventKey,
      relatedOrderId,
      relatedMessageId,
      relatedConversationId,
      relatedUserId,
      relatedProductId,
    };

    let notification;
    try {
      notification = await Notification.create(notificationData);
    } catch (err) {
      if (err.code === 11000) continue;
      throw err;
    }

    created.push(notification);
    const { getIO } = await import('../socket.js');
    getIO()?.to(`user:${admin._id.toString()}`).emit('notification:created', {
      notification: notification.toJSON(),
    });
    void sendAdminPushNotification(admin._id, notification).catch((err) => {
      console.error(`Could not send push notifications for admin ${admin._id}:`, err);
    });
  }

  return created;
}

export async function notifyAdminOfRegistration(user) {
  return createAdminNotification({
    type: 'registration',
    title: 'New customer registered',
    message: `${user.name} created a customer account.`,
    eventKey: `registration:${user._id}`,
    relatedUserId: user._id,
  });
}

export async function notifyAdminOfOrder(order) {
  return createAdminNotification({
    type: 'order',
    title: `New order #${order._id.toString().slice(-8).toUpperCase()}`,
    message: `${order.customerName} placed an order for Rs. ${order.totalAmount.toFixed(2)}.`,
    eventKey: `order:${order._id}`,
    relatedOrderId: order._id,
    relatedUserId: order.user,
  });
}

export async function notifyAdminOfLowStock(order, product, remainingStock) {
  return createAdminNotification({
    type: 'inventory',
    title: 'Low stock alert',
    message: `${product.name} has ${remainingStock} item(s) remaining.`,
    eventKey: `low-stock:${order._id}:${product._id}`,
    relatedOrderId: order._id,
    relatedProductId: product._id,
  });
}

export async function notifyAdminOfCustomerMessage(message, conversation, customerName) {
  const preview = message.text.length > 140 ? `${message.text.slice(0, 137)}...` : message.text;
  return createAdminNotification({
    type: 'message',
    title: `New message from ${customerName}`,
    message: preview,
    eventKey: `message:${message._id}`,
    relatedMessageId: message._id,
    relatedConversationId: conversation._id,
    relatedUserId: conversation.customer,
  });
}
