import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:4300', '/s': 'http://127.0.0.1:4300', '/runs-data': 'http://127.0.0.1:4300', '/report': 'http://127.0.0.1:4300' } },
});
