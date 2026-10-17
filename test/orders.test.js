import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrderTotal, getSizePrice, getSizeStock, setOrderStatus } from '../src/utils/orders.js';

test('order total recalculates remaining item quantities plus delivery', () => {
  const total = calculateOrderTotal([
    { price: 1299, quantity: 1 },
    { price: 3499, quantity: 2 },
  ], 100);
  assert.equal(total, 8397);
});

test('order total rounds to two decimal places', () => {
  const total = calculateOrderTotal([{ price: 10.125, quantity: 1 }], 0);
  assert.equal(total, 10.13);
});

test('marking an order delivered records and preserves its delivery time', () => {
  const deliveredAt = new Date('2025-01-02T03:04:05.000Z');
  const order = { status: 'Shipped', deliveredAt: null };
  setOrderStatus(order, 'Delivered', deliveredAt);
  assert.equal(order.status, 'Delivered');
  assert.equal(order.deliveredAt, deliveredAt);

  setOrderStatus(order, 'Delivered', new Date('2025-01-03T03:04:05.000Z'));
  assert.equal(order.deliveredAt, deliveredAt);
});

test('changing an order away from delivered clears its delivery time', () => {
  const order = { status: 'Delivered', deliveredAt: new Date('2025-01-02T03:04:05.000Z') };
  setOrderStatus(order, 'Shipped');
  assert.equal(order.status, 'Shipped');
  assert.equal(order.deliveredAt, null);
});

test('size pricing uses the selected size price and falls back for legacy products', () => {
  assert.equal(getSizePrice({
    price: 1800,
    sizes: [{ size: '7', price: 2100 }],
  }, '7'), 2100);
  assert.equal(getSizePrice({
    price: 1800,
    sizes: [{ size: '7', stock: 2 }],
  }, '7'), 1800);
  assert.equal(getSizePrice({ price: 1800, sizes: [] }, '7'), 1800);
});

test('shared-stock size options accept only admin-entered size labels', () => {
  const product = { sizeOptions: 'M, L, XL', stock: 5, sizes: [] };
  assert.equal(getSizeStock(product, 'M'), 5);
  assert.equal(getSizeStock(product, 'XL'), 5);
  assert.equal(getSizeStock(product, 'XXL'), 0);
});
