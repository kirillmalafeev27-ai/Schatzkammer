import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  POOL_RULES,
  POOL_STORAGE_KEY,
  QuestionPool,
  type GenerateRequest,
  type PoolStorage,
} from '../src/learning/pool';
import { questionFingerprint, questionHistoryLabel, type GameQuestion } from '../src/learning/questions';
import type { LearningSettings } from '../src/learning/settings';

const settings: LearningSettings = {
  level: 'A2',
  mode: 'recognition',
  lexicalTopic: 'Alltag & Routinen',
  grammarTopic: 'Präsens',
};

let serial = 0;
function record(tag = serial++) {
  return {
    prompt: 'Вставьте правильную немецкую форму.',
    context: `Satz ${tag} ___ heute.`,
    translation: 'Предложение на сегодня.',
    options: [`richtig${tag}`, `falsch${tag}a`, `falsch${tag}b`, `falsch${tag}c`],
    correct: 0,
    rule: `Правило ${tag}.`,
  };
}

function batch(n: number = POOL_RULES.batchSize) {
  return Array.from({ length: n }, () => record());
}

interface Call {
  request: GenerateRequest;
  signal: AbortSignal;
  resolve: (records: unknown[]) => void;
}

function controlledGenerate() {
  const calls: Call[] = [];
  const generate = vi.fn(
    (request: GenerateRequest, signal: AbortSignal) =>
      new Promise<unknown[]>((resolve) => calls.push({ request, signal, resolve })),
  );
  return { calls, generate };
}

const isGenerated = (q: GameQuestion) => q.id.startsWith('question-');
const flush = () => vi.advanceTimersByTimeAsync(0);

function memoryStorage(): PoolStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

/** Пул без localStorage — для проверок, которым снимок не нужен. */
const poolOf = (
  generate: ReturnType<typeof controlledGenerate>['generate'],
  s = settings,
  random = Math.random,
) => new QuestionPool(s, generate, random, null);

describe('пул вопросов (правила «Шахты»)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('выключенный пул не ходит на сервер и сразу отдаёт резерв своей темы', () => {
    const { generate } = controlledGenerate();
    const pool = poolOf(generate, settings, () => 0.3);
    const first = pool.next(true);
    expect(generate).not.toHaveBeenCalled();
    expect(first.id.startsWith('reserve-')).toBe(true);
    expect(first.grammarTopic === 'Präsens' || first.lexicalTopic === 'Alltag & Routinen').toBe(true);
    expect(pool.questionNumber).toBe(1);
  });

  it('пакет из 10 заданий запрашивается, когда в очереди меньше 3; один запрос на всех', async () => {
    const { calls, generate } = controlledGenerate();
    const pool = poolOf(generate);
    pool.setEnabled(true);
    void pool.refill();
    void pool.refill();
    expect(calls).toHaveLength(1);
    expect(calls[0].request).toMatchObject({ ...settings, count: 10, exclude: [] });

    calls[0].resolve(batch());
    await flush();
    expect(pool.queued).toBe(10);

    // Очередь тратится; пока в ней 3 и больше, новых запросов нет.
    for (let i = 0; i < 7; i++) expect(isGenerated(pool.next())).toBe(true);
    expect(calls).toHaveLength(1);
    pool.next();
    expect(pool.queued).toBe(2);
    expect(calls).toHaveLength(2);
    expect(calls[1].request.exclude).toHaveLength(8);
  });

  it('варианты перемешиваются, верный ответ сохраняется', async () => {
    const { calls, generate } = controlledGenerate();
    let r = 0;
    const pool = poolOf(generate, settings, () => [0.9, 0.1, 0.6, 0.3][r++ % 4]);
    pool.setEnabled(true);
    calls[0].resolve(batch());
    await flush();
    for (let i = 0; i < 6; i++) {
      const q = pool.next();
      expect(q.options[q.correct].startsWith('richtig')).toBe(true);
    }
  });

  it('в exclude уходят последние 12 формулировок', async () => {
    const { calls, generate } = controlledGenerate();
    const pool = poolOf(generate);
    const shown: string[] = [];
    for (let i = 0; i < 90; i++) shown.push(questionHistoryLabel(pool.next()));
    pool.setEnabled(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].request.exclude).toEqual(shown.slice(-12));
  });

  it('после неудачи — пауза 15 с, каждая следующая подряд вдвое дольше, до двух минут; успех сбрасывает', async () => {
    const { calls, generate } = controlledGenerate();
    const pool = poolOf(generate);
    pool.setEnabled(true);
    // Таймеров нет: попытку запускает следующий вопрос, если пауза уже прошла.
    const waitFor = async (pause: number) => {
      const before = calls.length;
      await vi.advanceTimersByTimeAsync(pause - 100);
      pool.next();
      expect(calls).toHaveLength(before);
      await vi.advanceTimersByTimeAsync(200);
      pool.next();
      expect(calls).toHaveLength(before + 1);
    };
    for (const pause of [15_000, 30_000, 60_000, 120_000, 120_000]) {
      calls[calls.length - 1].resolve([]);
      await flush();
      await waitFor(pause);
    }
    // Ответ без новых заданий — тоже неудача.
    calls[calls.length - 1].resolve([pool.next()]);
    await flush();
    await waitFor(120_000);

    // Пришло мало, но пришло: пауза сброшена, недобор запрашивается сразу, а неудача — снова 15 с.
    calls[calls.length - 1].resolve(batch(2));
    await flush();
    expect(pool.queued).toBe(2);
    const before = calls.length;
    pool.next();
    expect(calls).toHaveLength(before + 1);
    calls[calls.length - 1].resolve([]);
    await flush();
    await waitFor(POOL_RULES.retryDelayMs);
  });

  it('вопрос с ошибкой возвращается в хвост и не повторяется сразу', async () => {
    const { calls, generate } = controlledGenerate();
    const pool = poolOf(generate);
    pool.setEnabled(true);
    calls[0].resolve(batch(4));
    await flush();
    const wrong = pool.next();
    pool.release(wrong);
    pool.release(wrong);
    const order = [pool.next(), pool.next(), pool.next(), pool.next()].map(questionFingerprint);
    expect(order[0]).not.toBe(questionFingerprint(wrong));
    expect(order.filter((f) => f === questionFingerprint(wrong))).toHaveLength(1);
    expect(order[3]).toBe(questionFingerprint(wrong));
  });

  it('повтор прямо за собой отбрасывается и из пакета', async () => {
    const { calls, generate } = controlledGenerate();
    const pool = poolOf(generate);
    const shown = pool.next(true);
    pool.setEnabled(true);
    calls[0].resolve([{ ...shown, id: 'other' }, ...batch(3)]);
    await flush();
    expect(pool.queued).toBe(3);
  });

  it('смена темы: запрос уходит, когда выбор устоялся; пакет после смены темы ложится в свою очередь', async () => {
    const { calls, generate } = controlledGenerate();
    const pool = poolOf(generate);
    pool.setEnabled(true);
    calls[0].resolve(batch());
    await flush();
    // Узнавание и воспроизведение делят очередь.
    pool.setSettings({ ...settings, mode: 'recall' });
    expect(pool.queued).toBe(10);

    // Щелчки по темам подряд: запрос один — по последней, через 0,7 с.
    pool.setSettings({ ...settings, grammarTopic: 'Dativ' });
    await vi.advanceTimersByTimeAsync(300);
    pool.setSettings({ ...settings, mode: 'audio' });
    expect(pool.poolKey).toBe('audio|A2|Alltag & Routinen');
    expect(pool.queued).toBe(0);
    expect(pool.next().audioText).toBeTruthy();
    await vi.advanceTimersByTimeAsync(POOL_RULES.settleMs - 10);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(20);
    expect(calls).toHaveLength(2);
    expect(calls[1].request.mode).toBe('audio');

    // Ответ на запрос аудирования приходит после возврата к письменному режиму: он оплачен
    // и ложится в очередь аудирования, а не в чужую и не в корзину.
    pool.setSettings(settings);
    expect(calls[1].signal.aborted).toBe(false);
    calls[1].resolve(batch());
    await flush();
    expect(pool.queued).toBe(10);
    pool.setSettings({ ...settings, mode: 'audio' });
    expect(pool.queued).toBe(10);
  });

  it('остаток и показанный вопрос переживают перезагрузку; резерв не сохраняется; снимок живёт сутки', async () => {
    const storage = memoryStorage();
    const { calls, generate } = controlledGenerate();
    const first = new QuestionPool(settings, generate, Math.random, storage);
    first.next(true);
    expect(storage.data.get(POOL_STORAGE_KEY) ?? '').not.toMatch(/reserve-/);
    first.setEnabled(true);
    calls[0].resolve(batch());
    await flush();
    const shown = first.next();
    expect(isGenerated(shown)).toBe(true);

    // Новая страница: показанный, но не отвеченный вопрос и девять невыданных — на месте, без запроса.
    const second = new QuestionPool(settings, generate, Math.random, storage);
    expect(second.queued).toBe(10);
    second.setEnabled(true);
    expect(calls).toHaveLength(1);
    expect(questionFingerprint(second.next(true))).toBe(questionFingerprint(shown));

    vi.setSystemTime(Date.now() + POOL_RULES.snapshotTtlMs + 60_000);
    expect(new QuestionPool(settings, generate, Math.random, storage).queued).toBe(0);
  });

  it('резерв не показывает один вопрос дважды подряд', () => {
    const { generate } = controlledGenerate();
    const pool = poolOf(generate, { ...settings, level: 'A1' });
    let last = '';
    for (let i = 0; i < 200; i++) {
      const fingerprint = questionFingerprint(pool.next());
      expect(fingerprint).not.toBe(last);
      last = fingerprint;
    }
  });
});
