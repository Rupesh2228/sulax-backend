// Validates (and strips unknown keys from) req.body / req.query / req.params using a zod schema.
// Stripping unknown keys also prevents mass-assignment (e.g. someone sending {"role":"admin"}).
import fs from 'fs';

export const validate =
  (schema, source = 'body') =>
  (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      if (req.file) fs.unlink(req.file.path, () => {}); // don't keep uploads from rejected requests
      const errors = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return res.status(400).json({ message: errors[0]?.message || 'Invalid input.', errors });
    }
    req[source] = result.data;
    next();
  };
