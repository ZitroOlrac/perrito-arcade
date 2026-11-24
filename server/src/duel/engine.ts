/**
 * Lógica del Duelo de Llaves. No sabe nada de sockets ni de la base de datos:
 * recibe la hora y las acciones de los jugadores y devuelve lo que ha pasado.
 * Así se puede testear con un reloj falso y es el servidor quien manda
 * (el cliente solo dice "he pinchado en el tornillo 12").
 *
 * Reglas:
 *  - Van saliendo tornillos en el tablero y cada uno dura unos segundos.
 *  - Normal: un toque, 1 punto. Oxidado: 3 toques, 2 puntos (cada jugador
 *    lleva su propia cuenta; se lo queda el primero que llega a 3).
 *    Dorado: un toque, 3 puntos, pero dura muy poco.
 *  - Gana el primero que llega a 15, o el que más tenga cuando acaba el tiempo.
 */

export type Side = 'a' | 'b';
export type BoltKind = 'normal' | 'rusty' | 'gold';
export type Phase = 'countdown' | 'playing' | 'finished';
export type EndReason = 'score' | 'time' | 'forfeit';

export const RULES = {
  countdownMs: 3000,
  durationMs: 45_000,
  targetScore: 15,
  maxBolts: 5,
  spawnEveryMs: { min: 450, max: 900 },
  kinds: {
    normal: { points: 1, turns: 1, lifeMs: 4000, chance: 0.66 },
    rusty: { points: 2, turns: 3, lifeMs: 5000, chance: 0.24 },
    gold: { points: 3, turns: 1, lifeMs: 1500, chance: 0.1 },
  },
  // nadie reacciona en menos de esto; un toque más rápido es un script
  minReactionMs: 100,
  maxHitsPerSecond: 14,
  // El tablero va de 0 a 1 en cada eje pero es el doble de ancho que de alto,
  // así que las distancias se miden en "altos de tablero" (ver boltDistance).
  boardAspect: 2,
  minDistance: 0.26,
} as const;

/** Distancia real entre dos puntos del tablero, corrigiendo que es más ancho que alto. */
export function boltDistance(p: { x: number; y: number }, q: { x: number; y: number }) {
  return Math.hypot((p.x - q.x) * RULES.boardAspect, p.y - q.y);
}

export interface Bolt {
  id: number;
  kind: BoltKind;
  x: number;
  y: number;
  spawnedAt: number;
  expiresAt: number;
  needed: number;
  turns: Record<Side, number>;
}

export type DuelEvent =
  { type: 'claim'; boltId: number; by: Side; points: number } | { type: 'expire'; boltId: number };

export type HitResult =
  | { ok: true; claimed: boolean; turns: number; points: number }
  | { ok: false; reason: 'NOT_PLAYING' | 'NO_BOLT' | 'TOO_FAST' | 'RATE_LIMIT' };

export interface DuelSnapshot {
  phase: Phase;
  startsAt: number;
  endsAt: number;
  serverNow: number;
  scores: Record<Side, number>;
  target: number;
  bolts: Omit<Bolt, 'spawnedAt'>[];
  events: DuelEvent[];
  result: DuelResult | null;
}

export interface DuelResult {
  winner: Side | 'draw';
  reason: EndReason;
  scores: Record<Side, number>;
}

export class DuelEngine {
  phase: Phase = 'countdown';
  readonly startsAt: number;
  readonly endsAt: number;
  scores: Record<Side, number> = { a: 0, b: 0 };
  bolts = new Map<number, Bolt>();
  result: DuelResult | null = null;
  /** sube cada vez que cambia algo; el servidor solo reenvía el estado si ha cambiado */
  version = 0;

  private nextId = 1;
  private nextSpawnAt: number;
  private pendingEvents: DuelEvent[] = [];
  private recentHits: Record<Side, number[]> = { a: [], b: [] };

  private random: () => number;

  constructor(now: number, random: () => number = Math.random, countdownMs: number = RULES.countdownMs) {
    this.random = random;
    this.startsAt = now + countdownMs;
    this.endsAt = this.startsAt + RULES.durationMs;
    this.nextSpawnAt = this.startsAt;
  }

  /** Avanza el estado hasta `now`. Devuelve true si algo ha cambiado. */
  tick(now: number): boolean {
    if (this.phase === 'finished') return false;
    let changed = false;

    if (this.phase === 'countdown') {
      if (now < this.startsAt) return false;
      this.phase = 'playing';
      changed = true;
    }

    if (now >= this.endsAt) {
      this.finish(this.leader(), 'time');
      return true;
    }

    for (const bolt of this.bolts.values()) {
      if (now >= bolt.expiresAt) {
        this.bolts.delete(bolt.id);
        this.pendingEvents.push({ type: 'expire', boltId: bolt.id });
        changed = true;
      }
    }

    // si se ha retrasado el tick (servidor ocupado) puede tocar sacar más de uno
    while (now >= this.nextSpawnAt) {
      if (this.bolts.size < RULES.maxBolts && this.spawn(this.nextSpawnAt)) changed = true;
      const { min, max } = RULES.spawnEveryMs;
      this.nextSpawnAt += min + this.random() * (max - min);
    }

    if (changed) this.version++;
    return changed;
  }

  hit(side: Side, boltId: number, now: number): HitResult {
    if (this.phase !== 'playing' || now >= this.endsAt) return { ok: false, reason: 'NOT_PLAYING' };

    const recent = this.recentHits[side].filter((t) => now - t < 1000);
    if (recent.length >= RULES.maxHitsPerSecond) return { ok: false, reason: 'RATE_LIMIT' };
    recent.push(now);
    this.recentHits[side] = recent;

    const bolt = this.bolts.get(boltId);
    if (!bolt || now >= bolt.expiresAt) return { ok: false, reason: 'NO_BOLT' };
    if (now - bolt.spawnedAt < RULES.minReactionMs) return { ok: false, reason: 'TOO_FAST' };

    bolt.turns[side]++;
    this.version++;
    if (bolt.turns[side] < bolt.needed) {
      return { ok: true, claimed: false, turns: bolt.turns[side], points: 0 };
    }

    const points = RULES.kinds[bolt.kind].points;
    this.bolts.delete(bolt.id);
    this.scores[side] += points;
    this.pendingEvents.push({ type: 'claim', boltId: bolt.id, by: side, points });

    if (this.scores[side] >= RULES.targetScore) this.finish(side, 'score');
    return { ok: true, claimed: true, turns: bolt.turns[side], points };
  }

  forfeit(loser: Side) {
    if (this.phase === 'finished') return;
    this.finish(loser === 'a' ? 'b' : 'a', 'forfeit');
  }

  /** Estado para mandar a los clientes. Vacía la lista de eventos pendientes. */
  snapshot(now: number): DuelSnapshot {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return {
      phase: this.phase,
      startsAt: this.startsAt,
      endsAt: this.endsAt,
      serverNow: now,
      scores: { ...this.scores },
      target: RULES.targetScore,
      bolts: [...this.bolts.values()].map(({ spawnedAt: _s, ...b }) => ({ ...b, turns: { ...b.turns } })),
      events,
      result: this.result,
    };
  }

  private leader(): Side | 'draw' {
    if (this.scores.a === this.scores.b) return 'draw';
    return this.scores.a > this.scores.b ? 'a' : 'b';
  }

  private finish(winner: Side | 'draw', reason: EndReason) {
    this.phase = 'finished';
    this.version++;
    this.bolts.clear();
    this.result = { winner, reason, scores: { ...this.scores } };
  }

  private pickKind(): BoltKind {
    const r = this.random();
    const { normal, rusty } = RULES.kinds;
    if (r < normal.chance) return 'normal';
    if (r < normal.chance + rusty.chance) return 'rusty';
    return 'gold';
  }

  private spawn(at: number): boolean {
    // busco un hueco libre; si el tablero está muy lleno, este turno no sale nada
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = 0.08 + this.random() * 0.84;
      const y = 0.12 + this.random() * 0.76;
      const free = [...this.bolts.values()].every((b) => boltDistance(b, { x, y }) >= RULES.minDistance);
      if (!free) continue;

      const kind = this.pickKind();
      const cfg = RULES.kinds[kind];
      const bolt: Bolt = {
        id: this.nextId++,
        kind,
        x: Math.round(x * 1000) / 1000,
        y: Math.round(y * 1000) / 1000,
        spawnedAt: at,
        expiresAt: Math.min(at + cfg.lifeMs, this.endsAt),
        needed: cfg.turns,
        turns: { a: 0, b: 0 },
      };
      this.bolts.set(bolt.id, bolt);
      return true;
    }
    return false;
  }
}
