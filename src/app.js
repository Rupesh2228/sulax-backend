import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { env } from './config/env.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { csrfProtect, csrfTokenHandler } from './middleware/csrf.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { UPLOAD_DIR } from './middleware/upload.js';

import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import wishlistRoutes from './routes/wishlist.js';
import contactRoutes from './routes/contact.js';
import adminRoutes from './routes/admin.js';
import seoRoutes from './routes/seo.js';
import messageRoutes from './routes/messages.js';
import notificationRoutes from './routes/notifications.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.disable('x-powered-by');
if (env.isProd) app.set('trust proxy', 1); // correct client IPs for rate limiting behind a proxy/host

// --- Security headers (CSP, HSTS, X-Content-Type-Options, frame-ancestors, ...) ---
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // lets the SPA load /uploads images
  })
);

// --- CORS: only the configured front-end origin(s), with credentials for the cookie ---
app.use(
  cors({
    origin(origin, cb) {
      cb(null, env.isAllowedOrigin(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Authorization'],
  })
);

if (!env.isProd) app.use(morgan('dev'));

// --- Body parsing with small size limits ---
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(cookieParser());

// --- Injection / pollution defences ---
app.use(mongoSanitize());   // strips $ and . keys -> blocks NoSQL operator injection
app.use(hpp());             // blocks HTTP parameter pollution (?a=1&a=2)

// --- Uploaded product images (no directory listing, no MIME sniffing) ---
app.use(
  '/uploads',
  express.static(UPLOAD_DIR, {
    index: false,
    dotfiles: 'deny',
    setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff'),
  })
);

// --- Health check / root ---
app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Sulax API is running' });
});

// --- API ---
app.use('/api', apiLimiter);
app.get('/api/csrf', csrfTokenHandler);
app.use('/api', csrfProtect);

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/seo', seoRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', notFound);

// --- Optionally serve the built React app (single-origin production deploy) ---
const dist = path.join(__dirname, '../../client/dist');
if (env.isProd && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(errorHandler);

export default app;
