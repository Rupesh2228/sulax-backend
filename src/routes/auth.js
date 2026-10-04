import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { validate } from '../middleware/validate.js';
import {
  registerSchema, loginSchema, googleAuthSchema, profileSchema, changePasswordSchema,
} from '../middleware/schemas.js';
import { loginLimiter, registerLimiter, googleAuthLimiter, passwordLimiter } from '../middleware/rateLimit.js';
import { requireAuth, issueToken, clearToken } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../utils/helpers.js';
import { OAuth2Client } from 'google-auth-library';
import { notifyAdminOfRegistration } from '../services/adminNotifications.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '284274167517-j40sp4dqcd31qnhdom6lur8fc2gq7rk5.apps.googleusercontent.com';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);


const router = Router();

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
// Used to burn the same CPU time when the email doesn't exist (prevents timing-based user enumeration)
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-password', 12);

router.post('/register', registerLimiter, validate(registerSchema), asyncHandler(async (req, res) => {
  const { name, email, phone, address, password } = req.body; // role is NOT accepted from the client
  if (await User.exists({ email })) throw new AppError(409, 'Email is already registered.');
  const user = await User.create({ name, email, phone, address, password });
  try {
    await notifyAdminOfRegistration(user);
  } catch (err) {
    console.error('Customer registered, but admin notification could not be saved:', err);
  }
  const token = issueToken(res, user);
  res.status(201).json({ user: user.toSafeJSON(), token });
}));

router.post('/login', loginLimiter, validate(loginSchema), asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  const invalid = new AppError(401, 'Invalid email or password.');

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw invalid;
  }
  if (user.lockUntil && user.lockUntil > Date.now()) {
    throw new AppError(423, `Account temporarily locked. Try again in ${LOCK_MINUTES} minutes.`);
  }

  if (!(await user.comparePassword(password))) {
    user.loginAttempts += 1;
    if (user.loginAttempts >= MAX_ATTEMPTS) {
      user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      user.loginAttempts = 0;
    }
    await user.save();
    throw invalid;
  }

  if (user.loginAttempts || user.lockUntil) {
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();
  }
  const token = issueToken(res, user);
  res.json({ user: user.toSafeJSON(), token });
}));

router.post('/logout', (_req, res) => {
  clearToken(res);
  res.json({ message: 'Logged out.' });
});

router.post('/google', googleAuthLimiter, validate(googleAuthSchema), asyncHandler(async (req, res) => {
  const { credential, clientId } = req.body;

  const expectedAudiences = [
    clientId,
    process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_ID,
  ].filter(Boolean);

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: expectedAudiences.length === 1 ? expectedAudiences[0] : expectedAudiences,
    });
    payload = ticket.getPayload();
  } catch (verifyErr) {
    console.error('Google token verification failed:', verifyErr.message);
    throw new AppError(401, 'Google verification failed. Please try again.');
  }

  const { email, name, sub } = payload;
  const safeName = (name && name.trim()) || (email && email.split('@')[0]) || 'Google User';

  let user = await User.findOne({ email });
  let created = false;
  if (!user) {
    user = await User.create({
      name: safeName,
      email,
      phone: 'Not provided', 
      address: 'Not provided',
      password: await bcrypt.hash(sub + (process.env.JWT_SECRET || 'google_auth_secret'), 12),
    });
    created = true;
  }

  if (created) {
    try {
      await notifyAdminOfRegistration(user);
    } catch (err) {
      console.error('Google customer registered, but admin notification could not be saved:', err);
    }
  }

  const token = issueToken(res, user);
  res.json({ user: user.toSafeJSON(), token });
}));

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user.toSafeJSON() }));

router.put('/me', requireAuth, validate(profileSchema), asyncHandler(async (req, res) => {
  const { name, phone, address } = req.body;
  Object.assign(req.user, { name, phone, address });
  await req.user.save();
  res.json({ user: req.user.toSafeJSON() });
}));

router.put('/me/password', requireAuth, passwordLimiter, validate(changePasswordSchema), asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(req.body.currentPassword))) {
    throw new AppError(400, 'Current password is incorrect.');
  }
  user.password = req.body.newPassword;
  user.tokenVersion += 1;            // logs out every other device/session
  await user.save();
  issueToken(res, user);             // keep this session alive
  res.json({ message: 'Password changed successfully!' });
}));


export default router;
