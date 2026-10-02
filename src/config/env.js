import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();
dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env.push'),
});

const required = ['MONGO_URI', 'JWT_SECRET', 'CLIENT_ORIGIN'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be at least 32 characters long.');
  process.exit(1);
}

const vapidValues = [
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
  process.env.VAPID_SUBJECT,
];
if (vapidValues.some(Boolean) && !vapidValues.every(Boolean)) {
  console.error('VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT must be configured together.');
  process.exit(1);
}
if (vapidValues.every(Boolean) && !/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/i.test(process.env.VAPID_SUBJECT)) {
  console.error('VAPID_SUBJECT must be a valid mailto: address or HTTPS URL.');
  process.exit(1);
}

export const env = {
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigins: process.env.CLIENT_ORIGIN.split(',').map((s) => s.trim()),
  webPush: vapidValues.every(Boolean)
    ? {
        publicKey: process.env.VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY,
        subject: process.env.VAPID_SUBJECT,
      }
    : null,
};
