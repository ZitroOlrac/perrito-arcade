import { expect, test } from '@playwright/test';
import { register, sql, uniqueName } from './helpers';

test('comprar una skin con huesos y verla en el perfil', async ({ page }) => {
  const name = uniqueName('compra');
  await register(page, name);
  await sql('UPDATE users SET bones = 200 WHERE username = $1', [name]);

  await page.goto('/tienda');
  await expect(page.locator('.balance')).toHaveText('200');

  const nieve = page.locator('.skin-card').filter({ hasText: 'Nieve' });
  const oro = page.locator('.skin-card').filter({ hasText: 'Oro macizo' });
  await expect(oro.getByRole('button')).toBeDisabled();
  await expect(oro.getByRole('button')).toHaveText('Faltan 1800'); // en español los números de 4 cifras van sin punto;

  await nieve.getByRole('button', { name: 'Comprar' }).click();
  await expect(nieve.getByText('Puesta')).toBeVisible();
  await expect(page.locator('.wallet')).toHaveText('50');
  await expect(page.locator('.toast').filter({ hasText: 'De estreno' })).toBeVisible();

  // el historial explica de dónde sale el saldo
  await expect(page.locator('.wallet-history')).toContainText('Compra');
  await expect(page.locator('.wallet-history')).toContainText('-150');

  // volver a la clásica y otra vez a la comprada
  await page.locator('.skin-card').filter({ hasText: 'Clásico' }).getByRole('button', { name: 'Ponérsela' }).click();
  await expect(page.locator('.skin-card').filter({ hasText: 'Clásico' }).getByText('Puesta')).toBeVisible();
  await nieve.getByRole('button', { name: 'Ponérsela' }).click();
  await expect(nieve.getByText('Puesta')).toBeVisible();

  const { rows } = await sql('SELECT equipped_skin, bones FROM users WHERE username = $1', [name]);
  expect(rows[0]).toEqual({ equipped_skin: 'nieve', bones: 50 });
});
