import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrderTotal } from '../src/utils/orders.js';

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
