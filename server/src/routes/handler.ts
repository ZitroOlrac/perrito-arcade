import type { NextFunction, Request, RequestHandler, Response } from 'express';

// Express 4 no captura los errores de funciones async, así que los paso a next()
export const handler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
