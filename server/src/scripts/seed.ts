// Mete jugadores y partidas de prueba para que el ranking y el panel no salgan vacíos.
// Solo para desarrollo: npm run seed
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { migrate } from '../db/migrate.js';
import { calculateScore } from '../services/scoreValidation.js';

const players = ['toby', 'canela', 'rocky', 'luna_22', 'chispa', 'bobby', 'nala', 'thor'];

await migrate(false);
const hash = await bcrypt.hash('perrito123', 10);

for (const name of players) {
  const { rows } = await pool.query(
    `INSERT INTO users (username, password_hash, created_at)
     VALUES ($1, $2, now() - (random() * interval '20 days'))
     ON CONFLICT (lower(username)) DO UPDATE SET username = EXCLUDED.username
     RETURNING id`,
    [name, hash],
  );
  const userId = rows[0].id;
  const runs = 3 + Math.floor(Math.random() * 10);

  for (let i = 0; i < runs; i++) {
    const seconds = 15 + Math.random() * 90;
    const distance = Math.floor(seconds * (12 + Math.random() * 10));
    const coins = Math.floor(seconds * Math.random() * 0.8);
    const daysAgo = Math.random() * 13;
    await pool.query(
      `INSERT INTO game_sessions
         (user_id, game_slug, status, score, distance, coins, duration_ms, started_at, ended_at)
       VALUES ($1, 'perrito-run', 'finished', $2, $3, $4, $5::int,
               now() - make_interval(secs => $6::float8 * 86400 + $5::int / 1000.0),
               now() - make_interval(secs => $6::float8 * 86400))`,
      [userId, calculateScore(distance, coins), distance, coins, Math.floor(seconds * 1000), daysAgo.toFixed(3)],
    );
  }
}

console.log(`seed listo: ${players.length} jugadores (contraseña: perrito123)`);
await pool.end();
