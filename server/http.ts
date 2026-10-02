// Общие части API: ограничение частоты по клиенту и в целом, чтение JSON с пределом размера.
// Пределы и порядок проверок — как в маршрутах Conveyor.

export class HttpError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

export interface ClientInfo {
  /** Адрес сокета — если перед сервером нет прокси. */
  address?: string;
}

/**
 * Ключ клиента. Ближайший прокси дописывает адрес последним, поэтому последний элемент
 * X-Forwarded-For надёжнее первого, который задаёт сам клиент. Общий потолок ниже действует,
 * даже если подделан каждый заголовок.
 */
export function clientKey(request: Request, info: ClientInfo = {}): string {
  const forwardedAddress = request.headers
    .get('x-forwarded-for')
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .at(-1);
  return (forwardedAddress ?? request.headers.get('x-real-ip') ?? info.address ?? 'shared')
    .trim()
    .slice(0, 96);
}

export interface RateLimiterOptions {
  windowMs: number;
  clientLimit: number;
  globalLimit: number;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const requestsByClient = new Map<string, number[]>();
  let globalRequests: number[] = [];
  return function withinRateLimit(client: string, now = Date.now()): boolean {
    const cutoff = now - options.windowMs;
    globalRequests = globalRequests.filter((time) => time > cutoff);
    if (globalRequests.length >= options.globalLimit) return false;

    const recent = (requestsByClient.get(client) ?? []).filter((time) => time > cutoff);
    if (recent.length >= options.clientLimit) {
      requestsByClient.set(client, recent);
      return false;
    }
    recent.push(now);
    globalRequests.push(now);
    requestsByClient.set(client, recent);
    if (requestsByClient.size > 2_000) {
      for (const [key, times] of requestsByClient) {
        if (!times.some((time) => time > cutoff)) requestsByClient.delete(key);
      }
    }
    return true;
  };
}

/** Тело запроса читается потоком и обрывается, как только превышает предел. */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const advertisedLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(advertisedLength) && advertisedLength > maxBytes) {
    throw new HttpError('Request body is too large', 413);
  }
  if (!request.body) throw new HttpError('Request body is required');

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError('Request body is too large', 413);
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError('Invalid request body');
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new HttpError('Invalid JSON body');
  }
}

export const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE_HEADERS, ...headers } });
}
