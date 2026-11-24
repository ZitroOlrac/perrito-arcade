import { query } from '../db/pool.js';

export type Period = 'all' | 'week';

export interface LeaderboardEntry {
  rank: number;
  username: string;
  palette: Record<string, string>;
  score: number;
  achievedAt: string;
}

/**
 * Mejor puntuación de cada jugador (solo cuenta su mejor partida, si no
 * alguien que juega mucho llenaría el top él solo).
 */
export async function getLeaderboard(slug: string, period: Period = 'all', limit = 10) {
  const { rows } = await query<{ username: string; score: number; ended_at: Date; palette: Record<string, string> }>(
    `
    SELECT DISTINCT ON (s.user_id) u.username, s.score, s.ended_at, sk.palette
    FROM game_sessions s
    JOIN users u ON u.id = s.user_id
    JOIN skins sk ON sk.slug = u.equipped_skin
    WHERE s.game_slug = $1
      AND s.status = 'finished'
      AND ($2 = 'all' OR s.ended_at >= date_trunc('week', now()))
    ORDER BY s.user_id, s.score DESC, s.ended_at ASC
    `,
    [slug, period],
  );

  // DISTINCT ON obliga a ordenar por user_id primero, así que ordeno aquí.
  // Con pocos miles de jugadores es suficiente; si crece, pasar a una vista materializada.
  rows.sort((a, b) => b.score - a.score || a.ended_at.getTime() - b.ended_at.getTime());

  return rows.slice(0, limit).map<LeaderboardEntry>((r, i) => ({
    rank: i + 1,
    username: r.username,
    palette: r.palette,
    score: r.score,
    achievedAt: r.ended_at.toISOString(),
  }));
}

/** Posición del jugador en el ranking general según su mejor marca. */
export async function getUserRank(slug: string, userId: number) {
  const { rows } = await query<{ rank: string | null }>(
    `
    WITH best AS (
      SELECT user_id, MAX(score) AS score
      FROM game_sessions
      WHERE game_slug = $1 AND status = 'finished'
      GROUP BY user_id
    )
    SELECT (SELECT COUNT(*) + 1 FROM best b2 WHERE b2.score > b.score) AS rank
    FROM best b
    WHERE b.user_id = $2
    `,
    [slug, userId],
  );
  return rows[0]?.rank ? Number(rows[0].rank) : null;
}
