import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// en desarrollo el front va en :5173 y la API en :4000 (los tests e2e usan otra API con API_URL)
const api = process.env.API_URL ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': api,
      '/socket.io': { target: api, ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        // Phaser pesa mucho; en su propio chunk se cachea aparte del resto
        manualChunks: (id) => (id.includes('node_modules/phaser') ? 'phaser' : undefined),
      },
    },
  },
});
