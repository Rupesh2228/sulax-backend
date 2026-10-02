import http from 'http';
import { io as ioClient } from 'socket.io-client';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { env } from './src/config/env.js';
import { connectDB } from './src/config/db.js';
import app from './src/app.js';
import { initSocket } from './src/socket.js';
import User from './src/models/User.js';
import Conversation from './src/models/Conversation.js';
import Message from './src/models/Message.js';
import { COOKIE_NAME } from './src/middleware/auth.js';

async function runTests() {
  console.log('--- Starting Real-Time Messaging E2E Tests ---');
  await connectDB();

  // 1. Setup Test Server
  const testPort = 5055;
  const server = http.createServer(app);
  initSocket(server);

  await new Promise((resolve) => server.listen(testPort, resolve));
  console.log(`✓ Test server running on port ${testPort}`);

  // 2. Setup Test Customer & Admin
  const customerEmail = 'customer_test_' + Date.now() + '@example.com';
  const customer = await User.create({
    name: 'Test Customer',
    email: customerEmail,
    phone: '9841000000',
    address: 'Kathmandu, Nepal',
    password: 'Password123!',
    role: 'user',
  });

  const adminEmail = 'admin_test_' + Date.now() + '@example.com';
  const admin = await User.create({
    name: 'Support Admin',
    email: adminEmail,
    phone: '9841111111',
    address: 'Kathmandu HQ',
    password: 'AdminPassword123!',
    role: 'admin',
  });

  const customerToken = jwt.sign({ sub: customer._id.toString(), tv: customer.tokenVersion }, env.jwtSecret, { expiresIn: '1d' });
  const adminToken = jwt.sign({ sub: admin._id.toString(), tv: admin.tokenVersion }, env.jwtSecret, { expiresIn: '1d' });

  console.log('✓ Test users and JWTs created');

  // Helper for REST requests with CSRF double-submit-cookie support
  let cachedCsrfToken = null;
  let cachedCsrfCookie = null;

  async function fetchAPI(path, { method = 'GET', body, token } = {}) {
    if (!cachedCsrfToken) {
      const csrfRes = await fetch(`http://localhost:${testPort}/api/csrf`);
      const setCookie = csrfRes.headers.get('set-cookie');
      if (setCookie) {
        cachedCsrfCookie = setCookie.split(';')[0];
      }
      const data = await csrfRes.json();
      cachedCsrfToken = data.csrfToken;
    }

    const cookieParts = [];
    if (token) cookieParts.push(`${COOKIE_NAME}=${token}`);
    if (cachedCsrfCookie) cookieParts.push(cachedCsrfCookie);

    const headers = {
      Cookie: cookieParts.join('; '),
      'Content-Type': 'application/json',
    };
    if (method !== 'GET') {
      headers['X-CSRF-Token'] = cachedCsrfToken;
    }

    const res = await fetch(`http://localhost:${testPort}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  // 3. Test REST: Customer creates/gets conversation
  const myConvRes = await fetchAPI('/api/messages/my-conversation', { token: customerToken });
  if (myConvRes.status !== 200 || !myConvRes.data.conversation) {
    throw new Error('Failed to get customer conversation: ' + JSON.stringify(myConvRes));
  }
  const conversationId = myConvRes.data.conversation._id;
  console.log('✓ Customer conversation initialized:', conversationId);

  // 4. Test REST: Customer sends message
  const tempId1 = 'temp_' + Date.now();
  const sendRes = await fetchAPI('/api/messages/send', {
    method: 'POST',
    token: customerToken,
    body: { text: 'Hello Sulax support! Do you have size 9 for Classic Runner?', clientTempId: tempId1 },
  });
  if (sendRes.status !== 201 || sendRes.data.message.text !== 'Hello Sulax support! Do you have size 9 for Classic Runner?') {
    throw new Error('Failed to send message: ' + JSON.stringify(sendRes));
  }
  console.log('✓ Customer sent message via REST API');

  // 5. Test REST: Deduplication check with clientTempId
  const dupRes = await fetchAPI('/api/messages/send', {
    method: 'POST',
    token: customerToken,
    body: { text: 'Hello Sulax support! Do you have size 9 for Classic Runner?', clientTempId: tempId1 },
  });
  if (!dupRes.data.duplicate) {
    throw new Error('Deduplication failed, duplicate was not detected!');
  }
  console.log('✓ Duplicate message prevented via clientTempId');

  // 6. Test REST: Admin retrieves conversation list and sees unread badge
  const adminListRes = await fetchAPI('/api/messages/admin/conversations', { token: adminToken });
  if (adminListRes.status !== 200 || adminListRes.data.conversations.length === 0) {
    throw new Error('Admin failed to retrieve conversations');
  }
  const foundConv = adminListRes.data.conversations.find((c) => c._id === conversationId);
  if (!foundConv || foundConv.unreadCountAdmin !== 1) {
    throw new Error('Admin conversation list does not have unreadCountAdmin = 1');
  }
  console.log('✓ Admin retrieved conversation list, customer message visible with unreadCountAdmin = 1');

  // 7. Test REST: Admin replies to customer
  const adminReplyRes = await fetchAPI('/api/messages/send', {
    method: 'POST',
    token: adminToken,
    body: { conversationId, text: 'Hi! Yes, size 9 is in stock and ready to ship.' },
  });
  if (adminReplyRes.status !== 201) {
    throw new Error('Admin reply failed: ' + JSON.stringify(adminReplyRes));
  }
  console.log('✓ Admin replied to customer');

  // 8. Test REST: Customer marks messages as read
  const markReadRes = await fetchAPI(`/api/messages/conversations/${conversationId}/read`, {
    method: 'PATCH',
    token: customerToken,
  });
  if (markReadRes.status !== 200) {
    throw new Error('Customer mark read failed: ' + JSON.stringify(markReadRes));
  }
  console.log('✓ Customer marked admin reply as read');

  // 9. Test Security: Unauthorized customer cannot access another customer's conversation
  const hacker = await User.create({
    name: 'Another Customer',
    email: 'other_' + Date.now() + '@example.com',
    phone: '9841222222',
    address: 'Pokhara',
    password: 'Password123!',
    role: 'user',
  });
  const hackerToken = jwt.sign({ sub: hacker._id.toString(), tv: hacker.tokenVersion }, env.jwtSecret);
  const forbiddenRes = await fetchAPI(`/api/messages/conversations/${conversationId}/messages`, { token: hackerToken });
  if (forbiddenRes.status !== 403) {
    throw new Error(`Security failed! Expected status 403, got ${forbiddenRes.status}`);
  }
  console.log('✓ Security verified: other customers cannot access private conversations (HTTP 403)');

  // 10. Test Socket.IO Real-Time Delivery & Receipts
  console.log('Connecting Socket.IO clients (Customer & Admin)...');
  const customerSocket = ioClient(`http://localhost:${testPort}`, {
    auth: { token: customerToken },
    transports: ['websocket'],
  });

  const adminSocket = ioClient(`http://localhost:${testPort}`, {
    auth: { token: adminToken },
    transports: ['websocket'],
  });

  await Promise.all([
    new Promise((resolve) => customerSocket.on('connect', resolve)),
    new Promise((resolve) => adminSocket.on('connect', resolve)),
  ]);
  console.log('✓ Customer & Admin connected to Socket.IO successfully');

  // Both join conversation
  await new Promise((resolve) => {
    customerSocket.emit('join_conversation', { conversationId }, resolve);
  });
  await new Promise((resolve) => {
    adminSocket.emit('join_conversation', { conversationId }, resolve);
  });
  console.log('✓ Both joined conversation room');

  // Admin listens for customer real-time message
  const receivedByAdminPromise = new Promise((resolve) => {
    adminSocket.on('new_message', (payload) => {
      if (payload.message.text === 'Can I also order via Cash on Delivery?') {
        resolve(payload);
      }
    });
  });

  // Customer sends message via socket
  const tempSocketMsgId = 'temp_sock_' + Date.now();
  customerSocket.emit('send_message', {
    conversationId,
    text: 'Can I also order via Cash on Delivery?',
    clientTempId: tempSocketMsgId,
  });

  const adminReceived = await receivedByAdminPromise;
  console.log('✓ Admin received real-time socket message from Customer:', adminReceived.message.text);

  // Customer listens for real-time admin reply
  const receivedByCustomerPromise = new Promise((resolve) => {
    customerSocket.on('new_message', (payload) => {
      if (payload.message.text === 'Absolutely! Cash on Delivery is available across Nepal.') {
        resolve(payload);
      }
    });
  });

  adminSocket.emit('send_message', {
    conversationId,
    text: 'Absolutely! Cash on Delivery is available across Nepal.',
  });

  const customerReceived = await receivedByCustomerPromise;
  console.log('✓ Customer received real-time socket reply from Admin:', customerReceived.message.text);

  // Test real-time read receipt (Blue ticks)
  const readReceiptPromise = new Promise((resolve) => {
    adminSocket.on('messages_read', (data) => {
      if (data.conversationId === conversationId && data.role === 'user') {
        resolve(data);
      }
    });
  });

  customerSocket.emit('mark_read', { conversationId });
  await readReceiptPromise;
  console.log('✓ Admin received real-time read receipt (blue tick event)');

  // Clean up sockets & server
  customerSocket.disconnect();
  adminSocket.disconnect();
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();

  console.log('\n========================================');
  console.log('ALL REAL-TIME MESSAGING TESTS PASSED! 🎉');
  console.log('========================================');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
