import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { AppError } from '../utils/helpers.js';

export const UPLOAD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');

const ALLOWED = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  // Never trust the client's filename: generate a random one with a whitelisted extension.
  filename: (_req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + ALLOWED[file.mimetype]),
});

export const uploadImage = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024, files: 1 }, // 3 MB, same as the original app
  fileFilter: (_req, file, cb) =>
    ALLOWED[file.mimetype] ? cb(null, true) : cb(new AppError(400, 'Only JPG, PNG or WEBP images are allowed.')),
}).single('image');
