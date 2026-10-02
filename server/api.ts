// Маршруты API обучающего движка — те же, что в Conveyor:
//   POST /api/questions/generate — пакет заданий;
//   POST /api/questions/evaluate — проверка свободного ответа;
//   GET  /api/questions/status   — готова ли генерация и озвучка (без ключей и провайдера);
//   POST /api/tts                — mp3 по немецкой фразе;
//   GET  /healthz                — проверка живости.
// Обработчик работает на стандартных Request/Response: его подключают и Vite, и рабочий сервер.

import { evaluateRecallAnswer, RecallEvaluationRequestError } from './recall-evaluation.ts';
import { generateQuestions, isQuestionGenerationReady, QuestionRequestError } from './question-generation.ts';
import { isTextToSpeechReady, synthesizeGerman, TextToSpeechError } from './text-to-speech.ts';
import {
  clientKey,
  createRateLimiter,
  HttpError,
  json,
  NO_STORE_HEADERS,
  readJsonBody,
  type ClientInfo,
} from './http.ts';

export type ApiHandler = (request: Request, info?: ClientInfo) => Promise<Response | null>;

const RATE_WINDOW_MS = 60_000;

function statusOf(error: unknown, fallback: number): number {
  return error instanceof HttpError ||
    error instanceof QuestionRequestError ||
    error instanceof RecallEvaluationRequestError ||
    error instanceof TextToSpeechError
    ? error.statusCode
    : fallback;
}

function methodNotAllowed(allow: string): Response {
  return json({ error: 'method_not_allowed' }, 405, { Allow: allow });
}

/** Свои счётчики частоты у каждого экземпляра: тесты и разные серверы не мешают друг другу. */
export function createApiHandler(): ApiHandler {
  const generateLimit = createRateLimiter({ windowMs: RATE_WINDOW_MS, clientLimit: 6, globalLimit: 30 });
  const evaluateLimit = createRateLimiter({ windowMs: RATE_WINDOW_MS, clientLimit: 12, globalLimit: 60 });
  const speechLimit = createRateLimiter({ windowMs: RATE_WINDOW_MS, clientLimit: 40, globalLimit: 200 });

  async function generate(request: Request, info?: ClientInfo): Promise<Response> {
    if (!generateLimit(clientKey(request, info))) {
      return json({ questions: [] }, 429, { 'Retry-After': '60' });
    }
    try {
      const questions = await generateQuestions(await readJsonBody(request, 16_000));
      return json({ questions });
    } catch (error) {
      return json({ questions: [] }, statusOf(error, 503));
    }
  }

  async function evaluate(request: Request, info?: ClientInfo): Promise<Response> {
    if (!evaluateLimit(clientKey(request, info))) {
      return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
    }
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

  async function speak(request: Request, info?: ClientInfo): Promise<Response> {
    if (!speechLimit(clientKey(request, info))) {
      return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
    }
    try {
      const speech = await synthesizeGerman(await readJsonBody(request, 4_000));
      return new Response(speech.audio, {
        headers: {
          'Content-Type': speech.contentType,
          // Фраза — ключ кэша, поэтому байты по одному запросу не меняются.
          'Cache-Control': 'private, max-age=31536000, immutable',
          'X-Content-Type-Options': 'nosniff',
          'X-TTS-Cache': speech.cache,
        },
      });
    } catch (error) {
      return json({ error: 'unavailable' }, statusOf(error, 502));
    }
  }

  return async (request, info) => {
    const { pathname } = new URL(request.url);
    const method = request.method.toUpperCase();
    switch (pathname) {
      case '/api/questions/generate':
        return method === 'POST' ? generate(request, info) : methodNotAllowed('POST');
      case '/api/questions/evaluate':
        return method === 'POST' ? evaluate(request, info) : methodNotAllowed('POST');
      case '/api/questions/status':
        return method === 'GET' || method === 'HEAD'
          ? json({ ready: isQuestionGenerationReady(), speech: isTextToSpeechReady() })
          : methodNotAllowed('GET');
      case '/api/tts':
        return method === 'POST' ? speak(request, info) : methodNotAllowed('POST');
      case '/healthz':
        return Response.json({ ok: true }, { headers: NO_STORE_HEADERS });
      default:
        return pathname.startsWith('/api/') ? json({ error: 'not_found' }, 404) : null;
    }
  };
}
