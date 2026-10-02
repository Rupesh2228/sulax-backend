import Product from '../models/Product.js';

export function calculateOrderTotal(items, deliveryCharge) {
  const itemsTotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
  return Math.round((itemsTotal + deliveryCharge) * 100) / 100;
}

// Put the stock of a (just-cancelled) order back on the shelf.
export async function restoreStock(order) {
  await Promise.all(
    order.items.map((i) => Product.updateOne({ _id: i.product }, { $inc: { stock: i.quantity } }))
  );
}
