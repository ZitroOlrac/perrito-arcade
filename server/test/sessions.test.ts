import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { api, backdateSession, createPlayer, emitted, playRun, resetData } from './helpers.js';
import { pool } from '../src/db/pool.js';

beforeEach(resetData);
afterAll(() => pool.end());

describe('partidas', () => {
  it('hace falta estar logueado para jugar', async () => {
    const res = await api().post('/api/games/perrito-run/sessions');
    expect(res.status).toBe(401);
  });

  it('una partida válida suma puntos y es récord personal', async () => {
    const { auth } = await createPlayer('toby');
    const res = await playRun(auth, { distance: 500, coins: 10, durationMs: 30_000 });

    expect(res.body).toMatchObject({ status: 'finished', score: 600, personalBest: true, previousBest: null, rank: 1 });
    expect(emitted.map((e) => e.type)).toEqual(['user', 'run', 'leaderboard']);
  });

  it('una partida peor que la anterior no es récord ni mueve el ranking', async () => {
    const { auth } = await createPlayer('toby');
    await playRun(auth, { distance: 500, coins: 0, durationMs: 30_000 });
    emitted.length = 0;

    const res = await playRun(auth, { distance: 100, coins: 0, durationMs: 10_000 });
    expect(res.body).toMatchObject({ score: 100, personalBest: false, previousBest: 500 });
    expect(emitted.map((e) => e.type)).toEqual(['user', 'run']);
  });

  it('marca como rechazada una puntuación inflada', async () => {
    const { auth } = await createPlayer('tramposo');
    const res = await playRun(auth, { distance: 999_999, coins: 0, durationMs: 5_000 });
    expect(res.body).toEqual({ status: 'rejected', reason: 'DISTANCE_TOO_HIGH' });

    const board = await api().get('/api/games/perrito-run/leaderboard');
    expect(board.body.entries).toHaveLength(0);
  });

  it('no se puede cerrar la misma partida dos veces', async () => {
    const { auth } = await createPlayer();
    const start = await api().post('/api/games/perrito-run/sessions').set('Authorization', auth);
    await backdateSession(start.body.sessionId, 5_000);
    const run = { distance: 50, coins: 1, durationMs: 4_000 };

    const [a, b] = await Promise.all([
      api().post(`/api/sessions/${start.body.sessionId}/finish`).set('Authorization', auth).send(run),
      api().post(`/api/sessions/${start.body.sessionId}/finish`).set('Authorization', auth).send(run),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it('no puedes cerrar la partida de otro', async () => {
    const owner = await createPlayer();
    const other = await createPlayer();
    const start = await api().post('/api/games/perrito-run/sessions').set('Authorization', owner.auth);

    const res = await api()
      .post(`/api/sessions/${start.body.sessionId}/finish`)
      .set('Authorization', other.auth)
      .send({ distance: 1, coins: 0, durationMs: 100 });
    expect(res.status).toBe(403);
  });

  it('empezar otra partida cierra la que se quedó a medias', async () => {
    const { auth } = await createPlayer();
    const first = await api().post('/api/games/perrito-run/sessions').set('Authorization', auth);
    await api().post('/api/games/perrito-run/sessions').set('Authorization', auth);

    const res = await api()
      .post(`/api/sessions/${first.body.sessionId}/finish`)
      .set('Authorization', auth)
      .send({ distance: 1, coins: 0, durationMs: 100 });
    expect(res.status).toBe(409);
  });

  it('un id que no es uuid da 404 en vez de petar', async () => {
    const { auth } = await createPlayer();
    const res = await api().post('/api/sessions/123/finish').set('Authorization', auth).send({});
    expect(res.status).toBe(404);
  });
});

describe('ranking', () => {
  it('ordena por la mejor partida de cada jugador', async () => {
    const a = await createPlayer('toby');
    const b = await createPlayer('canela');
    await playRun(a.auth, { distance: 300, coins: 0, durationMs: 20_000 });
    await playRun(a.auth, { distance: 800, coins: 0, durationMs: 40_000 });
    await playRun(b.auth, { distance: 500, coins: 0, durationMs: 30_000 });

    const res = await api().get('/api/games/perrito-run/leaderboard');
    expect(res.body.entries.map((e: any) => [e.rank, e.username, e.score])).toEqual([
      [1, 'toby', 800],
      [2, 'canela', 500],
    ]);
  });

  it('el ranking semanal ignora partidas antiguas', async () => {
    const { auth } = await createPlayer('toby');
    await playRun(auth, { distance: 300, coins: 0, durationMs: 20_000 });
    await pool.query(`UPDATE game_sessions SET ended_at = now() - interval '30 days'`);

    const week = await api().get('/api/games/perrito-run/leaderboard?period=week');
    const all = await api().get('/api/games/perrito-run/leaderboard?period=all');
    expect(week.body.entries).toHaveLength(0);
    expect(all.body.entries).toHaveLength(1);
  });

  it('404 para un juego que no existe', async () => {
    const res = await api().get('/api/games/tetris/leaderboard');
    expect(res.status).toBe(404);
  });
});

describe('perfil y admin', () => {
  it('el perfil muestra estadísticas del jugador', async () => {
    const { auth } = await createPlayer('nala');
    await playRun(auth, { distance: 200, coins: 5, durationMs: 15_000 });
    await playRun(auth, { distance: 400, coins: 2, durationMs: 25_000 });

    const res = await api().get('/api/users/NALA');
    expect(res.body.username).toBe('nala');
    expect(res.body.games[0]).toMatchObject({ slug: 'perrito-run', plays: 2, best: 420, totalCoins: 7, rank: 1 });
    expect(res.body.recent).toHaveLength(2);
  });

  it('las estadísticas de admin están protegidas', async () => {
    const player = await createPlayer('normal');
    const res = await api().get('/api/admin/stats').set('Authorization', player.auth);
    expect(res.status).toBe(403);
  });

  it('un admin ve las estadísticas', async () => {
    await createPlayer('jefe');
    await pool.query(`UPDATE users SET role = 'admin' WHERE username = 'jefe'`);
    const login = await api().post('/api/auth/login').send({ username: 'jefe', password: 'secreto123' });

    const res = await api().get('/api/admin/stats').set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.users).toBe(1);
    expect(res.body.playsPerDay).toHaveLength(14);
  });
});
