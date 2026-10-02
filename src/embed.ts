// Встраивание (раздел 13.4): mountTreasury(container, options) → { destroy }.

// Только нужные подмножества: русский интерфейс и немецкие слова.
import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/cyrillic-400.css';
import '@fontsource/rubik/latin-500.css';
import '@fontsource/rubik/cyrillic-500.css';
import '@fontsource/rubik/latin-700.css';
import '@fontsource/rubik/cyrillic-700.css';
import '@fontsource/rubik/latin-800.css';
import '@fontsource/rubik/cyrillic-800.css';
import '@fontsource/rubik/latin-900.css';
import '@fontsource/rubik/cyrillic-900.css';
import '@fontsource/bangers/latin-400.css';
import './ui/styles.css';

import { App, type FinishResult } from './game/App';
import { localStorageAdapter, type KeyValueStorage } from './game/storage';
import type { QuestionProvider } from './questions/types';
import { pickKit } from './art/kits';

export interface TreasuryOptions {
  /** Свой источник вопросов. Без него работает встроенный обучающий движок (как в Conveyor). */
  questions?: QuestionProvider;
  storage?: KeyValueStorage;
  level?: number;
  onFinish?: (r: FinishResult) => void;
}

export function mountTreasury(container: HTMLElement, options: TreasuryOptions): { destroy(): void } {
  const params = new URLSearchParams(location.search);
  const app = new App(container, {
    questions: options.questions,
    storage: options.storage ?? localStorageAdapter('treasury:'),
    level: options.level,
    onFinish: options.onFinish,
    kit: pickKit(params.get('art')),
    debug: params.has('debug'),
    autoQuality: !params.has('test'),
  });
  return { destroy: () => app.destroy() };
}

export type { QuestionProvider, Question, AnswerReport, RecallVerdict } from './questions/types';
export type { FinishResult };
