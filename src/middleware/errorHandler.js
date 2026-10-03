import { env } from '../config/env.js';

export const notFound = (_req, res) => res.status(404).json({ message: 'Route not found.' });

// Central error handler: never leaks stack traces or DB internals to the client.
export function errorHandler(err, _req, res, _next) {
  let status = err.status || 500;
  let message = err.expose ? err.message : 'Something went wrong. Please try again.';

  if (err.name === 'CastError') { status = 400; message = 'Invalid ID.'; }
  else if (err.code === 11000) { status = 409; message = 'That record already exists.'; }
  else if (err.name === 'ValidationError') { status = 400; message = 'Invalid data.'; }
  else if (err.code === 'LIMIT_FILE_SIZE') { status = 400; message = 'Image must be 3 MB or smaller.'; }
  else if (err.type === 'entity.parse.failed') { status = 400; message = 'Malformed JSON.'; }
  else if (err.type === 'entity.too.large') { status = 413; message = 'Request too large.'; }

  if (status >= 500) console.error(err);
  res.status(status).json({ message, ...(env.isProd ? {} : { debug: err.message }) });
}
