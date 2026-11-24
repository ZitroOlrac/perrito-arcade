import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { conflict, forbidden, notFound } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validateRun } from '../services/scoreValidation.js';
import { getLeaderboard, getUserRank } from '../services/leaderboard.js';
import { config } from '../config.js';
import type { GameEvents } from '../events.js';
import { handler } from './handler.js';
import { moveBones, getBalance } from '../economy/wallet.js';
import { checkAchievements, type UnlockedAchievement } from '../economy/achievements.js';

const finishBody = z.object({
  distance: z.number().int().min(0).max(10_000_000),
  coins: z.number().int().min(0).max(100_000),
  durationMs: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60 * 1000),
});

export function sessionsRouter(events: GameEvents) {
  const router = Router();

  router.post(
    '/:id/finish',
    requireAuth,
    handler(async (req, res) => {
      const idCheck = z.string().uuid().safeParse(req.params.id);
      if (!idCheck.success) throw notFound('Partida no encontrada');
      const report = finishBody.parse(req.body);

      const client = await pool.connect();
      let result;
      try {
        await client.query('BEGIN');

        // FOR UPDATE: si llegan dos "finish" a la vez para la misma partida, solo pasa uno
        const { rows } = await client.query(
          `SELECT s.*, g.max_points_per_sec, g.max_coins_per_sec,
                  EXTRACT(EPOCH FROM (now() - s.started_at)) * 1000 AS elapsed_ms
           FROM game_sessions s JOIN games g ON g.slug = s.game_slug
           WHERE s.id = $1
           FOR UPDATE OF s`,
          [idCheck.data],
        );
        const session = rows[0];
        if (!session) throw notFound('Partida no encontrada');
        if (session.user_id !== req.user!.sub) throw forbidden('Esta partida no es tuya');
        if (session.status !== 'open') throw conflict('Esta partida ya se cerró', 'SESSION_CLOSED');

        const { rows: prev } = await client.query<{ best: number | null }>(
          `SELECT MAX(score) AS best FROM game_sessions
           WHERE user_id = $1 AND game_slug = $2 AND status = 'finished'`,
          [session.user_id, session.game_slug],
        );
        const previousBest = prev[0].best;

        const validation = validateRun(
          report,
          Number(session.elapsed_ms),
          {
            maxPointsPerSec: Number(session.max_points_per_sec),
            maxCoinsPerSec: Number(session.max_coins_per_sec),
          },
          config.maxSessionMinutes * 60 * 1000,
        );

        await client.query(
          `UPDATE game_sessions
           SET status = $2, score = $3, distance = $4, coins = $5, duration_ms = $6,
               reject_reason = $7, ended_at = now()
           WHERE id = $1`,
          [
            session.id,
            validation.ok ? 'finished' : 'rejected',
            validation.ok ? validation.score : null,
            report.distance,
            report.coins,
            report.durationMs,
            validation.ok ? null : validation.reason,
          ],
        );

        // los huesos recogidos pasan al monedero, y se miran los logros, todo en la misma transacción
        let achievements: UnlockedAchievement[] = [];
        let bones: number | null = null;
        if (validation.ok) {
          await moveBones(client, session.user_id, report.coins, 'run', session.id);
          achievements = await checkAchievements(client, session.user_id);
          bones = await getBalance(client, session.user_id);
        }
        await client.query('COMMIT');

        result = { session, validation, previousBest, achievements, bones };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      const { session, validation, previousBest, achievements, bones } = result;

      if (!validation.ok) {
        // devuelvo 200 con el motivo: la partida se ha procesado, pero no cuenta
        return res.json({ status: 'rejected', reason: validation.reason });
      }

      const personalBest = previousBest === null || validation.score > previousBest;
      events.userUpdate(session.user_id, { bones: bones!, achievements });
      const rank = await getUserRank(session.game_slug, session.user_id);

      events.runFinished({
        slug: session.game_slug,
        username: req.user!.username,
        score: validation.score,
        personalBest,
      });

      // solo aviso a los que miran el ranking si de verdad ha cambiado el top
      if (personalBest && rank !== null && rank <= 10) {
        events.leaderboardChanged(session.game_slug, await getLeaderboard(session.game_slug));
      }

      res.json({
        status: 'finished',
        score: validation.score,
        personalBest,
        previousBest,
        rank,
        bonesEarned: report.coins,
        bones,
        achievements,
      });
    }),
  );

  return router;
}
