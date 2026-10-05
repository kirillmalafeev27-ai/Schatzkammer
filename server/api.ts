// Маршруты API:
//   GET  /api/quiz/status                — готовы ли генерация и озвучка;
//   POST /api/generate-questions         — пакет грамматических заданий;
//   POST /api/generate-audio-questions   — пакет заданий на аудирование;
//   POST /api/tts                        — mp3 по немецкой фразе;
//   GET  /healthz                        — проверка живости;
// все пять — генератор «Шахты» и See Escape (quiz-generation.cjs, см. quiz-routes.ts);
//   POST /api/questions/evaluate         — проверка свободного ответа (своё, как в Conveyor).
// Обработчик работает на стандартных Request/Response: его подключают и Vite, и рабочий сервер.

import { evaluateRecallAnswer, RecallEvaluationRequestError } from './recall-evaluation.ts';
import { clientKey, createRateLimiter, HttpError, json, readJsonBody, type ClientInfo } from './http.ts';
import { quizMethods, quizRoute, runQuizRoute } from './quiz-routes.ts';

export type ApiHandler = (request: Request, info?: ClientInfo) => Promise<Response | null>;

const RATE_WINDOW_MS = 60_000;

function statusOf(error: unknown, fallback: number): number {
  return error instanceof HttpError || error instanceof RecallEvaluationRequestError
    ? error.statusCode
    : fallback;
}

function methodNotAllowed(allow: string): Response {
  return json({ error: 'method_not_allowed' }, 405, { Allow: allow });
}

function rateLimited(): Response {
  return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
}

/** Свои счётчики частоты у каждого экземпляра: тесты и разные серверы не мешают друг другу. */
export function createApiHandler(): ApiHandler {
  const generateLimit = createRateLimiter({ windowMs: RATE_WINDOW_MS, clientLimit: 6, globalLimit: 30 });
  const evaluateLimit = createRateLimiter({ windowMs: RATE_WINDOW_MS, clientLimit: 12, globalLimit: 60 });
  const speechLimit = createRateLimiter({ windowMs: RATE_WINDOW_MS, clientLimit: 40, globalLimit: 200 });
  // Пределы частоты и размера тела для маршрутов генератора.
  const quizLimits: Record<string, { limit: typeof generateLimit; maxBytes: number }> = {
    '/api/generate-questions': { limit: generateLimit, maxBytes: 16_000 },
    '/api/generate-audio-questions': { limit: generateLimit, maxBytes: 16_000 },
    '/api/tts': { limit: speechLimit, maxBytes: 4_000 },
  };

  async function evaluate(request: Request, info?: ClientInfo): Promise<Response> {
    if (!evaluateLimit(clientKey(request, info))) return rateLimited();
    try {
      return json(await evaluateRecallAnswer(await readJsonBody(request, 12_000)));
    } catch (error) {
      const status = statusOf(error, 503);
      return json(
        {
          error:
            status === 413
              ? 'request_too_large'
              : status === 400
                ? 'invalid_request'
                : 'evaluation_unavailable',
        },
        status,
      );
    }
  }

  async function quiz(request: Request, pathname: string, info?: ClientInfo): Promise<Response | null> {
    const method = request.method.toUpperCase();
    const handler = await quizRoute(method, pathname);
    if (!handler) {
      const allowed = await quizMethods(pathname);
      return allowed.length ? methodNotAllowed(allowed.join(', ')) : null;
    }
    const limits = quizLimits[pathname];
    if (limits && !limits.limit(clientKey(request, info))) return rateLimited();
    let body: unknown = {};
    if (method === 'POST') {
      try {
        body = await readJsonBody(request, limits?.maxBytes ?? 16_000);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Bad request' }, statusOf(error, 400));
      }
    }
    const response = await runQuizRoute(handler, request, body);
    return method === 'HEAD'
      ? new Response(null, { status: response.status, headers: response.headers })
      : response;
  }

  return async (request, info) => {
    const { pathname } = new URL(request.url);
    const method = request.method.toUpperCase();
    if (pathname === '/api/questions/evaluate') {
      return method === 'POST' ? evaluate(request, info) : methodNotAllowed('POST');
    }
    const response = await quiz(request, pathname, info);
    if (response) return response;
    return pathname.startsWith('/api/') ? json({ error: 'not_found' }, 404) : null;
  };
}
