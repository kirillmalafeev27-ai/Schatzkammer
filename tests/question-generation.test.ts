import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_DISPLAY_CONTEXT, wordFieldInstruction } from '../src/learning/formats';

type Generation = typeof import('../server/question-generation');

let fetchMock: ReturnType<typeof vi.fn>;
let replies: unknown[][] = [];

function upstream(questions: unknown[], fenced = false): Response {
  const content = JSON.stringify({ questions });
  return Response.json({
    choices: [{ message: { content: fenced ? `\`\`\`json\n${content}\n\`\`\`` : content } }],
  });
}

async function load(): Promise<Generation> {
  vi.resetModules();
  return import('../server/question-generation');
}

function sentBody(call = 0): { model: string; messages: { role: string; content: string }[] } {
  return JSON.parse(fetchMock.mock.calls[call][1].body as string);
}

function sentTask(call = 0): Record<string, unknown> {
  return JSON.parse(sentBody(call).messages[1].content);
}

const base = { level: 'A2', mode: 'recognition', lexicalTopic: 'Alltag & Routinen', count: 4 };

function gap(i: number, patch: Record<string, unknown> = {}) {
  return {
    prompt: 'Вставьте правильную немецкую форму.',
    context: `Ich helfe ___ Mann Nummer ${i}.`,
    translation: `Я помогаю мужчине номер ${i}.`,
    options: ['dem', 'den', 'der', 'des'],
    correct: 0,
    correctAnswer: 'dem',
    rule: 'Глагол helfen требует Dativ: dem.',
    ...patch,
  };
}

describe('генерация пакетов (сервер, правила Conveyor)', () => {
  beforeEach(() => {
    vi.stubEnv('AITUNNEL_API_KEY', 'test-key');
    vi.stubEnv('AI_BASE_URL', 'https://ai.test/v1');
    vi.stubEnv('AI_MODELS', 'model-a');
    replies = [];
    fetchMock = vi.fn(async () => upstream(replies.shift() ?? []));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('без ключа генерация не готова и в сеть не ходит', async () => {
    vi.stubEnv('AITUNNEL_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    const gen = await load();
    expect(gen.isQuestionGenerationReady()).toBe(false);
    expect(await gen.generateQuestions({ ...base, grammarTopic: 'Dativ' })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('запрос проверяется: неизвестные тема, уровень и режим — ошибка 400', async () => {
    const gen = await load();
    for (const bad of [
      { ...base, grammarTopic: 'Quantenphysik' },
      { ...base, grammarTopic: 'Dativ', level: 'C2' },
      { ...base, grammarTopic: 'Dativ', mode: 'dance' },
      'nonsense',
    ]) {
      await expect(gen.generateQuestions(bad)).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  it('подстановка: в запросе свод правил темы, мир игры запрещён; негодные задания отбрасываются', async () => {
    const gen = await load();
    replies.push([
      gap(1),
      gap(2, { context: 'Ich helfe ___ Mann, ___ Frau.' }),
      gap(3, { context: 'Я помогаю ___.' }),
      gap(4, { correctAnswer: 'den' }),
      gap(5, { rule: 'Так говорят в Schatzkammer.' }),
      gap(1),
      gap(6, { options: ['dem', 'dem', 'der', 'des'] }),
      gap(7),
      gap(8),
      gap(9),
    ]);
    const questions = await gen.generateQuestions({ ...base, grammarTopic: 'Dativ', exclude: ['x'] });
    expect(questions.map((q) => q.context)).toEqual([
      'Ich helfe ___ Mann Nummer 1.',
      'Ich helfe ___ Mann Nummer 7.',
      'Ich helfe ___ Mann Nummer 8.',
      'Ich helfe ___ Mann Nummer 9.',
    ]);
    for (const q of questions) {
      expect(q).toMatchObject({ level: 'A2', lexicalTopic: 'Alltag & Routinen', grammarTopic: 'Dativ' });
    }
    const body = sentBody();
    expect(body.model).toBe('model-a');
    expect(body.messages[0].content).toMatch(/сокровищниц/u);
    const task = sentTask();
    expect(task).toMatchObject({ grammarTopic: 'Dativ', exerciseFormat: 'gap', count: 4, exclude: ['x'] });
    expect(String(task.topicRule)).toMatch(/Dativpräpositionen/u);
    expect(task.qualityRules).toHaveLength(10);
  });

  it('порядок слов: все части в ответе, инструкция темы; ответ модели в ```json``` тоже читается', async () => {
    const gen = await load();
    const item = (i: number, answer: string) => ({
      prompt: 'что угодно',
      context: `Er fragt, / ob / ich / morgen / arbeiten / muss${i}`,
      translation: 'Он спрашивает, должен ли я завтра работать.',
      options: [answer, 'Er fragt, ob ich muss morgen arbeiten.', 'Er fragt, ob muss ich.', 'Er ob fragt.'],
      correct: 0,
      correctAnswer: answer,
      rule: 'В придаточном с ob модальный глагол в конце.',
    });
    const questions = [1, 2, 3, 4, 5].map((i) => item(i, `Er fragt, ob ich morgen arbeiten muss${i}.`));
    questions.splice(1, 0, item(9, 'Er fragt, ob ich arbeiten muss9.'));
    fetchMock.mockImplementationOnce(async () => upstream(questions, true));
    const result = await gen.generateQuestions({ ...base, grammarTopic: 'Wortstellung im Nebensatz' });
    expect(result).toHaveLength(4);
    expect(result.map((q) => q.context.at(-1))).toEqual(['1', '2', '3', '4']);
    expect(new Set(result.map((q) => q.prompt))).toEqual(
      new Set(['Соберите из всех частей придаточное предложение.']),
    );
    expect(sentTask().exerciseFormat).toBe('word-order');
  });

  it('синонимы: четыре синонима одного поля из каталога, каждый верный — один раз за пакет', async () => {
    const gen = await load();
    const item = (context: string, bases: string[], correct: number, field = 'sagen') => ({
      wordField: field,
      context,
      translation: 'Нейтральный перевод с «говорить».',
      options: bases,
      optionBases: bases,
      correct,
      correctAnswer: bases[correct],
      rule: 'Нюанс и сигнал в предложении.',
    });
    const sagen = ['flüstern', 'rufen', 'murmeln', 'behaupten'];
    replies.push([
      item('Das Baby schläft, wir ___ nur.', sagen, 0),
      item('Er ___ das Kind von weitem.', sagen, 1),
      item('Leise ___ sie, das Baby schläft.', sagen, 0),
      item('Sie ___ etwas Unverständliches.', sagen, 2),
      item('Er ___ es ohne Beweis.', ['flüstern', 'rufen', 'murmeln', 'quatschen'], 3),
      item('Wir ___ jetzt.', ['kriegen', 'erben', 'erhalten', 'gewinnen'], 0, 'bekommen'),
      item('Ohne Beweis ___ er das.', sagen, 3),
    ]);
    const result = await gen.generateQuestions({ ...base, grammarTopic: 'Wortfelder & Synonyme' });
    expect(result.map((q) => q.options[q.correct])).toEqual(['flüstern', 'rufen', 'murmeln', 'behaupten']);
    for (const q of result) {
      expect(q.wordFieldBase).toBe('sagen');
      expect(q.prompt).toBe(wordFieldInstruction('sagen'));
    }
    const task = sentTask();
    expect(task.exerciseFormat).toBe('word-field');
    expect((task.wordFields as { base: string }[]).length).toBeGreaterThanOrEqual(2);
  });

  it('аудирование: фраза не печатается, разбор — сама фраза, грамматической темы нет', async () => {
    const gen = await load();
    const item = (sentence: string) => ({
      audioText: sentence,
      options: ['Я забираю рецепт.', 'Я отдаю рецепт.', 'Я забираю чек.', 'Я жду рецепт.'],
      correct: 0,
      correctAnswer: 'Я забираю рецепт.',
      rule: 'что угодно',
    });
    replies.push([
      item('Ich hole heute das Rezept ab.'),
      item('Я забираю рецепт сегодня утром.'),
      item('Ich hole morgen das Rezept ab.'),
      item('Wir holen gleich das Rezept ab.'),
      item('Sie holt jetzt das Rezept ab.'),
    ]);
    const result = await gen.generateQuestions({ ...base, mode: 'audio', grammarTopic: 'Dativ' });
    expect(result).toHaveLength(4);
    for (const q of result) {
      expect(q.context).toBe(AUDIO_DISPLAY_CONTEXT);
      expect(q.translation).toBe('');
      expect(q.rule).toBe(q.audioText);
      expect(q.grammarTopic).toBeUndefined();
    }
    expect(sentTask().exerciseFormat).toBe('audio');
  });

  it('готовый пакет кэшируется; неудача ставит паузу на повтор', async () => {
    const gen = await load();
    replies.push([gap(1), gap(2), gap(3), gap(4)]);
    const spec = { ...base, grammarTopic: 'Dativ' };
    expect(await gen.generateQuestions(spec)).toHaveLength(4);
    expect(await gen.generateQuestions(spec)).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockImplementation(async () => new Response('boom', { status: 500 }));
    const other = { ...spec, grammarTopic: 'Akkusativ' };
    expect(await gen.generateQuestions(other)).toEqual([]);
    const calls = fetchMock.mock.calls.length;
    expect(await gen.generateQuestions(other)).toEqual([]);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
