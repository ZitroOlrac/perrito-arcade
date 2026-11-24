import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import type { TokenPayload } from '../middleware/auth.js';
import { DuelEngine, RULES, type Side } from './engine.js';
import { DuelBot } from './bot.js';
import { DUEL_WIN_BONES, getRating, saveDuel, type SavedDuel } from './store.js';

/**
 * Todo lo que tiene estado en el duelo: cola de búsqueda, salas privadas,
 * partidas en curso y el bucle que las hace avanzar.
 *
 * Eventos que escucha (todos con ack):
 *   duel:queue, duel:cancel, duel:bot, duel:room:create, duel:room:join (code),
 *   duel:hit ({ boltId }), duel:rematch, duel:leave, duel:ping
 * Eventos que manda:
 *   duel:queued, duel:match, duel:state, duel:end, duel:rematch-request, duel:opponent
 */

interface Player {
  userId: number;
  username: string;
  rating: number;
  socketId: string | null;
  isBot: boolean;
}

interface Match {
  id: string;
  engine: DuelEngine;
  players: Record<Side, Player>;
  bot: DuelBot | null;
  startedAt: Date;
  sentVersion: number;
  graceTimers: Partial<Record<Side, NodeJS.Timeout>>;
  rematch: Set<Side>;
  finishing: boolean;
  saved: SavedDuel | null;
  cleanupTimer?: NodeJS.Timeout;
}

interface Waiting {
  userId: number;
  username: string;
  socketId: string;
  since: number;
}

export interface DuelServerOptions {
  tickMs?: number;
  /** tiempo que se espera a un jugador desconectado antes de darle la partida por perdida */
  graceMs?: number;
  /** cuánto tiempo se guarda una partida acabada por si piden revancha */
  rematchWindowMs?: number;
  countdownMs?: number;
}

type Ack = (res: unknown) => void;
const noop: Ack = () => {};

const BOT_NAME = 'Perrobot';
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I para que no se confundan

export class DuelServer {
  private queue: Waiting[] = [];
  private rooms = new Map<string, Waiting>();
  private matches = new Map<string, Match>();
  private byUser = new Map<number, string>();
  private loop: NodeJS.Timeout;
  private opts: Required<DuelServerOptions>;

  constructor(
    private io: Server,
    options: DuelServerOptions = {},
  ) {
    this.opts = {
      tickMs: options.tickMs ?? 50,
      graceMs: options.graceMs ?? 10_000,
      rematchWindowMs: options.rematchWindowMs ?? 30_000,
      countdownMs: options.countdownMs ?? RULES.countdownMs,
    };
    this.loop = setInterval(() => this.tick(), this.opts.tickMs);
  }

  stop() {
    clearInterval(this.loop);
    for (const m of this.matches.values()) {
      Object.values(m.graceTimers).forEach(clearTimeout);
      clearTimeout(m.cleanupTimer);
    }
  }

  // ---------- conexión ----------

  attach(socket: Socket) {
    const user = socket.data.user as TokenPayload | undefined;

    // si se ha recargado la página a mitad de partida, lo devuelvo a ella
    if (user) this.reattach(socket, user);

    const authed =
      (fn: (user: TokenPayload, ...args: any[]) => unknown) =>
      (...args: any[]) => {
        const ack: Ack = typeof args[args.length - 1] === 'function' ? args.pop() : noop;
        if (!user) return ack({ error: 'Tienes que iniciar sesión para jugar duelos' });
        Promise.resolve(fn(user, ...args, ack)).catch((err) => {
          console.error('error en duelo', err);
          ack({ error: 'Error interno' });
        });
      };

    socket.on('duel:ping', (ack: Ack = noop) => ack({ serverNow: Date.now() }));
    // la página del duelo lo pide al abrirse: puede que la conexión ya existiera
    // (se abrió en otra página) y se haya perdido el duel:match inicial
    socket.on(
      'duel:sync',
      authed((u, ack: Ack) => ack(this.sync(socket, u))),
    );
    socket.on(
      'duel:queue',
      authed((u, ack: Ack) => this.joinQueue(socket, u, ack)),
    );
    socket.on(
      'duel:cancel',
      authed((u, ack: Ack) => ack(this.removeWaiting(u.sub))),
    );
    socket.on(
      'duel:bot',
      authed((u, ack: Ack) => this.playBot(socket, u, ack)),
    );
    socket.on(
      'duel:room:create',
      authed((u, ack: Ack) => this.createRoom(socket, u, ack)),
    );
    socket.on(
      'duel:room:join',
      authed((u, code: unknown, ack: Ack) => this.joinRoom(socket, u, code, ack)),
    );
    socket.on(
      'duel:hit',
      authed((u, data: unknown, ack: Ack) => this.hit(u, data, ack)),
    );
    socket.on(
      'duel:rematch',
      authed((u, ack: Ack) => this.requestRematch(u, ack)),
    );
    socket.on(
      'duel:leave',
      authed((u, ack: Ack) => this.leave(u, ack)),
    );

    socket.on('disconnect', () => this.onDisconnect(socket, user));
  }

  private reattach(socket: Socket, user: TokenPayload) {
    const match = this.matchOf(user.sub);
    if (!match) return;
    const side = this.sideOf(match, user.sub)!;
    // si la partida ya acabó no tiene sentido devolverle a la pantalla de resultado
    // de algo que pasó cuando no estaba: lo saco y empieza limpio en el lobby
    if (match.engine.phase === 'finished') {
      this.leaveFinished(match, side);
      return;
    }
    const player = match.players[side];
    player.socketId = socket.id;
    clearTimeout(match.graceTimers[side]);
    delete match.graceTimers[side];

    socket.join(this.room(match));
    this.sendMatchInfo(match, side);
    socket.emit('duel:state', match.engine.snapshot(Date.now()));
    if (match.saved) socket.emit('duel:end', this.endPayload(match));
    this.emitOpponentStatus(match, side, 'back');
  }

  private sync(socket: Socket, user: TokenPayload) {
    if (this.matchOf(user.sub)) {
      this.reattach(socket, user);
      if (this.matchOf(user.sub)) return { status: 'match' };
    }
    const waiting = this.queue.find((w) => w.userId === user.sub);
    if (waiting) {
      waiting.socketId = socket.id;
      return { status: 'queue' };
    }
    for (const [code, w] of this.rooms) {
      if (w.userId === user.sub) {
        w.socketId = socket.id;
        return { status: 'room', code };
      }
    }
    return { status: 'idle' };
  }

  private onDisconnect(socket: Socket, user?: TokenPayload) {
    this.queue = this.queue.filter((w) => w.socketId !== socket.id);
    for (const [code, w] of this.rooms) if (w.socketId === socket.id) this.rooms.delete(code);
    if (!user) return;

    const match = this.matchOf(user.sub);
    if (!match) return;
    const side = this.sideOf(match, user.sub)!;
    // si tiene otra pestaña conectada a la partida, no pasa nada
    if (match.players[side].socketId !== socket.id) return;
    match.players[side].socketId = null;

    if (match.engine.phase === 'finished') return;
    this.emitOpponentStatus(match, side, 'away');
    match.graceTimers[side] = setTimeout(() => {
      match.engine.forfeit(side);
    }, this.opts.graceMs);
  }

  // ---------- emparejar ----------

  private async joinQueue(socket: Socket, user: TokenPayload, ack: Ack) {
    if (this.busy(user.sub)) return ack({ error: 'Ya estás en una partida' });
    this.removeWaiting(user.sub);

    const rival = this.queue.find((w) => w.userId !== user.sub);
    if (rival) {
      this.queue = this.queue.filter((w) => w !== rival);
      ack({ ok: true, matched: true });
      await this.createMatch(rival, this.waiting(socket, user));
      return;
    }

    this.queue.push(this.waiting(socket, user));
    socket.emit('duel:queued', { mode: 'queue' });
    ack({ ok: true, matched: false });
  }

  private async playBot(socket: Socket, user: TokenPayload, ack: Ack) {
    if (this.busy(user.sub)) return ack({ error: 'Ya estás en una partida' });
    this.removeWaiting(user.sub);
    ack({ ok: true });
    await this.createMatch(this.waiting(socket, user), null);
  }

  private createRoom(socket: Socket, user: TokenPayload, ack: Ack) {
    if (this.busy(user.sub)) return ack({ error: 'Ya estás en una partida' });
    this.removeWaiting(user.sub);

    let code: string;
    do {
      code = Array.from({ length: 5 }, () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]).join(
        '',
      );
    } while (this.rooms.has(code));

    this.rooms.set(code, this.waiting(socket, user));
    socket.emit('duel:queued', { mode: 'room', code });
    ack({ ok: true, code });
  }

  private async joinRoom(socket: Socket, user: TokenPayload, rawCode: unknown, ack: Ack) {
    const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
    const host = this.rooms.get(code);
    if (!host) return ack({ error: 'Esa sala no existe o ya ha empezado' });
    if (host.userId === user.sub) return ack({ error: 'No puedes jugar contra ti mismo' });
    if (this.busy(user.sub)) return ack({ error: 'Ya estás en una partida' });

    this.rooms.delete(code);
    this.removeWaiting(user.sub);
    ack({ ok: true });
    await this.createMatch(host, this.waiting(socket, user));
  }

  private waiting(socket: Socket, user: TokenPayload): Waiting {
    return { userId: user.sub, username: user.username, socketId: socket.id, since: Date.now() };
  }

  private removeWaiting(userId: number) {
    this.queue = this.queue.filter((w) => w.userId !== userId);
    for (const [code, w] of this.rooms) if (w.userId === userId) this.rooms.delete(code);
    return { ok: true };
  }

  // ---------- partidas ----------

  private async createMatch(a: Waiting, b: Waiting | null, ratings?: [number, number]) {
    const [ratingA, ratingB] = ratings ?? [await getRating(a.userId), b ? await getRating(b.userId) : 1000];

    const toPlayer = (w: Waiting, rating: number): Player => ({
      userId: w.userId,
      username: w.username,
      rating,
      socketId: w.socketId,
      isBot: false,
    });

    const match: Match = {
      id: randomUUID(),
      engine: new DuelEngine(Date.now(), Math.random, this.opts.countdownMs),
      players: {
        a: toPlayer(a, ratingA),
        b: b ? toPlayer(b, ratingB) : { userId: 0, username: BOT_NAME, rating: 1000, socketId: null, isBot: true },
      },
      bot: b ? null : new DuelBot('b', 0.6),
      startedAt: new Date(),
      sentVersion: -1,
      graceTimers: {},
      rematch: new Set(),
      finishing: false,
      saved: null,
    };

    this.matches.set(match.id, match);
    for (const side of ['a', 'b'] as Side[]) {
      const p = match.players[side];
      if (p.isBot) continue;
      this.byUser.set(p.userId, match.id);
      const socket = p.socketId ? this.io.sockets.sockets.get(p.socketId) : undefined;
      socket?.join(this.room(match));
      this.sendMatchInfo(match, side);
    }
    this.broadcastState(match);
    return match;
  }

  private sendMatchInfo(match: Match, side: Side) {
    const me = match.players[side];
    const other = match.players[side === 'a' ? 'b' : 'a'];
    if (!me.socketId) return;
    this.io.to(me.socketId).emit('duel:match', {
      matchId: match.id,
      you: side,
      rated: !other.isBot,
      me: { username: me.username, rating: me.rating },
      opponent: { username: other.username, rating: other.rating, isBot: other.isBot },
    });
  }

  private hit(user: TokenPayload, data: unknown, ack: Ack) {
    const match = this.matchOf(user.sub);
    const boltId = (data as { boltId?: unknown })?.boltId;
    if (!match || typeof boltId !== 'number') return ack({ ok: false, reason: 'NO_MATCH' });

    const result = match.engine.hit(this.sideOf(match, user.sub)!, boltId, Date.now());
    ack(result);
    // el estado nuevo sale en el siguiente tick; así 10 toques seguidos no son 10 mensajes
  }

  private async requestRematch(user: TokenPayload, ack: Ack) {
    const match = this.matchOf(user.sub);
    if (!match || match.engine.phase !== 'finished' || !match.saved) return ack({ error: 'No hay revancha posible' });
    const side = this.sideOf(match, user.sub)!;
    const otherSide: Side = side === 'a' ? 'b' : 'a';
    const other = match.players[otherSide];

    if (!other.isBot && !other.socketId) return ack({ error: 'Tu rival se ha ido' });

    match.rematch.add(side);
    ack({ ok: true });

    if (other.isBot || match.rematch.has(otherSide)) {
      this.closeMatch(match);
      const me = match.players.a;
      const them = match.players.b;
      const wa: Waiting = { userId: me.userId, username: me.username, socketId: me.socketId!, since: Date.now() };
      const wb: Waiting | null = them.isBot
        ? null
        : { userId: them.userId, username: them.username, socketId: them.socketId!, since: Date.now() };
      await this.createMatch(wa, wb, [me.rating, them.rating]);
    } else if (other.socketId) {
      this.io.to(other.socketId).emit('duel:rematch-request', { from: match.players[side].username });
    }
  }

  private leave(user: TokenPayload, ack: Ack) {
    this.removeWaiting(user.sub);
    const match = this.matchOf(user.sub);
    if (!match) return ack({ ok: true });

    const side = this.sideOf(match, user.sub)!;
    if (match.engine.phase !== 'finished') {
      // abandonar en plena partida es rendirse. Sigue en la sala para recibir el
      // resultado; si luego busca otra partida, busy() lo saca de esta.
      match.engine.forfeit(side);
    } else {
      this.leaveFinished(match, side);
    }
    ack({ ok: true });
  }

  // ---------- bucle ----------

  private tick() {
    const now = Date.now();
    for (const match of this.matches.values()) {
      if (match.bot) match.bot.act(match.engine, now);
      match.engine.tick(now);

      if (match.engine.version !== match.sentVersion) this.broadcastState(match);
      if (match.engine.phase === 'finished' && !match.finishing) {
        match.finishing = true;
        this.onFinished(match).catch((err) => console.error('no se pudo guardar el duelo', err));
      }
    }
  }

  private broadcastState(match: Match) {
    match.sentVersion = match.engine.version;
    this.io.to(this.room(match)).emit('duel:state', match.engine.snapshot(Date.now()));
  }

  private async onFinished(match: Match) {
    Object.values(match.graceTimers).forEach(clearTimeout);
    match.graceTimers = {};
    const result = match.engine.result!;

    match.saved = await saveDuel({
      playerA: match.players.a.userId,
      playerB: match.players.b.isBot ? null : match.players.b.userId,
      startedAt: match.startedAt,
      result,
    });

    match.players.a.rating = match.saved.ratings.a.after;
    if (match.saved.ratings.b) match.players.b.rating = match.saved.ratings.b.after;

    this.io.to(this.room(match)).emit('duel:end', this.endPayload(match));
    for (const side of ['a', 'b'] as Side[]) {
      const update = match.saved.updates[side];
      if (update) this.io.to(`user:${match.players[side].userId}`).emit('me:update', update);
    }

    if (match.saved.rated && result.winner !== 'draw') {
      const winner = match.players[result.winner];
      const loserSide: Side = result.winner === 'a' ? 'b' : 'a';
      this.io.emit('activity', {
        slug: 'duelo-llaves',
        username: winner.username,
        score: result.scores[result.winner],
        opponent: match.players[loserSide].username,
        opponentScore: result.scores[loserSide],
        personalBest: false,
        at: new Date().toISOString(),
      });
    }

    match.cleanupTimer = setTimeout(() => this.closeMatch(match), this.opts.rematchWindowMs);
  }

  private endPayload(match: Match) {
    const { rated, ratings } = match.saved!;
    const winnerBones = rated && match.engine.result!.winner !== 'draw' ? DUEL_WIN_BONES : 0;
    return { result: match.engine.result, rated, ratings, winnerBones };
  }

  private closeMatch(match: Match) {
    clearTimeout(match.cleanupTimer);
    this.matches.delete(match.id);
    for (const p of Object.values(match.players)) {
      if (!p.isBot && this.byUser.get(p.userId) === match.id) this.byUser.delete(p.userId);
    }
    this.io.in(this.room(match)).socketsLeave(this.room(match));
  }

  private emitOpponentStatus(match: Match, side: Side, status: 'away' | 'back') {
    const other = match.players[side === 'a' ? 'b' : 'a'];
    if (other.socketId) {
      this.io.to(other.socketId).emit('duel:opponent', { status, graceMs: this.opts.graceMs });
    }
  }

  // ---------- utilidades ----------

  private room(match: Match) {
    return `duel:${match.id}`;
  }

  /**
   * ¿Está en una partida sin terminar? Si la suya ya acabó (y estaba esperando
   * por si había revancha) lo saco de ella, así puede buscar otra directamente.
   */
  private busy(userId: number) {
    const match = this.matchOf(userId);
    if (!match) return false;
    if (match.engine.phase !== 'finished') return true;
    this.leaveFinished(match, this.sideOf(match, userId)!);
    return false;
  }

  private leaveFinished(match: Match, side: Side) {
    const me = match.players[side];
    const other = match.players[side === 'a' ? 'b' : 'a'];
    if (other.socketId) this.io.to(other.socketId).emit('duel:opponent', { status: 'left' });
    if (me.socketId) this.io.sockets.sockets.get(me.socketId)?.leave(this.room(match));
    me.socketId = null;
    this.byUser.delete(me.userId);
  }

  private matchOf(userId: number) {
    const id = this.byUser.get(userId);
    return id ? this.matches.get(id) : undefined;
  }

  private sideOf(match: Match, userId: number): Side | null {
    if (match.players.a.userId === userId) return 'a';
    if (!match.players.b.isBot && match.players.b.userId === userId) return 'b';
    return null;
  }

  /** solo para los tests: olvida todo el estado en memoria */
  reset() {
    this.stop();
    this.queue = [];
    this.rooms.clear();
    this.matches.clear();
    this.byUser.clear();
    this.loop = setInterval(() => this.tick(), this.opts.tickMs);
  }

  /** para el panel y los tests */
  stats() {
    return { queue: this.queue.length, rooms: this.rooms.size, matches: this.matches.size };
  }
}
