import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { validate } from '../middleware/validate.js';
import {
  registerSchema, loginSchema, profileSchema, changePasswordSchema,
} from '../middleware/schemas.js';
import { loginLimiter, registerLimiter } from '../middleware/rateLimit.js';
import { requireAuth, issueToken, clearToken } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../utils/helpers.js';
import { OAuth2Client } from 'google-auth-library';
import { notifyAdminOfRegistration } from '../services/adminNotifications.js';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);


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
  issueToken(res, user);
  res.status(201).json({ user: user.toSafeJSON() });
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
  issueToken(res, user);
  res.json({ user: user.toSafeJSON() });
}));

router.post('/logout', (_req, res) => {
  clearToken(res);
  res.json({ message: 'Logged out.' });
});

router.post('/google', asyncHandler(async (req, res) => {
  const { credential } = req.body;
  if (!credential) throw new AppError(400, 'Token is missing');

  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  const { email, name, sub } = payload;

  let user = await User.findOne({ email });
  let created = false;
  if (!user) {
    // Register the user automatically
    user = await User.create({
      name,
      email,
      // Create some dummy values for required fields or make them optional
      phone: 'Not provided', 
      address: 'Not provided',
      password: await bcrypt.hash(sub + process.env.JWT_SECRET, 12), // Random password
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

  issueToken(res, user);
  res.json({ user: user.toSafeJSON() });
}));

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user.toSafeJSON() }));

router.put('/me', requireAuth, validate(profileSchema), asyncHandler(async (req, res) => {
  const { name, phone, address } = req.body;
  Object.assign(req.user, { name, phone, address });
  await req.user.save();
  res.json({ user: req.user.toSafeJSON() });
}));

router.put('/me/password', requireAuth, validate(changePasswordSchema), asyncHandler(async (req, res) => {
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
