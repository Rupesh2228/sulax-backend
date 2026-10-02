import { Router } from 'express';
import SEO from '../models/SEO.js';
import { asyncHandler } from '../utils/helpers.js';

const router = Router();

export const DEFAULT_SEO_CONFIGS = [
  {
    page: 'home',
    pageName: 'Home Page',
    metaTitle: 'Sulax Shoes - Premium Footwear in Nepal | Sneakers, Boots & Formal',
    metaDescription: 'Shop top quality sneakers, boots, sandals, and formal shoes at Sulax Shoes Nepal. Best prices, fast nationwide cash on delivery, and 100% authentic footwear.',
    metaKeywords: 'shoes nepal, sneakers kathmandu, footwear online nepal, boots nepal, sulax shoes, buy shoes online',
    canonicalUrl: 'https://sulaxshoes.com/',
    robots: 'index, follow',
    ogTitle: 'Sulax Shoes Nepal - Step Up Your Style',
    ogDescription: 'Discover the finest collection of trendy footwear. Quality, comfort, and affordable prices in Nepal.',
    ogImage: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1200&auto=format&fit=crop&q=80',
    twitterCard: 'summary_large_image',
    focusKeyword: 'shoes nepal',
    schemaJson: JSON.stringify(
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Sulax Shoes',
        url: 'https://sulaxshoes.com',
        description: 'Premium footwear store in Nepal.',
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://sulaxshoes.com/?search={search_term_string}',
          'query-input': 'required name=search_term_string',
        },
      },
      null,
      2
    ),
  },
  {
    page: 'products',
    pageName: 'Product Catalog / Shop',
    metaTitle: 'Shop All Shoes & Footwear Collection | Sulax Nepal',
    metaDescription: 'Explore the complete range of men and women footwear at Sulax Nepal. Filter by category, price, and latest arrivals. Cash on delivery available.',
    metaKeywords: 'all shoes, running shoes, casual sneakers, boots, sandals nepal, online shoe store',
    canonicalUrl: 'https://sulaxshoes.com/products',
    robots: 'index, follow',
    ogTitle: 'All Shoes Collection | Sulax Nepal',
    ogDescription: 'Find your perfect pair from our wide selection of sneakers, boots, and casual shoes.',
    ogImage: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=1200&auto=format&fit=crop&q=80',
    twitterCard: 'summary_large_image',
    focusKeyword: 'footwear collection nepal',
    schemaJson: JSON.stringify(
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Sulax Footwear Collection',
        url: 'https://sulaxshoes.com/products',
        description: 'Explore premium sneakers, boots, and formal shoes.',
      },
      null,
      2
    ),
  },
  {
    page: 'product_details',
    pageName: 'Product Details Template',
    metaTitle: '{product_name} | Sulax Shoes Nepal',
    metaDescription: 'Buy {product_name} at Sulax Shoes Nepal for Rs. {price}. Fast delivery across Kathmandu and Nepal with cash on delivery.',
    metaKeywords: 'buy shoes nepal, footwear, sneaker store, authentic shoes kathmandu',
    canonicalUrl: 'https://sulaxshoes.com/product',
    robots: 'index, follow',
    ogTitle: '{product_name} - Sulax Shoes',
    ogDescription: 'Check out {product_name} on Sulax Shoes Nepal. Best comfort and durable sole.',
    ogImage: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1200',
    twitterCard: 'summary_large_image',
    focusKeyword: '{product_name}',
    schemaJson: JSON.stringify(
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: '{product_name}',
        description: '{product_description}',
        offers: {
          '@type': 'Offer',
          priceCurrency: 'NPR',
          price: '{price}',
          availability: 'https://schema.org/InStock',
        },
      },
      null,
      2
    ),
  },
  {
    page: 'contact',
    pageName: 'Contact Us',
    metaTitle: 'Contact Sulax Shoes Nepal | Customer Support & Location',
    metaDescription: 'Have queries or need help with your shoe order? Contact the Sulax Shoes Nepal team via phone, email, or visit our Kathmandu location.',
    metaKeywords: 'contact sulax, shoe store kathmandu, customer care footwear, shoe store nepal',
    canonicalUrl: 'https://sulaxshoes.com/contact',
    robots: 'index, follow',
    ogTitle: 'Contact Us - Sulax Shoes Support',
    ogDescription: 'Get in touch with Sulax Shoes for orders, sizing help, and inquiries.',
    ogImage: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1200',
    twitterCard: 'summary',
    focusKeyword: 'contact sulax shoes',
    schemaJson: JSON.stringify(
      {
        '@context': 'https://schema.org',
        '@type': 'ContactPage',
        name: 'Contact Sulax Shoes',
        url: 'https://sulaxshoes.com/contact',
        contactPoint: {
          '@type': 'ContactPoint',
          telephone: '+977-9800000000',
          contactType: 'customer support',
          areaServed: 'NP',
        },
      },
      null,
      2
    ),
  },
  {
    page: 'cart',
    pageName: 'Shopping Cart',
    metaTitle: 'Your Shopping Cart | Sulax Shoes',
    metaDescription: 'Review selected items in your cart and proceed to secure checkout on Sulax Shoes.',
    metaKeywords: 'cart, shopping bag, checkout shoes',
    canonicalUrl: 'https://sulaxshoes.com/cart',
    robots: 'noindex, follow',
    ogTitle: 'Shopping Cart - Sulax Shoes',
    ogDescription: 'Complete your footwear purchase at Sulax Shoes.',
    ogImage: '',
    twitterCard: 'summary',
    focusKeyword: 'cart',
    schemaJson: '',
  },
  {
    page: 'checkout',
    pageName: 'Checkout',
    metaTitle: 'Secure Checkout | Sulax Shoes Nepal',
    metaDescription: 'Complete your shoe order with cash on delivery or online payment at Sulax Shoes.',
    metaKeywords: 'checkout, pay, cash on delivery nepal',
    canonicalUrl: 'https://sulaxshoes.com/checkout',
    robots: 'noindex, nofollow',
    ogTitle: 'Checkout - Sulax Shoes',
    ogDescription: 'Fast and secure checkout for Sulax footwear.',
    ogImage: '',
    twitterCard: 'summary',
    focusKeyword: 'checkout',
    schemaJson: '',
  },
  {
    page: 'account',
    pageName: 'My Account',
    metaTitle: 'My Account & Profile | Sulax Shoes',
    metaDescription: 'Manage your Sulax account, orders, delivery address, and profile settings.',
    metaKeywords: 'account, profile, orders, sulax nepal',
    canonicalUrl: 'https://sulaxshoes.com/account',
    robots: 'noindex, nofollow',
    ogTitle: 'My Account - Sulax Shoes',
    ogDescription: 'Manage your profile and orders.',
    ogImage: '',
    twitterCard: 'summary',
    focusKeyword: 'account',
    schemaJson: '',
  },
  {
    page: 'wishlist',
    pageName: 'Wishlist',
    metaTitle: 'My Wishlist | Sulax Shoes Nepal',
    metaDescription: 'View and manage your favorite shoes saved to your Sulax wishlist.',
    metaKeywords: 'wishlist, saved shoes, favorite sneakers',
    canonicalUrl: 'https://sulaxshoes.com/wishlist',
    robots: 'noindex, follow',
    ogTitle: 'My Wishlist - Sulax Shoes',
    ogDescription: 'Favorite shoes saved on Sulax Shoes.',
    ogImage: '',
    twitterCard: 'summary',
    focusKeyword: 'wishlist',
    schemaJson: '',
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
  const list = await SEO.find().sort({ createdAt: 1 });
  res.json({ seo: list });
}));

// Public: Get specific page SEO
router.get('/:page', asyncHandler(async (req, res) => {
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
