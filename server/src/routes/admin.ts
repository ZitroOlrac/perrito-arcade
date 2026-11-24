import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { handler } from './handler.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get(
  '/stats',
  handler(async (_req, res) => {
    const { rows: totals } = await query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM users WHERE created_at >= now() - interval '7 days') AS new_users_week,
        (SELECT COUNT(*) FROM game_sessions WHERE status = 'finished') AS finished,
        (SELECT COUNT(*) FROM game_sessions WHERE status = 'rejected' AND reject_reason <> 'ABANDONED') AS rejected,
        (SELECT COUNT(*) FROM game_sessions WHERE reject_reason = 'ABANDONED') AS abandoned,
        (SELECT COUNT(*) FROM duels WHERE rated) AS duels,
        (SELECT COUNT(*) FROM duels WHERE NOT rated) AS bot_duels`);

    // partidas por día de las dos últimas semanas, rellenando los días sin partidas
    const { rows: perDay } = await query<{ day: Date; plays: string }>(`
      SELECT d.day, COUNT(s.id) AS plays
      FROM generate_series(current_date - 13, current_date, interval '1 day') AS d(day)
      LEFT JOIN game_sessions s
        ON s.status = 'finished' AND s.ended_at::date = d.day::date
      GROUP BY d.day
      ORDER BY d.day`);

    const { rows: reasons } = await query<{ reason: string; count: string }>(`
      SELECT reject_reason AS reason, COUNT(*) AS count
      FROM game_sessions
      WHERE status = 'rejected'
      GROUP BY reject_reason
      ORDER BY count DESC`);

    const t = totals[0];
    res.json({
      users: Number(t.users),
      newUsersWeek: Number(t.new_users_week),
      finished: Number(t.finished),
      rejected: Number(t.rejected),
      abandoned: Number(t.abandoned),
      duels: Number(t.duels),
      botDuels: Number(t.bot_duels),
      playsPerDay: perDay.map((r) => ({ day: r.day.toISOString().slice(0, 10), plays: Number(r.plays) })),
      rejectReasons: reasons.map((r) => ({ reason: r.reason, count: Number(r.count) })),
    });
  }),
);

adminRouter.get(
  '/suspicious',
  handler(async (_req, res) => {
    const { rows } = await query(`
      SELECT s.id, u.username, s.game_slug, s.distance, s.coins, s.duration_ms, s.reject_reason, s.ended_at
      FROM game_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.status = 'rejected' AND s.reject_reason <> 'ABANDONED'
      ORDER BY s.ended_at DESC
      LIMIT 50`);
    res.json({ sessions: rows });
  }),
);
