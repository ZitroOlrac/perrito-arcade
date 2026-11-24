import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Versión jugable sin servidor para GitHub Pages (https://zitroolrac.github.io/perrito-arcade/).
// Perrito Run y el duelo contra el bot funcionan enteros en el navegador.
// En desarrollo: npm run demo y abrir http://localhost:5173/perrito-arcade/demo.html

const outDir = path.resolve(__dirname, 'dist-demo');

// GitHub Pages sirve index.html; la entrada de la demo se llama demo.html para no pisar la de la app
const renameToIndex = (): Plugin => ({
  name: 'demo-como-index',
  closeBundle() {
    fs.renameSync(path.join(outDir, 'demo.html'), path.join(outDir, 'index.html'));
  },
});

export default defineConfig({
  plugins: [react(), renameToIndex()],
  base: '/perrito-arcade/',
  build: {
    outDir,
    emptyOutDir: true,
    chunkSizeWarningLimit: 1300,
    rollupOptions: { input: path.resolve(__dirname, 'demo.html') },
  },
  // la demo importa el motor del duelo directamente de la carpeta del servidor
  server: { fs: { allow: ['.', '../server/src'] } },
});
