import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_DISPLAY_CONTEXT, TASK_FORMATS, wordFieldInstruction } from '../src/learning/formats';

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

function sentPrompt(call = 0): string {
  return sentBody(call).messages[1].content;
}

const base = { level: 'A2', mode: 'recognition', lexicalTopic: 'Alltag & Routinen', count: 4 };

function gap(i: number, patch: Record<string, unknown> = {}) {
  return {
    format: 'luecke',
    context: `Nach dem Umzug helfe ich ___ aus Wohnung Nummer ${i}.`,
    translation: `После переезда я помогаю новой соседке из квартиры номер ${i}.`,
    options: [
      'meiner neuen Nachbarin',
      'meine neue Nachbarin',
      'meiner neue Nachbarin',
      'meinen neuen Nachbarin',
    ],
    correct: 0,
    correctAnswer: 'meiner neuen Nachbarin',
    rule: 'helfen требует Dativ: meiner neuen Nachbarin.',
    ...patch,
  };
}

describe('генерация пакетов (сервер: форматы happy-shannon, синонимы и аудирование Conveyor)', () => {
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

  it('грамматика: запрос собран из свода правил и каталога форматов; брак отбрасывается', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const gen = await load();
    replies.push([
      gap(1),
      gap(2, { context: 'Ich helfe ___ und ___ heute.' }),
      gap(3, { context: 'Я помогаю ___ сегодня утром.' }),
      gap(4, { correctAnswer: 'meine neue Nachbarin' }),
      gap(5, { rule: 'Так говорят в Schatzkammer.' }),
      gap(1),
      gap(6, { options: ['dem', 'den', 'der', 'des'], correctAnswer: 'dem' }),
      gap(7, { format: 'wortstellung' }),
      gap(8, { format: undefined }),
      gap(9),
      gap(10),
      gap(11),
    ]);
    const questions = await gen.generateQuestions({ ...base, grammarTopic: 'Dativ', exclude: ['x'] });
    expect(questions.map((q) => q.context)).toEqual([
      'Nach dem Umzug helfe ich ___ aus Wohnung Nummer 1.',
      'Nach dem Umzug helfe ich ___ aus Wohnung Nummer 9.',
      'Nach dem Umzug helfe ich ___ aus Wohnung Nummer 10.',
      'Nach dem Umzug helfe ich ___ aus Wohnung Nummer 11.',
    ]);
    for (const q of questions) {
      expect(q).toMatchObject({
        level: 'A2',
        lexicalTopic: 'Alltag & Routinen',
        grammarTopic: 'Dativ',
        format: 'luecke',
        prompt: TASK_FORMATS.luecke.instruction,
      });
    }
    const body = sentBody();
    expect(body.model).toBe('model-a');
    expect(body.messages[0].content).toMatch(/сокровищниц/u);
    const prompt = sentPrompt();
    expect(prompt).toMatch(/GRAMMATIK "Dativ"/u);
    expect(prompt).toMatch(/NIVEAU A2/u);
    expect(prompt).toMatch(/SUBSTANZ DER OPTIONEN/u);
    expect(prompt).toMatch(/FORMAT "mehrfachluecke"/u);
    // Модель просят минимум о десяти (порог See Escape) и ещё о запасе на отбраковку.
    expect(prompt).toMatch(/Erstelle genau 14 /u);
    expect(prompt).toMatch(/- x/u);
    // Причины брака видны в логе.
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/\[Dativ A2\] 4\/12 .*Füllwort-Optionen/u);
    warn.mockRestore();
  });

  it('сборка предложения: все части в ответе, инструкция формата; ответ в ```json``` тоже читается', async () => {
    const gen = await load();
    const item = (i: number, answer: string) => ({
      format: 'wortstellung',
      context: `muss${i} / ob / Er fragt, / arbeiten / ich / morgen`,
      translation: 'Он спрашивает, должен ли я завтра работать.',
      options: [
        answer,
        `Er fragt, ob ich muss${i} morgen arbeiten.`,
        `Er fragt, ob muss${i} ich morgen arbeiten.`,
        `Er fragt, ob ich morgen muss${i} arbeiten.`,
      ],
      correct: 0,
      correctAnswer: answer,
      rule: 'В придаточном с ob модальный глагол в конце.',
    });
    const questions = [1, 2, 3, 4, 5].map((i) => item(i, `Er fragt, ob ich morgen arbeiten muss${i}.`));
    questions.splice(1, 0, item(9, 'Er fragt, ob ich arbeiten muss9.'));
    fetchMock.mockImplementationOnce(async () => upstream(questions, true));
    const result = await gen.generateQuestions({ ...base, grammarTopic: 'Wortstellung im Nebensatz' });
    expect(result).toHaveLength(4);
    expect(result.map((q) => q.context.split(' / ')[0])).toEqual(['muss1', 'muss2', 'muss3', 'muss4']);
    expect(new Set(result.map((q) => q.prompt))).toEqual(new Set([TASK_FORMATS.wortstellung.instruction]));
    expect(sentPrompt()).toMatch(/FORMAT "wortstellung"/u);
    expect(sentPrompt()).not.toMatch(/FORMAT "luecke"/u);
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

  it('остатки пакета лежат в пуле комбинации: пополнение из пула идёт без модели и без повторов', async () => {
    const gen = await load();
    replies.push(Array.from({ length: 10 }, (_, i) => gap(i + 1)));
    const spec = { ...base, grammarTopic: 'Dativ' };
    const first = await gen.generateQuestions(spec);
    expect(first).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Список exclude растёт с каждым пополнением, но пул от него не зависит.
    const second = await gen.generateQuestions({ ...spec, exclude: first.map((q) => q.context) });
    expect(second).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const contexts = [...first, ...second].map((q) => q.context);
    expect(new Set(contexts).size).toBe(8);

    // Другая комбинация пул не делит.
    replies.push(Array.from({ length: 10 }, (_, i) => gap(i + 21)));
    expect(await gen.generateQuestions({ ...spec, grammarTopic: 'Akkusativ' })).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // В пуле Dativ осталось два — меньше запроса, поэтому снова модель; остаток пула не теряется.
    replies.push(Array.from({ length: 10 }, (_, i) => gap(i + 41)));
    expect(await gen.generateQuestions(spec)).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await gen.generateQuestions(spec)).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('короткий пакет отдаётся; пустой ставит паузу на повтор', async () => {
    const gen = await load();
    // Первая попытка дала три из четырёх, повтор без response_format — ничего.
    replies.push([gap(1), gap(2), gap(3)], []);
    const spec = { ...base, grammarTopic: 'Dativ' };
    expect(await gen.generateQuestions(spec)).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Набрали столько, сколько просил клиент, — второй платной попытки нет.
    replies.push([gap(11), gap(12), gap(13), gap(14), gap(15)]);
    expect(await gen.generateQuestions({ ...spec, grammarTopic: 'Akkusativ' })).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fetchMock.mockImplementation(async () => new Response('boom', { status: 500 }));
    const other = { ...spec, grammarTopic: 'Genitiv' };
    expect(await gen.generateQuestions(other)).toEqual([]);
    const calls = fetchMock.mock.calls.length;
    expect(await gen.generateQuestions(other)).toEqual([]);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
