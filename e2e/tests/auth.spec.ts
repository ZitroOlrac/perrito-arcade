import { expect, test } from '@playwright/test';
import { register, uniqueName } from './helpers';

test('registro, cerrar sesión y volver a entrar', async ({ page }) => {
  const name = uniqueName('pepe');
  await register(page, name);
  await expect(page.locator('.wallet')).toHaveText('0');

  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible();

  await page.getByRole('link', { name: 'Entrar' }).click();
  await page.getByLabel('Nombre de jugador').fill(name.toUpperCase()); // no distingue mayúsculas
  await page.getByLabel('Contraseña').fill('secreto123');
  await page.locator('form').getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('.session .me')).toHaveText(name);
});

test('los errores del formulario salen junto a cada campo', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByRole('button', { name: '¿No tienes cuenta? Créala aquí' }).click();
  await page.getByLabel('Nombre de jugador').fill('a b');
  await page.getByLabel('Contraseña').fill('123');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText('Solo letras, números y guion bajo')).toBeVisible();
  await expect(page.getByText('Mínimo 6 caracteres')).toBeVisible();
});

test('la sesión se mantiene al recargar', async ({ page }) => {
  const name = uniqueName('recarga');
  await register(page, name);
  await page.reload();
  await expect(page.locator('.session .me')).toHaveText(name);
});
