import rateLimit from 'express-rate-limit';

const make = (windowMs, limit, message, extra = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
    ...extra,
  });

export const apiLimiter = make(15 * 60 * 1000, 300, 'Too many requests. Please slow down.');
export const loginLimiter = make(15 * 60 * 1000, 10, 'Too many login attempts. Try again in 15 minutes.', {
  skipSuccessfulRequests: true,
});
export const registerLimiter = make(60 * 60 * 1000, 10, 'Too many accounts created from this IP. Try later.');
export const contactLimiter = make(60 * 60 * 1000, 5, 'You have sent too many messages. Try again later.');
export const orderLimiter = make(60 * 60 * 1000, 30, 'Too many order attempts. Try again later.');
