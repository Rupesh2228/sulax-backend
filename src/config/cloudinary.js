import { v2 as cloudinary } from 'cloudinary';
import { env } from './env.js';

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
  secure: true,
});

export { cloudinary };

/**
 * Delete an image from Cloudinary by its public_id.
 * Safe to call with undefined/empty — silently skips.
 */
export async function destroyCloudinaryImage(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('[cloudinary] Failed to delete image:', publicId, err.message);
  }
}
