// npm start и npm run start:northflank — как в Conveyor. Northflank может запустить сервис
// из репозитория, где сборка не дошла до dist/standalone (например, выполнила только
// npm run build без шага build:node); тогда standalone собирается здесь же.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildStandalone } from './build-node.mjs';
import { serveStandalone } from './northflank-serve.mjs';

const standaloneServer = new URL('../dist/standalone/server.js', import.meta.url);
const viteCli = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));

if (!existsSync(fileURLToPath(standaloneServer))) {
  if (!existsSync(viteCli)) {
    console.error('[schatzkammer] dist/standalone is missing and vite is not installed.');
    console.error('[schatzkammer] Build the service with: npm run build:node');
    process.exit(1);
  }
  const status = buildStandalone();
  if (status !== 0) process.exit(status);
}

await serveStandalone(standaloneServer);
