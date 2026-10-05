import Product from '../models/Product.js';

export function calculateOrderTotal(items, deliveryCharge) {
  const itemsTotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
  return Math.round((itemsTotal + deliveryCharge) * 100) / 100;
}

export async function restoreStock(order) {
  await Promise.all(
    order.items.map(async (item) => {
      const product = await Product.findById(item.product);
      if (!product) return;
      const nextSizes = (product.sizes || []).map((entry) => {
        if (String(entry.size) !== String(item.size)) return entry;
        return { ...entry, stock: Math.max(0, Number(entry.stock) + Number(item.quantity)) };
      });
      if (nextSizes.length !== (product.sizes || []).length) {
        nextSizes.push({ size: item.size, stock: Math.max(0, Number(item.quantity)) });
      }
      product.sizes = nextSizes;
      product.stock = product.sizes.reduce((sum, entry) => sum + Math.max(0, Number(entry.stock) || 0), 0);
      await product.save();
    })
  );
}
