import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Notification from '../src/models/Notification.js';

const validNotification = () => new Notification({
  recipientId: new mongoose.Types.ObjectId(),
  type: 'order',
  title: 'New order',
  message: 'A customer placed an order.',
  eventKey: `order:${new mongoose.Types.ObjectId()}`,
});

test('notification schema accepts persisted admin events without a database connection', async () => {
  await assert.doesNotReject(validNotification().validate());
});

test('notification schema rejects unsupported event types', async () => {
  const notification = validNotification();
  notification.type = 'unknown';
  await assert.rejects(notification.validate(), /is not a valid enum value/);
});

test('notification idempotency index is unique per admin and event key', () => {
  const uniqueEventIndex = Notification.schema.indexes().find(([keys, options]) =>
    keys.recipientId === 1 && keys.eventKey === 1 && options.unique === true
  );
  assert.ok(uniqueEventIndex, 'expected recipientId + eventKey unique index');
});
