// Проверка ответа модели — перенос `lib/exercise-validation.js` из Druckmaschine (ветка
// happy-shannon). Что запрос не может гарантировать, проверяет код: задание без нужной
// субстанции, с дублями, оборванное или с расхождением между номером и текстом ответа
// отбрасывается, а причина попадает в лог — по ней видно, на чём спотыкается модель.
//
// Дополнения «Сокровищницы»: формат обязателен и должен быть разрешён теме (по нему игра ставит
// инструкцию и считает пропуски), число пропусков сверяется с форматом, сборка предложения
// тратит все части, исправленный вариант не совпадает с предложением с ошибкой, однословные
// варианты требуют предложения не короче восьми слов, перевод — русский.

import {
  TASK_FORMATS,
  gapCount,
  gapParts,
  isTaskFormatId,
  type TaskFormatId,
} from '../../src/learning/task-formats.ts';
import { usesEveryFragment, wordOrderFragments } from '../../src/learning/formats.ts';
import { maxPerFormat } from './quality-rules.ts';
import { getTopicFormats, resolveTopic } from './grammar-rules.ts';

/**
 * Сколько субстанции должно быть в варианте — машинная сторона правила субстанции из
 * `quality-rules.ts`. Темы, где целевое явление действительно одно слово (союз, предлог при
 * управлении, значение модального глагола, форма глагола, местоимение), не входят ни в один
 * список: там однословный вариант законен.
 */

/** Целевая структура — именная группа: одного артикля мало. */
export const PHRASE_TOPICS = new Set([
  'Nominativ',
  'Akkusativ',
  'Dativ',
  'Genitiv',
  'N-Deklination',
  'Adjektivdeklination',
  'Reflexive Verben',
  'Wechselpräpositionen',
  // Темы меню «Сокровищницы»:
  'Werden',
  'Sein vs. haben',
  'Relativpronomen',
  'Komparativ',
  'Superlativ',
  'Zahlen und Datum',
  'Präpositionen mit Dativ',
  'Präpositionen mit Akkusativ',
  'Genitivpräpositionen',
]);

/** Целевая структура — группа слов или целое предложение. */
export const SENTENCE_TOPICS = new Set([
  'Infinitiv mit zu',
  'Relativsätze',
  'Wortstellung im Hauptsatz',
  'Wortstellung im Nebensatz',
  'Satzklammer',
  'Trennbare Verben',
  'Passiv',
  'Zustandspassiv',
  'Plusquamperfekt',
  'Konjunktiv I',
  'Konjunktiv II',
  'Partizip I und II als Adjektive',
  'Indirekte Fragen',
  'Doppelkonjunktionen',
  'Lassen',
  // Темы меню «Сокровищницы»:
  'Untrennbare Verben',
  'damit-Sätze',
]);

/** Минимальное число слов, которого должен достичь хотя бы один вариант. */
export function minOptionWords(grammarTopic: unknown) {
  const topic = resolveTopic(grammarTopic);
  if (!topic) return 1;
  if (SENTENCE_TOPICS.has(topic)) return 3;
  if (PHRASE_TOPICS.has(topic)) return 2;
  return 1;
}

const MIN_SENTENCE_WORDS = 4;
/** Однословные варианты допустимы, только если решение несёт контекст не короче этого. */
const MIN_CONTEXT_WORDS_FOR_SINGLE_WORDS = 8;

export function normalizeText(value: unknown) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[„“”«»"']/g, '')
    .trim()
    .toLowerCase();
}

export function wordCount(value: unknown) {
  const text = String(value ?? '').trim();
  return text ? text.split(/\s+/).length : 0;
}

/** Слова материала без пропусков, номеров пропусков и тире реплик. */
function contextWords(context: string) {
  return context
    .replace(/\(\d\)/g, ' ')
    .replace(/___/g, ' ')
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

function cleanLine(value: unknown, maximum: number) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const withoutControls = Array.from(String(value))
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 || character === '<' || character === '>' ? ' ' : character;
    })
    .join('');
  return withoutControls.replace(/_{3,}/g, '___').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

export function answerLetterToIndex(letter: unknown) {
  return ['A', 'B', 'C', 'D'].indexOf(
    String(letter ?? '')
      .trim()
      .toUpperCase(),
  );
}

const CYRILLIC = /[А-Яа-яЁё]/u;
const LATIN = /[A-Za-zÄÖÜäöüß]/u;

/** Задание, прошедшее проверку: формат, немецкий материал, варианты, перевод и разбор. */
export type ValidatedQuestion = {
  format: TaskFormatId;
  context: string;
  options: [string, string, string, string];
  correct: 0 | 1 | 2 | 3;
  translation: string;
  rule: string;
};

export type ValidationResult = { ok: true; question: ValidatedQuestion } | { ok: false; reason: string };

export type ValidationContext = {
  grammarTopic: string;
};

/**
 * Проверяет одно задание. Возвращает очищенное задание или причину отказа — причины идут в лог
 * и показывают, на чём модель спотыкается сейчас.
 */
export function validateQuestion(raw: unknown, context: ValidationContext): ValidationResult {
  const reject = (reason: string): ValidationResult => ({ ok: false, reason });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return reject('kein Objekt');
  const source = raw as Record<string, unknown>;

  const display = cleanLine(source.context ?? source.display, 360);
  if (!display) return reject('Aufgabenmaterial fehlt');
  if (CYRILLIC.test(display) || !LATIN.test(display)) return reject('Aufgabenmaterial nicht deutsch');

  const rawOptions = Array.isArray(source.options) ? source.options : [];
  const options = rawOptions.map((option) => cleanLine(option, 180));
  if (options.length !== 4) return reject(`${options.length} statt 4 Optionen`);
  if (options.some((option) => !option)) return reject('leere Option');
  if (options.some((option) => option.includes('___'))) return reject('Lücke steht in der Option');
  if (options.some((option) => CYRILLIC.test(option))) return reject('Option nicht deutsch');
  if (new Set(options.map(normalizeText)).size !== 4) return reject('doppelte Optionen');

  // Оборванные предложения — модель остановилась на полуслове.
  if ([display, ...options].some((value) => /(\.\.\.|…)\s*$/.test(value))) {
    return reject('abgeschnittener Satz');
  }

  let correct = Number.isInteger(source.correct) ? Number(source.correct) : Number.NaN;
  if (!Number.isInteger(correct)) correct = answerLetterToIndex(source.correct);
  if (!Number.isInteger(correct) || correct < 0 || correct > 3) return reject('ungültiger correct-Index');

  // Перекрёстная проверка: номер и выписанный текст ответа должны указывать на один вариант.
  // Расходятся — значит, модель считала наугад; такое задание не берём.
  const claimed = cleanLine(source.correctAnswer ?? source.answer, 180);
  if (!claimed) return reject('correctAnswer fehlt');
  if (normalizeText(claimed) !== normalizeText(options[correct])) {
    return reject('correctAnswer passt nicht zu options[correct]');
  }

  // ПРОВЕРКА СУБСТАНЦИИ — главное средство против примитивных заданий. Если ВСЕ четыре варианта
  // не дотягивают до минимума темы, это запрещённое задание на служебное слово: например,
  // «zu / – / zum / um zu» для «Infinitiv mit zu» или «den / der / dem / dessen» для «Relativsätze».
  const minWords = minOptionWords(context.grammarTopic);
  if (minWords > 1 && options.every((option) => wordCount(option) < minWords)) {
    return reject(`Füllwort-Optionen: Thema verlangt mindestens ${minWords} Wörter je Option`);
  }

  // Вариант без единого немецкого слова («–» вместо «ничего») — тот же след задания на
  // служебное слово; если субстанции хватило, отбрасываем его здесь.
  if (options.some((option) => !LATIN.test(option))) return reject('Option ohne deutsches Wort');

  // Разрешены только форматы, которые стоят в каталоге для этой темы. Формат, который модель
  // придумала сама, не может выкупить себе исключения.
  const declared = String(source.format ?? '')
    .trim()
    .toLowerCase();
  if (!isTaskFormatId(declared))
    return reject(declared ? `unbekanntes Format "${declared}"` : 'Format fehlt');
  if (!getTopicFormats(context.grammarTopic).includes(declared)) {
    return reject(`Format "${declared}" ist für das Thema nicht vorgesehen`);
  }
  const format = TASK_FORMATS[declared];

  const gaps = gapCount(display);
  if (!format.gaps.includes(gaps)) return reject(`Format "${declared}" mit ${gaps} Lücken`);
  if (declared === 'mehrfachluecke' && options.some((option) => gapParts(option).length !== gaps)) {
    return reject('Mehrfachlücke: Optionen füllen nicht jede Lücke');
  }
  if (declared === 'wortstellung') {
    const fragments = wordOrderFragments(display);
    if (fragments.length < 3) return reject('Satzbau: zu wenige Bausteine');
    if (!usesEveryFragment(display, options[correct])) {
      return reject('Satzbau: Lösung benutzt nicht genau die Bausteine');
    }
    if (
      normalizeText(fragments.join(' ')).replace(/[.,!?]/g, '') ===
      normalizeText(options[correct]).replace(/[.,!?]/g, '')
    ) {
      return reject('Satzbau: Bausteine stehen schon in der richtigen Reihenfolge');
    }
  }
  if (declared === 'fehlerkorrektur' && normalizeText(options[correct]) === normalizeText(display)) {
    return reject('Fehlerkorrektur: Lösung wiederholt den Fehlersatz');
  }

  // Однословные варианты допустимы лишь тогда, когда решение несёт контекст.
  if (
    options.every((option) => wordCount(option) === 1) &&
    contextWords(display) < MIN_CONTEXT_WORDS_FOR_SINGLE_WORDS
  ) {
    return reject('Einwortoptionen ohne tragenden Kontext (unter acht Wörtern)');
  }

  // Форматам предложений нужны предложения, а не обрывки; формату без пропуска — тоже.
  if (format.sentenceOptions || gaps === 0) {
    const sentenceLike = options.filter((option) => wordCount(option) >= MIN_SENTENCE_WORDS).length;
    if (sentenceLike < 3) return reject(`Format "${declared}" verlangt vollständige Sätze`);
  }

  // Слишком разные по длине варианты выдают ответ.
  const lengths = options.map((option) => option.length);
  if (Math.max(...lengths) > 5 * Math.min(...lengths)) return reject('Optionen zu unterschiedlich lang');

  const translation = cleanLine(source.translation, 360);
  if (!CYRILLIC.test(translation)) return reject('russische Übersetzung fehlt');
  const rule = cleanLine(source.rule ?? source.explanation, 360);
  if (rule.length < 4) return reject('Erklärung fehlt');

  return {
    ok: true,
    question: {
      format: declared,
      context: display,
      options: options as ValidatedQuestion['options'],
      correct: correct as ValidatedQuestion['correct'],
      translation,
      rule,
    },
  };
}

export type BatchContext = ValidationContext & {
  /** Сколько заданий нужно; от него считается предел на один формат. */
  count: number;
  /** Уже выданные задания (немецкий материал или история клиента). */
  exclude?: readonly string[];
  /** Проверки игры поверх общих: вернуть причину отказа или null. */
  check?: (question: ValidatedQuestion) => string | null;
};

/**
 * Проверяет весь пакет, убирает дубли и ограничивает частоту одного формата, чтобы не отдавать
 * десять заданий по одному шаблону.
 */
export function validateBatch(rawQuestions: unknown, context: BatchContext) {
  const list = Array.isArray(rawQuestions) ? rawQuestions : [];
  const limit = maxPerFormat(context.count);
  const accepted: ValidatedQuestion[] = [];
  const overflow: ValidatedQuestion[] = [];
  const rejected: string[] = [];
  const seenDisplays = new Set((context.exclude ?? []).map(normalizeText).filter(Boolean));
  const formatCounts: Partial<Record<TaskFormatId, number>> = {};

  for (const raw of list) {
    const result = validateQuestion(raw, context);
    if (!result.ok) {
      rejected.push(result.reason);
      continue;
    }
    const extra = context.check?.(result.question);
    if (extra) {
      rejected.push(extra);
      continue;
    }
    const key = normalizeText(result.question.context);
    if (seenDisplays.has(key)) {
      rejected.push('Aufgabe doppelt');
      continue;
    }
    seenDisplays.add(key);

    const used = formatCounts[result.question.format] ?? 0;
    // Сверх предела задание уходит в конец очереди, а не в брак: лучше однообразный пакет,
    // чем пустой.
    if (used >= limit) {
      overflow.push(result.question);
      continue;
    }
    formatCounts[result.question.format] = used + 1;
    accepted.push(result.question);
  }

  return { questions: [...accepted, ...overflow], rejected, formatCounts };
}

/** Строка лога: сколько заданий принято и почему отброшены остальные. */
export function describeRejections(label: string, received: number, accepted: number, rejected: string[]) {
  const counts = new Map<string, number>();
  for (const reason of rejected) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  const reasons = [...counts].map(([reason, n]) => (n > 1 ? `${reason} ×${n}` : reason)).join('; ');
  return `[${label}] ${accepted}/${received} Aufgaben übernommen${reasons ? `; aussortiert: ${reasons}` : ''}`;
}
