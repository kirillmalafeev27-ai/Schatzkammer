// Рабочий сервер: отдаёт собранную игру из dist/ и API обучающего движка.
// Сборка: npm run build (клиент в dist/, сервер в dist-server/), запуск: npm start.
// PORT (по умолчанию 3000) и HOST (по умолчанию 0.0.0.0) задаются переменными окружения.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiHandler } from './api.ts';
import { loadEnvFiles } from './env.ts';
import { isApiPath, sendWebResponse, toWebRequest } from './node.ts';

loadEnvFiles(process.cwd());

const staticRoot = resolve(process.env.STATIC_DIR ?? fileURLToPath(new URL('../dist/', import.meta.url)));
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';
const api = createApiHandler();

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};

function fileAt(path: string): string | null {
  try {
    return statSync(path).isFile() ? path : null;
  } catch {
    return null;
  }
}

/** Путь внутри dist/; всё, что пытается выйти за его пределы, не находится. */
function resolveStatic(urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const target = normalize(join(staticRoot, decoded));
  if (target !== staticRoot && !target.startsWith(staticRoot + sep)) return null;
  return fileAt(target) ?? fileAt(join(target, 'index.html'));
}

const server = createServer((req, res) => {
  if (isApiPath(req.url)) {
    void (async () => {
      try {
        const response = await api(toWebRequest(req), { address: req.socket.remoteAddress });
        await sendWebResponse(res, response ?? new Response(null, { status: 404 }), req.method);
      } catch {
        if (!res.headersSent) res.statusCode = 500;
        res.end();
      }
    })();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const urlPath = new URL(req.url ?? '/', 'http://localhost').pathname;
  // Хэшированные файлы сборки лежат в assets/; для остальных путей отдаётся сама игра.
  const file =
    resolveStatic(urlPath) ??
    (urlPath.startsWith('/assets/') ? null : fileAt(join(staticRoot, 'index.html')));
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
});

server.listen(port, host, () => {
  console.log(`[schatzkammer] http://${host}:${port} · статика ${staticRoot}`);
});
