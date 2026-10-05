// Обращения игры к API. Генерация, статус и озвучка — маршруты генератора «Шахты» и See Escape
// (quiz-generation.cjs) с теми же телами запросов, что у QuizBankProvider «Шахты»; проверка
// свободного ответа — своя. Пути относительные: игра работает и из подпапки, если сервер отдаёт
// её вместе с API.

import { AUDIO_DISPLAY_CONTEXT, EXERCISE_FORMATS } from './formats.ts';
import type { GameQuestion } from './questions.ts';
import { localRecallEvaluation } from './recall.ts';
import type { LearningSettings } from './settings.ts';
import type { GenerateRequest } from './pool.ts';
import { gapCount, TASK_FORMATS, type TaskFormatId } from './task-formats.ts';

export const API_PATHS = {
  generate: 'api/generate-questions',
  audio: 'api/generate-audio-questions',
  evaluate: 'api/questions/evaluate',
  status: 'api/quiz/status',
  speech: 'api/tts',
} as const;

type Fetch = typeof fetch;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isWortstellungTopic(topic: string): boolean {
  return /Wortstellung/i.test(topic || '');
}

/**
 * Задание генератора («text / display / options / correct» или аудирование с audioText) в виде
 * записи игры. Перевода и разбора генератор не пишет — панель их просто не показывает.
 * Инструкция — по-русски, по формату, который видно из самого задания.
 */
export function fromGenerated(raw: unknown, request: GenerateRequest): Record<string, unknown> | null {
  const source = record(raw);
  if (!Array.isArray(source.options) || typeof source.correct !== 'number') return null;
  const common = {
    options: source.options,
    correct: source.correct,
    translation: '',
    level: request.level,
    lexicalTopic: request.lexicalTopic,
  };
  if (request.mode === 'audio') {
    const audioText = typeof source.audioText === 'string' ? source.audioText : '';
    if (!audioText) return null;
    return {
      ...common,
      prompt: EXERCISE_FORMATS.audio.instruction,
      context: AUDIO_DISPLAY_CONTEXT,
      audioText,
      // После ответа игрок видит, какая фраза звучала.
      rule: audioText,
    };
  }
  const display = typeof source.display === 'string' ? source.display : '';
  const gaps = gapCount(display);
  const format: TaskFormatId =
    gaps >= 2
      ? 'mehrfachluecke'
      : gaps === 1
        ? 'luecke'
        : isWortstellungTopic(request.grammarTopic) && display.includes(' / ')
          ? 'wortstellung'
          : 'satzvarianten';
  return {
    ...common,
    prompt: TASK_FORMATS[format].instruction,
    context: display,
    rule: '',
    format,
    grammarTopic: request.grammarTopic,
  };
}

export async function requestQuestions(
  request: GenerateRequest,
  signal: AbortSignal,
  fetchImpl: Fetch = fetch,
): Promise<unknown[]> {
  const { level, lexicalTopic, grammarTopic, count, exclude } = request;
  const audio = request.mode === 'audio';
  const response = await fetchImpl(audio ? API_PATHS.audio : API_PATHS.generate, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      audio
        ? { level, lexicalTopic, count, exclude }
        : {
            level,
            lexicalTopic,
            grammarTopic,
            isWortstellung: isWortstellungTopic(grammarTopic),
            count,
            exclude,
          },
    ),
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = record(await response.json());
  const questions = Array.isArray(payload.questions) ? payload.questions : [];
  return questions.map((raw) => fromGenerated(raw, request)).filter((item) => item !== null);
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
    return { ready: Boolean(data.generationConfigured), speech: Boolean(data.ttsConfigured) };
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
