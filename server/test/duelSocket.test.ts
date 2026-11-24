import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { createRealtime } from '../src/realtime.js';
import { pool } from '../src/db/pool.js';
import { createPlayer, resetData } from './helpers.js';

// Servidor de verdad con websockets, en un puerto libre, y clientes socket.io de verdad.
let server: http.Server;
let realtime: ReturnType<typeof createRealtime>;
let url: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  server = http.createServer(createApp());
  realtime = createRealtime(server, { countdownMs: 200, graceMs: 400, rematchWindowMs: 2000, tickMs: 20 });
  await new Promise<void>((r) => server.listen(0, r));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  realtime.duels.stop();
  realtime.io.close();
  await new Promise((r) => server.close(r));
  await pool.end();
});

beforeEach(async () => {
  realtime.duels.reset();
  await resetData();
});
afterEach(() => {
  sockets.splice(0).forEach((s) => s.disconnect());
});

function client(token?: string) {
  const s = connect(url, { auth: { token }, transports: ['websocket'], forceNew: true });
  sockets.push(s);
  return s;
}

const once = <T = any>(s: Socket, event: string, timeout = 3000) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no llegó ${event}`)), timeout);
    s.once(event, (data: T) => {
      clearTimeout(t);
      resolve(data);
    });
  });

const emit = <T = any>(s: Socket, event: string, ...args: unknown[]) =>
  new Promise<T>((resolve) => s.emit(event, ...args, resolve));

/** espera a un duel:state que cumpla la condición */
const stateWhere = (s: Socket, pred: (st: any) => boolean, timeout = 3000) =>
  new Promise<any>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('no llegó el estado esperado')), timeout);
    const onState = (st: any) => {
      if (!pred(st)) return;
      clearTimeout(t);
      s.off('duel:state', onState);
      resolve(st);
    };
    s.on('duel:state', onState);
  });

async function twoPlayersInMatch() {
  const p1 = await createPlayer('toby');
  const p2 = await createPlayer('canela');
  const s1 = client(p1.token);
  const s2 = client(p2.token);
  await Promise.all([once(s1, 'connect'), once(s2, 'connect')]);

  const m1 = once(s1, 'duel:match');
  const m2 = once(s2, 'duel:match');
  expect(await emit(s1, 'duel:queue')).toEqual({ ok: true, matched: false });
  expect(await emit(s2, 'duel:queue')).toEqual({ ok: true, matched: true });
  return { s1, s2, match1: await m1, match2: await m2 };
}

describe('duelos por websocket', () => {
  it('sin sesión no se puede jugar', async () => {
    const s = client();
    await once(s, 'connect');
    expect(await emit(s, 'duel:queue')).toEqual({ error: 'Tienes que iniciar sesión para jugar duelos' });
  });

  it('dos jugadores en cola acaban en la misma partida, cada uno en un lado', async () => {
    const { match1, match2 } = await twoPlayersInMatch();
    expect(match1.matchId).toBe(match2.matchId);
    expect(new Set([match1.you, match2.you])).toEqual(new Set(['a', 'b']));
    expect(match1.opponent).toMatchObject({ username: 'canela', rating: 1000, isBot: false });
    expect(match1.rated).toBe(true);
  });

  it('el servidor decide quién se lleva el tornillo y los dos ven lo mismo', async () => {
    const { s1, s2 } = await twoPlayersInMatch();
    const st = await stateWhere(s1, (x) => x.phase === 'playing' && x.bolts.length > 0);
    const bolt = st.bolts[0];
    await new Promise((r) => setTimeout(r, 150)); // tiempo de reacción mínimo

    const hits = bolt.needed;
    let last: any;
    for (let i = 0; i < hits; i++) last = await emit(s1, 'duel:hit', { boltId: bolt.id });
    expect(last).toMatchObject({ ok: true, claimed: true });

    // el rival llega tarde
    expect(await emit(s2, 'duel:hit', { boltId: bolt.id })).toMatchObject({ ok: false, reason: 'NO_BOLT' });

    const seenBy2 = await stateWhere(s2, (x) => x.scores.a + x.scores.b > 0);
    expect(seenBy2.bolts.find((b: any) => b.id === bolt.id)).toBeUndefined();
  });

  it('si uno abandona, gana el otro y se actualiza el ELO', async () => {
    const { s1, s2, match1 } = await twoPlayersInMatch();
    const end = once(s2, 'duel:end');
    await emit(s1, 'duel:leave');

    const payload = await end;
    const winnerSide = match1.you === 'a' ? 'b' : 'a';
    expect(payload.result).toMatchObject({ winner: winnerSide, reason: 'forfeit' });
    expect(payload.rated).toBe(true);

    const { rows } = await pool.query(
      `SELECT u.username, r.rating, r.wins, r.losses FROM duel_ratings r JOIN users u ON u.id = r.user_id ORDER BY u.username`,
    );
    expect(rows).toEqual([
      { username: 'canela', rating: 1016, wins: 1, losses: 0 },
      { username: 'toby', rating: 984, wins: 0, losses: 1 },
    ]);

    // el ganador cobra 20 huesos y el logro de la primera victoria (25)
    const bones = await pool.query(`SELECT username, bones FROM users ORDER BY username`);
    expect(bones.rows).toEqual([
      { username: 'canela', bones: 45 },
      { username: 'toby', bones: 0 },
    ]);
    expect(payload.winnerBones).toBe(20);
  });

  it('si se desconecta y vuelve a tiempo, sigue en la partida', async () => {
    const p1 = await createPlayer('toby');
    const p2 = await createPlayer('canela');
    const s1 = client(p1.token);
    const s2 = client(p2.token);
    await Promise.all([once(s1, 'connect'), once(s2, 'connect')]);
    await emit(s1, 'duel:queue');
    const first = once(s2, 'duel:match');
    await emit(s2, 'duel:queue');
    const { matchId } = await first;

    const away = once(s2, 'duel:opponent');
    s1.disconnect();
    expect(await away).toMatchObject({ status: 'away' });

    // vuelve con otra conexión (como al recargar la página)
    const again = client(p1.token);
    const rejoined = await once(again, 'duel:match');
    expect(rejoined.matchId).toBe(matchId);
    expect(await once(s2, 'duel:opponent')).toMatchObject({ status: 'back' });

    // pasado el tiempo de gracia, la partida sigue viva
    await new Promise((r) => setTimeout(r, 600));
    expect(realtime.duels.stats().matches).toBe(1);
  });

  it('si no vuelve, pierde la partida', async () => {
    const { s1, s2 } = await twoPlayersInMatch();
    const end = once(s2, 'duel:end', 3000);
    s1.disconnect();
    expect((await end).result.reason).toBe('forfeit');
  });

  it('duel:sync devuelve la partida en curso aunque se haya perdido el duel:match', async () => {
    const p1 = await createPlayer('toby');
    const p2 = await createPlayer('canela');
    const s1 = client(p1.token);
    const s2 = client(p2.token);
    await Promise.all([once(s1, 'connect'), once(s2, 'connect')]);
    expect(await emit(s1, 'duel:sync')).toEqual({ status: 'idle' });

    await emit(s1, 'duel:queue');
    expect(await emit(s1, 'duel:sync')).toEqual({ status: 'queue' });
    const started = once(s2, 'duel:match');
    await emit(s2, 'duel:queue');
    const { matchId } = await started;

    // otra pestaña del mismo jugador (conectada antes de abrir la página del duelo)
    const tab = client(p1.token);
    await once(tab, 'connect');
    const info = once(tab, 'duel:match');
    expect(await emit(tab, 'duel:sync')).toEqual({ status: 'match' });
    expect((await info).matchId).toBe(matchId);
  });

  it('sala privada con código', async () => {
    const p1 = await createPlayer('toby');
    const p2 = await createPlayer('canela');
    const s1 = client(p1.token);
    const s2 = client(p2.token);
    await Promise.all([once(s1, 'connect'), once(s2, 'connect')]);

    const { code } = await emit(s1, 'duel:room:create');
    expect(code).toMatch(/^[A-Z2-9]{5}$/);
    expect(await emit(s1, 'duel:room:join', code)).toEqual({ error: 'No puedes jugar contra ti mismo' });
    expect(await emit(s2, 'duel:room:join', 'NOPE1')).toEqual({ error: 'Esa sala no existe o ya ha empezado' });

    const started = once(s1, 'duel:match');
    expect(await emit(s2, 'duel:room:join', code.toLowerCase())).toEqual({ ok: true });
    expect((await started).opponent.username).toBe('canela');
  });

  it('contra el bot no se juega ELO', async () => {
    const p1 = await createPlayer('toby');
    const s1 = client(p1.token);
    await once(s1, 'connect');
    const match = once(s1, 'duel:match');
    await emit(s1, 'duel:bot');
    expect(await match).toMatchObject({ you: 'a', rated: false, opponent: { isBot: true } });

    const end = once(s1, 'duel:end');
    await emit(s1, 'duel:leave');
    expect((await end).rated).toBe(false);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM duel_ratings');
    expect(rows[0].n).toBe(0);
  });

  it('al acabar se puede buscar otra partida sin esperar a que caduque la revancha', async () => {
    const { s1, s2 } = await twoPlayersInMatch();
    const end = once(s2, 'duel:end');
    await emit(s1, 'duel:leave');
    await end;

    const left = once(s1, 'duel:opponent');
    expect(await emit(s2, 'duel:queue')).toEqual({ ok: true, matched: false });
    // al que se queda esperando la revancha se le avisa de que el otro se ha ido
    expect(await left).toEqual({ status: 'left' });
    expect(await emit(s1, 'duel:rematch')).toEqual({ error: 'Tu rival se ha ido' });
  });

  it('revancha tras una partida terminada normal', async () => {
    const { s1, s2, match1 } = await twoPlayersInMatch();
    // acabo la partida por tiempo forzando el reloj del motor
    const end = Promise.all([once(s1, 'duel:end'), once(s2, 'duel:end')]);
    const engine = (realtime.duels as any).matches.get(match1.matchId).engine;
    engine.forfeit('a');
    await end;

    const request = once(s2, 'duel:rematch-request');
    expect(await emit(s1, 'duel:rematch')).toEqual({ ok: true });
    expect((await request).from).toBe(match1.you === 'a' ? 'toby' : 'canela');

    const next = once(s1, 'duel:match');
    await emit(s2, 'duel:rematch');
    const m = await next;
    expect(m.matchId).not.toBe(match1.matchId);
    // el ELO ya viene actualizado de la partida anterior
    expect([m.me.rating, m.opponent.rating].sort()).toEqual([1016, 984].sort());
  });
});
