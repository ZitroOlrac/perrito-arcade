import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { handler } from './handler.js';

export const duelsRouter = Router();

// ranking por ELO; solo sale quien ha jugado al menos una partida contra una persona
duelsRouter.get(
  '/leaderboard',
  handler(async (req, res) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }).parse(req.query);
    const { rows } = await query<{
      username: string;
      rating: number;
      wins: number;
      losses: number;
      draws: number;
      palette: Record<string, string>;
    }>(
      `SELECT u.username, r.rating, r.wins, r.losses, r.draws, s.palette
       FROM duel_ratings r JOIN users u ON u.id = r.user_id JOIN skins s ON s.slug = u.equipped_skin
       WHERE r.wins + r.losses + r.draws > 0
       ORDER BY r.rating DESC, r.wins DESC, u.username
       LIMIT $1`,
      [limit],
    );
    res.json({ entries: rows.map((r, i) => ({ rank: i + 1, ...r })) });
  }),
);

duelsRouter.get(
  '/recent',
  handler(async (_req, res) => {
    const { rows } = await query<{
      id: string;
      a: string;
      b: string | null;
      score_a: number;
      score_b: number;
      result: string;
      end_reason: string;
      rating_change_a: number;
      ended_at: Date;
    }>(
      `SELECT d.id, ua.username AS a, ub.username AS b, d.score_a, d.score_b, d.result,
              d.end_reason, d.rating_change_a, d.ended_at
       FROM duels d
       JOIN users ua ON ua.id = d.player_a
       LEFT JOIN users ub ON ub.id = d.player_b
       WHERE d.rated
       ORDER BY d.ended_at DESC
       LIMIT 10`,
    );
    res.json({
      duels: rows.map((d) => ({
        id: d.id,
        a: d.a,
        b: d.b,
        scores: { a: d.score_a, b: d.score_b },
        result: d.result,
        reason: d.end_reason,
        ratingChange: Math.abs(d.rating_change_a),
        endedAt: d.ended_at.toISOString(),
      })),
    });
  }),
);
