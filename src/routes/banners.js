import { Router } from 'express';
import Banner from '../models/Banner.js';
import { asyncHandler } from '../utils/helpers.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const banners = await Banner.find({ isActive: true })
    .select('image alt link order')
    .sort({ order: 1, createdAt: 1 });
  res.json({ banners });
}));

export default router;
