import { expect, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../playwright.config';

/** Nombre único por test, para no depender de vaciar la base de datos. */
export function uniqueName(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function register(page: Page, username: string, password = 'secreto123', back = '/') {
  await page.goto(`/entrar?volver=${encodeURIComponent(back)}`);
  await page.getByRole('button', { name: '¿No tienes cuenta? Créala aquí' }).click();
  await page.getByLabel('Nombre de jugador').fill(username);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.locator('.session .me')).toHaveText(username);
}

/** Preparar datos que por la interfaz llevarían mucho tiempo (p. ej. tener huesos). */
export async function sql(text: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return await client.query(text, params);
  } finally {
    await client.end();
  }
}
