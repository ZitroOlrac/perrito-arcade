import { expect, test } from '@playwright/test';
import { register, uniqueName } from './helpers';

test('jugar a Perrito Run guarda la partida y da el primer logro', async ({ page }) => {
  const name = uniqueName('runner');
  await register(page, name, 'secreto123', '/jugar/perrito-run');

  const canvas = page.locator('.game-frame canvas');
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => (window as any).__perritoGame?.scene?.getScene('run')?.state === 'ready');

  // empezar con un toque en el juego, correr un poco y saltar
  await canvas.click();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);

  // en vez de esperar a chocar (aleatorio), provoco el choque desde el juego
  await page.evaluate(() => (window as any).__perritoGame.scene.getScene('run').crash());

  const overlay = page.getByRole('dialog', { name: 'Fin de la partida' });
  await expect(overlay).toBeVisible();
  await expect(overlay.getByText('¡Nuevo récord personal!')).toBeVisible();

  // el logro llega por websocket como aviso
  await expect(page.locator('.toast').filter({ hasText: 'Primeros pasos' })).toBeVisible();

  // y se ve en el perfil
  await page.goto(`/jugador/${name}`);
  await expect(page.locator('.achievement.unlocked')).toContainText(['Primeros pasos']);
  await expect(page.locator('.stat').filter({ hasText: 'Partidas' })).toContainText('1');
});

test('como invitado se puede jugar pero no se guarda', async ({ page }) => {
  await page.goto('/jugar/perrito-run');
  await expect(page.getByText('Estás jugando como invitado')).toBeVisible();
  await page.waitForFunction(() => (window as any).__perritoGame?.scene?.getScene('run')?.state === 'ready');
  await page.keyboard.press('Space');
  await page.waitForTimeout(800);
  await page.evaluate(() => (window as any).__perritoGame.scene.getScene('run').crash());
  await expect(page.getByRole('dialog').getByText('para guardar tus puntuaciones')).toBeVisible();
});
