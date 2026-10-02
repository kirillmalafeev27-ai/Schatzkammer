// Сборка для Northflank (и любого Node-хостинга) — как в Conveyor: всё нужное для запуска
// собирается в dist/standalone/ и копируется в образ без node_modules, исходников и scripts/.
//
//   dist/standalone/server.js            сервер: игра + API обучающего движка (только встроенные модули Node)
//   dist/standalone/public/              собранная игра
//   dist/standalone/northflank-serve.mjs запускающий скрипт, который выбирает порты
//   dist/standalone/package.json         npm start и npm run start:northflank ведут в него же

import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const viteCli = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const standalone = fileURLToPath(new URL('../dist/standalone/', import.meta.url));
const launcherSource = fileURLToPath(new URL('./northflank-serve.mjs', import.meta.url));

function vite(args) {
  const run = spawnSync(process.execPath, [viteCli, ...args], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });
  return run.status ?? 1;
}

// Собранная игра уходит в standalone/public, запускающий скрипт и манифест — рядом с сервером.
function addStandaloneFiles() {
  for (const entry of readdirSync(dist)) {
    if (entry === 'standalone') continue;
    cpSync(`${dist}${entry}`, `${standalone}public/${entry}`, { recursive: true });
  }
  copyFileSync(launcherSource, `${standalone}northflank-serve.mjs`);
  const manifest = {
    name: 'schatzkammer-standalone',
    private: true,
    type: 'module',
    scripts: {
      start: 'node northflank-serve.mjs',
      'start:northflank': 'node northflank-serve.mjs',
    },
  };
  writeFileSync(`${standalone}package.json`, `${JSON.stringify(manifest, null, 2)}\n`);
}

export function buildStandalone() {
  // Клиент первым: его сборка очищает dist/, сервер собирается уже внутрь dist/standalone.
  const client = vite(['build']);
  if (client !== 0) return client;
  const server = vite(['build', '--ssr', 'server/main.ts', '--outDir', 'dist/standalone', '--emptyOutDir']);
  if (server !== 0) return server;
  // Vite называет файл по входной точке: main.js → server.js, как у standalone Conveyor.
  renameSync(`${standalone}main.js`, `${standalone}server.js`);
  addStandaloneFiles();
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(buildStandalone());
}
