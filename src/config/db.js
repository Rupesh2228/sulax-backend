import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB() {
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log('MongoDB connected successfully');
  } catch (err) {
    if (env.isProd && (env.mongoUri.includes('127.0.0.1') || env.mongoUri.includes('localhost'))) {
      console.error('MongoDB connection failed: MONGO_URI is set to localhost (127.0.0.1) in production. When deployed on Render, set MONGO_URI in Render Dashboard to a MongoDB Atlas cluster URI (mongodb+srv://...).');
    } else {
      console.error('MongoDB connection failed:', err.message);
    }
    throw new Error('MongoDB connection failed.');
  }
}

