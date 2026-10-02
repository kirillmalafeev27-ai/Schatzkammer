// API обучающего движка внутри `npm run dev` и `npm run preview`: тот же обработчик, что у рабочего
// сервера, ключи читаются из .env.local / .env и в браузер не попадают.

import type { Plugin } from 'vite';
import { loadEnvFiles } from './env.ts';
import { apiMiddleware } from './node.ts';

export function learningApi(): Plugin {
  return {
    name: 'schatzkammer-learning-api',
    configureServer(server) {
      loadEnvFiles(server.config.root);
      server.middlewares.use(apiMiddleware());
    },
    configurePreviewServer(server) {
      loadEnvFiles(server.config.root);
      server.middlewares.use(apiMiddleware());
    },
  };
}
