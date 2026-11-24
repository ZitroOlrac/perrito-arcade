import { Router } from 'express';
import { query } from '../db/pool.js';
import { notFound } from '../errors.js';
import { getUserRank } from '../services/leaderboard.js';
import { handler } from './handler.js';

export const usersRouter = Router();

usersRouter.get(
  '/:username',
  handler(async (req, res) => {
    const { rows: users } = await query<{
      id: number;
      username: string;
      created_at: Date;
      skin: string;
      palette: Record<string, string>;
    }>(
      `SELECT u.id, u.username, u.created_at, u.equipped_skin AS skin, s.palette
       FROM users u JOIN skins s ON s.slug = u.equipped_skin
       WHERE lower(u.username) = lower($1)`,
      [req.params.username],
    );
    const user = users[0];
    if (!user) throw notFound('Ese jugador no existe');

    const { rows: stats } = await query<{
      game_slug: string;
      name: string;
      plays: string;
      best: number;
      total_coins: string;
      total_time_ms: string;
    }>(
      `SELECT s.game_slug, g.name, COUNT(*) AS plays, MAX(s.score) AS best,
              SUM(s.coins) AS total_coins, SUM(s.duration_ms) AS total_time_ms
       FROM game_sessions s JOIN games g ON g.slug = s.game_slug
       WHERE s.user_id = $1 AND s.status = 'finished'
       GROUP BY s.game_slug, g.name`,
      [user.id],
    );

    const { rows: recent } = await query<{ game_slug: string; score: number; ended_at: Date }>(
      `SELECT game_slug, score, ended_at FROM game_sessions
       WHERE user_id = $1 AND status = 'finished'
       ORDER BY ended_at DESC LIMIT 10`,
      [user.id],
    );

    const games = await Promise.all(
      stats.map(async (s) => ({
        slug: s.game_slug,
        name: s.name,
        plays: Number(s.plays),
        best: s.best,
        totalCoins: Number(s.total_coins),
        totalTimeMs: Number(s.total_time_ms),
        rank: await getUserRank(s.game_slug, user.id),
      })),
    );

    const { rows: duelRows } = await query<{
      rating: number;
      wins: number;
      losses: number;
      draws: number;
      rank: string;
    }>(
      `SELECT r.rating, r.wins, r.losses, r.draws,
              (SELECT COUNT(*) + 1 FROM duel_ratings o
               WHERE o.rating > r.rating AND o.wins + o.losses + o.draws > 0) AS rank
       FROM duel_ratings r WHERE r.user_id = $1`,
      [user.id],
    );
    const duel = duelRows[0];

    const { rows: achievements } = await query<{
      slug: string;
      name: string;
      description: string;
      reward: number;
      unlocked_at: Date | null;
    }>(
      `SELECT a.slug, a.name, a.description, a.reward, ua.unlocked_at
       FROM achievements a
       LEFT JOIN user_achievements ua ON ua.achievement_slug = a.slug AND ua.user_id = $1
       ORDER BY a.sort_order`,
      [user.id],
    );

    res.json({
      username: user.username,
      skin: user.skin,
      palette: user.palette,
      achievements: achievements.map((a) => ({
        slug: a.slug,
        name: a.name,
        description: a.description,
        reward: a.reward,
        unlockedAt: a.unlocked_at?.toISOString() ?? null,
      })),
      duel:
        duel && duel.wins + duel.losses + duel.draws > 0
          ? { rating: duel.rating, wins: duel.wins, losses: duel.losses, draws: duel.draws, rank: Number(duel.rank) }
          : null,
      memberSince: user.created_at.toISOString(),
      games,
      recent: recent.map((r) => ({ slug: r.game_slug, score: r.score, playedAt: r.ended_at.toISOString() })),
    });
  }),
);
