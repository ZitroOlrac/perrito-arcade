import http from 'node:http';
import { createApp } from './app.js';
import { createRealtime } from './realtime.js';
import { migrate } from './db/migrate.js';
import { pool } from './db/pool.js';
import { config } from './config.js';
import { noopEvents, type GameEvents } from './events.js';

async function main() {
  await migrate();

  // La app necesita los eventos de socket.io y socket.io necesita el servidor http
  // ya creado con la app. Rompo el círculo con un objeto que delega en `realtimeEvents`.
  //
  // (Antes enganchaba Express con server.on('request') y Express contestaba también
  // a las peticiones de /socket.io -> "headers already sent" y el servidor se caía.)
  let realtimeEvents: GameEvents = noopEvents;
  const events: GameEvents = {
    leaderboardChanged: (...args) => realtimeEvents.leaderboardChanged(...args),
    runFinished: (...args) => realtimeEvents.runFinished(...args),
    userUpdate: (...args) => realtimeEvents.userUpdate(...args),
  };

  const server = http.createServer(createApp(events));
  const realtime = createRealtime(server);
  realtimeEvents = realtime.events;

  server.listen(config.port, () => {
    console.log(`Perrito Arcade escuchando en http://localhost:${config.port}`);
  });

  const shutdown = () => {
    console.log('cerrando...');
    realtime.duels.stop();
    realtime.io.close();
    server.close(() => pool.end().then(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
