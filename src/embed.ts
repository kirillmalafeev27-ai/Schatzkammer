// Встраивание (раздел 13.4): mountTreasury(container, options) → { destroy }.

import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/800.css';
import '@fontsource/rubik/900.css';
import '@fontsource/bangers/400.css';
import './ui/styles.css';

import { App, type FinishResult } from './game/App';
import { localStorageAdapter, type KeyValueStorage } from './game/storage';
import type { QuestionProvider } from './questions/types';
import { pickKit } from './art/kits';

export interface TreasuryOptions {
  questions: QuestionProvider;
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
  });
  return { destroy: () => app.destroy() };
}

export type { QuestionProvider, Question, AnswerReport } from './questions/types';
export type { FinishResult };
