import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from './config.js';
import { verifyToken } from './middleware/auth.js';
import { getLeaderboard } from './services/leaderboard.js';
import type { GameEvents } from './events.js';
import { DuelServer, type DuelServerOptions } from './duel/server.js';

/**
 * Eventos que manda el servidor:
 *  - presence            { online }                 gente conectada ahora mismo
 *  - leaderboard:update  { slug, entries }          cambia el top 10 de un juego
 *  - activity            { slug, username, score, personalBest, at }
 *  - me:update           { bones, achievements }    solo al propio jugador
 *
 * Los eventos del duelo (duel:*) están en duel/server.ts.
 *
 * Eventos que escucha:
 *  - leaderboard:join  (slug)  empieza a recibir el ranking de ese juego
 *  - leaderboard:leave (slug)
 */
export function createRealtime(httpServer: HttpServer, duelOptions: DuelServerOptions = {}) {
  const io = new Server(httpServer, {
    cors: { origin: config.clientOrigin },
  });

  // el token es opcional: los invitados también pueden ver rankings en directo
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token === 'string' && token) {
      try {
        socket.data.user = verifyToken(token);
      } catch {
        // token viejo: se conecta como invitado, no hace falta cortarle
      }
    }
    next();
  });

  const duels = new DuelServer(io, duelOptions);

  const broadcastPresence = () => io.emit('presence', { online: io.engine.clientsCount });

  io.on('connection', (socket) => {
    broadcastPresence();
    // sala privada por usuario, para avisos que solo le interesan a él (en todas sus pestañas)
    if (socket.data.user) socket.join(`user:${socket.data.user.sub}`);
    duels.attach(socket);

    socket.on('leaderboard:join', async (slug: unknown) => {
      if (typeof slug !== 'string' || slug.length > 30) return;
      await socket.join(`game:${slug}`);
      try {
        socket.emit('leaderboard:update', { slug, entries: await getLeaderboard(slug) });
      } catch (err) {
        console.error('error enviando ranking inicial', err);
      }
    });

    socket.on('leaderboard:leave', (slug: unknown) => {
      if (typeof slug === 'string') socket.leave(`game:${slug}`);
    });

    socket.on('disconnect', broadcastPresence);
  });

  const events: GameEvents = {
    leaderboardChanged(slug, entries) {
      io.to(`game:${slug}`).emit('leaderboard:update', { slug, entries });
    },
    runFinished(info) {
      io.emit('activity', { ...info, at: new Date().toISOString() });
    },
    userUpdate(userId, update) {
      io.to(`user:${userId}`).emit('me:update', update);
    },
  };

  return { io, events, duels };
}
