// Переходник Node ↔ Web: API написан на стандартных Request/Response, а Vite и рабочий сервер
// живут на node:http.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { createApiHandler, type ApiHandler } from './api.ts';

export function toWebRequest(req: IncomingMessage): Request {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) for (const item of value) headers.append(key, item);
    else headers.set(key, value);
  }
  const method = req.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  return new Request(url, {
    method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream<Uint8Array>) : undefined,
    duplex: 'half',
  } as RequestInit);
}

export async function sendWebResponse(
  res: ServerResponse,
  response: Response,
  method = 'GET',
): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (!response.body || method.toUpperCase() === 'HEAD') {
    res.end();
    return;
  }
  res.end(Buffer.from(await response.arrayBuffer()));
}

export function isApiPath(url: string | undefined): boolean {
  const path = (url ?? '').split('?')[0];
  return path.startsWith('/api/') || path === '/healthz';
}

type Next = (error?: unknown) => void;

/** Промежуточный обработчик в стиле connect: всё, что не API, уходит дальше. */
export function apiMiddleware(handler: ApiHandler = createApiHandler()) {
  return (req: IncomingMessage, res: ServerResponse, next: Next): void => {
    if (!isApiPath(req.url)) {
      next();
      return;
    }
    void (async () => {
      try {
        const response = await handler(toWebRequest(req), { address: req.socket.remoteAddress });
        if (!response) {
          next();
          return;
        }
        await sendWebResponse(res, response, req.method);
      } catch {
        if (!res.headersSent) res.statusCode = 500;
        res.end();
      }
    })();
  };
}
