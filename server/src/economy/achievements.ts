import type { PoolClient } from 'pg';
import { moveBones } from './wallet.js';

export interface UnlockedAchievement {
  slug: string;
  name: string;
  description: string;
  reward: number;
}

interface PlayerStats {
  runs: number;
  best_distance: number;
  total_coins: number;
  duel_wins: number;
  rating: number;
  purchases: number;
}

// Qué hace falta para cada logro. Los textos y recompensas están en la base de datos;
// aquí solo la condición, que es código.
const RULES: Record<string, (s: PlayerStats) => boolean> = {
  'primera-carrera': (s) => s.runs >= 1,
  quinientos: (s) => s.best_distance >= 500,
  maraton: (s) => s.best_distance >= 1500,
  coleccionista: (s) => s.total_coins >= 500,
  'primer-duelo': (s) => s.duel_wins >= 1,
  'cinco-duelos': (s) => s.duel_wins >= 5,
  'elo-1100': (s) => s.rating >= 1100,
  'primera-compra': (s) => s.purchases >= 1,
};

export const ACHIEVEMENT_SLUGS = Object.keys(RULES);

/**
 * Mira qué logros ha conseguido el jugador y no tenía todavía, los apunta y
 * paga la recompensa. Va dentro de la transacción de lo que lo ha provocado
 * (terminar partida, ganar duelo, comprar), así que si eso falla, esto tampoco cuenta.
 *
 * Recalcula a partir de los datos en vez de llevar contadores aparte: es un poco
 * más de trabajo para la base de datos, pero no se puede desincronizar.
 */
export async function checkAchievements(client: PoolClient, userId: number): Promise<UnlockedAchievement[]> {
  const { rows } = await client.query<PlayerStats>(
    `SELECT
       (SELECT COUNT(*) FROM game_sessions WHERE user_id = $1 AND status = 'finished')::int AS runs,
       (SELECT COALESCE(MAX(distance), 0) FROM game_sessions WHERE user_id = $1 AND status = 'finished')::int AS best_distance,
       (SELECT COALESCE(SUM(coins), 0) FROM game_sessions WHERE user_id = $1 AND status = 'finished')::int AS total_coins,
       (SELECT COALESCE(wins, 0) FROM duel_ratings WHERE user_id = $1)::int AS duel_wins,
       (SELECT COALESCE(rating, 1000) FROM duel_ratings WHERE user_id = $1)::int AS rating,
       (SELECT COUNT(*) FROM bone_transactions WHERE user_id = $1 AND reason = 'purchase')::int AS purchases`,
    [userId],
  );
  // las subconsultas de duel_ratings dan NULL si nunca ha jugado un duelo
  const stats: PlayerStats = {
    ...rows[0],
    duel_wins: rows[0].duel_wins ?? 0,
    rating: rows[0].rating ?? 1000,
  };

  const earned = ACHIEVEMENT_SLUGS.filter((slug) => RULES[slug](stats));
  if (earned.length === 0) return [];

  const { rows: fresh } = await client.query<UnlockedAchievement>(
    `WITH ins AS (
       INSERT INTO user_achievements (user_id, achievement_slug)
       SELECT $1, unnest($2::text[])
       ON CONFLICT DO NOTHING
       RETURNING achievement_slug
     )
     SELECT a.slug, a.name, a.description, a.reward
     FROM ins JOIN achievements a ON a.slug = ins.achievement_slug
     ORDER BY a.sort_order`,
    [userId, earned],
  );

  for (const a of fresh) {
    if (a.reward > 0) await moveBones(client, userId, a.reward, 'achievement', a.slug);
  }
  return fresh;
}
