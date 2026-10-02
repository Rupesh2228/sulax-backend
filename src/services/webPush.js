import webPush from 'web-push';
import AdminPushSubscription from '../models/AdminPushSubscription.js';
import { env } from '../config/env.js';

if (env.webPush) {
  webPush.setVapidDetails(env.webPush.subject, env.webPush.publicKey, env.webPush.privateKey);
}

function notificationUrl(notification) {
  if (notification.relatedOrderId) {
    return `/sulax-itnb-admain/orders?order=${notification.relatedOrderId}`;
  }
  if (notification.relatedConversationId) {
    return `/sulax-itnb-admain/messages?conversation=${notification.relatedConversationId}`;
  }
  if (notification.relatedProductId) return '/sulax-itnb-admain/products';
  if (notification.relatedUserId) {
    return `/sulax-itnb-admain/customers?customer=${notification.relatedUserId}`;
  }
  return '/sulax-itnb-admain';
}

function safePushContent(notification) {
  if (notification.type === 'message') {
    return { title: 'New customer message', body: 'A customer sent a support message.' };
  }
  if (notification.type === 'registration') {
    return { title: 'New customer registered', body: 'A new customer account was created.' };
  }
  if (notification.type === 'order') {
    return { title: notification.title, body: 'A new customer order was placed.' };
  }
  if (notification.type === 'inventory') {
    return { title: 'Low stock alert', body: 'A product has reached the low-stock threshold.' };
  }
  if (notification.type === 'payment') {
    return { title: 'Payment update', body: 'A payment status has changed.' };
  }
  return { title: notification.title, body: 'There is a new Sulax Shop admin update.' };
}

export async function sendAdminPushNotification(adminId, notification) {
  if (!env.webPush) return;
  const subscriptions = await AdminPushSubscription.find({ adminId }).lean();
  const content = safePushContent(notification);
  const payload = JSON.stringify({
    notificationId: notification._id.toString(),
    type: notification.type,
    title: content.title,
    body: content.body,
    url: notificationUrl(notification),
    timestamp: notification.createdAt,
  });

  await Promise.all(subscriptions.map(async (subscription) => {
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      expirationTime: subscription.expirationTime,
    };

    try {
      await webPush.sendNotification(pushSubscription, payload, { TTL: 60 * 60 });
      await AdminPushSubscription.updateOne({ _id: subscription._id }, { $set: { lastUsedAt: new Date() } });
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await AdminPushSubscription.deleteOne({ _id: subscription._id });
        return;
      }
      console.error(`Web push delivery failed for admin subscription ${subscription._id}:`, err.message);
    }
  }));
}
