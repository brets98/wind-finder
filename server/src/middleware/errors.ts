import type { ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';

const DUPLICATE_KEY = 11000;

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof mongoose.Error.ValidationError) {
    const errors = Object.fromEntries(
      Object.entries(err.errors).map(([field, e]) => [field, e.message]),
    );
    res.status(400).json({ error: 'Validation failed', errors });
    return;
  }

  // Optimistic concurrency: someone saved the same document in the meantime
  if (err instanceof mongoose.Error.VersionError) {
    res.status(409).json({ error: 'Changed in the meantime: reload and try again' });
    return;
  }

  if (err?.code === DUPLICATE_KEY) {
    const fields = Object.keys(err.keyValue ?? {});
    res.status(409).json({ error: `Already exists: ${fields.join(', ')}` });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
