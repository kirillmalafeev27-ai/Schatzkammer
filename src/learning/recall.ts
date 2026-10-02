// Проверка свободного ответа (режим «Воспроизведение»), общая для сервера и клиента: строгое
// локальное сравнение идёт первым, смысловая проверка на сервере — только если оно не сработало.

export interface RecallEvaluationResult {
  correct: boolean;
  explanation: string;
  correctAnswer: string;
  evaluator: 'local' | 'semantic';
}

export function compactRecallText(value: unknown, maximumLength: number): string {
  if (typeof value !== 'string') return '';
  const withoutControls = Array.from(value)
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 || character === '<' || character === '>' ? ' ' : character;
    })
    .join('');
  return withoutControls.replace(/\s+/gu, ' ').trim().slice(0, maximumLength);
}

/**
 * Сравнение до любого сетевого запроса. Умлауты и их привычные замены ae/oe/ue равнозначны,
 * а немецкая грамматика и порядок слов остаются значимыми.
 */
export function normalizeRecallAnswer(value: unknown): string {
  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : '';
  return text
    .normalize('NFKC')
    .toLocaleLowerCase('de-DE')
    .replace(/ä/gu, 'ae')
    .replace(/ö/gu, 'oe')
    .replace(/ü/gu, 'ue')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function localRecallEvaluation(userAnswer: unknown, expectedAnswer: unknown): RecallEvaluationResult {
  const expected = compactRecallText(expectedAnswer, 600);
  const submitted = compactRecallText(userAnswer, 600);
  const normalizedExpected = normalizeRecallAnswer(expected);
  const normalizedSubmitted = normalizeRecallAnswer(submitted);
  const correct =
    Boolean(normalizedExpected && normalizedSubmitted) && normalizedSubmitted === normalizedExpected;

  return {
    correct,
    explanation: correct
      ? 'Ответ совпадает с эталоном.'
      : 'Нужная немецкая форма или формулировка пока не совпадает с эталоном.',
    correctAnswer: expected,
    evaluator: 'local',
  };
}
