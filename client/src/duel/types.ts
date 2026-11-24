// Copia de los tipos de server/src/duel/engine.ts que viajan por el socket.
// Si cambian allí, hay que cambiarlos aquí (con un monorepo con paquete compartido no haría falta).

export type Side = 'a' | 'b';
export type BoltKind = 'normal' | 'rusty' | 'gold';

export interface Bolt {
  id: number;
  kind: BoltKind;
  x: number;
  y: number;
  expiresAt: number;
  needed: number;
  turns: Record<Side, number>;
}

export type DuelEvent =
  { type: 'claim'; boltId: number; by: Side; points: number } | { type: 'expire'; boltId: number };

export interface DuelResult {
  winner: Side | 'draw';
  reason: 'score' | 'time' | 'forfeit';
  scores: Record<Side, number>;
}

export interface DuelSnapshot {
  phase: 'countdown' | 'playing' | 'finished';
  startsAt: number;
  endsAt: number;
  serverNow: number;
  scores: Record<Side, number>;
  target: number;
  bolts: Bolt[];
  events: DuelEvent[];
  result: DuelResult | null;
}

export interface MatchInfo {
  matchId: string;
  you: Side;
  rated: boolean;
  me: { username: string; rating: number };
  opponent: { username: string; rating: number; isBot: boolean };
}

export interface RatingChange {
  before: number;
  after: number;
  delta: number;
}

export interface EndPayload {
  result: DuelResult;
  rated: boolean;
  /** huesos que se lleva el ganador (0 en empates y contra el bot) */
  winnerBones: number;
  ratings: { a: RatingChange; b: RatingChange | null };
}

export type HitResult =
  | { ok: true; claimed: boolean; turns: number; points: number }
  | { ok: false; reason: 'NOT_PLAYING' | 'NO_BOLT' | 'TOO_FAST' | 'RATE_LIMIT' | 'NO_MATCH' };

export const other = (side: Side): Side => (side === 'a' ? 'b' : 'a');
