import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiHandler } from '../server/api';
import { API_PATHS, fromGenerated, requestQuestions } from '../src/learning/client';
import { AUDIO_DISPLAY_CONTEXT, EXERCISE_FORMATS } from '../src/learning/formats';
import { normalizeQuestion } from '../src/learning/questions';
import { TASK_FORMATS } from '../src/learning/task-formats';
import type { GenerateRequest } from '../src/learning/pool';

const post = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** Ответ модели в формате генератора «Шахты»: AUFGABEN, затем LOESUNGEN. */
function aufgaben(count: number, tag: string) {
  const tasks: string[] = [];
  const keys: string[] = [];
  for (let i = 1; i <= count; i++) {
    tasks.push(
      `${i}. Anweisung: Waehle die richtige Option.\nSatz: Ich helfe ___ Nachbarin ${tag}${i}.\n` +
        `A) der${tag}${i}\nB) die${tag}${i}\nC) den${tag}${i}\nD) dem${tag}${i}`,
    );
    keys.push(`${i}: A = der${tag}${i}`);
  }
  return `AUFGABEN\n${tasks.join('\n\n')}\n\nLOESUNGEN\n${keys.join('\n')}`;
}

describe('генерация — модуль «Шахты» (quiz-generation.cjs) за API «Сокровищницы»', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv('AITUNNEL_API_KEY', 'test-key');
    vi.stubEnv('AI_BASE_URL', 'https://ai.test/v1');
    fetchMock = vi.fn(async () => Response.json({ choices: [{ message: { content: aufgaben(10, 'x') } }] }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('один вызов модели: короткий запрос «Шахты», 10 заданий, gpt-5.4', async () => {
    const api = createApiHandler();
    const response = (await api(
      post('/api/generate-questions', {
        level: 'A2',
        lexicalTopic: 'Alltag & Routinen',
        grammarTopic: 'Dativ',
        isWortstellung: false,
        count: 10,
        exclude: ['Ich helfe ___ Nachbarin.'],
      }),
    ))!;
    expect(response.status).toBe(200);
    const { questions } = await response.json();
    expect(questions).toHaveLength(10);
    expect(questions[0]).toEqual({
      text: 'Waehle die richtige Option.',
      display: 'Ich helfe ___ Nachbarin x1.',
      options: ['derx1', 'diex1', 'denx1', 'demx1'],
      correct: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://ai.test/v1/chat/completions');
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({ model: 'gpt-5.4', max_tokens: 8192 });
    expect(sent.messages).toHaveLength(1);
    const prompt: string = sent.messages[0].content;
    expect(prompt).toMatch(/Erstelle genau 10 deutsche Grammatikuebungen/);
    expect(prompt).toMatch(/Dativpräpositionen/);
    expect(prompt).toMatch(/"Ich helfe ___ Nachbarin\."/);
    // Цена вызова: запрос «Шахты» в шесть раз короче прежнего запроса Druckmaschine (≈16 000 знаков).
    expect(prompt.length).toBeLessThan(4_000);
  });

  it('аудирование — тот же модуль, задания с фразой и русскими вариантами', async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify(
                Array.from({ length: 10 }, (_, i) => ({
                  audioText: `Ich hole heute das Rezept Nummer ${i} ab.`,
                  options: [
                    `Я забираю рецепт ${i}.`,
                    `Я отдаю рецепт ${i}.`,
                    `Я жду рецепт ${i}.`,
                    `Я ищу рецепт ${i}.`,
                  ],
                  correct: 0,
                })),
              ),
            },
          },
        ],
      }),
    );
    const api = createApiHandler();
    const response = (await api(
      post('/api/generate-audio-questions', { level: 'B1', lexicalTopic: 'Gesundheit & Körper', count: 10 }),
    ))!;
    const { questions } = await response.json();
    expect(questions).toHaveLength(10);
    expect(questions[0]).toMatchObject({
      mode: 'audio',
      audioText: 'Ich hole heute das Rezept Nummer 0 ab.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('клиент: запросы и задания как у QuizBankProvider «Шахты»', () => {
  const request: GenerateRequest = {
    level: 'A2',
    mode: 'recognition',
    lexicalTopic: 'Alltag & Routinen',
    grammarTopic: 'Wortstellung im Nebensatz',
    count: 10,
    exclude: ['a', 'b'],
  };

  it('тело запроса — как у «Шахты»; ответ не 200 — ошибка, чтобы пул поставил паузу', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ questions: [] }));
    await requestQuestions(request, new AbortController().signal, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith(API_PATHS.generate, expect.anything());
    expect(
      JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string),
    ).toEqual({
      level: 'A2',
      lexicalTopic: 'Alltag & Routinen',
      grammarTopic: 'Wortstellung im Nebensatz',
      isWortstellung: true,
      count: 10,
      exclude: ['a', 'b'],
    });

    const audio = vi.fn(async () => Response.json({ questions: [] }));
    await requestQuestions(
      { ...request, mode: 'audio' },
      new AbortController().signal,
      audio as unknown as typeof fetch,
    );
    expect(audio).toHaveBeenCalledWith(API_PATHS.audio, expect.anything());

    const failing = vi.fn(async () => new Response('{}', { status: 502 }));
    await expect(
      requestQuestions(request, new AbortController().signal, failing as unknown as typeof fetch),
    ).rejects.toThrow('HTTP 502');
  });

  it('формат задания виден из него самого; инструкция по-русски; перевода и разбора нет', () => {
    const options = ['a1', 'b1', 'c1', 'd1'];
    const cases: Array<[string, string]> = [
      ['Ich bleibe zu Hause, weil ich krank ___.', 'luecke'],
      ['Der Zug ___ um 9 Uhr ___.', 'mehrfachluecke'],
      ['morgen / ich / fahre / nach Berlin', 'wortstellung'],
      ['Welcher Satz ist richtig?', 'satzvarianten'],
    ];
    for (const [display, format] of cases) {
      const record = fromGenerated(
        { text: 'Waehle die richtige Option.', display, options, correct: 2 },
        request,
      );
      const question = normalizeQuestion(record)!;
      expect(question).toMatchObject({
        context: display,
        format,
        prompt: TASK_FORMATS[format as keyof typeof TASK_FORMATS].instruction,
        translation: '',
        rule: '',
        correct: 2,
        grammarTopic: 'Wortstellung im Nebensatz',
      });
    }

    const audio = normalizeQuestion(
      fromGenerated(
        {
          mode: 'audio',
          audioText: 'Ich hole das Rezept ab.',
          options: ['я1', 'я2', 'я3', 'я4'],
          correct: 1,
        },
        { ...request, mode: 'audio' },
      ),
    )!;
    expect(audio).toMatchObject({
      prompt: EXERCISE_FORMATS.audio.instruction,
      context: AUDIO_DISPLAY_CONTEXT,
      audioText: 'Ich hole das Rezept ab.',
      rule: 'Ich hole das Rezept ab.',
    });
    expect(fromGenerated({ display: 'x', options }, request)).toBeNull();
  });
});
