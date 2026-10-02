import { defineConfig } from 'vite';
import { learningApi } from './server/vite-plugin.ts';

export default defineConfig({
  base: './',
  plugins: [learningApi()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 0,
  },
});
