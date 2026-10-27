import { Router } from 'express';
import SEO from '../models/SEO.js';
import { asyncHandler } from '../utils/helpers.js';
import { validate } from '../middleware/validate.js';
import { seoPageParam } from '../middleware/schemas.js';

const router = Router();


export const DEFAULT_SEO_CONFIGS = [
  {
    page: 'home',
    pageName: 'Home Page',
    metaTitle: 'Sulax Shoes - Premium Footwear in Nepal | Sneakers, Boots & Formal',
    metaDescription: 'Shop premium footwear at Sulax Shoes Nepal with trusted quality, great value, and cash on delivery across Nepal. Browse our collection today.',
    h1: 'Sulax Shoes Collection',
    description: 'Explore comfortable and stylish footwear for everyday life, work, travel, and special occasions.',
    faq: 'Delivery: Cash on delivery is available across Nepal.',
  },
  {
    page: 'product',
    pageName: 'Product Pages',
    metaTitle: '{product_name} | Sulax Shoes Nepal',
    metaDescription: 'Shop {product_name} in Nepal for comfort, reliable quality, and everyday style. Order now with convenient cash on delivery across Nepal today.',
    h1: '{product_name}',
    description: '{product_name} is designed for comfortable everyday wear with a durable material and dependable sole. Its practical fit supports easy movement, while the available sizes make it simple to choose a pair that feels right. This versatile style suits customers looking for reliable footwear for daily errands, work, travel, or casual outings. Check the size guide before ordering for the best fit.',
    faq: 'Sizing: Check the size guide before ordering.\nDelivery: Cash on delivery is available across Nepal.\nExchanges: Contact support to request an exchange.',
  },
];

// Helper to seed defaults if table is empty or missing pages
export async function ensureDefaultSEO() {
  for (const def of DEFAULT_SEO_CONFIGS) {
    const exists = await SEO.findOne({ page: def.page });
    if (!exists) {
      await SEO.create(def).catch(() => {});
    }
  }
}

// Public: Get all pages SEO
router.get('/', asyncHandler(async (_req, res) => {
  await ensureDefaultSEO();
  const list = await SEO.find({ page: { $in: DEFAULT_SEO_CONFIGS.map((config) => config.page) } }).sort({ createdAt: 1 });
  res.json({ seo: list });
}));

// Public: Get specific page SEO
router.get('/:page', validate(seoPageParam, 'params'), asyncHandler(async (req, res) => {
  const page = req.params.page.toLowerCase();

  let item = await SEO.findOne({ page });
  if (!item) {
    const def = DEFAULT_SEO_CONFIGS.find((d) => d.page === page);
    if (def) {
      item = await SEO.create(def).catch(() => def);
    }
  }
  res.json({ seo: item });
}));

export default router;
