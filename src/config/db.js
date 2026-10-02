import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB() {
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log('MongoDB connected successfully');
  } catch {
    console.error('MongoDB connection failed. Check the configured MONGO_URI and database availability.');
    throw new Error('MongoDB connection failed.');
  }
}
