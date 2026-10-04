import { Router } from 'express';
import { z } from 'zod';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam, objectId, adminConversationQuerySchema, messageListQuerySchema } from '../middleware/schemas.js';
import { messageLimiter } from '../middleware/rateLimit.js';
import { AppError, asyncHandler, escapeRegex } from '../utils/helpers.js';
import { getIO } from '../socket.js';
import { notifyAdminOfCustomerMessage } from '../services/adminNotifications.js';

const router = Router();
router.use(requireAuth);

const sendMessageSchema = z.object({
  conversationId: objectId.optional(),
  text: z.string().trim().min(1, 'Message cannot be empty.').max(4000, 'Message is too long.'),
  clientTempId: z.string().max(100).optional(),
});

router.delete('/admin/messages/:id', requireAdmin, validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const message = await Message.findById(req.params.id);
  if (!message) throw new AppError(404, 'Message not found.');

  const conversation = await Conversation.findById(message.conversationId);
  if (!conversation) {
    await Message.deleteOne({ _id: message._id });
    return res.json({ messageId: message._id, conversationId: message.conversationId });
  }

  await Message.deleteOne({ _id: message._id });
  const [latestMessage, unreadByCustomer, unreadByAdmin] = await Promise.all([
    Message.findOne({ conversationId: conversation._id }).sort({ createdAt: -1, _id: -1 }),
    Message.countDocuments({ conversationId: conversation._id, senderRole: 'admin', status: { $ne: 'read' } }),
    Message.countDocuments({ conversationId: conversation._id, senderRole: 'user', status: { $ne: 'read' } }),
  ]);

  conversation.lastMessage = latestMessage
    ? {
        text: latestMessage.text,
        sender: latestMessage.sender,
        senderRole: latestMessage.senderRole,
        createdAt: latestMessage.createdAt,
      }
    : { text: '', sender: undefined, senderRole: undefined, createdAt: conversation.createdAt };
  conversation.lastMessageAt = latestMessage?.createdAt || conversation.createdAt;
  conversation.unreadCountCustomer = unreadByCustomer;
  conversation.unreadCountAdmin = unreadByAdmin;
  await conversation.save();

  const populatedConversation = await Conversation.findById(conversation._id)
    .populate('customer', 'name email phone');
  const io = getIO();
  const deletion = {
    conversationId: conversation._id.toString(),
    messageId: message._id.toString(),
  };
  io?.to(`conversation:${conversation._id}`).emit('message_deleted', deletion);
  io?.to('admin_room').emit('message_deleted', deletion);
  io?.to(`user:${conversation.customer.toString()}`).emit('message_deleted', deletion);
  io?.to('admin_room').emit('conversation_updated', { conversation: populatedConversation });
  io?.to(`user:${conversation.customer.toString()}`).emit('conversation_updated', {
    conversation: populatedConversation,
  });

  res.json({ messageId: message._id, conversation: populatedConversation });
}));

// 1. Get or create current customer's conversation
router.get('/my-conversation', asyncHandler(async (req, res) => {
  let conv = await Conversation.findOne({ customer: req.user._id }).populate('customer', 'name email phone');
  if (!conv) {
    conv = await Conversation.create({
      customer: req.user._id,
      lastMessageAt: new Date(),
    });
    conv = await Conversation.findById(conv._id).populate('customer', 'name email phone');
  }
  res.json({ conversation: conv });
}));

// 2. Get unread message count for current user
router.get('/unread-count', asyncHandler(async (req, res) => {
  if (req.user.role === 'admin') {
    const total = await Conversation.aggregate([
      { $group: { _id: null, totalUnread: { $sum: '$unreadCountAdmin' } } },
    ]);
    return res.json({ unreadCount: total[0]?.totalUnread || 0 });
  }

  const conv = await Conversation.findOne({ customer: req.user._id }).select('unreadCountCustomer');
  res.json({ unreadCount: conv?.unreadCountCustomer || 0 });
}));

// 3. Admin: list all customer conversations
router.get('/admin/conversations', requireAdmin, validate(adminConversationQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const { search, filter } = req.query;
  const query = {};

  if (filter === 'unread') {
    query.unreadCountAdmin = { $gt: 0 };
  }

  if (search && search.trim()) {
    const safeRegex = new RegExp(escapeRegex(search.trim()), 'i');
    const matchedUsers = await User.find({
      $or: [{ name: safeRegex }, { email: safeRegex }, { phone: safeRegex }],
    }).select('_id');
    const userIds = matchedUsers.map((u) => u._id);
    query.customer = { $in: userIds };
  }

  const conversations = await Conversation.find(query)
    .sort({ lastMessageAt: -1 })
    .limit(100)
    .populate('customer', 'name email phone');

  const totalUnreadResult = await Conversation.aggregate([
    { $group: { _id: null, totalUnread: { $sum: '$unreadCountAdmin' } } },
  ]);

  res.json({
    conversations,
    totalUnread: totalUnreadResult[0]?.totalUnread || 0,
  });
}));

// 4. Retrieve messages for a conversation with pagination
router.get('/conversations/:id/messages', validate(idParam, 'params'), validate(messageListQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const conv = await Conversation.findById(req.params.id);
  if (!conv) throw new AppError(404, 'Conversation not found.');

  // Access check
  if (req.user.role !== 'admin' && !conv.customer.equals(req.user._id)) {
    throw new AppError(403, 'Access denied to this conversation.');
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const before = req.query.before; // cursor: message ID or date

  const query = { conversationId: conv._id };
  if (before) {
    if (before.match(/^[a-f\d]{24}$/i)) {
      query._id = { $lt: before };
    } else {
      query.createdAt = { $lt: new Date(before) };
    }
  }

  const messagesDesc = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .populate('sender', 'name email role');

  const hasMore = messagesDesc.length > limit;
  const messagesToReturn = hasMore ? messagesDesc.slice(0, limit) : messagesDesc;

  // Return in chronological order (oldest to newest)
  const messages = messagesToReturn.reverse();

  res.json({
    conversationId: conv._id,
    messages,
    hasMore,
    nextCursor: messages.length > 0 ? messages[0]._id : null,
  });
}));

// 5. Send message via REST API
router.post('/send', messageLimiter, validate(sendMessageSchema), asyncHandler(async (req, res) => {

  const { conversationId, text, clientTempId } = req.body;
  let conv;

  if (req.user.role === 'admin') {
    if (!conversationId) throw new AppError(400, 'conversationId is required for admin replies.');
    conv = await Conversation.findById(conversationId);
    if (!conv) throw new AppError(404, 'Conversation not found.');
  } else {
    conv = await Conversation.findOne({ customer: req.user._id });
    if (!conv) {
      conv = await Conversation.create({
        customer: req.user._id,
        lastMessageAt: new Date(),
      });
    }
  }

  // Deduplication check
  if (clientTempId) {
    const existing = await Message.findOne({
      conversationId: conv._id,
      clientTempId,
    }).populate('sender', 'name email role');
    if (existing) {
      return res.json({ message: existing, duplicate: true });
    }
  }

  const now = new Date();
  const message = await Message.create({
    conversationId: conv._id,
    sender: req.user._id,
    senderRole: req.user.role,
    text: text.trim(),
    status: 'sent',
    clientTempId: clientTempId || undefined,
  });

  conv.lastMessage = {
    text: message.text,
    sender: req.user._id,
    senderRole: req.user.role,
    createdAt: now,
  };
  conv.lastMessageAt = now;
  if (req.user.role === 'user') {
    conv.unreadCountAdmin += 1;
  } else {
    conv.unreadCountCustomer += 1;
  }
  await conv.save();

  const populatedMessage = await Message.findById(message._id).populate('sender', 'name email role');
  const populatedConv = await Conversation.findById(conv._id).populate('customer', 'name email phone');

  if (req.user.role === 'user') {
    try {
      await notifyAdminOfCustomerMessage(message, conv, req.user.name);
    } catch (err) {
      console.error('Customer message was saved, but admin notification could not be saved:', err);
    }
  }

  // Broadcast through Socket.IO if available
  const io = getIO();
  if (io) {
    io.to(`conversation:${conv._id.toString()}`).emit('new_message', {
      conversationId: conv._id.toString(),
      message: populatedMessage,
    });
    io.to('admin_room').emit('conversation_updated', {
      conversation: populatedConv,
    });
    io.to(`user:${conv.customer.toString()}`).emit('new_message_notification', {
      conversationId: conv._id.toString(),
      message: populatedMessage,
      conversation: populatedConv,
    });
  }

  res.status(201).json({ message: populatedMessage, conversation: populatedConv });
}));

// 6. Mark conversation as read
router.patch('/conversations/:id/read', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const conv = await Conversation.findById(req.params.id);
  if (!conv) throw new AppError(404, 'Conversation not found.');

  if (req.user.role !== 'admin' && !conv.customer.equals(req.user._id)) {
    throw new AppError(403, 'Access denied.');
  }

  const now = new Date();
  if (req.user.role === 'admin') {
    await Message.updateMany(
      {
        conversationId: conv._id,
        senderRole: 'user',
        status: { $ne: 'read' },
      },
      { status: 'read', readAt: now }
    );
    conv.unreadCountAdmin = 0;
  } else {
    await Message.updateMany(
      {
        conversationId: conv._id,
        senderRole: 'admin',
        status: { $ne: 'read' },
      },
      { status: 'read', readAt: now }
    );
    conv.unreadCountCustomer = 0;
  }
  await conv.save();

  const populatedConv = await Conversation.findById(conv._id).populate('customer', 'name email phone');

  const io = getIO();
  if (io) {
    io.to(`conversation:${conv._id.toString()}`).emit('messages_read', {
      conversationId: conv._id.toString(),
      readBy: req.user._id,
      role: req.user.role,
      readAt: now,
    });
    io.to('admin_room').emit('conversation_updated', {
      conversation: populatedConv,
    });
    io.to(`user:${conv.customer.toString()}`).emit('conversation_updated', {
      conversation: populatedConv,
    });
  }

  res.json({ success: true, conversation: populatedConv });
}));

export default router;
