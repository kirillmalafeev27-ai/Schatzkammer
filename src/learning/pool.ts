// Пул вопросов — правила «Шахты» (QuizBankProvider, перенос QuestionBank из See Escape):
// - пакет из 10 заданий запрашивается, когда в очереди меньше 3; к модели не обращаются, пока
//   пул выключен — игрок не на выборе зала и не в зале;
// - смена темы или уровня: запрос уходит, когда выбор устоялся (0,7 с), а не на каждый щелчок;
// - после неудачи новый запрос не раньше чем через 15 с, каждая неудача подряд — вдвое дольше,
//   до двух минут; первый успех сбрасывает паузу. Ответ без новых заданий — тоже неудача;
// - последние 60 формулировок помнятся, последние 12 уходят серверу в `exclude`;
// - невыданный остаток и показанный, но ещё не отвеченный вопрос хранятся в localStorage сутки:
//   после перезагрузки страницы они отдаются без нового запроса.
// Своё, как было: очередь на каждый ключ `уровень | лексика | грамматика` (аудирование —
// `audio | уровень | лексика`), и пакет, пришедший после смены темы, ложится в очередь своей
// темы, а не пропадает; вопрос с ошибкой возвращается в хвост очереди, но не показывается два
// раза подряд; пока очередь пуста, без ожидания берётся встроенный резерв своей темы.

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
  batchSize: 10,
  lowWaterMark: 3,
  recentLimit: 60,
  serverExcludeLimit: 12,
  retryDelayMs: 15_000,
  // Недоступный, ограниченный или исчерпанный провайдер отвечает так же быстро, как здоровый,
  // и ровный повтор превращает сбой в капель платных попыток.
  retryDelayCeilingMs: 120_000,
  settleMs: 700,
  snapshotTtlMs: 24 * 60 * 60 * 1000,
} as const;

export const POOL_STORAGE_KEY = 'schatzkammer.quiz.pool.v1';

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

export type PoolStorage = Pick<Storage, 'getItem' | 'setItem'>;

interface KeyState {
  queue: GameQuestion[];
  /** Показанный сгенерированный вопрос, пока на него не ответили: он тоже переживает перезагрузку. */
  current: GameQuestion | null;
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

function defaultStorage(): PoolStorage | null {
  try {
    return (globalThis as { localStorage?: PoolStorage }).localStorage ?? null;
  } catch {
    return null;
  }
}

/** Снимок прошлой сессии: очереди по ключам, если ему меньше суток. */
function loadSnapshot(storage: PoolStorage | null): Map<string, GameQuestion[]> {
  const restored = new Map<string, GameQuestion[]>();
  if (!storage) return restored;
  try {
    const saved = JSON.parse(storage.getItem(POOL_STORAGE_KEY) || '{}') as {
      savedAt?: number;
      pools?: Record<string, unknown>;
    };
    if (Date.now() - Number(saved.savedAt || 0) > POOL_RULES.snapshotTtlMs) return restored;
    for (const [key, records] of Object.entries(saved.pools ?? {})) {
      if (!Array.isArray(records)) continue;
      const questions = records
        .map((record, index) => normalizeQuestion(record, index))
        .filter((question): question is GameQuestion => question !== null);
      if (questions.length) restored.set(key, questions);
    }
  } catch {
    // Испорченный снимок — играем без него.
  }
  return restored;
}

export class QuestionPool {
  private readonly states = new Map<string, KeyState>();
  private readonly restored: Map<string, GameQuestion[]>;
  private settings!: LearningSettings;
  private key = '';
  private state!: KeyState;
  private enabled = false;
  private inFlight: Promise<void> | null = null;
  private abort: AbortController | null = null;
  private retryAt = 0;
  private retryDelay: number = POOL_RULES.retryDelayMs;
  /** Тему и уровень часто меняют подряд: запрос уходит, когда выбор устоялся. */
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private epoch = 0;
  private destroyed = false;
  /** Номер текущего вопроса в раунде (с 1). */
  questionNumber = 0;

  constructor(
    settings: LearningSettings,
    private readonly generate: GenerateFn,
    private readonly random: () => number = Math.random,
    private readonly storage: PoolStorage | null = defaultStorage(),
  ) {
    this.restored = loadSnapshot(storage);
    this.select(settings);
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

  /** Смена темы или режима: прежняя очередь сохраняется, запрос по новой уходит через 0,7 с. */
  setSettings(settings: LearningSettings): void {
    if (!this.select(settings)) return;
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      void this.refill();
    }, POOL_RULES.settleMs);
  }

  /** Пополнение идёт, только пока игрок рядом с игрой: в залах и на выборе зала. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) void this.refill();
  }

  refill(): Promise<void> {
    if (!this.enabled || this.destroyed || this.settleTimer) return Promise.resolve();
    if (this.state.queue.length >= POOL_RULES.lowWaterMark) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    if (Date.now() < this.retryAt) return Promise.resolve();
    const epoch = this.epoch;
    const state = this.state;
    const settings = this.settings;
    const controller = new AbortController();
    this.abort = controller;
    const task: Promise<void> = this.generate(
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
        if (this.destroyed) return;
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
        // Ответ без новых заданий — тоже неудача: иначе каждый следующий вопрос запрашивал бы снова.
        if (!accepted.length) throw new Error('no new questions');
        // Пакет оплачен, поэтому ложится в очередь своей темы, даже если игрок её уже сменил.
        state.queue.push(...shuffled(accepted, this.random));
        this.retryAt = 0;
        this.retryDelay = POOL_RULES.retryDelayMs;
        this.persist();
      })
      .catch(() => {
        if (this.destroyed || epoch !== this.epoch) return;
        this.retryAt = Date.now() + this.retryDelay;
        this.retryDelay = Math.min(this.retryDelay * 2, POOL_RULES.retryDelayCeilingMs);
      })
      .finally(() => {
        if (this.abort === controller) this.abort = null;
        if (this.inFlight === task) this.inFlight = null;
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
      next = alternateIndex >= 0 ? state.queue.splice(alternateIndex, 1)[0] : undefined;
    }
    state.current = next ?? null;
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
    this.persist();
    if (state.queue.length < POOL_RULES.lowWaterMark) void this.refill();
    return shuffleQuestion(next, this.random);
  }

  /** Вопрос с ошибкой возвращается в хвост очереди, если его там ещё нет. */
  release(released: GameQuestion): void {
    const fingerprint = questionFingerprint(released);
    if (!this.state.queue.some((queued) => questionFingerprint(queued) === fingerprint)) {
      this.state.queue.push(released);
      this.persist();
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.abort?.abort();
    this.abort = null;
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = null;
  }

  /** Переключиться на очередь ключа; false — ключ не изменился. */
  private select(settings: LearningSettings): boolean {
    this.settings = { ...settings };
    const key = learningPoolKey(settings);
    if (key === this.key) return false;
    // Прежний запрос не отменяется: его пакет ляжет в очередь своей темы.
    this.epoch += 1;
    this.inFlight = null;
    this.retryAt = 0;
    this.key = key;
    let state = this.states.get(key);
    if (!state) {
      const reserve = fallbackQuestionsFor(settings);
      state = {
        queue: this.restored.get(key) ?? [],
        current: null,
        recent: [],
        recentFingerprints: [],
        reserve,
        reserveOrder: reserveIndexes(reserve, settings, this.random),
        reserveCursor: 0,
        lastFingerprint: '',
      };
      this.restored.delete(key);
      this.states.set(key, state);
    }
    this.state = state;
    this.questionNumber = 0;
    return true;
  }

  /** Сохранить сгенерированный остаток всех тем (saveRestartPoolSnapshot в See Escape). */
  private persist(): void {
    if (!this.storage) return;
    const pools: Record<string, GameQuestion[]> = Object.fromEntries(this.restored);
    for (const [key, state] of this.states) {
      const seen = new Set<string>();
      const questions = [...(state.current ? [state.current] : []), ...state.queue].filter((question) => {
        const fingerprint = questionFingerprint(question);
        if (seen.has(fingerprint)) return false;
        seen.add(fingerprint);
        return true;
      });
      if (questions.length) pools[key] = questions;
    }
    try {
      this.storage.setItem(POOL_STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), pools }));
    } catch {
      // Приватный режим или квота — пул просто не переживёт перезагрузку.
    }
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
}
