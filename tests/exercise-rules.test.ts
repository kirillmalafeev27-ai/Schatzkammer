// Порт test/exercise-rules.test.js из Druckmaschine (ветка happy-shannon): полнота правил,
// разрешимость тем меню, примеры каталога, отбраковка примитивных заданий и сохранность
// законных однословных. Задания генерирует теперь quiz-generation.cjs «Шахты», а эта проверка
// стережёт встроенный резерв: каждое резервное задание проходит её целиком.

import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import {
  GRAMMAR_RULES,
  getTopicFormats,
  renderTopicBlock,
  resolveTopic,
} from '../server/exercises/grammar-rules';
import { buildMixRule } from '../server/exercises/quality-rules';
import { minOptionWords, validateBatch, validateQuestion } from '../server/exercises/exercise-validation';
import { TASK_FORMATS, TASK_FORMAT_IDS, renderFormatCatalogue } from '../src/learning/task-formats';
import { FALLBACK_QUESTIONS } from '../src/learning/questions';
import { GRAMMAR_TOPICS } from '../src/learning/settings';
import { WORD_FIELD_TOPIC } from '../src/learning/formats';

const GRAMMAR_MENU = GRAMMAR_TOPICS.filter((topic) => topic !== WORD_FIELD_TOPIC);

/** Поля, которые «Сокровищница» добавляет к заданию Druckmaschine. */
const RU = { translation: 'Перевод задания.', rule: 'Разбор задания.' };

describe('свод правил и каталог форматов (порт happy-shannon)', () => {
  it('каждая грамматическая тема меню находит свой свод правил', () => {
    assert.deepEqual(
      GRAMMAR_MENU.filter((topic) => !resolveTopic(topic)),
      [],
      'a topic the menu offers has no rule set',
    );
    // ASCII-написания из других игр находят ту же запись.
    assert.equal(resolveTopic('Praeteritum'), 'Präteritum');
    assert.equal(resolveTopic('Relativsaetze'), 'Relativsätze');
    assert.equal(resolveTopic('Possessivartikel'), 'Possessivpronomen in verschiedenen Kasus');
    assert.equal(resolveTopic('Partizip I und II'), 'Partizip I und II als Adjektive');
    assert.equal(resolveTopic('Pronomen'), 'Pronomen');
    assert.equal(resolveTopic('Quantenphysik'), null);
  });

  it('каждая запись полна и ссылается на известные форматы', () => {
    for (const [topic, entry] of Object.entries(GRAMMAR_RULES)) {
      for (const field of ['rule', 'design', 'traps', 'avoid'] as const) {
        assert.ok(entry[field] && entry[field].length > 40, `${topic}: ${field} fehlt oder ist zu knapp`);
      }
      assert.ok(entry.formats.length >= 3, `${topic}: zu wenige Formate`);
      for (const id of entry.formats) assert.ok(TASK_FORMATS[id], `${topic}: unbekanntes Format ${id}`);
    }
  });

  it('пример каждого формата проходит ту же проверку, что и ответ модели', () => {
    for (const id of TASK_FORMAT_IDS) {
      const { example } = TASK_FORMATS[id];
      assert.equal(new Set(example.options).size, 4, `${id}: doppelte Optionen im Beispiel`);
      assert.ok(getTopicFormats(example.topic).includes(id), `${id}: Beispielthema erlaubt das Format nicht`);
      const result = validateQuestion(
        {
          format: id,
          context: example.context,
          options: example.options,
          correct: example.correct,
          correctAnswer: example.options[example.correct],
          ...RU,
        },
        { grammarTopic: example.topic },
      );
      assert.ok(result.ok, `${id}: ${result.ok ? '' : result.reason}`);
    }
  });

  it('у каждого формата есть инструкция и подсказки для обоих режимов', () => {
    for (const format of Object.values(TASK_FORMATS)) {
      assert.ok(/[А-Яа-яЁё]/u.test(format.instruction), `${format.id}: инструкция не по-русски`);
      assert.ok(format.hints.recognition && format.hints.recall && format.recallPlaceholder);
      assert.ok(format.gaps.length > 0);
    }
    // Выбор целого предложения по опорным словам нельзя ввести без вариантов однозначно.
    assert.equal(TASK_FORMATS.satzvarianten.recallable, false);
  });

  it('«Infinitiv mit zu» не допускает чистого задания на пропуск', () => {
    assert.ok(!getTopicFormats('Infinitiv mit zu').includes('luecke'));
    assert.equal(minOptionWords('Infinitiv mit zu'), 3);
  });
});

describe('проверка заданий (порт happy-shannon)', () => {
  it('задание на служебное слово отбраковывается', () => {
    const fillWord = validateQuestion(
      {
        format: 'luecke',
        context: 'Er versucht, den Bahnhof ___ finden.',
        options: ['zu', '–', 'zum', 'um zu'],
        correct: 0,
        correctAnswer: 'zu',
        ...RU,
      },
      { grammarTopic: 'Infinitiv mit zu' },
    );
    assert.equal(fillWord.ok, false);
    assert.match(fillWord.ok ? '' : fillWord.reason, /Füllwort/);

    // Артикли без существительного при падежной теме — то же самое.
    const articles = validateQuestion(
      {
        format: 'luecke',
        context: 'Ich helfe ___ Mann aus dem dritten Stock jeden Morgen.',
        options: ['dem', 'den', 'der', 'des'],
        correct: 0,
        correctAnswer: 'dem',
        ...RU,
      },
      { grammarTopic: 'Dativ' },
    );
    assert.equal(articles.ok, false);
    assert.match(articles.ok ? '' : articles.reason, /Füllwort/);
  });

  it('та же тема как выбор целого предложения принимается', () => {
    const result = validateQuestion(
      {
        format: 'satzvarianten',
        context: 'Sein Zug fährt um sechs. (vorhaben – früh aufstehen)',
        options: [
          'Er hat vor, morgen früh aufzustehen.',
          'Er hat vor, morgen früh zu aufstehen.',
          'Er hat vor, morgen früh aufstehen zu.',
          'Er hat vor, morgen früh aufstehen.',
        ],
        correct: 0,
        correctAnswer: 'Er hat vor, morgen früh aufzustehen.',
        ...RU,
      },
      { grammarTopic: 'Infinitiv mit zu' },
    );
    assert.equal(result.ok, true);
  });

  it('однословные варианты остаются там, где целевое явление — одно слово', () => {
    const result = validateQuestion(
      {
        format: 'dialog',
        context: '___ ich zehn Jahre alt war, ist meine Familie nach Berlin gezogen.',
        options: ['Als', 'Wenn', 'Wann', 'Während'],
        correct: 0,
        correctAnswer: 'Als',
        ...RU,
      },
      { grammarTopic: 'als vs. wenn' },
    );
    assert.equal(result.ok, true);

    // …но только при контексте, который несёт решение.
    const bare = validateQuestion(
      {
        format: 'dialog',
        context: '___ ich klein war.',
        options: ['Als', 'Wenn', 'Wann', 'Während'],
        correct: 0,
        correctAnswer: 'Als',
        ...RU,
      },
      { grammarTopic: 'als vs. wenn' },
    );
    assert.equal(bare.ok, false);
    assert.match(bare.ok ? '' : bare.reason, /Kontext/);
  });

  it('номер ответа и его текст сверяются; расхождение — брак', () => {
    const result = validateQuestion(
      {
        format: 'luecke',
        context: 'Anna hat ___ einen Blumenstrauß geschenkt.',
        options: [
          'ihrer neuen Kollegin',
          'ihre neue Kollegin',
          'ihrer neue Kollegin',
          'ihren neuen Kollegen',
        ],
        correct: 3,
        correctAnswer: 'ihrer neuen Kollegin',
        ...RU,
      },
      { grammarTopic: 'Dativ' },
    );
    assert.equal(result.ok, false);
    assert.match(result.ok ? '' : result.reason, /correctAnswer/);
  });

  it('сломанные задания не проходят', () => {
    const base = {
      format: 'luecke',
      context: 'Am Montag gehe ich mit meiner Schwester ___ ins Kino.',
      correct: 0,
      correctAnswer: 'w',
      ...RU,
    };
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ ...base, options: ['w', 'x', 'y'] }, /statt 4/],
      [{ ...base, options: ['w', 'w', 'y', 'z'] }, /doppelte/],
      [{ ...base, options: ['w', 'x', 'y', 'z'], correct: 9 }, /correct-Index/],
      [{ ...base, context: 'Er geht ___ ins Kino...', options: ['w', 'x', 'y', 'z'] }, /abgeschnitten/],
      [{ ...base, options: ['w ___', 'x', 'y', 'z'], correctAnswer: 'w ___' }, /Lücke/],
      [{ ...base, options: ['w', 'x', 'y', 'z'], format: 'quiz' }, /unbekanntes Format/],
      [{ ...base, options: ['w', 'x', 'y', 'z'], format: 'wortstellung' }, /nicht vorgesehen/],
      [{ ...base, options: ['w', 'x', 'y', 'z'], translation: 'no russian' }, /Übersetzung/],
      [
        { ...base, options: ['w', 'x', 'y', 'z'], context: 'Am Montag gehe ich ___ und ___ ins Kino.' },
        /Lücken/,
      ],
    ];
    for (const [raw, pattern] of cases) {
      const result = validateQuestion(raw, { grammarTopic: 'Präsens' });
      assert.equal(result.ok, false, `${JSON.stringify(raw.options)} ${String(raw.context)} passed`);
      assert.match(result.ok ? '' : result.reason, pattern);
    }
  });

  it('проверки форматов игры: сборка предложения, исправление, двойной пропуск', () => {
    const ordered = validateQuestion(
      {
        format: 'wortstellung',
        context: 'morgen / fahre / ich / nach Berlin',
        options: [
          'Morgen fahre ich nach Berlin.',
          'Morgen ich fahre nach Berlin.',
          'Morgen ich nach Berlin fahre.',
          'Fahre ich morgen nach Berlin.',
        ],
        correct: 0,
        correctAnswer: 'Morgen fahre ich nach Berlin.',
        ...RU,
      },
      { grammarTopic: 'Wortstellung im Hauptsatz' },
    );
    assert.equal(ordered.ok, false, 'fragments already in the right order give the answer away');

    const unchanged = validateQuestion(
      {
        format: 'fehlerkorrektur',
        context: 'Ich bleibe heute zu Hause, weil ich habe Fieber.',
        options: [
          'Ich bleibe heute zu Hause, weil ich habe Fieber.',
          'Ich bleibe heute zu Hause, weil ich Fieber habe.',
          'Ich bleibe heute zu Hause, weil habe ich Fieber.',
          'Ich bleibe heute zu Hause, denn ich Fieber habe.',
        ],
        correct: 0,
        correctAnswer: 'Ich bleibe heute zu Hause, weil ich habe Fieber.',
        ...RU,
      },
      { grammarTopic: 'Wortstellung im Nebensatz' },
    );
    assert.equal(unchanged.ok, false, 'the uncorrected sentence cannot be the answer');

    const halfFilled = validateQuestion(
      {
        format: 'mehrfachluecke',
        context: 'Gestern (1) ___ meine Schwester mit dem Zug nach Hamburg (2) ___ .',
        options: ['ist gefahren', 'hat – gefahren', 'ist – gefahrt', 'hat – gefahrt'],
        correct: 1,
        correctAnswer: 'hat – gefahren',
        ...RU,
      },
      { grammarTopic: 'Perfekt' },
    );
    assert.equal(halfFilled.ok, false);
    assert.match(halfFilled.ok ? '' : halfFilled.reason, /jede Lücke/);
  });

  it('пакет теряет дубли и ограничивает один формат', () => {
    const make = (n: number) => ({
      format: 'satzvarianten',
      context: `Aufgabe Nummer ${n} mit genug Kontext für einen ganzen Satz.`,
      options: [
        `Er hat vor, am ${n}. Mai früh aufzustehen.`,
        `Er hat vor, am ${n}. Mai früh zu aufstehen.`,
        `Er hat vor, am ${n}. Mai früh aufstehen zu.`,
        `Er hat vor, am ${n}. Mai früh aufstehen.`,
      ],
      correct: 0,
      correctAnswer: `Er hat vor, am ${n}. Mai früh aufzustehen.`,
      ...RU,
    });
    const batch = [make(1), make(1), make(2), make(3), make(4), make(5), make(6)];
    const result = validateBatch(batch, { grammarTopic: 'Infinitiv mit zu', count: 10 });
    assert.ok(result.rejected.includes('Aufgabe doppelt'));
    assert.equal(result.questions.length, 6);
    assert.equal(result.formatCounts.satzvarianten, 4, 'the rest waits at the end of the queue');
    assert.equal(result.questions[5].context, make(6).context);
  });
});

describe('свод правил: блок темы и смешивание форматов (порт happy-shannon)', () => {
  it('блок темы содержит все четыре раздела', () => {
    const block = renderTopicBlock('Praeteritum');
    assert.match(block, /GRAMMATIK "Präteritum"/);
    assert.match(block, /AUFGABENDESIGN/);
    assert.match(block, /GUTE FALSCHE OPTIONEN/);
    assert.match(block, /VERBOTEN/);
  });

  it('правило смешивания не требует больше форматов, чем разрешено теме', () => {
    const satzklammer = getTopicFormats('Satzklammer');
    assert.equal(satzklammer.length, 3);
    assert.match(buildMixRule(10, satzklammer), /mindestens 3 VERSCHIEDENE/);
    assert.match(buildMixRule(10, getTopicFormats('Dativ')), /mindestens 4 VERSCHIEDENE/);
    assert.match(renderFormatCatalogue(satzklammer), /FORMAT "wortstellung"/);
  });
});

describe('резерв «Сокровищницы»', () => {
  it('каждое резервное задание проходит проверку ответа модели', () => {
    assert.ok(FALLBACK_QUESTIONS.length >= 30);
    for (const question of FALLBACK_QUESTIONS) {
      assert.ok(question.format, `${question.context}: no format`);
      assert.equal(question.prompt, TASK_FORMATS[question.format].instruction);
      const result = validateQuestion(
        { ...question, correctAnswer: question.options[question.correct] },
        { grammarTopic: question.grammarTopic ?? '' },
      );
      assert.ok(
        result.ok,
        `${question.grammarTopic}: ${question.context} — ${result.ok ? '' : result.reason}`,
      );
    }
  });

  it('резерв покрывает уровни и не меньше шести форматов', () => {
    for (const level of ['A1', 'A2', 'B1', 'B2']) {
      assert.ok(
        FALLBACK_QUESTIONS.some((question) => question.level === level),
        `no reserve item for ${level}`,
      );
    }
    assert.ok(new Set(FALLBACK_QUESTIONS.map((question) => question.format)).size >= 6);
  });
});
