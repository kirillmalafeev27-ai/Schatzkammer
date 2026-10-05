import { defineConfig } from 'vite';
import { learningApi } from './server/vite-plugin.ts';

export default defineConfig(({ isSsrBuild }) => ({
  base: './',
  plugins: [learningApi()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 0,
    // Сервер (npm run build:node) собирается сразу в server.js: генератор заданий лежит
    // отдельным куском и импортирует общие помощники из входного файла по его имени.
    ...(isSsrBuild ? { rollupOptions: { output: { entryFileNames: 'server.js' } } } : {}),
  },
}));
