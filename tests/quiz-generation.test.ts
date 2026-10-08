import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiHandler } from '../server/api';
import { API_PATHS, fromGenerated, generatedFormatOf, requestQuestions } from '../src/learning/client';
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

/** Ответ модели на Perfekt — по заданию каждого из пяти типов TOPIC_TASK_MIX. */
const PERFEKT_REPLY = `AUFGABEN
1. Anweisung: Setze das Partizip II ein.
Satz: Wir haben gestern bis acht Uhr ___. (arbeiten)
A) gearbeitet
B) arbeitet
C) geärbeitet
D) gearbeiten

2. Anweisung: Ergaenze beide Luecken.
Satz: Gestern ___ ich um sechs Uhr ___. (aufstehen)
A) habe – aufgestanden
B) bin – aufgestanden
C) bin – aufgesteht
D) habe – aufgesteht

3. Anweisung: Setze den Satz ins Perfekt.
Satz: Der Bus fährt um acht ab. → Perfekt
A) Der Bus hat um acht abgefahren.
B) Der Bus ist um acht abgefahren.
C) Der Bus ist um acht abgefährt.
D) Der Bus ist abgefahren um acht.

4. Anweisung: Waehle die korrigierte Fassung.
Satz: Sie hat am Sonntag nach Hause gegangen. (1 Fehler)
A) Sie hat am Sonntag nach Hause gegangen.
B) Sie ist am Sonntag nach Hause gegeht.
C) Sie ist am Sonntag nach Hause gegangen.
D) Sie hat am Sonntag nach Hause gegeht.

5. Anweisung: Bilde den Satz im Perfekt.
Woerter: eine Pizza / gestern / gegessen / habe / ich
A) Gestern ich habe eine Pizza gegessen.
B) Gestern habe ich gegessen eine Pizza.
C) Gestern habe ich eine Pizza gegessen.
D) Gestern gegessen habe ich eine Pizza.

LOESUNGEN
1: A = gearbeitet
2: B = bin – aufgestanden
3: B = Der Bus ist um acht abgefahren.
4: C = Sie ist am Sonntag nach Hause gegangen.
5: C = Gestern habe ich eine Pizza gegessen.`;

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

  it('Perfekt: в запросе смесь пяти типов вместо «одна Lücke»; каждый тип доходит до игры своим форматом', async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({ choices: [{ message: { content: PERFEKT_REPLY } }] }),
    );
    const api = createApiHandler();
    const request: GenerateRequest = {
      level: 'A2',
      mode: 'recognition',
      lexicalTopic: 'Freizeit & Hobbys',
      grammarTopic: 'Perfekt',
      count: 10,
      exclude: [],
    };
    const response = (await api(post('/api/generate-questions', { ...request, isWortstellung: false })))!;
    const { questions } = await response.json();

    const prompt: string = JSON.parse(fetchMock.mock.calls[0][1].body as string).messages[0].content;
    expect(prompt).toMatch(/Aufgabentypen fuer "Perfekt"/);
    expect(prompt).toMatch(/Hoechstens 1 Aufgabe, in der nur haben\/sein gewaehlt wird/);
    expect(prompt).not.toMatch(/genau einer Luecke/);
    // Смесь удлиняет запрос по Perfekt примерно на 1 600 знаков — он всё ещё втрое короче прежнего.
    expect(prompt.length).toBeLessThan(5_000);

    const games = questions.map((raw: unknown) => normalizeQuestion(fromGenerated(raw, request))!);
    expect(games.map((q: { format?: string }) => q.format)).toEqual([
      'luecke',
      'mehrfachluecke',
      'umformung',
      'fehlerkorrektur',
      'wortstellung',
    ]);
    for (const q of games)
      expect(q.prompt).toBe(TASK_FORMATS[q.format as keyof typeof TASK_FORMATS].instruction);
    expect(games[1].options[games[1].correct]).toBe('bin – aufgestanden');
    expect(games[4].options[games[4].correct]).toBe('Gestern habe ich eine Pizza gegessen.');
  });

  it('у других тем запрос прежний: одна Lücke', async () => {
    const api = createApiHandler();
    await api(
      post('/api/generate-questions', {
        level: 'A2',
        lexicalTopic: 'Freizeit & Hobbys',
        grammarTopic: 'Akkusativ',
        count: 10,
      }),
    );
    const prompt: string = JSON.parse(fetchMock.mock.calls[0][1].body as string).messages[0].content;
    expect(prompt).toMatch(/genau einer Luecke/);
    expect(prompt).not.toMatch(/Aufgabentypen/);
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
      ['Ich kaufe ein Brot. → Perfekt', 'umformung'],
      ['Er hat nach Hause gegangen. (1 Fehler)', 'fehlerkorrektur'],
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
    // Дробь в обычном предложении — ещё не сборка предложения.
    expect(generatedFormatOf('Die Fahrt kostet 3 / 4 Euro ___.')).toBe('luecke');
    expect(generatedFormatOf('Er sagt ja / nein.')).toBe('satzvarianten');
  });
});
