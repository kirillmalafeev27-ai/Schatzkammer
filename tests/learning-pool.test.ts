import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POOL_RULES, QuestionPool, type GenerateRequest } from '../src/learning/pool';
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

describe('пул вопросов (правила Conveyor)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('выключенный пул не ходит на сервер и сразу отдаёт резерв своей темы', () => {
    const { generate } = controlledGenerate();
    const pool = new QuestionPool(settings, generate, () => 0.3);
    const first = pool.next(true);
    expect(generate).not.toHaveBeenCalled();
    expect(first.id.startsWith('reserve-')).toBe(true);
    expect(first.grammarTopic === 'Präsens' || first.lexicalTopic === 'Alltag & Routinen').toBe(true);
    expect(pool.questionNumber).toBe(1);
  });

  it('пакет из 8 заданий запрашивается, когда в очереди меньше 3; один запрос на всех', async () => {
    const { calls, generate } = controlledGenerate();
    const pool = new QuestionPool(settings, generate);
    pool.setEnabled(true);
    void pool.refill();
    void pool.refill();
    expect(calls).toHaveLength(1);
    expect(calls[0].request).toMatchObject({ ...settings, count: 8, exclude: [] });

    calls[0].resolve(batch());
    await flush();
    expect(pool.queued).toBe(8);

    // Очередь тратится; пока в ней 3 и больше, новых запросов нет.
    for (let i = 0; i < 5; i++) expect(isGenerated(pool.next())).toBe(true);
    expect(calls).toHaveLength(1);
    pool.next();
    expect(pool.queued).toBe(2);
    expect(calls).toHaveLength(2);
    expect(calls[1].request.exclude).toHaveLength(6);
  });

  it('варианты перемешиваются, верный ответ сохраняется', async () => {
    const { calls, generate } = controlledGenerate();
    let r = 0;
    const pool = new QuestionPool(settings, generate, () => [0.9, 0.1, 0.6, 0.3][r++ % 4]);
    pool.setEnabled(true);
    calls[0].resolve(batch());
    await flush();
    for (let i = 0; i < 6; i++) {
      const q = pool.next();
      expect(q.options[q.correct].startsWith('richtig')).toBe(true);
    }
  });

  it('в exclude уходят последние 60 формулировок из 80 запомненных', async () => {
    const { calls, generate } = controlledGenerate();
    const pool = new QuestionPool(settings, generate);
    const shown: string[] = [];
    for (let i = 0; i < 90; i++) shown.push(questionHistoryLabel(pool.next()));
    pool.setEnabled(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].request.exclude).toEqual(shown.slice(-80).slice(-60));
  });

  it('пустой ответ — повтор через 12 секунд, не раньше', async () => {
    const { calls, generate } = controlledGenerate();
    const pool = new QuestionPool(settings, generate);
    pool.setEnabled(true);
    calls[0].resolve([]);
    await flush();
    await vi.advanceTimersByTimeAsync(POOL_RULES.retryDelayMs - 100);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(calls).toHaveLength(2);
    pool.setEnabled(false);
    calls[1].resolve([]);
    await vi.advanceTimersByTimeAsync(POOL_RULES.retryDelayMs * 3);
    expect(calls).toHaveLength(2);
  });

  it('вопрос с ошибкой возвращается в хвост и не повторяется сразу', async () => {
    const { calls, generate } = controlledGenerate();
    const pool = new QuestionPool(settings, generate);
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
    const pool = new QuestionPool(settings, generate);
    const shown = pool.next(true);
    pool.setEnabled(true);
    calls[0].resolve([{ ...shown, id: 'other' }, ...batch(3)]);
    await flush();
    expect(pool.queued).toBe(3);
  });

  it('узнавание и воспроизведение делят очередь; аудирование — своя; устаревший ответ не попадает в чужую', async () => {
    const { calls, generate } = controlledGenerate();
    const pool = new QuestionPool(settings, generate);
    pool.setEnabled(true);
    calls[0].resolve(batch());
    await flush();
    pool.setSettings({ ...settings, mode: 'recall' });
    expect(pool.queued).toBe(8);
    expect(calls).toHaveLength(1);

    pool.setSettings({ ...settings, mode: 'audio' });
    expect(pool.poolKey).toBe('audio|A2|Alltag & Routinen');
    expect(pool.queued).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls[1].request.mode).toBe('audio');
    expect(pool.next().audioText).toBeTruthy();

    // Ответ на запрос аудирования приходит после возврата к письменному режиму.
    pool.setSettings(settings);
    expect(calls[1].signal.aborted).toBe(true);
    calls[1].resolve(batch());
    await flush();
    expect(pool.queued).toBe(8);
    pool.setSettings({ ...settings, mode: 'audio' });
    expect(pool.queued).toBe(0);
  });

  it('резерв не показывает один вопрос дважды подряд', () => {
    const { generate } = controlledGenerate();
    const pool = new QuestionPool({ ...settings, level: 'A1' }, generate, Math.random);
    let last = '';
    for (let i = 0; i < 200; i++) {
      const fingerprint = questionFingerprint(pool.next());
      expect(fingerprint).not.toBe(last);
      last = fingerprint;
    }
  });
});
