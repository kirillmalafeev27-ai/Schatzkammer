// Обучающий движок как источник вопросов игры: пул по правилам «Шахты» (задания генерирует её
// quiz-generation.cjs), форматы и проверка свободного ответа из Conveyor. Вопрос выбирается в момент показа (prefetch = false), чтобы успевшие прийти задания
// из сгенерированного пакета не уступали место резерву. Если сервер сообщил, что генерация
// не настроена, пул не шлёт запросов и сразу играет резервом; без ключа озвучки фразу читает
// голос браузера.

import type { AnswerReport, Question, QuestionProvider, RecallVerdict } from '../questions/types';
import { setProviderSpeech } from './audio.ts';
import { evaluateRecall, requestQuestions, requestStatus, type PoolStatus } from './client.ts';
import {
  exerciseFormatOf,
  exerciseHint,
  wordFieldBank,
  wordFieldFor,
  type GameQuestion,
} from './questions.ts';
import { localRecallEvaluation } from './recall.ts';
import { QuestionPool, type GenerateFn } from './pool.ts';
import type { LearningSettings } from './settings.ts';

/** Сколько последних показанных вопросов помнить, чтобы вернуть ошибочный в очередь. */
const SHOWN_LIMIT = 12;

export interface LearningProviderDeps {
  generate?: GenerateFn;
  evaluate?: (question: GameQuestion, answer: string, settings: LearningSettings) => Promise<RecallVerdict>;
  random?: () => number;
  status?: () => Promise<PoolStatus>;
}

export class LearningProvider implements QuestionProvider {
  readonly prefetch = false;
  private readonly pool: QuestionPool;
  private readonly shown = new Map<string, GameQuestion>();
  private settings: LearningSettings;
  private restartNext = true;
  private enabled = false;
  /** null — сервер ещё не ответил; пока ждём, пул работает как обычно. */
  private generationReady: boolean | null = null;
  private readonly statusPromise: Promise<PoolStatus>;
  private readonly evaluateFn: NonNullable<LearningProviderDeps['evaluate']>;

  constructor(settings: LearningSettings, deps: LearningProviderDeps = {}) {
    this.settings = { ...settings };
    this.pool = new QuestionPool(settings, deps.generate ?? requestQuestions, deps.random);
    this.evaluateFn = deps.evaluate ?? ((question, answer, s) => evaluateRecall(question, answer, s));
    this.statusPromise = (deps.status ?? requestStatus)();
    void this.statusPromise.then((st) => {
      this.generationReady = st.ready;
      setProviderSpeech(st.speech);
      this.applyEnabled();
    });
  }

  get learning(): LearningSettings {
    return { ...this.settings };
  }

  setSettings(settings: LearningSettings): void {
    this.settings = { ...settings };
    this.pool.setSettings(settings);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.applyEnabled();
  }

  private applyEnabled(): void {
    this.pool.setEnabled(this.enabled && this.generationReady !== false);
  }

  /** Начало раунда: первый вопрос может совпасть с последним прошлого раунда. */
  restart(): void {
    this.restartNext = true;
  }

  status(): Promise<PoolStatus> {
    return this.statusPromise;
  }

  next(): Promise<Question> {
    const question = this.pool.next(this.restartNext);
    this.restartNext = false;
    this.shown.delete(question.id);
    this.shown.set(question.id, question);
    while (this.shown.size > SHOWN_LIMIT) this.shown.delete(this.shown.keys().next().value!);
    return Promise.resolve(this.present(question));
  }

  report(r: AnswerReport): void {
    if (r.correct) return;
    const question = this.shown.get(r.id);
    if (question) this.pool.release(question);
  }

  async evaluate(q: Question, answer: string): Promise<RecallVerdict> {
    const question = this.shown.get(q.id);
    if (!question) {
      const expected = q.options[q.correctIndex];
      return localRecallEvaluation(answer, expected).correct
        ? { correct: true, feedback: q.rule ?? '' }
        : { correct: false, feedback: `Пока не совпало. Ответ: ${expected}` };
    }
    return this.evaluateFn(question, answer, this.settings);
  }

  destroy(): void {
    this.pool.destroy();
  }

  private present(question: GameQuestion): Question {
    const mode = this.settings.mode;
    const format = exerciseFormatOf(question, mode);
    const listening = format.id === 'audio';
    // Свободный ответ — только там, где материал задания определяет его однозначно; иначе
    // и в «Воспроизведении» игрок выбирает из вариантов (подсказка говорит об этом).
    const typed = mode === 'recall' && format.recallable;
    const field = wordFieldFor(question.wordFieldBase);
    // Как в Conveyor — уровень и тема из настроек; у аудирования грамматической темы нет.
    const topic = listening ? this.settings.lexicalTopic : this.settings.grammarTopic;
    return {
      id: question.id,
      prompt: question.context,
      promptLang: listening ? 'ru' : 'de',
      options: [...question.options],
      optionsLang: listening ? 'ru' : 'de',
      correctIndex: question.correct,
      instruction: question.prompt,
      meta: `${this.settings.level} · ${topic}`,
      translation: listening ? undefined : question.translation || undefined,
      rule: question.rule,
      audioText: question.audioText,
      wordField: field ? { base: field.base, bank: wordFieldBank(field) } : undefined,
      hint: exerciseHint(format, mode),
      recall: typed ? { placeholder: format.recallPlaceholder } : undefined,
    };
  }
}
