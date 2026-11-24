import { defineConfig, devices } from '@playwright/test';

// Levanta la API y el front en puertos distintos a los de desarrollo y contra
// su propia base de datos, para poder pasar los tests con la app abierta.
const API_PORT = 4010;
const WEB_PORT = 5174;
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://arcade:arcade@localhost:5432/arcade_e2e';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      // WebGL por software para que Phaser funcione en máquinas sin GPU (CI)
      args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npx tsx src/index.ts',
      cwd: '../server',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: String(API_PORT),
        DATABASE_URL: E2E_DATABASE_URL,
        JWT_SECRET: 'e2e-secret',
        CLIENT_ORIGIN: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      cwd: '../client',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      env: { API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
