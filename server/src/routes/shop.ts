import { Router } from 'express';
import { pool, query } from '../db/pool.js';
import { badRequest, notFound } from '../errors.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { getBalance, moveBones } from '../economy/wallet.js';
import { checkAchievements } from '../economy/achievements.js';
import type { GameEvents } from '../events.js';
import { handler } from './handler.js';

interface SkinRow {
  slug: string;
  name: string;
  price: number;
  palette: Record<string, string>;
  owned: boolean;
}

async function listSkins(userId: number | null) {
  const { rows } = await query<SkinRow>(
    `SELECT s.slug, s.name, s.price, s.palette,
            (s.price = 0 OR us.user_id IS NOT NULL) AS owned
     FROM skins s
     LEFT JOIN user_skins us ON us.skin_slug = s.slug AND us.user_id = $1
     ORDER BY s.sort_order`,
    [userId],
  );
  return rows;
}

export function shopRouter(events: GameEvents) {
  const router = Router();

  router.get(
    '/',
    optionalAuth,
    handler(async (req, res) => {
      const userId = req.user?.sub ?? null;
      const skins = await listSkins(userId);
      let me = null;
      if (userId) {
        const { rows } = await query<{ bones: number; equipped_skin: string }>(
          'SELECT bones, equipped_skin FROM users WHERE id = $1',
          [userId],
        );
        if (rows[0]) me = { bones: rows[0].bones, equipped: rows[0].equipped_skin };
      }
      res.json({ skins, me });
    }),
  );

  router.post(
    '/:slug/buy',
    requireAuth,
    handler(async (req, res) => {
      const userId = req.user!.sub;
      const client = await pool.connect();
      let outcome;
      try {
        await client.query('BEGIN');
        const { rows } = await client.query<{ slug: string; price: number }>(
          'SELECT slug, price FROM skins WHERE slug = $1',
          [req.params.slug],
        );
        const skin = rows[0];
        if (!skin) throw notFound('Esa skin no existe');
        if (skin.price === 0) throw badRequest('Esta skin es gratis, ya la tienes', 'ALREADY_OWNED');

        const owned = await client.query(
          `INSERT INTO user_skins (user_id, skin_slug) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING skin_slug`,
          [userId, skin.slug],
        );
        if (owned.rowCount === 0) throw badRequest('Ya tienes esta skin', 'ALREADY_OWNED');

        // si no llega el saldo, moveBones lanza un 409 y el ROLLBACK deshace también la skin
        await moveBones(client, userId, -skin.price, 'purchase', skin.slug);
        // la compra la equipa directamente, que es lo que quiere todo el mundo
        await client.query('UPDATE users SET equipped_skin = $2 WHERE id = $1', [userId, skin.slug]);
        const achievements = await checkAchievements(client, userId);
        const bones = await getBalance(client, userId);
        await client.query('COMMIT');
        outcome = { bones, achievements, equipped: skin.slug };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      events.userUpdate(userId, { bones: outcome.bones, achievements: outcome.achievements });
      res.json(outcome);
    }),
  );

  router.post(
    '/:slug/equip',
    requireAuth,
    handler(async (req, res) => {
      const { rows } = await query(
        `UPDATE users u SET equipped_skin = s.slug
         FROM skins s
         LEFT JOIN user_skins us ON us.skin_slug = s.slug AND us.user_id = $1
         WHERE u.id = $1 AND s.slug = $2 AND (s.price = 0 OR us.user_id IS NOT NULL)
         RETURNING s.slug, s.palette`,
        [req.user!.sub, req.params.slug],
      );
      if (!rows[0]) throw notFound('No tienes esa skin');
      res.json({ equipped: rows[0].slug, palette: rows[0].palette });
    }),
  );

  return router;
}

export const meRouter = Router();

meRouter.get(
  '/wallet',
  requireAuth,
  handler(async (req, res) => {
    const userId = req.user!.sub;
    const [{ rows: u }, { rows: tx }] = await Promise.all([
      query<{ bones: number }>('SELECT bones FROM users WHERE id = $1', [userId]),
      query<{ amount: number; reason: string; ref: string | null; created_at: Date }>(
        `SELECT amount, reason, ref, created_at FROM bone_transactions
         WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 20`,
        [userId],
      ),
    ]);
    res.json({
      bones: u[0]?.bones ?? 0,
      transactions: tx.map((t) => ({ amount: t.amount, reason: t.reason, ref: t.ref, at: t.created_at.toISOString() })),
    });
  }),
);
