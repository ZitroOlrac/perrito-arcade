import type { PoolClient } from 'pg';
import { conflict } from '../errors.js';

export type BoneReason = 'run' | 'duel' | 'achievement' | 'purchase';

/**
 * Mueve huesos dentro de una transacción que ya está abierta: apunta el
 * movimiento en el libro y actualiza el saldo. Siempre hay que llamarlo con el
 * mismo `client` de la transacción, para que si algo falla después no quede
 * el saldo cambiado sin su partida (o al revés).
 *
 * Es idempotente: el mismo (usuario, motivo, ref) solo cuenta una vez gracias
 * al índice único. Devuelve el saldo nuevo, o null si ya se había apuntado.
 */
export async function moveBones(
  client: PoolClient,
  userId: number,
  amount: number,
  reason: BoneReason,
  ref: string,
): Promise<number | null> {
  if (amount === 0) return null;

  const inserted = await client.query(
    `INSERT INTO bone_transactions (user_id, amount, reason, ref)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, reason, ref) WHERE reason IN ('run', 'duel', 'achievement', 'purchase') DO NOTHING
     RETURNING id`,
    [userId, amount, reason, ref],
  );
  if (inserted.rowCount === 0) return null;

  try {
    const { rows } = await client.query<{ bones: number }>(
      'UPDATE users SET bones = bones + $2 WHERE id = $1 RETURNING bones',
      [userId, amount],
    );
    return rows[0].bones;
  } catch (err: any) {
    // el CHECK (bones >= 0) de la tabla salta si no llega el dinero
    if (err.code === '23514') throw conflict('No tienes huesos suficientes', 'NOT_ENOUGH_BONES');
    throw err;
  }
}

export async function getBalance(client: PoolClient, userId: number) {
  const { rows } = await client.query<{ bones: number }>('SELECT bones FROM users WHERE id = $1', [userId]);
  return rows[0]?.bones ?? 0;
}
