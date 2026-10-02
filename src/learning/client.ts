// Обращения игры к API обучающего движка. Пути относительные: игра работает и из подпапки,
// если сервер отдаёт её вместе с API.

import type { GameQuestion } from './questions.ts';
import { localRecallEvaluation } from './recall.ts';
import type { LearningSettings } from './settings.ts';
import type { GenerateRequest } from './pool.ts';

export const API_PATHS = {
  generate: 'api/questions/generate',
  evaluate: 'api/questions/evaluate',
  status: 'api/questions/status',
  speech: 'api/tts',
} as const;

type Fetch = typeof fetch;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function requestQuestions(
  request: GenerateRequest,
  signal: AbortSignal,
  fetchImpl: Fetch = fetch,
): Promise<unknown[]> {
  const response = await fetchImpl(API_PATHS.generate, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  const payload = record(response.ok ? await response.json() : null);
  return Array.isArray(payload.questions) ? payload.questions : [];
}

export interface PoolStatus {
  /** Генерация настроена на сервере. */
  ready: boolean;
  /** Озвучка через провайдера; без неё фразу читает голос браузера. */
  speech: boolean;
}

export async function requestStatus(fetchImpl: Fetch = fetch): Promise<PoolStatus> {
  try {
    const response = await fetchImpl(API_PATHS.status, { cache: 'no-store' });
    const data = record(response.ok ? await response.json() : null);
    return { ready: Boolean(data.ready), speech: Boolean(data.speech) };
  } catch {
    return { ready: false, speech: false };
  }
}

export interface RecallOutcome {
  correct: boolean;
  /** Строка разбора: объяснение и, при ошибке, эталон. */
  feedback: string;
}

/**
 * Свободный ответ: сервер сначала сравнивает строго, затем по смыслу. Если сервер недоступен,
 * работает то же строгое сравнение на месте (умлауты и ae/oe/ue равнозначны).
 */
export async function evaluateRecall(
  question: GameQuestion,
  answer: string,
  settings: LearningSettings,
  fetchImpl: Fetch = fetch,
  signal?: AbortSignal,
): Promise<RecallOutcome> {
  const expected = question.options[question.correct];
  const local = (): RecallOutcome =>
    localRecallEvaluation(answer, expected).correct
      ? { correct: true, feedback: question.rule }
      : { correct: false, feedback: `Пока не совпало. Ответ: ${expected}` };
  try {
    const response = await fetchImpl(API_PATHS.evaluate, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        userAnswer: answer,
        expectedAnswer: expected,
        prompt: question.prompt,
        context: question.context,
        translation: question.translation,
        level: settings.level,
        lexicalTopic: settings.lexicalTopic,
        grammarTopic: settings.grammarTopic,
      }),
    });
    if (!response.ok) return local();
    const result = record(await response.json());
    const explanation = typeof result.explanation === 'string' ? result.explanation : '';
    const correctAnswer = typeof result.correctAnswer === 'string' ? result.correctAnswer : expected;
    if (result.correct === true) return { correct: true, feedback: explanation || question.rule };
    return { correct: false, feedback: `${explanation || 'Пока не совпало.'} Ответ: ${correctAnswer}` };
  } catch {
    if (signal?.aborted) throw new Error('aborted');
    return local();
  }
}
