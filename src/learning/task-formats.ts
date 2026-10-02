// Каталог форматов заданий — перенос `lib/exercise-formats.js` из Druckmaschine (ветка happy-shannon).
//
// Игрок видит три вещи: инструкцию по-русски, немецкий материал задания (`context`) и четыре
// варианта. Варианты — полные строки, поэтому целые предложения в них допустимы технически.
// Именно на этом держится каталог: задание должно требовать настоящего грамматического решения,
// а не клика по одному служебному слову.
//
// Немецкие поля (`name`, `display`, `options`, `useFor`, пример и `why`) уходят генератору дословно.
// Русские поля — то, что показывает панель вопроса.

export type TaskFormatId =
  | 'satzvarianten'
  | 'umformung'
  | 'verbindung'
  | 'fehlerkorrektur'
  | 'dialog'
  | 'mehrfachluecke'
  | 'wortstellung'
  | 'bedeutung'
  | 'luecke';

export type TaskFormatExample = {
  topic: string;
  level: string;
  context: string;
  options: readonly [string, string, string, string];
  correct: 0 | 1 | 2 | 3;
  why: string;
};

export type TaskFormat = {
  id: TaskFormatId;
  /** Название формата по-русски — для логов и документации. */
  label: string;
  /** Немецкое название — уходит генератору. */
  name: string;
  /** Инструкция над заданием: её ставит сервер, модель её не пишет. */
  instruction: string;
  /** Что стоит в `context` (немецкое описание для генератора). */
  display: string;
  /** Что такое четыре варианта (немецкое описание для генератора). */
  options: string;
  /** Для каких тем формат хорош (немецкое описание для генератора). */
  useFor: string;
  example: TaskFormatExample;
  /** Сколько пропусков ___ допускает `context`. */
  gaps: readonly number[];
  /** Варианты — целые предложения, а не часть фразы. */
  sentenceOptions: boolean;
  /**
   * Можно ли ответить без вариантов (режим «Воспроизведение»). Нельзя там, где материал
   * задания не определяет ответ однозначно: в выборе целого предложения по опорным словам
   * свободный ответ допускал бы десяток верных формулировок.
   */
  recallable: boolean;
  recallPlaceholder: string;
  hints: { recognition: string; recall: string };
};

const CHOICE_ONLY_HINT = 'В этом формате ответ выбирается из вариантов.';

export const TASK_FORMATS: Record<TaskFormatId, TaskFormat> = {
  satzvarianten: {
    id: 'satzvarianten',
    label: 'Выбор целого предложения',
    name: 'Satzvarianten (Vollsatz-Auswahl)',
    instruction: 'Выбери грамматически правильный вариант.',
    display:
      'Eine Situation in einem Satz, dazu in Klammern das Wortmaterial (Verben, Stichwörter), aus dem der Satz gebaut werden soll.',
    options:
      'Vier VOLLSTÄNDIGE deutsche Sätze mit identischem Wortmaterial. Sie unterscheiden sich ausschließlich im Zielphänomen (Form, Position, Klammer).',
    useFor:
      'Satzbau, Satzklammer, Infinitiv mit zu, Nebensätze, Verbstellung, trennbare Verben, Passiv, Konjunktiv.',
    example: {
      topic: 'Infinitiv mit zu',
      level: 'B1',
      context: 'Sein Zug fährt um sechs. (vorhaben – früh aufstehen)',
      options: [
        'Er hat vor, morgen früh aufzustehen.',
        'Er hat vor, morgen früh zu aufstehen.',
        'Er hat vor, morgen früh aufstehen zu.',
        'Er hat vor, morgen früh aufstehen.',
      ],
      correct: 0,
      why: 'Alle vier Optionen sind vollständige Sätze mit demselben Wortmaterial. Geprüft wird nur die Stellung von "zu" beim trennbaren Verb. Niemand kann die Lösung an der Optionslänge oder an einem Nebenfehler ablesen.',
    },
    gaps: [0],
    sentenceOptions: true,
    recallable: false,
    recallPlaceholder: 'Напиши предложение целиком',
    hints: {
      recognition: 'Варианты различаются в одном месте — найди его.',
      recall: CHOICE_ONLY_HINT,
    },
  },

  umformung: {
    id: 'umformung',
    label: 'Преобразование',
    name: 'Umformung (Transformation)',
    instruction: 'Преобразуй предложение по заданию.',
    display:
      'Ein korrekter Ausgangssatz in Form A und eine PRÄZISE Angabe der Zielform ("ins Passiv Präsens", "ins Präteritum", "als indirekte Frage").',
    options: 'Vier vollständige Sätze in Form B.',
    useFor:
      'Passiv, Präteritum, Perfekt, Plusquamperfekt, Konjunktiv II, Konjunktiv I, indirekte Fragen, Relativsätze, Nominalisierung.',
    example: {
      topic: 'Passiv',
      level: 'B1',
      context: 'Ins Passiv Präsens umformen: "Der Mechaniker repariert das Auto."',
      options: [
        'Das Auto wird vom Mechaniker repariert.',
        'Das Auto wird von dem Mechaniker reparieren.',
        'Das Auto ist vom Mechaniker repariert.',
        'Das Auto wurde vom Mechaniker repariert.',
      ],
      correct: 0,
      why: 'Option 3 (Zustandspassiv) und Option 4 (Präteritum) sind für sich genommen wohlgeformte Sätze — die Anweisung "Passiv Präsens" schließt sie eindeutig aus. Das ist erlaubt und stark, WEIL die Zielform exakt benannt ist.',
    },
    gaps: [0],
    sentenceOptions: true,
    recallable: true,
    recallPlaceholder: 'Напиши предложение целиком',
    hints: {
      recognition: 'Подходит только вариант ровно в той форме, что названа в задании.',
      recall: 'Преобразуй предложение и напиши его целиком.',
    },
  },

  verbindung: {
    id: 'verbindung',
    label: 'Соединение предложений',
    name: 'Satzverbindung',
    instruction: 'Соедини два предложения в одно.',
    display:
      'Zwei korrekte Einzelsätze, dazu das geforderte Verbindungsmittel (Konjunktion, Relativsatz, Doppelkonjunktion).',
    options: 'Vier vollständige zusammengesetzte Sätze.',
    useFor:
      'Relativsätze, weil/dass/obwohl/wenn, als vs. wenn, Doppelkonjunktionen, indirekte Fragen, Infinitivsätze.',
    example: {
      topic: 'Relativsätze',
      level: 'B1',
      context:
        'Verbinde mit einem Relativsatz: "Der Turm ist sehr alt." + "Man kann den Turm vom Bahnhof aus sehen."',
      options: [
        'Der Turm, den man vom Bahnhof aus sehen kann, ist sehr alt.',
        'Der Turm, der man vom Bahnhof aus sehen kann, ist sehr alt.',
        'Der Turm, dem man vom Bahnhof aus sehen kann, ist sehr alt.',
        'Der Turm, den man kann vom Bahnhof aus sehen, ist sehr alt.',
      ],
      correct: 0,
      why: 'Der Lernende muss den Kasus aus der Funktion im Relativsatz ableiten (Akkusativ) UND die Verbstellung halten. Drei verschiedene, real belegte Fehler als Distraktoren.',
    },
    gaps: [0],
    sentenceOptions: true,
    recallable: true,
    recallPlaceholder: 'Напиши предложение целиком',
    hints: {
      recognition: 'Проверь и связку, и место глагола в каждом варианте.',
      recall: 'Соедини предложения и напиши результат целиком.',
    },
  },

  fehlerkorrektur: {
    id: 'fehlerkorrektur',
    label: 'Исправление ошибки',
    name: 'Fehlerkorrektur',
    instruction: 'В предложении одна ошибка. Выбери исправленный вариант.',
    display: 'Ein Satz mit GENAU EINEM Fehler, der zum Thema gehört.',
    options:
      'Vier vollständige Sätze: einer ist korrigiert, einer wiederholt den unveränderten Fehlersatz, zwei "korrigieren" falsch.',
    useFor: 'Alle Themen, besonders Wortstellung, Kasus, Verbformen, Negation.',
    example: {
      topic: 'Wortstellung im Nebensatz',
      level: 'A2',
      context: 'Ich bleibe heute zu Hause, weil ich habe Fieber.',
      options: [
        'Ich bleibe heute zu Hause, weil ich Fieber habe.',
        'Ich bleibe heute zu Hause, weil habe ich Fieber.',
        'Ich bleibe heute zu Hause, weil ich habe Fieber.',
        'Ich bleibe heute zu Hause, denn ich Fieber habe.',
      ],
      correct: 0,
      why: 'Option 3 ist der unveränderte Fehlersatz — ein starker Distraktor für Lernende, die den Fehler nicht sehen. Option 4 prüft zusätzlich die Abgrenzung weil/denn, bleibt aber im Thema Wortstellung.',
    },
    gaps: [0],
    sentenceOptions: true,
    recallable: true,
    recallPlaceholder: 'Напиши исправленное предложение',
    hints: {
      recognition: 'Один из вариантов повторяет ошибку — не попадись.',
      recall: 'Исправь ошибку и напиши предложение целиком.',
    },
  },

  dialog: {
    id: 'dialog',
    label: 'Мини-диалог',
    name: 'Minidialog / Kontextentscheidung',
    instruction: 'Прочитай ситуацию и выбери подходящий вариант.',
    display:
      'Zwei bis drei Zeilen Dialog oder eine kurze Situation. Die Lücke steht in der Antwort. NUR der Kontext entscheidet — die Form allein reicht nicht.',
    options: 'Vier Varianten, die alle grammatisch möglich wären; nur eine passt zur Situation.',
    useFor:
      'Modalverben (Bedeutung), als vs. wenn, Perfekt gegen Präteritum, Artikel (bestimmt/unbestimmt), Negation und doch, Konjunktiv II, Wechselpräpositionen.',
    example: {
      topic: 'Modalverben',
      level: 'A2',
      context:
        '— Muss ich das Formular heute abgeben? — Nein, du ___ es nicht heute abgeben. Du hast noch bis Freitag Zeit.',
      options: ['musst', 'darfst', 'sollst', 'kannst'],
      correct: 0,
      why: 'Hier sind Einwortoptionen richtig, weil das Zielphänomen tatsächlich EIN Wort ist: die Bedeutung des Modalverbs. Die Entscheidung trägt der Kontext ("noch bis Freitag Zeit" = keine Notwendigkeit, nicht Verbot). "darfst" wäre ein Verbot — der klassische Fehler.',
    },
    gaps: [1],
    sentenceOptions: false,
    recallable: true,
    recallPlaceholder: 'Напиши слово или фразу',
    hints: {
      recognition: 'Решает ситуация: прочитай реплики целиком.',
      recall: 'Впиши то, что подходит по ситуации.',
    },
  },

  mehrfachluecke: {
    id: 'mehrfachluecke',
    label: 'Двойной пропуск',
    name: 'Mehrfachlücke / Kombinationsmatrix',
    instruction: 'Заполни оба пропуска.',
    display: 'Ein Satz mit zwei (selten drei) nummerierten Lücken, die grammatisch zusammenhängen.',
    options:
      'Jede Option liefert den KOMPLETTEN Satz von Einsetzungen, getrennt durch " – ". Am besten als 2×2-Matrix: zwei Entscheidungen, vier Kombinationen.',
    useFor:
      'Perfekt (Hilfsverb + Partizip), Adjektivdeklination, Kasus bei zwei Objekten, Reflexivpronomen + Artikel, Relativpronomen + Verbstellung, Modalverben im Präteritum.',
    example: {
      topic: 'Perfekt',
      level: 'A2',
      context: 'Gestern (1) ___ meine Schwester mit dem Zug nach Hamburg (2) ___ .',
      options: ['ist – gefahren', 'hat – gefahren', 'ist – gefahrt', 'hat – gefahrt'],
      correct: 0,
      why: 'Eine saubere 2×2-Matrix: Achse 1 ist die Hilfsverbwahl, Achse 2 die Partizipbildung. Raten bringt 25 Prozent, halbes Wissen bringt 50 Prozent — beides ist sichtbar. Kein Distraktor scheitert an etwas Themenfremdem.',
    },
    gaps: [2, 3],
    sentenceOptions: false,
    recallable: true,
    recallPlaceholder: 'Слова для пропусков по порядку',
    hints: {
      recognition: 'Каждый вариант заполняет все пропуски сразу.',
      recall: 'Впиши слова для всех пропусков по порядку, через пробел.',
    },
  },

  wortstellung: {
    id: 'wortstellung',
    label: 'Сборка предложения',
    name: 'Satzbau aus Bausteinen',
    instruction: 'Составь предложение из данных частей.',
    display:
      'Die Satzglieder durch " / " getrennt in ZUFÄLLIGER Reihenfolge — niemals schon in der richtigen.',
    options: 'Vier vollständige Sätze aus genau diesen Bausteinen.',
    useFor:
      'Wortstellung im Haupt- und Nebensatz, Satzklammer, TeKaMoLo, trennbare Verben, Negationsposition.',
    example: {
      topic: 'Wortstellung im Hauptsatz',
      level: 'A2',
      context: 'ins Kino / heute Abend / mit meiner Schwester / ich / gehe',
      options: [
        'Heute Abend gehe ich mit meiner Schwester ins Kino.',
        'Heute Abend ich gehe mit meiner Schwester ins Kino.',
        'Heute Abend ich mit meiner Schwester ins Kino gehe.',
        'Gehe ich heute Abend mit meiner Schwester ins Kino.',
      ],
      correct: 0,
      why: 'Achtung: "Ich gehe heute Abend mit meiner Schwester ins Kino." wäre EBENFALLS korrekt und darf deshalb NICHT als falsche Option auftauchen. Die Distraktoren verletzen alle die Verbzweitstellung.',
    },
    gaps: [0],
    sentenceOptions: true,
    recallable: true,
    recallPlaceholder: 'Напиши предложение целиком',
    hints: {
      recognition: 'Выбери вариант с правильным порядком слов.',
      recall: 'Собери предложение и введи его целиком.',
    },
  },

  bedeutung: {
    id: 'bedeutung',
    label: 'Минимальная пара',
    name: 'Bedeutungsunterscheidung (Minimalpaar)',
    instruction: 'Выбери вариант, который подходит по смыслу.',
    display: 'Eine Situation, die eindeutig eine von zwei ähnlichen Strukturen verlangt.',
    options:
      'Vier Varianten, von denen mehrere für sich genommen wohlgeformt sind; nur eine trifft die beschriebene Situation.',
    useFor:
      'Wechselpräpositionen (wohin/wo), nicht dürfen gegen nicht müssen, Vorgangs- gegen Zustandspassiv, Perfekt gegen Plusquamperfekt, lassen, Konjunktiv II, Reflexivpronomen im Dativ gegen Akkusativ.',
    example: {
      topic: 'Wechselpräpositionen',
      level: 'A2',
      context: '— Wo ist meine Brille? — Du hast sie doch selbst ___ gelegt!',
      options: ['auf den Tisch', 'auf dem Tisch', 'auf der Tisch', 'auf die Tische'],
      correct: 0,
      why: 'Das Verb "legen" erzwingt die Richtung und damit den Akkusativ. Option 2 ist die Positionsvariante (der häufigste Fehler), Option 3 eine falsche Artikelform, Option 4 der falsche Numerus.',
    },
    gaps: [0, 1],
    sentenceOptions: false,
    recallable: true,
    recallPlaceholder: 'Напиши слово или фразу',
    hints: {
      recognition: 'Грамматичны могут быть несколько вариантов — по смыслу подходит один.',
      recall: 'Впиши вариант, который подходит по смыслу.',
    },
  },

  luecke: {
    id: 'luecke',
    label: 'Пропуск с целой структурой',
    name: 'Lückensatz mit vollständiger Zielstruktur',
    instruction: 'Выбери правильный вариант.',
    display:
      'Ein deutscher Satz mit genau einer Lücke ___ . Der Satz muss genug Kontext liefern, damit nur eine Form passt.',
    options: 'Vier Varianten, die JEWEILS DIE GANZE Zielstruktur enthalten — nicht nur ein Füllwort daraus.',
    useFor: 'Kasus, Adjektivdeklination, Verbformen, Präpositionen, Pronomen.',
    example: {
      topic: 'Dativ',
      level: 'A2',
      context: 'Zum Geburtstag hat Anna ___ einen großen Blumenstrauß geschenkt.',
      options: ['ihrer neuen Kollegin', 'ihre neue Kollegin', 'ihrer neue Kollegin', 'ihren neuen Kollegen'],
      correct: 0,
      why: 'Die Lücke umfasst die ganze Nominalphrase (Possessivartikel + Adjektiv + Nomen), nicht nur den Artikel. Damit wird die Dativentscheidung wirklich geprüft und nicht bloß ein Wort erkannt.',
    },
    gaps: [1],
    sentenceOptions: false,
    recallable: true,
    recallPlaceholder: 'Напиши недостающую часть',
    hints: {
      recognition: 'Выбери вариант, который закрывает пропуск целиком.',
      recall: 'Впиши недостающую часть целиком.',
    },
  },
};

export const TASK_FORMAT_IDS = Object.keys(TASK_FORMATS) as TaskFormatId[];

/** Сложные форматы: в каждом пакете их должно быть хотя бы два. */
export const DEMANDING_FORMATS: readonly TaskFormatId[] = [
  'umformung',
  'verbindung',
  'fehlerkorrektur',
  'bedeutung',
];

export function isTaskFormatId(value: unknown): value is TaskFormatId {
  return typeof value === 'string' && Object.hasOwn(TASK_FORMATS, value);
}

/** Пропуски в `context`. */
export function gapCount(context: string) {
  return context.split('___').length - 1;
}

/** Части варианта двойного пропуска: «ist – gefahren» → ['ist', 'gefahren']. */
export function gapParts(option: string) {
  return option
    .split(/\s[–—-]\s/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Формат как блок запроса, с разобранным примером. */
export function renderFormat(id: TaskFormatId) {
  const format = TASK_FORMATS[id];
  const { example } = format;
  const optionLines = example.options.map(
    (option, index) => `   ${'ABCD'[index]}) ${option}${index === example.correct ? '   <- richtig' : ''}`,
  );
  return [
    `FORMAT "${id}" — ${format.name}`,
    `  Anweisung, die der Lernende sieht (setzt das Spiel selbst): ${format.instruction}`,
    `  Aufgabenmaterial (context): ${format.display}`,
    `  Optionen: ${format.options}`,
    `  Geeignet für: ${format.useFor}`,
    `  Beispiel (${example.topic}, ${example.level}):`,
    `   context: ${example.context}`,
    ...optionLines,
    `   Warum das eine gute Aufgabe ist: ${example.why}`,
  ].join('\n');
}

/** Каталог форматов, разрешённых для темы. */
export function renderFormatCatalogue(ids: readonly TaskFormatId[]) {
  const list = ids.filter((id) => isTaskFormatId(id));
  if (!list.length) return '';
  return [
    'AUFGABENFORMATE — verwende NUR diese und halte dich genau an ihren Aufbau:',
    '',
    list.map(renderFormat).join('\n\n'),
  ].join('\n');
}
