import { Router } from 'express';
import Wishlist from '../models/Wishlist.js';
import Product from '../models/Product.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { objectId } from '../middleware/schemas.js';
import { z } from 'zod';
import { AppError, asyncHandler } from '../utils/helpers.js';

const router = Router();
const pidParam = z.object({ productId: objectId });

router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const rows = await Wishlist.find({ user: req.user._id }).sort({ createdAt: -1 }).populate('product');
  res.json({ products: rows.map((r) => r.product).filter(Boolean) });
}));

// State changes use POST/DELETE (the original used GET links, which are CSRF-able).
router.post('/:productId', validate(pidParam, 'params'), asyncHandler(async (req, res) => {
  if (!(await Product.exists({ _id: req.params.productId }))) throw new AppError(404, 'Product not found.');
  await Wishlist.updateOne(
    { user: req.user._id, product: req.params.productId },
    { $setOnInsert: { user: req.user._id, product: req.params.productId } },
    { upsert: true }
  );
  res.status(201).json({ message: 'Added to wishlist.' });
}));

router.delete('/:productId', validate(pidParam, 'params'), asyncHandler(async (req, res) => {
  await Wishlist.deleteOne({ user: req.user._id, product: req.params.productId });
  res.json({ message: 'Removed from wishlist.' });
}));

export default router;
