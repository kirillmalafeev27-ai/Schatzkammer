// Интерфейс вопросов (раздел 12): игра не знает, откуда берутся вопросы.
// Необязательные поля — форматы обучающего движка (как в Conveyor): инструкция, перевод, разбор,
// аудирование, поле слова и свободный ответ. Простой источник может их не заполнять.

export interface Question {
  id: string;
  /** Текст задания. */
  prompt: string;
  promptLang: 'de' | 'ru';
  /** 2–4 варианта. */
  options: string[];
  optionsLang: 'de' | 'ru';
  correctIndex: number;
  /** Инструкция над заданием (по-русски); без неё — «Выбери верный ответ». */
  instruction?: string;
  /** Уровень и тема — короткая метка рядом с инструкцией. */
  meta?: string;
  /** Перевод под заданием. */
  translation?: string;
  /** Разбор: показывается после ответа. */
  rule?: string;
  /** Аудирование: фраза звучит и не печатается. */
  audioText?: string;
  /** Поле слова: стёртое слово и все его синонимы. */
  wordField?: { base: string; bank: string[] };
  /** Подсказка над ответами. */
  hint?: string;
  /** Ответ вводится текстом (режим «Воспроизведение»); варианты не показываются. */
  recall?: { placeholder: string };
}

export interface AnswerReport {
  id: string;
  correct: boolean;
  timeMs: number;
}

export interface RecallVerdict {
  correct: boolean;
  /** Строка разбора. */
  feedback: string;
}

export interface QuestionProvider {
  next(): Promise<Question>;
  report(r: AnswerReport): void;
  /** Проверка свободного ответа; без неё ответ сравнивается с верным вариантом. */
  evaluate?(q: Question, answer: string): Promise<RecallVerdict>;
  /**
   * false — не загружать следующий вопрос заранее: источник отвечает сразу и выбирает лучше,
   * когда вопрос действительно нужен (например, пока идёт пополнение пула).
   */
  prefetch?: boolean;
}
