import { z } from 'zod';

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

export const objectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid ID.')
  .transform((v) => v.toLowerCase());
export const idParam = z.object({ id: objectId });

const phone = z
  .string()
  .trim()
  .refine((v) => /^\+?[0-9]{7,15}$/.test(v.replace(/[\s-]/g, '')), 'Please enter a valid phone number.');

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password is too long.')
  .regex(/[A-Za-z]/, 'Password must contain a letter.')
  .regex(/[0-9]/, 'Password must contain a number.');

const name = z.string().trim().min(2, 'Please enter a valid name.').max(100);
const address = z.string().trim().min(1, 'Please enter your address.').max(1000);
const email = z.string().trim().toLowerCase().email('Please enter a valid email address.').max(200);

export const registerSchema = z
  .object({ name, email, phone, address, password, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match.' });

export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
export const googleAuthSchema = z.object({
  credential: z.string().min(1, 'Token is missing').max(5000),
  clientId: z.string().max(500).optional(),
});

export const profileSchema = z.object({ name, phone, address });
export const adminUserUpdateSchema = z.object({ name, email, phone, address });
export const userRoleSchema = z.object({ role: z.enum(['user', 'admin']) });

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: password, confirmPassword: z.string() })
  .refine((d) => d.newPassword === d.confirmPassword, { path: ['confirmPassword'], message: 'New passwords do not match.' });

export const contactSchema = z.object({
  name,
  email,
  subject: z.string().trim().min(1, 'Please enter a subject.').max(200),
  message: z.string().trim().min(1, 'Please enter your message.').max(3000),
});

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().default(''),
});

export const orderSchema = z.object({
  name,
  phone,
  address,
  payment: z.enum(['Cash on Delivery', 'Online Payment']),
  items: z
    .array(
      z.object({
        productId: objectId,
        size: z.enum(['6', '7', '8', '9', '10', '11']),
        quantity: z.coerce.number().int().min(1).max(20),
      })
    )
    .min(1, 'Cart is empty.')
    .max(50),
});

export const productListQuery = z.object({
  search: z.string().trim().max(100).optional().default(''),
  category: z.string().trim().max(80).optional().default(''),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'rating']).optional().default('newest'),
});

const sizeEntrySchema = z.object({
  size: z.string().trim().min(1, 'Size is required.').max(20),
  stock: z.preprocess((val) => val === '' || val === null || val === undefined ? 0 : val, z.coerce.number().int().min(0, 'Stock must be 0 or more.').max(100000)),
});

const imageEntrySchema = z.object({
  url: z.string().trim().max(2000).default(''),
  public_id: z.string().trim().max(500).default(''),
});

export const productBodySchema = z.object({
  name: z.string().trim().min(1, 'Product name is required.').max(200),
  category: z.string().trim().min(1, 'Category is required.').max(80),
  description: z.string().trim().max(5000).optional().default(''),
  price: z.preprocess((val) => (val === '' || val === null || val === undefined ? 0 : val), z.coerce.number().min(0, 'Price must be 0 or more.')),
  oldPrice: z.preprocess((val) => (val === '' || val === null || val === undefined ? 0 : val), z.coerce.number().min(0).optional().default(0)),
  discount: z.preprocess((val) => (val === '' || val === null || val === undefined ? 0 : val), z.coerce.number().int().min(0).max(100).optional().default(0)),
  stock: z.preprocess((val) => (val === '' || val === null || val === undefined ? 0 : val), z.coerce.number().int().min(0, 'Stock must be 0 or more.').optional().default(0)),
  sizes: z.preprocess(parseJsonArray, z.array(sizeEntrySchema).max(12).default([])),
  images: z.preprocess(parseJsonArray, z.array(imageEntrySchema).max(5).default([])),
});

export const bannerBodySchema = z.object({
  alt: z.string().trim().max(200).optional().default('Sulax Shoes banner'),
  link: z.string().trim().max(500).optional().default('').refine(
    (value) => !value || ((value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !/[\r\n]/.test(value)) || /^https?:\/\/\S+$/i.test(value)),
    'Please enter a valid internal path or HTTP(S) URL.'
  ),
});

export const bannerStatusSchema = z.object({
  isActive: z.boolean(),
});

const optionalHttpUrl = z.string().trim().max(500).refine(
  (value) => !value || /^https?:\/\/\S+$/i.test(value),
  'Please enter a valid HTTP or HTTPS URL.'
).optional().default('');

export const seoPageParam = z.object({
  page: z.enum(['home', 'products', 'product_details', 'contact', 'cart', 'checkout', 'account', 'wishlist']),
});

export const seoBodySchema = z.object({
  pageName: z.string().trim().min(1).max(100).optional(),
  metaTitle: z.string().trim().min(1, 'Meta title is required.').max(150),
  metaDescription: z.string().trim().max(500).optional().default(''),
  metaKeywords: z.string().trim().max(500).optional().default(''),
  canonicalUrl: optionalHttpUrl,
  robots: z.enum(['index, follow', 'noindex, follow', 'noindex, nofollow', 'index, nofollow'])
    .optional().default('index, follow'),
  ogTitle: z.string().trim().max(150).optional().default(''),
  ogDescription: z.string().trim().max(500).optional().default(''),
  ogImage: optionalHttpUrl,
  twitterCard: z.enum(['summary', 'summary_large_image']).optional().default('summary_large_image'),
  schemaJson: z.string().trim().max(10000).optional().default('')
    .refine((value) => {
      if (!value) return true;
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }, 'Structured data must be valid JSON.'),
  focusKeyword: z.string().trim().max(100).optional().default(''),
});

const browserPushEndpoint = z.string().url().max(2048).refine((value) => {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return [
    'fcm.googleapis.com',
    'push.services.mozilla.com',
    'push.apple.com',
    'notify.windows.com',
    'wns.windows.com',
  ].some((domain) => host === domain || host.endsWith(`.${domain}`));
}, 'Unsupported or insecure browser push endpoint.');

export const pushSubscriptionSchema = z.object({
  endpoint: browserPushEndpoint,
  expirationTime: z.number().finite().nonnegative().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(20).max(256).regex(/^[A-Za-z0-9_-]+$/),
    auth: z.string().min(10).max(128).regex(/^[A-Za-z0-9_-]+$/),
  }).strict(),
}).strict();

export const pushSubscriptionRemovalSchema = z.object({
  endpoint: browserPushEndpoint,
}).strict();

export const statusSchema = z.object({
  status: z.enum(['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled']),
});

export const orderItemParam = z.object({
  id: objectId,
  index: z.coerce.number().int().nonnegative(),
});

export const adminConversationQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(''),
  filter: z.enum(['unread', 'all', '']).optional().default(''),
});

export const messageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
  before: z.string().trim().max(100).optional(),
});
