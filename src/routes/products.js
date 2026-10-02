import { Router } from 'express';
import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Review from '../models/Review.js';
import { validate } from '../middleware/validate.js';
import { idParam, productListQuery, reviewSchema } from '../middleware/schemas.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { AppError, asyncHandler, escapeRegex } from '../utils/helpers.js';

const router = Router();

const SORTS = {
  newest: { createdAt: -1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  rating: { rating: -1 },
};

router.get('/', validate(productListQuery, 'query'), asyncHandler(async (req, res) => {
  const { search, category, sort } = req.query;
  const filter = {};
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { category: rx }];
  }
  if (category) filter.category = category; // plain string (validated + mongo-sanitized)
  const products = await Product.find(filter).sort(SORTS[sort]).limit(24);
  res.json({ products });
}));

router.get('/categories', asyncHandler(async (_req, res) => {
  const categories = (await Product.distinct('category')).sort();
  res.json({ categories });
}));

router.get('/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new AppError(404, 'Product not found.');
  const related = await Product.find({ category: product.category, _id: { $ne: product._id } })
    .sort({ createdAt: -1 })
    .limit(4);
  res.json({ product, related });
}));

// Reviews + whether the logged-in user is allowed to write one
router.get('/:id/reviews', validate(idParam, 'params'), optionalAuth, asyncHandler(async (req, res) => {
  const reviews = await Review.find({ product: req.params.id })
    .sort({ _id: -1 })
    .populate('user', 'name')
    .select('rating comment createdAt user');
  const canReview = !!req.user;
  let myReview = null;
  if (req.user) {
    myReview = await Review.findOne({ user: req.user._id, product: req.params.id }).select('rating comment');
  }
  res.json({ reviews, canReview, myReview });
}));

router.post('/:id/reviews', requireAuth, validate(idParam, 'params'), validate(reviewSchema),
  asyncHandler(async (req, res) => {
    const productId = req.params.id;
    if (!(await Product.exists({ _id: productId }))) throw new AppError(404, 'Product not found.');

    await Review.findOneAndUpdate(
      { user: req.user._id, product: productId },
      { rating: req.body.rating, comment: req.body.comment },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // keep the product's stored rating in sync
    const [agg] = await Review.aggregate([
      { $match: { product: new mongoose.Types.ObjectId(productId) } },
      { $group: { _id: '$product', avg: { $avg: '$rating' }, n: { $sum: 1 } } },
    ]);
    await Product.updateOne(
      { _id: productId },
      { rating: Math.round((agg?.avg || 0) * 10) / 10, ratingCount: agg?.n || 0 }
    );
    res.json({ message: 'Review saved successfully.' });
  })
);

export default router;
