// Сборка запроса на пакет грамматических заданий — перенос `lib/exercise-prompt.js` из
// Druckmaschine (ветка happy-shannon). Описания уровней и порядок блоков — дословно; формат
// ответа — под задание «Сокровищницы»: модель дописывает русский перевод и разбор, а
// инструкцию над заданием ставит игра по формату.

import { renderFormatCatalogue } from '../../src/learning/task-formats.ts';
import { getTopicFormats, renderTopicBlock, resolveTopic } from './grammar-rules.ts';
import {
  ANTI_PATTERNS,
  COVER_TEST,
  DISTRACTOR_QUALITY,
  OPTION_SUBSTANCE,
  SELF_CHECK,
  buildMixRule,
} from './quality-rules.ts';

type LevelSpec = {
  sentenceLength: string;
  structures: string;
  forbidden: string;
  vocabulary: string;
  taskNote: string;
};

/**
 * Описания уровней. «Niveau A2» само по себе мало что говорит модели — ей нужны конкретные
 * границы длины предложения, структур и лексики. В меню «Сокровищницы» уровни A1–B2, поэтому
 * C1 из исходника не перенесён.
 */
export const LEVEL_SPECS: Record<'A1' | 'A2' | 'B1' | 'B2', LevelSpec> = {
  A1: {
    sentenceLength: '6 bis 10 Wörter',
    structures:
      'Präsens, Modalverben, Perfekt der häufigsten Verben, Imperativ, Nominativ und Akkusativ, Possessivartikel, einfache Hauptsätze, Verbindung mit und/oder/aber/denn.',
    forbidden:
      'Genitiv, Konjunktiv, Passiv, Relativsätze, Plusquamperfekt, Partizipialattribute, Nebensätze außer sehr einfachen weil-Sätzen.',
    vocabulary:
      'Nur Alltagswortschatz der ersten Lernmonate: Familie, Wohnung, Essen, Zahlen, Uhrzeit, Einkaufen, Verkehrsmittel.',
    taskNote:
      'Die Aufgaben bleiben kurz und konkret. Der Kontext steht direkt im Satz, nicht zwischen den Zeilen.',
  },
  A2: {
    sentenceLength: '8 bis 14 Wörter',
    structures:
      'Alle Zeiten außer Plusquamperfekt und Futur II, Dativ, Wechselpräpositionen, Komparativ und Superlativ, trennbare und reflexive Verben, Nebensätze mit weil, dass, wenn, Adjektivdeklination nach bestimmtem und unbestimmtem Artikel.',
    forbidden:
      'Konjunktiv I, Passiv in zusammengesetzten Zeiten, erweiterte Partizipialattribute, Nominalisierungen, seltene Genitivpräpositionen.',
    vocabulary: 'Erweiterter Alltagswortschatz: Arbeit, Gesundheit, Reisen, Wetter, Feste, Wohnen, Freizeit.',
    taskNote:
      'Minidialoge und kurze Situationen sind auf diesem Niveau besonders gut, weil der Kontext die Entscheidung tragen kann.',
  },
  B1: {
    sentenceLength: '10 bis 18 Wörter',
    structures:
      'Alle Zeiten, Vorgangs- und Zustandspassiv, Konjunktiv II, Relativsätze, indirekte Fragen, Infinitivsätze mit zu, Genitiv, Doppelkonjunktionen, alle Nebensatztypen.',
    forbidden:
      'Konjunktiv I außer in einfacher indirekter Rede, stark verschachtelte Satzgefüge, Fachsprache.',
    vocabulary: 'Alltag, Beruf, Ausbildung, Medien, Umwelt, Gesellschaft — konkret und gebräuchlich.',
    taskNote:
      'Hier gehören Umformungen und Satzverbindungen zum Standardrepertoire. Der Kontext darf über zwei Sätze laufen.',
  },
  B2: {
    sentenceLength: '14 bis 24 Wörter',
    structures:
      'Passiv in allen Zeiten, Passiversatzformen, Konjunktiv I und II, Partizipialattribute, Nominalisierung und Verbalisierung, Konnektoren wie zumal, sofern, indem, während, mehrgliedrige Satzgefüge.',
    forbidden: 'Enge Fachterminologie, veraltete oder rein literarische Wendungen.',
    vocabulary:
      'Abstrakter: Arbeitswelt, Wissenschaft, Kultur, Politik, Technik — aber allgemein verständlich.',
    taskNote: 'Die Aufgaben dürfen zwei Entscheidungen verlangen, wenn beide zum Thema gehören.',
  },
};

const DEFAULT_LEVEL = 'B1';

export function normalizeLevel(level: unknown): keyof typeof LEVEL_SPECS {
  const key = String(level ?? '')
    .trim()
    .toUpperCase();
  return key in LEVEL_SPECS ? (key as keyof typeof LEVEL_SPECS) : DEFAULT_LEVEL;
}

export function renderLevelBlock(level: unknown) {
  const key = normalizeLevel(level);
  const spec = LEVEL_SPECS[key];
  return `NIVEAU ${key} — halte es strikt ein:
- Satzlänge: ${spec.sentenceLength}.
- Erlaubte Strukturen: ${spec.structures}
- Auf diesem Niveau NICHT verwenden: ${spec.forbidden}
- Wortschatz: ${spec.vocabulary}
- ${spec.taskNote}
Eine Aufgabe, die über dem Niveau liegt, prüft nicht das Thema, sondern den Wortschatz — und ist damit unbrauchbar.`;
}

/**
 * Формат ответа. В отличие от исходника модель не пишет инструкцию (её ставит игра по формату),
 * зато добавляет русский перевод и разбор — их панель вопроса показывает до и после ответа.
 */
export const OUTPUT_JSON = `AUSGABEFORMAT — antworte NUR mit einem validen JSON-Objekt, ohne Markdown, ohne Kommentar, ohne Einleitung:
{
  "questions": [
    {
      "format": "id des verwendeten Formats aus dem Katalog",
      "context": "das deutsche Aufgabenmaterial",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct": 0,
      "correctAnswer": "exakter Text der richtigen Option, Zeichen für Zeichen wie in options",
      "translation": "russische Übersetzung, siehe unten",
      "rule": "kurze russische Erklärung, siehe unten"
    }
  ]
}
"correct" ist der Index (0 bis 3) und "correctAnswer" der wörtliche Text derselben Option. Beide müssen übereinstimmen — daran wird deine Antwort geprüft.
Immer genau vier Optionen. Die Pfeile und Buchstaben aus den Beispielen im Katalog gehören NICHT in die Ausgabe.
"context" und "options" sind rein deutsch, ohne kyrillische Buchstaben. Die russische Anweisung über der Aufgabe setzt das Spiel selbst nach dem Format — schreibe sie nicht.
"translation" ist die vollständige russische Übersetzung der gelösten Aufgabe (Material mit der richtigen Option; bei umformung und fehlerkorrektur der korrekte Satz). Bei den Formaten dialog und bedeutung entscheidet die Bedeutung: Dort übersetzt "translation" nur die Situation und setzt an die Stelle der Lücke „…“ — sonst verrät die Übersetzung die Lösung.
"rule" erklärt auf Russisch in ein bis zwei kurzen Sätzen, welche Regel die Aufgabe entscheidet und woran der stärkste Distraktor scheitert.`;

export type ExercisePromptOptions = {
  level: string;
  grammarTopic: string;
  lexicalTopic?: string;
  /** Сколько заданий просить у модели (с запасом на отбраковку). */
  count?: number;
  /** Уже выданные задания. */
  exclude?: readonly string[];
};

/** В истории задание записано с русской инструкцией впереди; модели нужен только немецкий материал. */
function excludeLine(item: string) {
  const german = item.replace(/^[^A-Za-zÄÖÜäöüß]*(?=[A-Za-zÄÖÜäöüß])/u, '');
  return german || item;
}

/** Полный запрос на пакет грамматических заданий. */
export function buildExercisePrompt(options: ExercisePromptOptions) {
  const { level, grammarTopic, lexicalTopic, count = 10, exclude = [] } = options;
  const questionsCount = Math.max(1, Math.min(20, Number(count) || 10));
  const topic = resolveTopic(grammarTopic) ?? String(grammarTopic ?? '').trim();
  const formats = getTopicFormats(grammarTopic);

  const lexicalBlock = lexicalTopic
    ? `WORTSCHATZTHEMA: ${lexicalTopic}. Alle Aufgaben spielen in diesem Themenfeld — Personen, Orte und Gegenstände stammen daraus. Das Grammatikthema bleibt trotzdem der Prüfgegenstand.`
    : 'WORTSCHATZTHEMA: frei wählbar, aber innerhalb eines Blocks abwechslungsreich.';

  const excludeBlock = exclude.length
    ? `SCHON VERWENDET — diese Aufgabenstellungen nicht wiederholen und auch nicht leicht abwandeln:\n${exclude
        .slice(-20)
        .map((item) => `- ${excludeLine(item)}`)
        .join('\n')}`
    : '';

  return [
    'Du bist erfahrener DaF-Lehrer und Lehrbuchautor. Du schreibst Übungen auf dem Qualitätsniveau von Schritte International, Menschen und Aspekte.',
    `Erstelle genau ${questionsCount} Multiple-Choice-Aufgaben mit je vier Optionen.`,
    `GRAMMATIKTHEMA: ${topic}`,
    lexicalBlock,
    '',
    renderLevelBlock(level),
    '',
    renderTopicBlock(grammarTopic),
    '',
    renderFormatCatalogue(formats),
    '',
    buildMixRule(questionsCount, formats),
    '',
    OPTION_SUBSTANCE,
    '',
    DISTRACTOR_QUALITY,
    '',
    ANTI_PATTERNS,
    '',
    COVER_TEST,
    '',
    excludeBlock,
    '',
    SELF_CHECK,
    '',
    OUTPUT_JSON,
    '',
    `Schreibe jetzt die ${questionsCount} Aufgaben.`,
  ]
    .filter((block) => String(block).trim())
    .join('\n');
}
