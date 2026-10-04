import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { cloudinary } from '../config/cloudinary.js';
import { AppError } from '../utils/helpers.js';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');


const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Upload directly to Cloudinary — no temp file on disk.
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'sulax/products',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    // Resize to a sensible product-image size and convert to webp for efficiency.
    transformation: [{ width: 800, height: 800, crop: 'limit', quality: 'auto', fetch_format: 'webp' }],
  },
});

const bannerStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'sulax/banners',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1800, height: 700, crop: 'limit', quality: 'auto', fetch_format: 'webp' }],
  },
});

export const uploadImage = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    ALLOWED.has(file.mimetype)
      ? cb(null, true)
      : cb(new AppError(400, 'Only JPG, PNG or WEBP images are allowed.')),
}).single('image');

export const uploadBanner = multer({
  storage: bannerStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    ALLOWED.has(file.mimetype)
      ? cb(null, true)
      : cb(new AppError(400, 'Only JPG, PNG or WEBP images are allowed.')),
}).single('image');
