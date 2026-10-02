import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiHandler } from '../server/api';

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const generateBody = {
  level: 'A2',
  mode: 'recognition',
  lexicalTopic: 'Alltag & Routinen',
  grammarTopic: 'Präsens',
};

describe('API обучающего движка', () => {
  beforeEach(() => {
    for (const key of [
      'AITUNNEL_API_KEY',
      'AI_TUNNEL_API_KEY',
      'AITUNNEL_TOKEN',
      'OPENAI_API_KEY',
      'AI_API_KEY',
    ])
      vi.stubEnv(key, '');
    for (const key of ['ELEVENLABS_API_KEY', 'ELEVEN_API_KEY', 'ELEVENLABS_KEY']) vi.stubEnv(key, '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('статус не раскрывает ключи — только готовность генерации и озвучки', async () => {
    const api = createApiHandler();
    const response = (await api(new Request('http://localhost/api/questions/status')))!;
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ ready: false, speech: false });
  });

  it('без ключа генерация отвечает пустым пакетом, клиент играет резервом', async () => {
    const api = createApiHandler();
    const response = (await api(post('/api/questions/generate', generateBody)))!;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ questions: [] });
  });

  it('плохой JSON, чужая тема и слишком большое тело отклоняются', async () => {
    const api = createApiHandler();
    expect((await api(post('/api/questions/generate', '{oops')))!.status).toBe(400);
    expect((await api(post('/api/questions/generate', { ...generateBody, grammarTopic: 'x' })))!.status).toBe(
      400,
    );
    expect((await api(post('/api/questions/generate', { pad: 'x'.repeat(20_000) })))!.status).toBe(413);
  });

  it('частота ограничена: 6 пакетов в минуту на клиента', async () => {
    const api = createApiHandler();
    const from = (ip: string) => post('/api/questions/generate', generateBody, { 'X-Forwarded-For': ip });
    for (let i = 0; i < 6; i++) expect((await api(from('1.1.1.1')))!.status).toBe(200);
    const limited = (await api(from('1.1.1.1')))!;
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    expect((await api(from('2.2.2.2')))!.status).toBe(200);
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
    expect((await api(post('/api/tts', { text: 'x'.repeat(500) })))!.status).toBe(413);
  });

  it('чужой метод — 405, неизвестный путь API — 404, всё остальное не API', async () => {
    const api = createApiHandler();
    expect((await api(new Request('http://localhost/api/questions/generate')))!.status).toBe(405);
    expect((await api(new Request('http://localhost/api/nothing')))!.status).toBe(404);
    expect((await api(new Request('http://localhost/healthz')))!.status).toBe(200);
    expect(await api(new Request('http://localhost/index.html'))).toBeNull();
  });
});
