import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localRecallEvaluation, normalizeRecallAnswer } from '../src/learning/recall';

type Recall = typeof import('../server/recall-evaluation');

async function load(): Promise<Recall> {
  vi.resetModules();
  return import('../server/recall-evaluation');
}

function semantic(content: unknown): Response {
  return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
}

describe('проверка свободного ответа', () => {
  it('регистр, пунктуация и ae/oe/ue не ошибки, а порядок слов и форма — ошибки', () => {
    expect(normalizeRecallAnswer('  Müller, BITTE! ')).toBe('mueller bitte');
    expect(localRecallEvaluation('schliess', 'Schließ').correct).toBe(false);
    expect(localRecallEvaluation('fährt', 'faehrt').correct).toBe(true);
    expect(localRecallEvaluation('ob ich morgen arbeiten muss', 'Ob ich morgen arbeiten muss.').correct).toBe(
      true,
    );
    expect(localRecallEvaluation('ob ich muss morgen arbeiten', 'ob ich morgen arbeiten muss').correct).toBe(
      false,
    );
    expect(localRecallEvaluation('', 'dem').correct).toBe(false);
  });

  describe('сервер', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      vi.stubEnv('AITUNNEL_API_KEY', 'test-key');
      vi.stubEnv('AI_BASE_URL', 'https://ai.test/v1');
      vi.stubEnv('AI_MODELS', 'model-a');
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it('точное совпадение решается на месте, без модели', async () => {
      const recall = await load();
      const result = await recall.evaluateRecallAnswer({ userAnswer: 'MUESSEN', expectedAnswer: 'müssen' });
      expect(result).toMatchObject({ correct: true, evaluator: 'local', correctAnswer: 'müssen' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('равнозначную формулировку принимает модель; ответ со сменой эталона отбрасывается', async () => {
      const recall = await load();
      fetchMock.mockResolvedValueOnce(
        semantic({ correct: true, explanation: 'Тоже верно.', correctAnswer: 'Morgen fahre ich.' }),
      );
      const ok = await recall.evaluateRecallAnswer({
        userAnswer: 'Ich fahre morgen.',
        expectedAnswer: 'Morgen fahre ich.',
      });
      expect(ok).toMatchObject({ correct: true, evaluator: 'semantic', explanation: 'Тоже верно.' });
      const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sent.temperature).toBe(0);
      expect(sent.messages[0].content).toMatch(/недоверенные данные/u);

      // Модель подменила эталон — её ответу не верим, остаётся строгое сравнение.
      fetchMock.mockResolvedValue(
        semantic({ correct: true, explanation: 'Да.', correctAnswer: 'Ich fahre morgen.' }),
      );
      const forged = await recall.evaluateRecallAnswer({
        userAnswer: 'Ich fahre morgen.',
        expectedAnswer: 'Morgen fahre ich.',
      });
      expect(forged).toMatchObject({ correct: false, evaluator: 'local' });
    });

    it('без ответа или эталона — ошибка 400', async () => {
      const recall = await load();
      await expect(
        recall.evaluateRecallAnswer({ userAnswer: '  ', expectedAnswer: 'dem' }),
      ).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });
});
