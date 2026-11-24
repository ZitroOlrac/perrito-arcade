import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { api, createPlayer, emitted, playRun, resetData } from './helpers.js';
import { pool } from '../src/db/pool.js';

beforeEach(resetData);
afterAll(() => pool.end());

async function giveBones(username: string, amount: number) {
  await pool.query('UPDATE users SET bones = $2 WHERE username = $1', [username, amount]);
}

describe('monedero', () => {
  it('los huesos de una partida válida van al monedero', async () => {
    const { auth } = await createPlayer('toby');
    const res = await playRun(auth, { distance: 300, coins: 12, durationMs: 20_000 });
    expect(res.body.bonesEarned).toBe(12);

    const wallet = await api().get('/api/me/wallet').set('Authorization', auth);
    // 12 de la partida + 10 del logro "Primeros pasos"
    expect(wallet.body.bones).toBe(22);
    expect(wallet.body.transactions.map((t: any) => [t.reason, t.amount])).toEqual([
      ['achievement', 10],
      ['run', 12],
    ]);
  });

  it('una partida rechazada no paga nada', async () => {
    const { auth } = await createPlayer('tramposo');
    await playRun(auth, { distance: 999_999, coins: 99, durationMs: 5_000 });
    const wallet = await api().get('/api/me/wallet').set('Authorization', auth);
    expect(wallet.body).toEqual({ bones: 0, transactions: [] });
  });

  it('el saldo coincide siempre con la suma del libro de movimientos', async () => {
    const { auth } = await createPlayer('toby');
    for (const coins of [5, 8, 13]) await playRun(auth, { distance: 100, coins, durationMs: 10_000 });
    const { rows } = await pool.query(
      `SELECT u.bones, (SELECT SUM(amount) FROM bone_transactions t WHERE t.user_id = u.id)::int AS ledger
       FROM users u WHERE username = 'toby'`,
    );
    expect(rows[0].bones).toBe(rows[0].ledger);
  });
});

describe('logros', () => {
  it('se desbloquean una sola vez y se avisa al jugador', async () => {
    const { auth, user } = await createPlayer('toby');
    const first = await playRun(auth, { distance: 600, coins: 0, durationMs: 30_000 });
    expect(first.body.achievements.map((a: any) => a.slug)).toEqual(['primera-carrera', 'quinientos']);

    const update = emitted.find((e) => e.type === 'user')!.payload as any;
    expect(update).toMatchObject({ userId: user.id, bones: 40 });

    const second = await playRun(auth, { distance: 650, coins: 0, durationMs: 30_000 });
    expect(second.body.achievements).toEqual([]);
  });

  it('salen en el perfil con la fecha en que se consiguieron', async () => {
    const { auth } = await createPlayer('nala');
    await playRun(auth, { distance: 50, coins: 0, durationMs: 5_000 });
    const res = await api().get('/api/users/nala');
    const unlocked = res.body.achievements.filter((a: any) => a.unlockedAt).map((a: any) => a.slug);
    expect(unlocked).toEqual(['primera-carrera']);
    expect(res.body.achievements.length).toBeGreaterThan(5);
  });
});

describe('tienda', () => {
  it('sin sesión se puede ver pero no comprar', async () => {
    const list = await api().get('/api/shop');
    expect(list.body.me).toBeNull();
    expect(list.body.skins[0]).toMatchObject({ slug: 'clasico', price: 0, owned: true });
    expect((await api().post('/api/shop/carbon/buy')).status).toBe(401);
  });

  it('comprar descuenta, equipa la skin y da el logro', async () => {
    const { auth } = await createPlayer('toby');
    await giveBones('toby', 200);

    const res = await api().post('/api/shop/carbon/buy').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ bones: 50, equipped: 'carbon' });
    expect(res.body.achievements.map((a: any) => a.slug)).toEqual(['primera-compra']);

    const me = await api().get('/api/auth/me').set('Authorization', auth);
    expect(me.body.user).toMatchObject({ skin: 'carbon', bones: 50 });
    expect(me.body.user.palette.B).toBe('#3a3532');
  });

  it('sin saldo suficiente no compra nada (ni la skin ni el cobro)', async () => {
    const { auth } = await createPlayer('pobre');
    await giveBones('pobre', 100);

    const res = await api().post('/api/shop/carbon/buy').set('Authorization', auth);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_ENOUGH_BONES');

    const shop = await api().get('/api/shop').set('Authorization', auth);
    expect(shop.body.me).toEqual({ bones: 100, equipped: 'clasico' });
    expect(shop.body.skins.find((s: any) => s.slug === 'carbon').owned).toBe(false);
  });

  it('no se puede comprar dos veces ni con dos peticiones a la vez', async () => {
    const { auth } = await createPlayer('toby');
    await giveBones('toby', 1000);

    const results = await Promise.all([
      api().post('/api/shop/nieve/buy').set('Authorization', auth),
      api().post('/api/shop/nieve/buy').set('Authorization', auth),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);

    const { rows } = await pool.query(`SELECT bones FROM users WHERE username = 'toby'`);
    expect(rows[0].bones).toBe(850);
  });

  it('solo se puede equipar lo que tienes', async () => {
    const { auth } = await createPlayer('toby');
    expect((await api().post('/api/shop/oro/equip').set('Authorization', auth)).status).toBe(404);
    expect((await api().post('/api/shop/clasico/equip').set('Authorization', auth)).body.equipped).toBe('clasico');
  });

  it('la skin equipada sale en el ranking', async () => {
    const { auth } = await createPlayer('toby');
    await giveBones('toby', 500);
    await api().post('/api/shop/grasa/buy').set('Authorization', auth);
    await playRun(auth, { distance: 100, coins: 0, durationMs: 10_000 });

    const board = await api().get('/api/games/perrito-run/leaderboard');
    expect(board.body.entries[0].palette.W).toBe('#3d7dd8');
  });
});
