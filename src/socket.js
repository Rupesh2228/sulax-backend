import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import User from './models/User.js';
import { notifyAdminOfCustomerMessage } from './services/adminNotifications.js';
import Conversation from './models/Conversation.js';
import Message from './models/Message.js';
import { COOKIE_NAME } from './middleware/auth.js';

let io = null;

// Track online users: userId -> Set of socketIds
const onlineUsers = new Map();

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  const cookies = {};
  cookieHeader.split(';').forEach((item) => {
    const parts = item.trim().split('=');
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const val = parts.slice(1).join('=');
      cookies[name] = decodeURIComponent(val);
    }
  });
  return cookies;
}

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin(origin, cb) {
        cb(null, env.isAllowedOrigin(origin));
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Socket Authentication Middleware
  io.use(async (socket, next) => {
    try {
      let token = socket.handshake.auth?.token;
      if (!token && socket.request.headers.cookie) {
        const parsed = parseCookies(socket.request.headers.cookie);
        token = parsed[COOKIE_NAME];
      }

      if (!token) {
        return next(new Error('Authentication required: sulax_token missing'));
      }

      const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
      const user = await User.findById(payload.sub);
      if (!user || user.tokenVersion !== payload.tv) {
        return next(new Error('Invalid or revoked session'));
      }

      socket.user = user;
      next();
    } catch (err) {
      return next(new Error('Socket authentication failed: ' + err.message));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    const userIdStr = user._id.toString();

    // Track user presence
    if (!onlineUsers.has(userIdStr)) {
      onlineUsers.set(userIdStr, new Set());
    }
    onlineUsers.get(userIdStr).add(socket.id);

    // Personal user room
    socket.join(`user:${userIdStr}`);

    // Admin-wide room
    if (user.role === 'admin') {
      socket.join('admin_room');
    }

    // Broadcast online status
    io.emit('user_presence', {
      userId: userIdStr,
      role: user.role,
      status: 'online',
    });

    // 1. Join Conversation Room
    socket.on('join_conversation', async ({ conversationId }, callback) => {
      try {
        if (!conversationId) {
          return callback?.({ error: 'Conversation ID required' });
        }
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          return callback?.({ error: 'Conversation not found' });
        }

        // Security check: only the conversation customer or an admin can join
        if (user.role !== 'admin' && conversation.customer.toString() !== userIdStr) {
          return callback?.({ error: 'Unauthorized to join this conversation' });
        }

        socket.join(`conversation:${conversationId}`);

        // If customer joins or admin joins, check if messages can be marked as delivered
        const pendingDelivered = await Message.updateMany(
          {
            conversationId: conversation._id,
            sender: { $ne: user._id },
            status: 'sent',
          },
          { status: 'delivered', deliveredAt: new Date() }
        );

        if (pendingDelivered.modifiedCount > 0) {
          io.to(`conversation:${conversationId}`).emit('messages_delivered', {
            conversationId,
            deliveredAt: new Date(),
          });
        }

        callback?.({ success: true, conversationId });
      } catch (err) {
        console.error('Socket join_conversation error:', err);
        callback?.({ error: 'Failed to join conversation' });
      }
    });

    // 2. Leave Conversation Room
    socket.on('leave_conversation', ({ conversationId }) => {
      if (conversationId) {
        socket.leave(`conversation:${conversationId}`);
      }
    });

    // 3. Send Message
    socket.on('send_message', async (data, callback) => {
      try {
        const { conversationId, text, clientTempId } = data || {};
        if (!text || !text.trim()) {
          return callback?.({ error: 'Message text cannot be empty' });
        }
        if (text.length > 4000) {
          return callback?.({ error: 'Message is too long (max 4000 characters)' });
        }

        let conv;
        if (user.role === 'admin') {
          if (!conversationId) {
            return callback?.({ error: 'conversationId required for admin reply' });
          }
          conv = await Conversation.findById(conversationId);
          if (!conv) {
            return callback?.({ error: 'Conversation not found' });
          }
        } else {
          // Customer: find or create conversation for this customer
          conv = await Conversation.findOne({ customer: user._id });
          if (!conv) {
            conv = await Conversation.create({
              customer: user._id,
              lastMessageAt: new Date(),
            });
          }
        }

        // Deduplication check: if clientTempId already exists in this conversation, return existing message
        if (clientTempId) {
          const existing = await Message.findOne({
            conversationId: conv._id,
            clientTempId,
          }).populate('sender', 'name email role');
          if (existing) {
            return callback?.({ success: true, message: existing });
          }
        }

        // Determine initial message delivery status based on recipient presence
        const recipientId = user.role === 'admin' ? conv.customer.toString() : null;
        let isRecipientOnline = false;
        if (user.role === 'user') {
          // User is sending to admin: check if any admin is online
          for (const [id, sockets] of onlineUsers.entries()) {
            if (sockets.size > 0) {
              // check if admin
              const u = await User.findById(id).select('role');
              if (u && u.role === 'admin') {
                isRecipientOnline = true;
                break;
              }
            }
          }
        } else if (recipientId) {
          // Admin is sending to user
          isRecipientOnline = (onlineUsers.get(recipientId)?.size || 0) > 0;
        }

        const initialStatus = isRecipientOnline ? 'delivered' : 'sent';
        const now = new Date();

        // 1. Permanently save message to MongoDB FIRST
        const message = await Message.create({
          conversationId: conv._id,
          sender: user._id,
          senderRole: user.role,
          text: text.trim(),
          status: initialStatus,
          clientTempId: clientTempId || undefined,
          deliveredAt: isRecipientOnline ? now : undefined,
        });

        // 2. Update Conversation summary & unread counts
        conv.lastMessage = {
          text: message.text,
          sender: user._id,
          senderRole: user.role,
          createdAt: now,
        };
        conv.lastMessageAt = now;
        if (user.role === 'user') {
          conv.unreadCountAdmin += 1;
        } else {
          conv.unreadCountCustomer += 1;
        }
        await conv.save();

        if (user.role === 'user') {
          try {
            await notifyAdminOfCustomerMessage(message, conv, user.name);
          } catch (err) {
            console.error('Customer message was saved, but admin notification could not be saved:', err);
          }
        }

        const populatedMessage = await Message.findById(message._id).populate('sender', 'name email role');
        const populatedConv = await Conversation.findById(conv._id).populate('customer', 'name email phone');

        // 3. Broadcast to conversation room
        io.to(`conversation:${conv._id.toString()}`).emit('new_message', {
          conversationId: conv._id.toString(),
          message: populatedMessage,
        });

        // 4. Broadcast conversation update to Admin room
        io.to('admin_room').emit('conversation_updated', {
          conversation: populatedConv,
        });

        // 5. Notify customer room
        io.to(`user:${conv.customer.toString()}`).emit('new_message_notification', {
          conversationId: conv._id.toString(),
          message: populatedMessage,
          conversation: populatedConv,
        });

        callback?.({ success: true, message: populatedMessage });
      } catch (err) {
        console.error('Socket send_message error:', err);
        callback?.({ error: 'Failed to send message: ' + err.message });
      }
    });

    // 4. Mark Conversation as Read
    socket.on('mark_read', async ({ conversationId }, callback) => {
      try {
        if (!conversationId) return callback?.({ error: 'Conversation ID required' });
        const conv = await Conversation.findById(conversationId);
        if (!conv) return callback?.({ error: 'Conversation not found' });

        if (user.role !== 'admin' && conv.customer.toString() !== userIdStr) {
          return callback?.({ error: 'Unauthorized' });
        }

        const now = new Date();
        if (user.role === 'admin') {
          // Admin reading customer's messages
          await Message.updateMany(
            {
              conversationId: conv._id,
              senderRole: 'user',
              status: { $ne: 'read' },
            },
            { status: 'read', readAt: now }
          );
          conv.unreadCountAdmin = 0;
          await conv.save();
        } else {
          // Customer reading admin's messages
          await Message.updateMany(
            {
              conversationId: conv._id,
              senderRole: 'admin',
              status: { $ne: 'read' },
            },
            { status: 'read', readAt: now }
          );
          conv.unreadCountCustomer = 0;
          await conv.save();
        }

        const populatedConv = await Conversation.findById(conv._id).populate('customer', 'name email phone');

        // Notify room that messages were read
        io.to(`conversation:${conversationId}`).emit('messages_read', {
          conversationId,
          readBy: user._id,
          role: user.role,
          readAt: now,
        });

        // Notify admin dashboard
        io.to('admin_room').emit('conversation_updated', {
          conversation: populatedConv,
        });

        // Notify customer
        io.to(`user:${conv.customer.toString()}`).emit('conversation_updated', {
          conversation: populatedConv,
        });

        callback?.({ success: true });
      } catch (err) {
        console.error('Socket mark_read error:', err);
        callback?.({ error: 'Failed to mark messages as read' });
      }
    });

    // 5. Typing indicator
    socket.on('typing', ({ conversationId, isTyping }) => {
      if (!conversationId) return;
      socket.to(`conversation:${conversationId}`).emit('user_typing', {
        conversationId,
        userId: user._id,
        userName: user.name,
        role: user.role,
        isTyping: !!isTyping,
      });
    });

    // 6. Check Online Status of Support
    socket.on('check_admin_status', async (_data, callback) => {
      let anyAdminOnline = false;
      for (const [id, sockets] of onlineUsers.entries()) {
        if (sockets.size > 0) {
          const u = await User.findById(id).select('role');
          if (u && u.role === 'admin') {
            anyAdminOnline = true;
            break;
          }
        }
      }
      callback?.({ online: anyAdminOnline });
    });

    // Disconnect
    socket.on('disconnect', () => {
      const userSockets = onlineUsers.get(userIdStr);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userIdStr);
          io.emit('user_presence', {
            userId: userIdStr,
            role: user.role,
            status: 'offline',
          });
        }
      }
    });
  });

  return io;
}

export function getIO() {
  return io;
}
