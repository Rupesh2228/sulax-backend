import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { env } from '../config/env.js';
import { AppError, asyncHandler } from '../utils/helpers.js';

export const COOKIE_NAME = 'sulax_token';

const cookieOptions = {
  httpOnly: true,            // JS cannot read it -> XSS cannot steal the session
  secure: env.isProd,        // HTTPS only in production
  sameSite: env.isProd ? 'none' : 'lax', // 'none' required for cross-domain cookies (Vercel -> Render)
  path: '/',
};

export function issueToken(res, user) {
  const token = jwt.sign({ sub: user._id.toString(), tv: user.tokenVersion }, env.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: env.jwtExpiresIn,
  });
  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
  return token;
}

export const clearToken = (res) => res.clearCookie(COOKIE_NAME, cookieOptions);

async function loadUser(req) {
  let token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    const authHeader = req.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    const user = await User.findById(payload.sub);
    if (!user || user.tokenVersion !== payload.tv) return null; // revoked
    return user;
  } catch (err) {
    // Log JWT errors so they appear in Render logs — helps diagnose secret mismatches
    console.error('[auth] JWT verification failed:', err.name, err.message);
    return null;
  }
}

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const user = await loadUser(req);
  if (!user) throw new AppError(401, 'Please log in to continue.');
  req.user = user;
  next();
});

export const optionalAuth = asyncHandler(async (req, _res, next) => {
  req.user = await loadUser(req);
  next();
});

export const requireAdmin = (req, _res, next) => {
  if (req.user?.role !== 'admin') return next(new AppError(403, 'Admin access required.'));
  next();
};
