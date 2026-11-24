import { pool, query } from '../db/pool.js';
import { eloChange } from './elo.js';
import type { DuelResult } from './engine.js';
import { moveBones, getBalance } from '../economy/wallet.js';
import { checkAchievements } from '../economy/achievements.js';
import type { UserUpdate } from '../events.js';

/** huesos que se lleva quien gana un duelo contra otra persona */
export const DUEL_WIN_BONES = 20;

export const DEFAULT_RATING = 1000;

export async function getRating(userId: number) {
  const { rows } = await query<{ rating: number }>('SELECT rating FROM duel_ratings WHERE user_id = $1', [userId]);
  return rows[0]?.rating ?? DEFAULT_RATING;
}

export interface SaveDuelInput {
  playerA: number;
  playerB: number | null; // null = bot
  startedAt: Date;
  result: DuelResult;
}

export interface SavedDuel {
  id: string;
  rated: boolean;
  ratings: { a: RatingChange; b: RatingChange | null };
  /** monedero y logros nuevos de cada jugador (null para el bot) */
  updates: { a: UserUpdate; b: UserUpdate | null };
}

export interface RatingChange {
  before: number;
  after: number;
  delta: number;
}

/**
 * Guarda el duelo y, si es entre dos personas, actualiza el ELO de los dos
 * en la misma transacción. Las filas de rating se bloquean en orden de id
 * para que dos duelos que acaban a la vez no se crucen (deadlock).
 */
export async function saveDuel(input: SaveDuelInput): Promise<SavedDuel> {
  const { playerA, playerB, result } = input;
  const rated = playerB !== null && playerB !== playerA;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let ratings: SavedDuel['ratings'];

    if (rated) {
      const ids = [playerA, playerB!].sort((x, y) => x - y);
      await client.query(`INSERT INTO duel_ratings (user_id) VALUES ($1), ($2) ON CONFLICT (user_id) DO NOTHING`, ids);
      const { rows } = await client.query<{ user_id: number; rating: number }>(
        `SELECT user_id, rating FROM duel_ratings WHERE user_id = ANY($1) ORDER BY user_id FOR UPDATE`,
        [ids],
      );
      const before = Object.fromEntries(rows.map((r) => [r.user_id, r.rating]));
      const outcome = result.winner === 'a' ? 1 : result.winner === 'b' ? 0 : 0.5;
      const delta = eloChange(before[playerA], before[playerB!], outcome);

      const update = (userId: number, d: number, col: 'wins' | 'losses' | 'draws') =>
        client.query(
          `UPDATE duel_ratings SET rating = rating + $2, ${col} = ${col} + 1, updated_at = now() WHERE user_id = $1`,
          [userId, d],
        );
      const colA = result.winner === 'draw' ? 'draws' : result.winner === 'a' ? 'wins' : 'losses';
      const colB = result.winner === 'draw' ? 'draws' : result.winner === 'b' ? 'wins' : 'losses';
      await update(playerA, delta.a, colA);
      await update(playerB!, delta.b, colB);

      ratings = {
        a: { before: before[playerA], after: before[playerA] + delta.a, delta: delta.a },
        b: { before: before[playerB!], after: before[playerB!] + delta.b, delta: delta.b },
      };
    } else {
      // contra el bot no se juega ELO: son partidas de práctica
      const rating =
        (await client.query('SELECT rating FROM duel_ratings WHERE user_id = $1', [playerA])).rows[0]?.rating ??
        DEFAULT_RATING;
      ratings = { a: { before: rating, after: rating, delta: 0 }, b: null };
    }

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO duels (player_a, player_b, score_a, score_b, result, end_reason, rated,
                          rating_change_a, rating_change_b, started_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        playerA,
        playerB,
        result.scores.a,
        result.scores.b,
        result.winner,
        result.reason,
        rated,
        ratings.a.delta,
        ratings.b?.delta ?? 0,
        input.startedAt,
      ],
    );

    const duelId = rows[0].id;
    if (rated && result.winner !== 'draw') {
      const winnerId = result.winner === 'a' ? playerA : playerB!;
      await moveBones(client, winnerId, DUEL_WIN_BONES, 'duel', duelId);
    }

    const updateFor = async (userId: number): Promise<UserUpdate> => {
      const achievements = await checkAchievements(client, userId);
      return { achievements, bones: await getBalance(client, userId) };
    };
    const updates = {
      a: await updateFor(playerA),
      b: rated ? await updateFor(playerB!) : null,
    };

    await client.query('COMMIT');
    return { id: duelId, rated, ratings, updates };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
