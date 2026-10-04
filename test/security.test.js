import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import app from '../src/app.js';
import {
  googleAuthSchema,
  adminConversationQuerySchema,
  messageListQuerySchema,
  seoPageParam,
  registerSchema,
} from '../src/middleware/schemas.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

// Helper to start temporary server and send HTTP request
function makeRequest(serverApp, options, payload = null) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(serverApp);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const reqOpts = {
        hostname: '127.0.0.1',
        port,
        path: options.path || '/',
        method: options.method || 'GET',
        headers: options.headers || {},
      };

      const req = http.request(reqOpts, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          server.close();
          let json = null;
          try { json = JSON.parse(body); } catch (_) {}
          resolve({ status: res.statusCode, headers: res.headers, body, json });
        });
      });

      req.on('error', (err) => {
        server.close();
        reject(err);
      });

      if (payload) {
        req.write(typeof payload === 'string' ? payload : JSON.stringify(payload));
      }
      req.end();
    });
  });
}

test('1. Helmet headers and CORS configuration are properly enforced', async () => {
  const res = await makeRequest(app, { path: '/' });
  assert.equal(res.status, 200);
  assert.equal(res.headers['x-dns-prefetch-control'], 'off');
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.ok(res.headers['content-security-policy'], 'Content-Security-Policy header should be set');
  assert.ok(res.headers['strict-transport-security'], 'Strict-Transport-Security header should be set');

  // Test CORS response for allowed origin
  const corsRes = await makeRequest(app, {
    path: '/api/products',
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'GET',
    },
  });
  assert.equal(corsRes.headers['access-control-allow-origin'], 'http://localhost:5173');
  assert.equal(corsRes.headers['access-control-allow-credentials'], 'true');
});

test('2. Input validation schemas validate query parameters and bodies', () => {
  // Google Auth Schema
  assert.equal(googleAuthSchema.safeParse({ credential: 'valid_google_token' }).success, true);
  assert.equal(googleAuthSchema.safeParse({ credential: '' }).success, false);

  // Admin Conversation Query Schema
  const convQuery = adminConversationQuerySchema.parse({ search: '  john  ', filter: 'unread' });
  assert.equal(convQuery.search, 'john');
  assert.equal(convQuery.filter, 'unread');
  assert.equal(adminConversationQuerySchema.safeParse({ filter: 'invalid_filter' }).success, false);

  // Message List Query Schema
  const msgQuery = messageListQuerySchema.parse({ limit: '50' });
  assert.equal(msgQuery.limit, 50);
  assert.equal(messageListQuerySchema.safeParse({ limit: '500' }).success, false);

  // SEO Page Param Schema
  assert.equal(seoPageParam.safeParse({ page: 'home' }).success, true);
  assert.equal(seoPageParam.safeParse({ page: 'unsupported' }).success, false);
});

test('3. NoSQL injection objects are sanitized by mongoSanitize', () => {
  const middleware = mongoSanitize({ replaceWith: '_' });
  const req = {
    body: { email: { $gt: '' }, name: 'Test' },
    query: { search: { $ne: null } },
    params: { id: '507f1f77bcf86cd799439011' },
    headers: {},
  };
  middleware(req, {}, () => {});

  assert.deepEqual(req.body, { email: { _gt: '' }, name: 'Test' });
  assert.deepEqual(req.query, { search: { _ne: null } });
});

test('4. Mass assignment is prevented by schema parsing', () => {
  const payload = {
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+977 9800000000',
    address: 'Kathmandu',
    password: 'Password123',
    confirmPassword: 'Password123',
    role: 'admin', // Malicious attempt to self-promote to admin
    tokenVersion: 99,
  };

  const parsed = registerSchema.parse(payload);
  assert.equal(parsed.name, 'Jane Doe');
  assert.equal(parsed.email, 'jane@example.com');
  assert.equal(parsed.role, undefined, 'role field must be stripped');
  assert.equal(parsed.tokenVersion, undefined, 'tokenVersion field must be stripped');
});

test('5. Request body size limit rejects oversized JSON payloads', async () => {
  const largePayload = JSON.stringify({ data: 'a'.repeat(60 * 1024) }); // 60 KB payload > 50 KB limit

  const res = await makeRequest(
    app,
    {
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(largePayload),
      },
    },
    largePayload
  );

  assert.equal(res.status, 413);
  assert.equal(res.json.message, 'Request too large.');
});

test('6. Error handler returns generic messages in production without stack traces or DB details', async () => {
  const testApp = express();

  // Test 1: CastError (Mongoose Invalid ID)
  testApp.get('/error-cast', (_req, _res, next) => {
    const err = new Error('Cast to ObjectId failed for value "123"');
    err.name = 'CastError';
    next(err);
  });

  // Test 2: Unhandled 500 database crash
  testApp.get('/error-500', (_req, _res, next) => {
    const err = new Error('MongoNetworkError: connection 1 to 127.0.0.1:27017 timed out');
    err.stack = 'MongoNetworkError: connection timed out\n    at net.js:123:45';
    next(err);
  });

  testApp.use(errorHandler);

  const castRes = await makeRequest(testApp, { path: '/error-cast' });
  assert.equal(castRes.status, 400);
  assert.equal(castRes.json.message, 'Invalid ID.');
  assert.equal(castRes.json.stack, undefined);

  const err500Res = await makeRequest(testApp, { path: '/error-500' });
  assert.equal(err500Res.status, 500);
  assert.equal(err500Res.json.message, 'Something went wrong. Please try again.');
  assert.equal(err500Res.json.stack, undefined);
});
