import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { cloudinary } from '../config/cloudinary.js';
import { AppError } from '../utils/helpers.js';

export const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

const productStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'sulax/products',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1000, height: 1000, crop: 'limit', quality: 'auto', fetch_format: 'webp' }],
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

const imageFilter = (_req, file, cb) => {
  if (!ALLOWED.has(file.mimetype)) {
    return cb(new AppError(400, 'Only JPG, PNG or WEBP images are allowed.'));
  }
  cb(null, true);
};

export const uploadImage = multer({
  storage: productStorage,
  limits: { fileSize: 3 * 1024 * 1024, files: 5 },
  fileFilter: imageFilter,
}).array('images', 5);

export const uploadBanner = multer({
  storage: bannerStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: imageFilter,
}).single('image');
