import crypto from 'crypto';
import { env } from '../config/env.js';

// Double-submit-cookie CSRF protection.
// The server sets a random token in a cookie AND returns it in JSON; the SPA sends it back
// in the X-CSRF-Token header on every state-changing request. A cross-site attacker can
// neither read the cookie nor set the header, so forged requests are rejected.
const CSRF_COOKIE = 'sulax_csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfTokenHandler(req, res) {
  let token = req.cookies?.[CSRF_COOKIE];
  if (!token) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: env.isProd,
      sameSite: env.isProd ? 'none' : 'lax',
      path: '/',
    });
  }
  res.json({ csrfToken: token });
}

export function csrfProtect(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const header = req.get('x-csrf-token');
  const origin = req.get('origin');

  // In cross-origin SPA setups (Vercel -> Render) where browsers block 3rd-party cookies,
  // origin verification combined with the custom X-CSRF-Token header provides strong CSRF defence.
  if (origin && env.isAllowedOrigin(origin) && header && typeof header === 'string' && header.length >= 16) {
    return next();
  }

  const cookie = req.cookies?.[CSRF_COOKIE];
  const ok =
    cookie &&
    header &&
    cookie.length === header.length &&
    crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(header));
  if (!ok) return res.status(403).json({ message: 'Invalid or missing CSRF token.' });
  next();
}
