import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import type { GameEvents } from '../src/events.js';

export const emitted: { type: string; payload: unknown }[] = [];

const recordingEvents: GameEvents = {
  leaderboardChanged: (slug, entries) => emitted.push({ type: 'leaderboard', payload: { slug, entries } }),
  runFinished: (info) => emitted.push({ type: 'run', payload: info }),
  userUpdate: (userId, update) => emitted.push({ type: 'user', payload: { userId, ...update } }),
};

export const app = createApp(recordingEvents);
export const api = () => request(app);

export async function resetData() {
  emitted.length = 0;
  await pool.query('TRUNCATE game_sessions, users RESTART IDENTITY CASCADE');
}

let counter = 0;
export async function createPlayer(name = `jugador${++counter}`) {
  const res = await api().post('/api/auth/register').send({ username: name, password: 'secreto123' });
  if (res.status !== 201) throw new Error(`no se pudo crear ${name}: ${res.text}`);
  return { token: res.body.token as string, user: res.body.user, auth: `Bearer ${res.body.token}` };
}

/** Mueve el inicio de la sesión hacia atrás, para simular que la partida ha durado X ms. */
export async function backdateSession(sessionId: string, ms: number) {
  await pool.query(`UPDATE game_sessions SET started_at = now() - ($2 || ' milliseconds')::interval WHERE id = $1`, [
    sessionId,
    ms,
  ]);
}

export async function playRun(auth: string, run: { distance: number; coins: number; durationMs: number }) {
  const start = await api().post('/api/games/perrito-run/sessions').set('Authorization', auth);
  await backdateSession(start.body.sessionId, run.durationMs + 300);
  return api().post(`/api/sessions/${start.body.sessionId}/finish`).set('Authorization', auth).send(run);
}
