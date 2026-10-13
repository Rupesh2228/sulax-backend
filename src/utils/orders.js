import Product from '../models/Product.js';

export function calculateOrderTotal(items, deliveryCharge) {
  const itemsTotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
  return Math.round((itemsTotal + deliveryCharge) * 100) / 100;
}

export function getSizePrice(product, size) {
  const entry = (product?.sizes || []).find((item) => String(item.size) === String(size));
  return Number.isFinite(Number(entry?.price)) ? Number(entry.price) : Number(product?.price) || 0;
}

export async function restoreStock(order) {
  await Promise.all(
    order.items.map(async (item) => {
      const product = await Product.findById(item.product);
      if (!product) return;
      if (!product.sizes?.length) {
        await Product.updateOne({ _id: product._id }, { $inc: { stock: item.quantity } });
        return;
      }
      const nextSizes = (product.sizes || []).map((entry) => {
        if (String(entry.size) !== String(item.size)) return entry;
        return { ...entry.toObject(), stock: Math.max(0, Number(entry.stock) + Number(item.quantity)) };
      });
      if (nextSizes.length !== (product.sizes || []).length) {
        nextSizes.push({ size: item.size, price: item.price, stock: Math.max(0, Number(item.quantity)) });
      }
      product.sizes = nextSizes;
      product.stock = product.sizes.reduce((sum, entry) => sum + Math.max(0, Number(entry.stock) || 0), 0);
      await product.save();
    })
  );
}
