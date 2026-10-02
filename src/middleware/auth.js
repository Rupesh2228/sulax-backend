import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { env } from '../config/env.js';
import { AppError, asyncHandler } from '../utils/helpers.js';

export const COOKIE_NAME = 'sulax_token';

const cookieOptions = {
  httpOnly: true,            // JS cannot read it -> XSS cannot steal the session
  secure: env.isProd,        // HTTPS only in production
  sameSite: 'lax',           // blocks cross-site POSTs (CSRF defence in depth)
  path: '/',
};

export function issueToken(res, user) {
  const token = jwt.sign({ sub: user._id.toString(), tv: user.tokenVersion }, env.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: env.jwtExpiresIn,
  });
  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

export const clearToken = (res) => res.clearCookie(COOKIE_NAME, cookieOptions);

async function loadUser(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    const user = await User.findById(payload.sub);
    if (!user || user.tokenVersion !== payload.tv) return null; // revoked
    return user;
  } catch {
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
