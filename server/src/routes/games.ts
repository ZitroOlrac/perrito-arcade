import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { badRequest, notFound } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { getLeaderboard } from '../services/leaderboard.js';
import { handler } from './handler.js';

export interface GameRow {
  slug: string;
  name: string;
  description: string;
  max_points_per_sec: string;
  max_coins_per_sec: string;
  active: boolean;
}

export async function findGame(slug: string) {
  const { rows } = await query<GameRow>('SELECT * FROM games WHERE slug = $1', [slug]);
  return rows[0] ?? null;
}

export const gamesRouter = Router();

gamesRouter.get(
  '/',
  handler(async (_req, res) => {
    // los juegos en solitario guardan sus partidas en game_sessions y el duelo en duels
    const { rows } = await query<GameRow & { mode: string; plays: string; players: string }>(`
      SELECT g.slug, g.name, g.description, g.mode,
        CASE g.mode
          WHEN 'duel' THEN (SELECT COUNT(*) FROM duels)
          ELSE (SELECT COUNT(*) FROM game_sessions s WHERE s.game_slug = g.slug AND s.status = 'finished')
        END AS plays,
        CASE g.mode
          WHEN 'duel' THEN (SELECT COUNT(*) FROM (SELECT player_a FROM duels UNION SELECT player_b FROM duels
                                                  WHERE player_b IS NOT NULL) p)
          ELSE (SELECT COUNT(DISTINCT s.user_id) FROM game_sessions s
                WHERE s.game_slug = g.slug AND s.status = 'finished')
        END AS players
      FROM games g
      WHERE g.active
      ORDER BY g.created_at, g.slug DESC`);

    res.json({
      games: rows.map((g) => ({
        slug: g.slug,
        name: g.name,
        description: g.description,
        mode: g.mode,
        plays: Number(g.plays),
        players: Number(g.players),
      })),
    });
  }),
);

gamesRouter.get(
  '/:slug/leaderboard',
  handler(async (req, res) => {
    const params = z
      .object({
        period: z.enum(['all', 'week']).default('all'),
        limit: z.coerce.number().int().min(1).max(50).default(10),
      })
      .parse(req.query);

    if (!(await findGame(req.params.slug))) throw notFound('Ese juego no existe');
    const entries = await getLeaderboard(req.params.slug, params.period, params.limit);
    res.json({ slug: req.params.slug, period: params.period, entries });
  }),
);

// abre una partida; el id que devuelve es el que hay que mandar al terminar
gamesRouter.post(
  '/:slug/sessions',
  requireAuth,
  handler(async (req, res) => {
    const game = await findGame(req.params.slug);
    if (!game) throw notFound('Ese juego no existe');
    if (!game.active) throw badRequest('Este juego está desactivado', 'GAME_INACTIVE');

    // si el jugador cierra la pestaña a mitad de partida, la sesión se queda abierta;
    // las cierro aquí para que no se acumulen
    await query(
      `UPDATE game_sessions SET status = 'rejected', reject_reason = 'ABANDONED', ended_at = now()
       WHERE user_id = $1 AND game_slug = $2 AND status = 'open'`,
      [req.user!.sub, game.slug],
    );

    const { rows } = await query<{ id: string; started_at: Date }>(
      `INSERT INTO game_sessions (user_id, game_slug) VALUES ($1, $2) RETURNING id, started_at`,
      [req.user!.sub, game.slug],
    );
    res.status(201).json({ sessionId: rows[0].id, startedAt: rows[0].started_at.toISOString() });
  }),
);
