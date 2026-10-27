import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adminUserUpdateSchema,
  bannerBodySchema,
  bannerStatusSchema,
  orderItemParam,
  orderSchema,
  productBodySchema,
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

test('product schema validates per-size shoe inventory', () => {
  const product = {
    name: 'Runner',
    category: 'Running',
    price: 2000,
    sizes: JSON.stringify([
      { size: '7', price: 2100, stock: 3 },
      { size: '8', price: 2200, stock: 2 },
    ]),
  };
  assert.equal(productBodySchema.safeParse(product).success, true);
  assert.equal(productBodySchema.safeParse({
    ...product,
    sizes: JSON.stringify([
      { size: ' EU 42 ', price: 2100, stock: 3 },
      { size: 'UK 8', price: 2200, stock: 2 },
    ]),
  }).success, true);
  assert.equal(productBodySchema.safeParse({ ...product, sizes: '[]' }).success, false);
  assert.equal(productBodySchema.safeParse({
    ...product,
    sizes: JSON.stringify([
      { size: '7', price: 2100, stock: 3 },
      { size: '7', price: 2200, stock: 2 },
    ]),
  }).success, false);
  assert.equal(productBodySchema.safeParse({
    ...product,
    sizes: JSON.stringify([
      { size: 'EU 42', price: 2100, stock: 3 },
      { size: ' eu 42 ', price: 2200, stock: 2 },
    ]),
  }).success, false);
  assert.equal(productBodySchema.safeParse({
    ...product,
    sizes: JSON.stringify([{ size: '7', stock: 3 }]),
  }).success, false);
});

test('product schema accepts category-specific shared-stock items with free-text sizes', () => {
  const base = {
    name: 'Sulax Tee',
    price: '1200',
    stock: '12',
    description: 'A comfortable everyday T-shirt.',
    sizes: '[]',
  };
  const shirt = productBodySchema.safeParse({
    ...base,
    category: 'T-shirts',
    sizeOptions: 'S, M, L, XL, XXL',
  });
  assert.equal(shirt.success, true);
  assert.equal(shirt.data.sizeOptions, 'S, M, L, XL, XXL');
  assert.equal(productBodySchema.safeParse({
    ...base,
    category: 'Sari / Kurtha',
    sizeOptions: 'Free Size, S, M, L, XL',
  }).success, true);
  assert.equal(productBodySchema.safeParse({
    ...base,
    category: 'T-shirts',
    sizeOptions: '',
  }).success, false);
  assert.equal(productBodySchema.safeParse({
    ...base,
    category: 'T-shirts',
    sizeOptions: 'M, m',
  }).success, false);
});

test('product schema validates other specified categories without selectable size inventory', () => {
  const base = {
    name: 'Sample item',
    price: '1500',
    stock: '5',
    description: 'A detailed product description.',
    sizes: '[]',
  };
  for (const category of ['Dolls', 'Bag Packs', 'Electronic Accessories']) {
    assert.equal(productBodySchema.safeParse({ ...base, category }).success, true, category);
  }
  assert.equal(productBodySchema.safeParse({
    ...base,
    category: 'Bag Packs',
    bagType: 'School, Travel, Laptop',
  }).success, true);
  assert.equal(productBodySchema.safeParse({
    ...base,
    category: 'Dolls',
    description: '',
  }).success, false);
  assert.equal(productBodySchema.safeParse({
    ...base,
    category: 'Dolls',
    price: '',
  }).success, false);
});

test('product schema enforces a maximum of three images and valid ordered image references', () => {
  const product = {
    name: 'Runner',
    category: 'Running',
    price: 2000,
    sizes: JSON.stringify([{ size: '7', price: 2000, stock: 3 }]),
  };
  const images = JSON.stringify([
    { url: 'https://res.cloudinary.com/example/one.jpg', public_id: 'one' },
    { url: 'https://res.cloudinary.com/example/two.jpg', public_id: 'two' },
    { url: 'https://res.cloudinary.com/example/three.jpg', public_id: 'three' },
  ]);
  assert.equal(productBodySchema.safeParse({ ...product, images }).success, true);
  assert.equal(productBodySchema.safeParse({
    ...product,
    images: JSON.stringify([...JSON.parse(images), { url: 'https://res.cloudinary.com/example/four.jpg', public_id: 'four' }]),
  }).success, false);
  assert.equal(productBodySchema.safeParse({
    ...product,
    imageOrder: JSON.stringify([{ type: 'upload', index: 0 }, { type: 'upload', index: 0 }]),
  }).success, false);
});

test('order schema accepts a custom shoe size label', () => {
  const result = orderSchema.safeParse({
    name: 'Customer Example',
    phone: '+977 9812345678',
    address: 'Kathmandu',
    payment: 'Cash on Delivery',
    items: [{ productId: '507f1f77bcf86cd799439011', size: ' EU 42 ', quantity: 1 }],
  });
  assert.equal(result.success, true);
  assert.equal(result.data.items[0].size, 'EU 42');
});

test('admin order-item route validates the order ID and nonnegative item index', () => {
  assert.deepEqual(orderItemParam.parse({ id: '507f1f77bcf86cd799439011', index: '2' }), {
    id: '507f1f77bcf86cd799439011',
    index: 2,
  });
  assert.equal(orderItemParam.safeParse({ id: 'invalid', index: '0' }).success, false);
  assert.equal(orderItemParam.safeParse({ id: '507f1f77bcf86cd799439011', index: '-1' }).success, false);
});

test('SEO schema accepts only the requested content fields', () => {
  const valid = seoBodySchema.safeParse({
    pageName: 'Home',
    metaTitle: 'Sulax Shoes',
    metaDescription: 'A'.repeat(140),
    h1: 'Sulax Shoes',
    description: 'Original product content',
    faq: 'Sizing: See the size guide.',
  });
  assert.equal(valid.success, true);
  assert.equal(seoBodySchema.safeParse({
    pageName: 'Home',
    metaTitle: 'Sulax Shoes',
    metaDescription: 'Too short',
  }).success, false);
  assert.equal(seoBodySchema.safeParse({
    pageName: 'Home',
    metaTitle: 'Sulax Shoes',
    metaDescription: 'A'.repeat(140),
    canonicalUrl: 'https://sulax.example/',
  }).data.canonicalUrl, undefined);
});

test('SEO page parameter only accepts supported pages', () => {
  assert.equal(seoPageParam.safeParse({ page: 'home' }).success, true);
  assert.equal(seoPageParam.safeParse({ page: 'product' }).success, true);
  assert.equal(seoPageParam.safeParse({ page: 'category' }).success, false);
  assert.equal(seoPageParam.safeParse({ page: 'contact' }).success, false);
  assert.equal(seoPageParam.safeParse({ page: 'internal-admin' }).success, false);
});

test('banner schema accepts safe internal or HTTP links and rejects script URLs', () => {
  assert.equal(bannerBodySchema.safeParse({ alt: 'Summer sale', link: '/?category=Running' }).success, true);
  assert.equal(bannerBodySchema.safeParse({ link: 'https://sulax.example/sale' }).success, true);
  assert.equal(bannerBodySchema.safeParse({ link: 'javascript:alert(1)' }).success, false);
  assert.equal(bannerBodySchema.safeParse({ link: '//external.example/path' }).success, false);
  assert.equal(bannerBodySchema.safeParse({ link: '/\\external.example/path' }).success, false);
});

test('banner status schema requires an explicit boolean', () => {
  assert.equal(bannerStatusSchema.safeParse({ isActive: false }).success, true);
  assert.equal(bannerStatusSchema.safeParse({ isActive: 'false' }).success, false);
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
