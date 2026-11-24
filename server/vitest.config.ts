import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { NODE_ENV: 'test' },
    globalSetup: './test/globalSetup.ts',
    // todos los tests comparten la misma base de datos, así que en serie
    fileParallelism: false,
  },
});
