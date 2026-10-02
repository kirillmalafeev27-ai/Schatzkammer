// Запуск на Northflank — тот же скрипт, что в Conveyor.
//
// Northflank не подставляет $PORT. Какой порт набирает его прокси, решает port entry в панели,
// и если контейнер слушает другой, публичный адрес отвечает «upstream connect error ...
// Connection refused». Поэтому без PORT и PORTS слушаем сразу оба номера — 8080 и 3000, и любой
// из них в port entry доходит до игры без правки панели.

import { existsSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const DEFAULT_PORTS = '8080,3000';

export function resolvePorts(environment = process.env) {
  const configured = environment.PORTS || environment.PORT || DEFAULT_PORTS;
  const ports = [];
  for (const entry of String(configured).split(',')) {
    const port = Number(entry.trim());
    if (Number.isInteger(port) && port > 0 && port < 65_536 && !ports.includes(port)) {
      ports.push(port);
    }
  }
  return ports.length ? ports : [8080];
}

// Первый порт слушает сам сервер; каждый следующий — просто TCP-труба в него. Дополнительные
// порты — по возможности: занятый порт даёт предупреждение, а не падение сервиса.
function forwardPort(port, target, host) {
  const relay = createServer((socket) => {
    const upstream = connect(target, '127.0.0.1');
    const drop = () => {
      socket.destroy();
      upstream.destroy();
    };
    socket.on('error', drop);
    upstream.on('error', drop);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  relay.on('error', (error) => {
    console.warn(`[northflank] extra port ${port} unavailable: ${error.message}`);
  });
  relay.listen(port, host);
  relay.unref();
  return relay;
}

export async function serveStandalone(serverUrl) {
  const requestedPort = process.env.PORT ?? '';
  const requestedPorts = process.env.PORTS ?? '';
  const [primary, ...extras] = resolvePorts();
  const host = process.env.HOST ?? '0.0.0.0';

  process.env.NODE_ENV ??= 'production';
  process.env.HOST = host;
  // Сервер читает PORT, поэтому первый номер — обязательный: если его не занять, процесс
  // падает, и Northflank видит неудачный старт.
  process.env.PORT = String(primary);

  console.log(
    `[northflank] PORT=${requestedPort} PORTS=${requestedPorts} -> binding ${[primary, ...extras].join(', ')} on ${host}`,
  );

  await import(serverUrl.href ?? String(serverUrl));
  for (const port of extras) forwardPort(port, primary, host);
}

// Скрипт лежит рядом с сервером в образе и в scripts/ при сборке из репозитория — находит оба.
export function standaloneServerUrl() {
  const sibling = new URL('./server.js', import.meta.url);
  return existsSync(fileURLToPath(sibling))
    ? sibling
    : new URL('../dist/standalone/server.js', import.meta.url);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await serveStandalone(standaloneServerUrl());
}
