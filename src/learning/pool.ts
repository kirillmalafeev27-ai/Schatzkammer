// Пул вопросов — правила Conveyor (use-question-pool) без React:
// - своя очередь на каждый ключ `уровень | лексика | грамматика` (аудирование — `audio | уровень | лексика`);
// - пакет из 8 заданий запрашивается, когда в очереди меньше 3; не вышло — повтор через 12 с;
// - последние 80 формулировок помнятся, последние 60 уходят серверу в `exclude`;
// - вопрос с ошибкой возвращается в хвост очереди, но не показывается два раза подряд;
// - пока очередь пуста, без ожидания берётся встроенный резерв: сначала задания своей темы.

import type { LearningSettings } from './settings.ts';
import { learningPoolKey } from './settings.ts';
import {
  fallbackQuestionsFor,
  normalizeQuestion,
  questionFingerprint,
  questionHistoryLabel,
  shuffleQuestion,
  type GameQuestion,
} from './questions.ts';

export const POOL_RULES = {
  batchSize: 8,
  lowWaterMark: 3,
  recentLimit: 80,
  serverExcludeLimit: 60,
  retryDelayMs: 12_000,
  requestTimeoutMs: 46_000,
} as const;

export interface GenerateRequest {
  level: string;
  mode: string;
  lexicalTopic: string;
  grammarTopic: string;
  count: number;
  exclude: string[];
}

/** Запрос пакета; возвращает сырые записи — пул сам нормализует их и отсеивает повторы. */
export type GenerateFn = (request: GenerateRequest, signal: AbortSignal) => Promise<unknown[]>;

interface KeyState {
  queue: GameQuestion[];
  recent: string[];
  recentFingerprints: string[];
  reserve: GameQuestion[];
  reserveOrder: number[];
  reserveCursor: number;
  lastFingerprint: string;
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function reserveIndexes(
  questions: GameQuestion[],
  settings: Pick<LearningSettings, 'lexicalTopic' | 'grammarTopic'>,
  random: () => number,
): number[] {
  const preferred: number[] = [];
  const supplemental: number[] = [];
  questions.forEach((question, index) => {
    if (question.grammarTopic === settings.grammarTopic || question.lexicalTopic === settings.lexicalTopic) {
      preferred.push(index);
    } else {
      supplemental.push(index);
    }
  });
  return [...shuffled(preferred, random), ...shuffled(supplemental, random)];
}

export class QuestionPool {
  private readonly states = new Map<string, KeyState>();
  private settings!: LearningSettings;
  private key = '';
  private state!: KeyState;
  private enabled = false;
  private inFlight: Promise<void> | null = null;
  private abort: AbortController | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private epoch = 0;
  private destroyed = false;
  /** Номер текущего вопроса в раунде (с 1). */
  questionNumber = 0;

  constructor(
    settings: LearningSettings,
    private readonly generate: GenerateFn,
    private readonly random: () => number = Math.random,
  ) {
    this.setSettings(settings);
  }

  get poolKey(): string {
    return this.key;
  }

  get queued(): number {
    return this.state.queue.length;
  }

  get refilling(): boolean {
    return this.inFlight != null;
  }

  /** Смена темы или режима: прежняя очередь сохраняется, запрос по ней отменяется. */
  setSettings(settings: LearningSettings): void {
    this.settings = { ...settings };
    const key = learningPoolKey(settings);
    if (key === this.key) return;
    this.abort?.abort();
    this.abort = null;
    this.epoch += 1;
    this.inFlight = null;
    this.clearRetry();
    this.key = key;
    let state = this.states.get(key);
    if (!state) {
      const reserve = fallbackQuestionsFor(settings);
      state = {
        queue: [],
        recent: [],
        recentFingerprints: [],
        reserve,
        reserveOrder: reserveIndexes(reserve, settings, this.random),
        reserveCursor: 0,
        lastFingerprint: '',
      };
      this.states.set(key, state);
    }
    this.state = state;
    this.questionNumber = 0;
    if (this.enabled && state.queue.length < POOL_RULES.lowWaterMark) void this.refill();
  }

  /** Пополнение идёт, только пока игрок рядом с игрой: в залах и на выборе зала. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clearRetry();
      return;
    }
    if (this.state.queue.length < POOL_RULES.lowWaterMark) void this.refill();
  }

  refill(): Promise<void> {
    if (!this.enabled || this.destroyed) return Promise.resolve();
    if (this.state.queue.length >= POOL_RULES.lowWaterMark) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    const key = this.key;
    const epoch = this.epoch;
    const state = this.state;
    const settings = this.settings;
    const controller = new AbortController();
    this.abort = controller;
    const timeout = setTimeout(() => controller.abort(), POOL_RULES.requestTimeoutMs);
    const isCurrent = () => !this.destroyed && epoch === this.epoch && key === this.key;
    const task = this.generate(
      {
        level: settings.level,
        mode: settings.mode,
        lexicalTopic: settings.lexicalTopic,
        grammarTopic: settings.grammarTopic,
        count: POOL_RULES.batchSize,
        exclude: state.recent.slice(-POOL_RULES.serverExcludeLimit),
      },
      controller.signal,
    )
      .then((records) => {
        if (!isCurrent()) return;
        const known = new Set([
          state.lastFingerprint,
          ...state.recentFingerprints,
          ...state.queue.map(questionFingerprint),
        ]);
        const accepted: GameQuestion[] = [];
        for (const [index, candidate] of (Array.isArray(records) ? records : []).entries()) {
          const normalized = normalizeQuestion(candidate, index);
          if (!normalized) continue;
          const fingerprint = questionFingerprint(normalized);
          if (known.has(fingerprint)) continue;
          known.add(fingerprint);
          accepted.push(normalized);
        }
        state.queue.push(...shuffled(accepted, this.random));
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(timeout);
        if (this.abort === controller) this.abort = null;
        if (epoch === this.epoch) this.inFlight = null;
        if (!isCurrent()) return;
        if (this.enabled && state.queue.length < POOL_RULES.lowWaterMark && !this.retryTimer) {
          this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            void this.refill();
          }, POOL_RULES.retryDelayMs);
        }
      });
    this.inFlight = task;
    return task;
  }

  /** Следующий вопрос с перемешанными вариантами. `restart` — начало раунда. */
  next(restart = false): GameQuestion {
    const state = this.state;
    if (restart) state.lastFingerprint = '';
    let next = state.queue.shift();
    if (next && questionFingerprint(next) === state.lastFingerprint) {
      // Вопрос с ошибкой стоит в хвосте, но сразу же повториться не должен.
      state.queue.push(next);
      const alternateIndex = state.queue.findIndex(
        (candidate) => questionFingerprint(candidate) !== state.lastFingerprint,
      );
      next = alternateIndex >= 0 ? state.queue.splice(alternateIndex, 1)[0] : this.nextReserve();
    }
    next ??= this.nextReserve();
    const fingerprint = questionFingerprint(next);
    state.lastFingerprint = fingerprint;
    state.recent.push(questionHistoryLabel(next));
    state.recentFingerprints.push(fingerprint);
    if (state.recent.length > POOL_RULES.recentLimit) {
      state.recent.splice(0, state.recent.length - POOL_RULES.recentLimit);
    }
    if (state.recentFingerprints.length > POOL_RULES.recentLimit) {
      state.recentFingerprints.splice(0, state.recentFingerprints.length - POOL_RULES.recentLimit);
    }
    this.questionNumber = restart ? 1 : this.questionNumber + 1;
    if (state.queue.length < POOL_RULES.lowWaterMark) void this.refill();
    return shuffleQuestion(next, this.random);
  }

  /** Вопрос с ошибкой возвращается в хвост очереди, если его там ещё нет. */
  release(released: GameQuestion): void {
    const fingerprint = questionFingerprint(released);
    if (!this.state.queue.some((queued) => questionFingerprint(queued) === fingerprint)) {
      this.state.queue.push(released);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.abort?.abort();
    this.abort = null;
    this.clearRetry();
  }

  private nextReserve(): GameQuestion {
    const state = this.state;
    if (state.reserveCursor >= state.reserveOrder.length) {
      state.reserveOrder = reserveIndexes(state.reserve, this.settings, this.random);
      state.reserveCursor = 0;
    }
    let next = state.reserve[state.reserveOrder[state.reserveCursor++]];
    if (questionFingerprint(next) === state.lastFingerprint) {
      if (state.reserveCursor >= state.reserveOrder.length) state.reserveCursor = 0;
      next = state.reserve[state.reserveOrder[state.reserveCursor++]];
    }
    return next;
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}
