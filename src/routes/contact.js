import { Router } from 'express';
import ContactMessage from '../models/ContactMessage.js';
import { validate } from '../middleware/validate.js';
import { contactSchema } from '../middleware/schemas.js';
import { contactLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../utils/helpers.js';

const router = Router();

router.post('/', contactLimiter, validate(contactSchema), asyncHandler(async (req, res) => {
  await ContactMessage.create(req.body);
  res.status(201).json({ message: 'Your message has been sent successfully. We will contact you soon.' });
}));

export default router;
