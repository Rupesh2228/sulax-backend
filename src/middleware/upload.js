import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { cloudinary } from '../config/cloudinary.js';
import { AppError } from '../utils/helpers.js';

// ── Kept for backward-compatibility: old code imports UPLOAD_DIR for local unlink.
// With Cloudinary the local disk is no longer used; this export is a no-op placeholder
// so existing imports do not break. removeFile() in admin.js uses it — see note below.
export const UPLOAD_DIR = null;

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

export const uploadImage = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    ALLOWED.has(file.mimetype)
      ? cb(null, true)
      : cb(new AppError(400, 'Only JPG, PNG or WEBP images are allowed.')),
}).single('image');
