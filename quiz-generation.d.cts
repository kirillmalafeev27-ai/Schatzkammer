// Типы для quiz-generation.cjs — генератора заданий See Escape и «Шахты», скопированного байт в байт.
// Модуль вешает маршруты на express-подобное приложение: app.get / app.post.

interface QuizRequest {
  body: Record<string, unknown>;
  query: Record<string, string>;
}

interface QuizResponse {
  status(code: number): QuizResponse;
  json(body: unknown): void;
  send(body: Uint8Array | string): void;
  setHeader(name: string, value: string | number): void;
}

type QuizHandler = (req: QuizRequest, res: QuizResponse) => unknown;

interface QuizApp {
  get(path: string, handler: QuizHandler): void;
  post(path: string, handler: QuizHandler): void;
}

declare function installQuizRoutes(app: QuizApp): void;

export { installQuizRoutes, type QuizApp, type QuizHandler, type QuizRequest, type QuizResponse };
