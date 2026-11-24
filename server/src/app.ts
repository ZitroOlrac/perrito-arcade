import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { gamesRouter } from './routes/games.js';
import { sessionsRouter } from './routes/sessions.js';
import { usersRouter } from './routes/users.js';
import { adminRouter } from './routes/admin.js';
import { duelsRouter } from './routes/duels.js';
import { meRouter, shopRouter } from './routes/shop.js';
import { errorHandler } from './middleware/errors.js';
import { notFound } from './errors.js';
import { noopEvents, type GameEvents } from './events.js';
import { pool } from './db/pool.js';

export function createApp(events: GameEvents = noopEvents) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  // Phaser dibuja en canvas y usa blobs para las texturas generadas
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:', 'blob:'],
          'connect-src': ["'self'", 'ws:', 'wss:'],
        },
      },
    }),
  );
  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json({ limit: '20kb' }));

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/games', gamesRouter);
  app.use('/api/sessions', sessionsRouter(events));
  app.use('/api/users', usersRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/duels', duelsRouter);
  app.use('/api/shop', shopRouter(events));
  app.use('/api/me', meRouter);

  app.use('/api', (_req, _res, next) => next(notFound('Esa ruta no existe')));

  // en producción el mismo servidor sirve el frontend ya compilado
  const clientDist = process.env.CLIENT_DIST;
  if (clientDist && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { maxAge: '1h', index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
