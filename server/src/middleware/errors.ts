import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../errors.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Datos no válidos',
      code: 'VALIDATION',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  // body con JSON mal formado
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON mal formado', code: 'BAD_JSON' });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno', code: 'INTERNAL' });
};
