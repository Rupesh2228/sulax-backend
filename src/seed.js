// Usage:  npm run seed
// Creates the admin account (from ADMIN_EMAIL / ADMIN_PASSWORD in .env) and a few sample products.
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import mongoose from 'mongoose';
import User from './models/User.js';
import Product from './models/Product.js';

await connectDB();

const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 10) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (10+ chars) in .env first. No default admin password is shipped.');
  process.exit(1);
}

if (!(await User.exists({ email: ADMIN_EMAIL.toLowerCase() }))) {
  await User.create({
    name: 'Sulax Admin', email: ADMIN_EMAIL, phone: '9800000000', address: 'Kathmandu',
    password: ADMIN_PASSWORD, role: 'admin',
  });
  console.log(`Admin created: ${ADMIN_EMAIL}`);
} else {
  console.log('Admin already exists, skipping.');
}

if ((await Product.countDocuments()) === 0) {
  await Product.insertMany([
    { name: 'Classic Runner', category: 'Sneakers', price: 3499, oldPrice: 4299, discount: 19, stock: 25, rating: 4.5, description: 'Lightweight everyday runner with a breathable mesh upper.' },
    { name: 'Urban Street Low', category: 'Sneakers', price: 2999, stock: 18, rating: 4.2, description: 'Clean low-top sneaker for daily wear.' },
    { name: 'Trail Hiker Pro', category: 'Boots', price: 5499, oldPrice: 6499, discount: 15, stock: 10, rating: 4.7, description: 'Grippy outsole and waterproof finish for rough trails.' },
    { name: 'Office Oxford', category: 'Formal', price: 4599, stock: 12, rating: 4.1, description: 'Polished leather-look oxford for work and events.' },
    { name: 'Comfort Slide', category: 'Sandals', price: 1299, stock: 40, rating: 4.0, description: 'Soft cushioned slide for home and beach.' },
  ]);
  console.log('Sample products inserted. (Add images later via the admin API.)');
}

await mongoose.disconnect();
