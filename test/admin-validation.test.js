import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adminUserUpdateSchema,
  orderItemParam,
  pushSubscriptionRemovalSchema,
  pushSubscriptionSchema,
  seoBodySchema,
  seoPageParam,
  userRoleSchema,
} from '../src/middleware/schemas.js';

const validUser = {
  name: 'Customer Example',
  email: 'customer@example.com',
  phone: '+977 9812345678',
  address: 'Kathmandu',
};

test('admin user update schema accepts valid account details and normalizes email', () => {
  const result = adminUserUpdateSchema.parse({ ...validUser, email: ' CUSTOMER@example.com ' });
  assert.equal(result.email, 'customer@example.com');
});

test('admin user update schema rejects invalid email and phone values', () => {
  assert.equal(adminUserUpdateSchema.safeParse({ ...validUser, email: 'not-an-email' }).success, false);
  assert.equal(adminUserUpdateSchema.safeParse({ ...validUser, phone: 'abc' }).success, false);
});

test('admin role schema accepts only supported roles', () => {
  assert.equal(userRoleSchema.safeParse({ role: 'admin' }).success, true);
  assert.equal(userRoleSchema.safeParse({ role: 'owner' }).success, false);
});

test('admin order-item route validates the order ID and nonnegative item index', () => {
  assert.deepEqual(orderItemParam.parse({ id: '507f1f77bcf86cd799439011', index: '2' }), {
    id: '507f1f77bcf86cd799439011',
    index: 2,
  });
  assert.equal(orderItemParam.safeParse({ id: 'invalid', index: '0' }).success, false);
  assert.equal(orderItemParam.safeParse({ id: '507f1f77bcf86cd799439011', index: '-1' }).success, false);
});

test('SEO schema validates URLs, robots directives, and JSON-LD', () => {
  const valid = seoBodySchema.safeParse({
    pageName: 'Home',
    metaTitle: 'Sulax Shoes',
    canonicalUrl: 'https://sulax.example/',
    ogImage: '',
    schemaJson: '{"@type":"WebSite"}',
  });
  assert.equal(valid.success, true);
  assert.equal(seoBodySchema.safeParse({
    pageName: 'Home',
    metaTitle: 'Sulax Shoes',
    canonicalUrl: 'javascript:alert(1)',
  }).success, false);
  assert.equal(seoBodySchema.safeParse({
    pageName: 'Home',
    metaTitle: 'Sulax Shoes',
    schemaJson: '{invalid}',
  }).success, false);
  assert.equal(seoBodySchema.safeParse({
    pageName: 'Home',
    metaTitle: 'Sulax Shoes',
    robots: 'maybe',
  }).success, false);
});

test('SEO page parameter only accepts supported pages', () => {
  assert.equal(seoPageParam.safeParse({ page: 'home' }).success, true);
  assert.equal(seoPageParam.safeParse({ page: 'internal-admin' }).success, false);
});

test('push subscriptions require a trusted HTTPS push service endpoint and valid encryption keys', () => {
  const valid = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/example',
    keys: {
      p256dh: 'B'.repeat(40),
      auth: 'A'.repeat(20),
    },
  };
  assert.equal(pushSubscriptionSchema.safeParse(valid).success, true);
  assert.equal(pushSubscriptionRemovalSchema.safeParse({ endpoint: valid.endpoint }).success, true);
  assert.equal(pushSubscriptionSchema.safeParse({
    ...valid,
    endpoint: 'https://attacker.example/push',
  }).success, false);
  assert.equal(pushSubscriptionSchema.safeParse({
    ...valid,
    endpoint: 'http://fcm.googleapis.com/fcm/send/example',
  }).success, false);
});
