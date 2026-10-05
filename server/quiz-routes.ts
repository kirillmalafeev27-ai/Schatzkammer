// Маршруты генератора «Шахты» и See Escape поверх стандартных Request/Response.
// Сам генератор — quiz-generation.cjs в корне, копия байт в байт: тот же запрос к модели, те же
// правила тем, тот же пул остатков на сервере. Модуль написан под express-подобное приложение,
// поэтому здесь — тот же минимальный req/res, что у server.js «Шахты».
//
// Модуль читает часть настроек (AI_MODELS, ELEVENLABS_*, таймауты) при загрузке, поэтому он
// подгружается при первом запросе — после того как сервер прочитал .env.local / .env.

import type { QuizHandler, QuizResponse } from '../quiz-generation.cjs';

type QuizModule = typeof import('../quiz-generation.cjs');

let routes: Promise<Map<string, QuizHandler>> | null = null;

function loadRoutes(): Promise<Map<string, QuizHandler>> {
  routes ??= import('../quiz-generation.cjs').then((loaded) => {
    const module = loaded as QuizModule & { default?: QuizModule };
    const install = module.installQuizRoutes ?? module.default!.installQuizRoutes;
    const table = new Map<string, QuizHandler>();
    install({
      get: (path, handler) => void table.set(`GET ${path}`, handler),
      post: (path, handler) => void table.set(`POST ${path}`, handler),
    });
    return table;
  });
  return routes;
}

/** Обработчик маршрута; HEAD обслуживается обработчиком GET. */
export async function quizRoute(method: string, pathname: string): Promise<QuizHandler | null> {
  const table = await loadRoutes();
  return table.get(`${method === 'HEAD' ? 'GET' : method} ${pathname}`) ?? null;
}

/** Методы, которые есть у пути: для ответа 405. */
export async function quizMethods(pathname: string): Promise<string[]> {
  const table = await loadRoutes();
  return [...table.keys()].filter((key) => key.endsWith(` ${pathname}`)).map((key) => key.split(' ')[0]);
}

export function runQuizRoute(handler: QuizHandler, request: Request, body: unknown): Promise<Response> {
  const query = Object.fromEntries(new URL(request.url).searchParams.entries());
  return new Promise<Response>((resolve) => {
    let status = 200;
    const headers = new Headers({ 'X-Content-Type-Options': 'nosniff' });
    const res: QuizResponse = {
      status(code) {
        status = code;
        return res;
      },
      setHeader(name, value) {
        headers.set(name, String(value));
      },
      json(payload) {
        headers.set('Content-Type', 'application/json; charset=utf-8');
        headers.set('Cache-Control', 'no-cache');
        resolve(new Response(JSON.stringify(payload), { status, headers }));
      },
      send(payload) {
        if (typeof payload === 'string') {
          if (!headers.has('Content-Type')) headers.set('Content-Type', 'text/plain; charset=utf-8');
          resolve(new Response(payload, { status, headers }));
          return;
        }
        if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/octet-stream');
        resolve(new Response(new Uint8Array(payload), { status, headers }));
      },
    };
    const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    Promise.resolve()
      .then(() => handler({ body: source as Record<string, unknown>, query }, res))
      .then(
        () => resolve(Response.json({ error: 'No response' }, { status: 500 })),
        (error: unknown) => {
          console.error('API route failed:', error);
          const code = (error as { statusCode?: number })?.statusCode ?? 500;
          resolve(Response.json({ error: 'Internal server error' }, { status: code }));
        },
      );
  });
}
