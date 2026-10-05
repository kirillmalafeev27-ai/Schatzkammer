import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiHandler } from '../server/api';

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const generateBody = { level: 'A2', lexicalTopic: 'Alltag & Routinen', grammarTopic: 'Präsens' };

describe('API: генератор «Шахты» и проверка свободного ответа', () => {
  beforeEach(() => {
    for (const key of [
      'AITUNNEL_API_KEY',
      'AI_TUNNEL_API_KEY',
      'AITUNNEL_TOKEN',
      'OPENAI_API_KEY',
      'AI_API_KEY',
    ])
      vi.stubEnv(key, '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('статус — как у «Шахты»: готовность генерации и озвучки, модель, ключей нет', async () => {
    const api = createApiHandler();
    const response = (await api(new Request('http://localhost/api/quiz/status')))!;
    expect(response.status).toBe(200);
    const status = await response.json();
    expect(status).toMatchObject({ ok: true, generationConfigured: false, models: ['gpt-5.4'] });
    expect(JSON.stringify(status)).not.toMatch(/key/i);
    expect((await api(new Request('http://localhost/api/quiz/status', { method: 'HEAD' })))!.status).toBe(
      200,
    );
  });

  it('без ключа генерация отвечает 503 с причиной — клиент ставит паузу и играет резервом', async () => {
    const api = createApiHandler();
    const response = (await api(post('/api/generate-questions', generateBody)))!;
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/not configured/);
  });

  it('без уровня и темы, с плохим JSON и со слишком большим телом — отказ', async () => {
    const api = createApiHandler();
    expect((await api(post('/api/generate-questions', { level: 'A2' })))!.status).toBe(400);
    expect((await api(post('/api/generate-audio-questions', {})))!.status).toBe(400);
    expect((await api(post('/api/generate-questions', '{oops')))!.status).toBe(400);
    expect((await api(post('/api/generate-questions', { pad: 'x'.repeat(20_000) })))!.status).toBe(413);
  });

  it('частота ограничена: 6 пакетов в минуту на клиента', async () => {
    const api = createApiHandler();
    const from = (ip: string) => post('/api/generate-questions', generateBody, { 'X-Forwarded-For': ip });
    for (let i = 0; i < 6; i++) expect((await api(from('1.1.1.1')))!.status).toBe(503);
    const limited = (await api(from('1.1.1.1')))!;
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    expect((await api(from('2.2.2.2')))!.status).toBe(503);
  });

  it('свободный ответ проверяется на месте, если модель не настроена', async () => {
    const api = createApiHandler();
    const response = (await api(
      post('/api/questions/evaluate', { userAnswer: 'Faehrt', expectedAnswer: 'fährt' }),
    ))!;
    expect(await response.json()).toMatchObject({ correct: true, evaluator: 'local' });
    const bad = (await api(post('/api/questions/evaluate', { userAnswer: '' })))!;
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'invalid_request' });
  });

  it('озвучка без ключа — 503: клиент читает фразу голосом браузера', async () => {
    const api = createApiHandler();
    const response = (await api(post('/api/tts', { text: 'Guten Morgen' })))!;
    expect(response.status).toBe(503);
    expect((await api(post('/api/tts', { text: 'x'.repeat(500) })))!.status).toBe(400);
    expect((await api(post('/api/tts', { text: 'x'.repeat(5_000) })))!.status).toBe(413);
  });

  it('чужой метод — 405, неизвестный путь API — 404, всё остальное не API', async () => {
    const api = createApiHandler();
    const wrong = (await api(new Request('http://localhost/api/generate-questions')))!;
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get('allow')).toBe('POST');
    expect(
      (await api(new Request('http://localhost/api/questions/generate', { method: 'POST' })))!.status,
    ).toBe(404);
    expect((await api(new Request('http://localhost/api/nothing')))!.status).toBe(404);
    expect((await api(new Request('http://localhost/healthz')))!.status).toBe(200);
    expect(await api(new Request('http://localhost/index.html'))).toBeNull();
  });
});
