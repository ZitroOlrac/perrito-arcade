import { expect, test } from '@playwright/test';
import { register, uniqueName } from './helpers';

test('duelo entre dos jugadores con sala privada', async ({ browser }) => {
  // dos contextos = dos navegadores distintos, cada uno con su sesión
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  const hostName = uniqueName('anfi');
  const guestName = uniqueName('invi');

  await register(host, hostName, 'secreto123', '/duelo');
  await register(guest, guestName, 'secreto123', '/duelo');

  await host.getByRole('button', { name: 'Crear sala para un amigo' }).click();
  const code = (await host.locator('.room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z2-9]{5}$/);

  // el invitado entra con el enlace
  await guest.goto(`/duelo?sala=${code}`);

  for (const [page, rival] of [
    [host, guestName],
    [guest, hostName],
  ] as const) {
    await expect(page.locator('.duel-hud')).toContainText(rival);
    await expect(page.locator('.duel-frame canvas')).toBeVisible();
  }

  // esperar a que acabe la cuenta atrás y tocar tornillos de verdad, con el ratón.
  // Espero un poco antes de cada toque: el servidor rechaza los toques a menos de
  // 100 ms de que salga el tornillo (nadie reacciona tan rápido)
  const tapSomeBolt = async () => {
    await host.waitForFunction(() => (window as any).__duelGame?.scene?.getScene('duel')?.views?.size > 0);
    await host.waitForTimeout(250);
    const pos = await host.evaluate(() => {
      const g = (window as any).__duelGame;
      const views: any[] = [...g.scene.getScene('duel').views.values()].filter((v: any) => !v.leaving);
      const view = views.sort((a, b) => b.data.expiresAt - a.data.expiresAt)[0];
      if (!view) return null;
      const r = g.canvas.getBoundingClientRect();
      const k = r.width / 960;
      return { x: r.left + view.container.x * k, y: r.top + view.container.y * k, needed: view.data.needed };
    });
    if (!pos) return;
    for (let i = 0; i < pos.needed; i++) {
      await host.mouse.click(pos.x, pos.y);
      await host.waitForTimeout(120);
    }
  };
  await expect(async () => {
    await tapSomeBolt();
    await expect(host.locator('.player-score.me .player-points')).not.toHaveText('0', { timeout: 1000 });
  }).toPass({ timeout: 15_000 });

  // el rival ve los mismos puntos en su marcador
  const hostPoints = await host.locator('.player-score.me .player-points').textContent();
  await expect(guest.locator('.player-score.rival .player-points')).toHaveText(hostPoints!);

  // el invitado se rinde
  await guest.getByRole('button', { name: 'Rendirse' }).click();
  await expect(guest.getByText('Has perdido')).toBeVisible();
  await expect(host.getByText('¡Has ganado!')).toBeVisible();
  await expect(host.getByText('(+16)')).toBeVisible();
  await expect(host.getByText('+20 huesos para la tienda')).toBeVisible();

  // los huesos del duelo y del logro llegan al monedero de la cabecera
  await expect(host.locator('.wallet')).toHaveText('45');
  await expect(host.locator('.toast').filter({ hasText: 'Primera victoria' })).toBeVisible();
});

test('sin cuenta, el duelo pide entrar', async ({ page }) => {
  await page.goto('/duelo');
  await expect(page.getByRole('link', { name: 'Entrar o crear cuenta' })).toBeVisible();
});
