import http from 'http';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import app from './app.js';
import { initSocket } from './socket.js';

await connectDB();

const server = http.createServer(app);
initSocket(server);

server.listen(env.port, () => console.log(`API and Socket.IO running on http://localhost:${env.port}`));

// Fail safe on unexpected errors and shut down cleanly
process.on('unhandledRejection', (e) => {
  console.error('Unhandled rejection:', e);
  server.close(() => process.exit(1));
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
