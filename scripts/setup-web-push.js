import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webPush from 'web-push';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localEnvPath = path.join(serverDir, '.env');
const pushEnvPath = path.join(serverDir, '.env.push');

dotenv.config({ path: localEnvPath });
dotenv.config({ path: pushEnvPath });

const configuredKeys = [
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
  process.env.VAPID_SUBJECT,
];

if (configuredKeys.every(Boolean)) {
  console.log('Web Push VAPID settings are already configured.');
  process.exit(0);
}

if (configuredKeys.some(Boolean)) {
  console.error('VAPID settings are incomplete. Configure all three VAPID variables together.');
  process.exit(1);
}

const keys = webPush.generateVAPIDKeys();
const subject = 'mailto:admin@example.com';
const contents = [
  '# Generated Web Push credentials. Keep this file private and do not commit it.',
  `VAPID_PUBLIC_KEY=${keys.publicKey}`,
  `VAPID_PRIVATE_KEY=${keys.privateKey}`,
  `VAPID_SUBJECT=${subject}`,
  '',
].join('\n');

try {
  await fs.writeFile(pushEnvPath, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  console.log('Web Push credentials saved in the ignored server/.env.push file.');
  console.log('Restart the server to enable push delivery. Update VAPID_SUBJECT to a monitored contact before production.');
} catch (err) {
  if (err.code === 'EEXIST') {
    console.error('server/.env.push already exists; refusing to replace push credentials.');
    process.exitCode = 1;
  } else {
    throw err;
  }
}
