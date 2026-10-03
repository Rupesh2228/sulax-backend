import http from 'http';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import app from './app.js';
import { initSocket } from './socket.js';

await connectDB();

const server = http.createServer(app);
initSocket(server);

server.listen(env.port, () => {
  console.log(`API and Socket.IO running on http://localhost:${env.port}`);
  console.log(`[startup] NODE_ENV=${process.env.NODE_ENV} | isProd=${env.isProd}`);
  console.log(`[startup] Cookie sameSite=${env.isProd ? 'none' : 'lax'} | secure=${env.isProd}`);
  console.log(`[startup] Allowed origins: ${env.clientOrigins.join(', ')}`);
  if (!env.isProd) {
    console.warn('[startup] WARNING: NODE_ENV is not "production". Cookies use SameSite=Lax which');
    console.warn('[startup]          blocks cross-origin requests when serving from a different origin.');
    console.warn('[startup] ACTION: On Render set the following environment variables for the service:');
    console.warn('[startup]   - NODE_ENV=production');
    console.warn('[startup]   - MONGO_URI, JWT_SECRET (>=32 chars), CLIENT_ORIGIN (comma-separated)');
    console.warn('[startup] If you use GitHub-connected deploys, ensure Render has access to your repository.');
    console.warn('[startup] See server/DEPLOY_RENDER.md in the project for step-by-step deployment guidance.');
  }
});

// Fail safe on unexpected errors and shut down cleanly
process.on('unhandledRejection', (e) => {
  console.error('Unhandled rejection:', e);
  server.close(() => process.exit(1));
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
