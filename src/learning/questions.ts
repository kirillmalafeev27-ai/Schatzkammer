import {
  AUDIO_DISPLAY_CONTEXT,
  EXERCISE_FORMATS,
  TASK_FORMATS,
  WORD_FIELD_TOPIC,
  exerciseFormatFor,
  isTaskFormatId,
  isWordFieldTopic,
  wordFieldFor,
  wordFieldInstruction,
  type TaskFormatId,
} from './formats.ts';
import type { LearningSettings } from './settings.ts';

export {
  AUDIO_DISPLAY_CONTEXT,
  EXERCISE_FORMATS,
  TASK_FORMATS,
  WORD_FIELDS,
  WORD_FIELD_TOPIC,
  exerciseHint,
  exerciseFormatFor,
  isTaskFormatId,
  isWordFieldTopic,
  usesEveryFragment,
  wordFieldBank,
  wordFieldFor,
  wordFieldInstruction,
  wordFieldSynonymOf,
  wordFieldsForLevel,
  wordOrderFragments,
} from './formats.ts';
export type {
  ExerciseFormat,
  ExerciseFormatId,
  TaskFormat,
  TaskFormatId,
  WordField,
  WordFieldSynonym,
} from './formats.ts';

// Вопрос обучающего движка (как в Conveyor) и встроенный разноуровневый резерв.

export type GameQuestion = {
  id: string;
  prompt: string;
  context: string;
  translation: string;
  options: [string, string, string, string];
  correct: 0 | 1 | 2 | 3;
  rule: string;
  level?: string;
  lexicalTopic?: string;
  grammarTopic?: string;
  /** Только аудирование: немецкая фраза, которая звучит и никогда не печатается. */
  audioText?: string;
  /** Только синонимы: стёртое слово, вместо которого стоят четыре синонима. */
  wordFieldBase?: string;
  /** Формат грамматического задания из каталога `task-formats.ts`. */
  format?: TaskFormatId;
};

// Резерв грамматики — в тех же девяти форматах и по тем же правилам, что и сгенерированные
// задания: варианты несут всю целевую структуру, дистракторы — настоящие ошибки учащихся.
// Тест прогоняет каждое задание через ту же проверку, что и ответ модели.
const FALLBACK_DATA: Array<Omit<GameQuestion, 'id'>> = [
  {
    level: 'A1',
    lexicalTopic: 'Einkaufen & Konsum',
    grammarTopic: 'Artikel',
    format: 'dialog',
    prompt: TASK_FORMATS.dialog.instruction,
    context: '— Was hast du heute gekauft? — Ich habe ___ gekauft. Das Fahrrad ist rot und ganz neu.',
    translation: '— Что ты сегодня купил? — Я купил … . Велосипед красный и совсем новый.',
    options: ['ein Fahrrad', 'das Fahrrad', 'einen Fahrrad', 'Fahrrad'],
    correct: 0,
    rule: 'Велосипед упоминается впервые — нужен неопределённый артикль: ein Fahrrad (средний род). das Fahrrad — уже во второй фразе, когда он известен.',
  },
  {
    level: 'A1',
    lexicalTopic: 'Freizeit & Hobbys',
    grammarTopic: 'Präsens',
    format: 'mehrfachluecke',
    prompt: TASK_FORMATS.mehrfachluecke.instruction,
    context: 'Am Wochenende (1) ___ Lena lange, und ihr Bruder (2) ___ Romane.',
    translation: 'По выходным Лена долго спит, а её брат читает романы.',
    options: ['schläft – liest', 'schlaft – liest', 'schläft – lest', 'schlaft – lest'],
    correct: 0,
    rule: 'В 3-м лице единственного числа меняется корневая гласная: schlafen → schläft (a → ä), lesen → liest (e → ie).',
  },
  {
    level: 'A1',
    lexicalTopic: 'Natur & Tiere',
    grammarTopic: 'Akkusativ',
    format: 'luecke',
    prompt: TASK_FORMATS.luecke.instruction,
    context: 'Im Park sehe ich jeden Morgen ___ mit seinem Hund.',
    translation: 'В парке я каждое утро вижу пожилого мужчину с его собакой.',
    options: ['einen alten Mann', 'ein alter Mann', 'einem alten Mann', 'ein alten Mann'],
    correct: 0,
    rule: 'sehen требует Akkusativ; мужской род: einen + прилагательное на -en — einen alten Mann.',
  },
  {
    level: 'A1',
    lexicalTopic: 'Reisen & Tourismus',
    grammarTopic: 'Wortstellung im Hauptsatz',
    format: 'wortstellung',
    prompt: TASK_FORMATS.wortstellung.instruction,
    context: 'nach Berlin / morgen / fahre / ich',
    translation: 'Завтра я еду в Берлин.',
    options: [
      'Morgen fahre ich nach Berlin.',
      'Morgen ich fahre nach Berlin.',
      'Morgen ich nach Berlin fahre.',
      'Fahre ich morgen nach Berlin.',
    ],
    correct: 0,
    rule: 'В повествовательном предложении глагол стоит на втором месте: после morgen сразу fahre, подлежащее — за ним.',
  },
  {
    level: 'A1',
    lexicalTopic: 'Termine & Zeitmanagement',
    grammarTopic: 'Negation',
    format: 'umformung',
    prompt: TASK_FORMATS.umformung.instruction,
    context: 'Verneine den Satz: "Wir haben heute Zeit für einen Ausflug."',
    translation: 'Сегодня у нас нет времени на поездку.',
    options: [
      'Wir haben heute keine Zeit für einen Ausflug.',
      'Wir haben heute nicht Zeit für einen Ausflug.',
      'Wir haben heute keinen Zeit für einen Ausflug.',
      'Wir haben heute Zeit nicht für einen Ausflug.',
    ],
    correct: 0,
    rule: 'Существительное без артикля отрицается словом kein; Zeit — женского рода, в Akkusativ: keine Zeit.',
  },
  {
    level: 'A1',
    lexicalTopic: 'Schule & Lernen',
    grammarTopic: 'Modalverben',
    format: 'dialog',
    prompt: TASK_FORMATS.dialog.instruction,
    context:
      '— Kommst du heute mit ins Kino? — Ich möchte gern, aber morgen ist die Prüfung. Ich ___ heute lernen.',
    translation:
      '— Пойдёшь сегодня со мной в кино? — Я бы с радостью, но завтра экзамен. Мне … сегодня заниматься.',
    options: ['muss', 'darf', 'will', 'kann'],
    correct: 0,
    rule: '«Хочу, но экзамен» — это необходимость: müssen. wollen — собственное желание, оно спорит с «möchte gern, aber».',
  },
  {
    level: 'A1',
    lexicalTopic: 'Verkehr & Mobilität',
    grammarTopic: 'Präpositionen mit Dativ',
    format: 'luecke',
    prompt: TASK_FORMATS.luecke.instruction,
    context: 'Jeden Morgen fahre ich ___ zur Arbeit, weil das Auto kaputt ist.',
    translation: 'Каждое утро я езжу на работу на автобусе, потому что машина сломалась.',
    options: ['mit dem Bus', 'mit den Bus', 'mit der Bus', 'mit Bus'],
    correct: 0,
    rule: 'mit всегда требует Dativ, даже когда речь о движении: der Bus → mit dem Bus.',
  },
  {
    level: 'A2',
    lexicalTopic: 'Kunst & Kultur',
    grammarTopic: 'Perfekt',
    format: 'mehrfachluecke',
    prompt: TASK_FORMATS.mehrfachluecke.instruction,
    context: 'Gestern (1) ___ wir mit der ganzen Klasse ins Museum (2) ___ .',
    translation: 'Вчера мы всем классом ходили в музей.',
    options: ['sind – gegangen', 'haben – gegangen', 'sind – gegeht', 'haben – gegeht'],
    correct: 0,
    rule: 'gehen — движение со сменой места, поэтому Perfekt с sein; причастие неправильное: gegangen.',
  },
  {
    level: 'A2',
    lexicalTopic: 'Wohnen & Nachbarschaft',
    grammarTopic: 'Dativ',
    format: 'luecke',
    prompt: TASK_FORMATS.luecke.instruction,
    context: 'Nach dem Umzug helfe ich ___ mit den schweren Kisten.',
    translation: 'После переезда я помогаю новой соседке с тяжёлыми коробками.',
    options: [
      'meiner neuen Nachbarin',
      'meine neue Nachbarin',
      'meiner neue Nachbarin',
      'meinen neuen Nachbarin',
    ],
    correct: 0,
    rule: 'helfen требует Dativ: женский род — meiner, прилагательное после артикля в Dativ — на -en: meiner neuen Nachbarin.',
  },
  {
    level: 'A2',
    lexicalTopic: 'Arbeit & Beruf',
    grammarTopic: 'Modalverben',
    format: 'dialog',
    prompt: TASK_FORMATS.dialog.instruction,
    context: '— Soll ich morgen früher kommen? — Nein, das ___ du nicht. Wir fangen erst um zehn Uhr an.',
    translation: '— Мне завтра прийти пораньше? — Нет, тебе … . Мы начинаем только в десять.',
    options: ['musst', 'darfst', 'kannst', 'willst'],
    correct: 0,
    rule: 'nicht müssen — «не нужно»: необходимости нет. nicht dürfen — запрет, а прийти раньше никто не запрещает.',
  },
  {
    level: 'A2',
    lexicalTopic: 'Wohnen & Nachbarschaft',
    grammarTopic: 'Wechselpräpositionen',
    format: 'mehrfachluecke',
    prompt: TASK_FORMATS.mehrfachluecke.instruction,
    context: 'Ich stelle die Vase (1) ___ , und jetzt steht sie (2) ___ .',
    translation: 'Я ставлю вазу на стол, и теперь она стоит на столе.',
    options: [
      'auf den Tisch – auf dem Tisch',
      'auf dem Tisch – auf den Tisch',
      'auf den Tisch – auf den Tisch',
      'auf dem Tisch – auf dem Tisch',
    ],
    correct: 0,
    rule: 'stellen — куда? → Akkusativ: auf den Tisch. stehen — где? → Dativ: auf dem Tisch.',
  },
  {
    level: 'A2',
    lexicalTopic: 'Verkehr & Mobilität',
    grammarTopic: 'Trennbare Verben',
    format: 'satzvarianten',
    prompt: TASK_FORMATS.satzvarianten.instruction,
    context: 'Lisa wartet am Bahnhof. (der Zug – um neun Uhr – ankommen)',
    translation: 'Лиза ждёт на вокзале. Поезд прибывает в девять часов.',
    options: [
      'Der Zug kommt um neun Uhr an.',
      'Der Zug ankommt um neun Uhr.',
      'Der Zug kommt an um neun Uhr.',
      'Der Zug an kommt um neun Uhr.',
    ],
    correct: 0,
    rule: 'В главном предложении приставка an отделяется и уходит в самый конец: kommt … an.',
  },
  {
    level: 'A2',
    lexicalTopic: 'Gesundheit & Wohlbefinden',
    grammarTopic: 'weil-Sätze',
    format: 'verbindung',
    prompt: TASK_FORMATS.verbindung.instruction,
    context: 'Verbinde mit "weil": "Ich gehe heute nicht zur Arbeit." + "Ich habe starke Kopfschmerzen."',
    translation: 'Я сегодня не иду на работу, потому что у меня сильно болит голова.',
    options: [
      'Ich gehe heute nicht zur Arbeit, weil ich starke Kopfschmerzen habe.',
      'Ich gehe heute nicht zur Arbeit, weil ich habe starke Kopfschmerzen.',
      'Ich gehe heute nicht zur Arbeit, weil habe ich starke Kopfschmerzen.',
      'Weil ich starke Kopfschmerzen habe, ich gehe heute nicht zur Arbeit.',
    ],
    correct: 0,
    rule: 'weil вводит придаточное: спрягаемый глагол уходит в конец. Если придаточное впереди, главное начинается с глагола: …, gehe ich.',
  },
  {
    level: 'A2',
    lexicalTopic: 'Wohnen & Nachbarschaft',
    grammarTopic: 'Adjektivdeklination',
    format: 'luecke',
    prompt: TASK_FORMATS.luecke.instruction,
    context: 'Wir wohnen jetzt in ___ mit einem großen Garten.',
    translation: 'Теперь мы живём в тихом доме с большим садом.',
    options: ['einem ruhigen Haus', 'einem ruhiges Haus', 'einem ruhigem Haus', 'einem ruhige Haus'],
    correct: 0,
    rule: 'После einem (Dativ) прилагательное получает -en: einem ruhigen Haus. Сигнал падежа -em уже несёт артикль.',
  },
  {
    level: 'A2',
    lexicalTopic: 'Wetter & Jahreszeiten',
    grammarTopic: 'Imperativ',
    format: 'umformung',
    prompt: TASK_FORMATS.umformung.instruction,
    context: 'Bilde den Imperativ für "du": "Du nimmst heute den Regenschirm mit."',
    translation: 'Возьми сегодня с собой зонтик!',
    options: [
      'Nimm heute den Regenschirm mit!',
      'Nimmst heute den Regenschirm mit!',
      'Nehm heute den Regenschirm mit!',
      'Nimm heute mit den Regenschirm!',
    ],
    correct: 0,
    rule: 'Повелительное наклонение для du: основа без -st и без местоимения, смена e → i сохраняется (nimm), приставка mit — в конце.',
  },
  {
    level: 'A2',
    lexicalTopic: 'Alltag & Routinen',
    grammarTopic: 'Sein vs. haben',
    format: 'mehrfachluecke',
    prompt: TASK_FORMATS.mehrfachluecke.instruction,
    context: 'Heute Morgen (1) ___ ich leider viel zu spät (2) ___ .',
    translation: 'Сегодня утром я, к сожалению, проснулся слишком поздно.',
    options: ['bin – aufgewacht', 'habe – aufgewacht', 'bin – geaufwacht', 'habe – geaufwacht'],
    correct: 0,
    rule: 'aufwachen — изменение состояния, поэтому Perfekt с sein: bin aufgewacht. У отделяемого глагола ge- стоит между приставкой и корнем.',
  },
  {
    level: 'A2',
    lexicalTopic: 'Gesundheit & Wohlbefinden',
    grammarTopic: 'Untrennbare Verben',
    format: 'mehrfachluecke',
    prompt: TASK_FORMATS.mehrfachluecke.instruction,
    context: 'Gestern (1) ___ ich meine Großeltern im Krankenhaus (2) ___ .',
    translation: 'Вчера я навестил бабушку и дедушку в больнице.',
    options: ['habe – besucht', 'bin – besucht', 'habe – gebesucht', 'bin – gebesucht'],
    correct: 0,
    rule: 'be- — неотделяемая приставка, поэтому причастие без ge-: besucht. Глагол с дополнением в Akkusativ — Perfekt с haben.',
  },
  {
    level: 'A2',
    lexicalTopic: 'Familie & Beziehungen',
    grammarTopic: 'Komparativ',
    format: 'luecke',
    prompt: TASK_FORMATS.luecke.instruction,
    context: 'Mein Bruder ist zwei Jahre ___ ich, aber ich bin größer.',
    translation: 'Мой брат на два года старше меня, но я выше.',
    options: ['älter als', 'älter wie', 'alter als', 'mehr alt als'],
    correct: 0,
    rule: 'Неравенство: Komparativ + als; alt → älter (с умлаутом). wie — только для равенства: so alt wie.',
  },
  {
    level: 'A2',
    lexicalTopic: 'Feste, Traditionen & Feiertage',
    grammarTopic: 'Zahlen und Datum',
    format: 'luecke',
    prompt: TASK_FORMATS.luecke.instruction,
    context: 'Meine Schwester hat ___ Geburtstag, also schon in zwei Wochen.',
    translation: 'У моей сестры день рождения третьего мая, то есть уже через две недели.',
    options: ['am dritten Mai', 'am dritte Mai', 'am drei Mai', 'im dritten Mai'],
    correct: 0,
    rule: 'Дата с am: порядковое числительное в Dativ на -en — am dritten Mai; drei → dritte. Месяц без дня — im Mai.',
  },
  {
    level: 'A2',
    lexicalTopic: 'Schule & Lernen',
    grammarTopic: 'Wortstellung im Nebensatz',
    format: 'wortstellung',
    prompt: TASK_FORMATS.wortstellung.instruction,
    context: 'die Prüfung / Ich hoffe, / besteht / er / dass',
    translation: 'Я надеюсь, что он сдаст экзамен.',
    options: [
      'Ich hoffe, dass er die Prüfung besteht.',
      'Ich hoffe, dass er besteht die Prüfung.',
      'Ich hoffe, dass besteht er die Prüfung.',
      'Ich hoffe, er dass die Prüfung besteht.',
    ],
    correct: 0,
    rule: 'После dass спрягаемый глагол уходит в конец придаточного: dass er die Prüfung besteht.',
  },
  {
    level: 'B1',
    lexicalTopic: 'Freizeit & Hobbys',
    grammarTopic: 'Konjunktiv II',
    format: 'umformung',
    prompt: TASK_FORMATS.umformung.instruction,
    context:
      'Formuliere als irreale Bedingung im Konjunktiv II: "Ich habe keine Zeit, deshalb komme ich nicht mit."',
    translation: 'Если бы у меня было время, я бы пошёл с вами.',
    options: [
      'Wenn ich Zeit hätte, würde ich mitkommen.',
      'Wenn ich Zeit hatte, würde ich mitkommen.',
      'Wenn ich Zeit haben würde, würde ich mitkommen.',
      'Wenn ich Zeit hätte, ich würde mitkommen.',
    ],
    correct: 0,
    rule: 'Нереальное условие — Konjunktiv II: у haben своя форма hätte (с умлаутом), würde с haben не ставят; после придаточного — инверсия: würde ich.',
  },
  {
    level: 'B1',
    lexicalTopic: 'Alltag & Routinen',
    grammarTopic: 'Infinitiv mit zu',
    format: 'satzvarianten',
    prompt: TASK_FORMATS.satzvarianten.instruction,
    context: 'Nach der Party sieht die Küche schlimm aus. (anfangen – die Küche aufräumen)',
    translation: 'После вечеринки кухня выглядит ужасно. Мы сразу начинаем убирать кухню.',
    options: [
      'Wir fangen sofort an, die Küche aufzuräumen.',
      'Wir fangen sofort an, die Küche zu aufräumen.',
      'Wir fangen sofort an, die Küche aufräumen.',
      'Wir fangen sofort an, die Küche räumen auf.',
    ],
    correct: 0,
    rule: 'anfangen требует zu + Infinitiv; у отделяемого глагола zu встаёт между приставкой и корнем и пишется слитно: aufzuräumen.',
  },
  {
    level: 'B1',
    lexicalTopic: 'Wohnen & Nachbarschaft',
    grammarTopic: 'Passiv',
    format: 'umformung',
    prompt: TASK_FORMATS.umformung.instruction,
    context: 'Ins Passiv Präteritum umformen: "Der Hausmeister schloss jeden Abend die Tür."',
    translation: 'Каждый вечер дверь запиралась комендантом.',
    options: [
      'Die Tür wurde jeden Abend vom Hausmeister geschlossen.',
      'Die Tür wird jeden Abend vom Hausmeister geschlossen.',
      'Die Tür wurde jeden Abend vom Hausmeister schließen.',
      'Die Tür war jeden Abend vom Hausmeister geschlossen.',
    ],
    correct: 0,
    rule: 'Vorgangspassiv в Präteritum: wurde + Partizip II (geschlossen); исполнитель — von + Dativ: vom Hausmeister. wird — это Präsens, war geschlossen — состояние.',
  },
  {
    level: 'B1',
    lexicalTopic: 'Arbeit & Beruf',
    grammarTopic: 'Relativpronomen',
    format: 'luecke',
    prompt: TASK_FORMATS.luecke.instruction,
    context: 'Das sind die Kollegen, ___ ich jeden Tag zur Arbeit fahre.',
    translation: 'Это коллеги, с которыми я каждый день езжу на работу.',
    options: ['mit denen', 'mit den', 'mit die', 'mit dem'],
    correct: 0,
    rule: 'Kollegen — множественное число, mit требует Dativ; относительное местоимение в Dativ Plural — denen, а не артикль den.',
  },
  {
    level: 'B1',
    lexicalTopic: 'Familie & Beziehungen',
    grammarTopic: 'Präteritum',
    format: 'umformung',
    prompt: TASK_FORMATS.umformung.instruction,
    context:
      'Ins Präteritum umformen: "Meine Großeltern denken oft an ihre Jugend und bringen uns alte Fotos."',
    translation: 'Мои бабушка и дедушка часто вспоминали свою молодость и приносили нам старые фотографии.',
    options: [
      'Meine Großeltern dachten oft an ihre Jugend und brachten uns alte Fotos.',
      'Meine Großeltern denkten oft an ihre Jugend und bringten uns alte Fotos.',
      'Meine Großeltern dachten oft an ihre Jugend und bringten uns alte Fotos.',
      'Meine Großeltern dächten oft an ihre Jugend und brächten uns alte Fotos.',
    ],
    correct: 0,
    rule: 'denken и bringen — смешанные глаголы: и смена корня, и суффикс -te: dachten, brachten. Формы с умлаутом (dächten) — это Konjunktiv II.',
  },
  {
    level: 'B1',
    lexicalTopic: 'Schule & Lernen',
    grammarTopic: 'Doppelkonjunktionen',
    format: 'verbindung',
    prompt: TASK_FORMATS.verbindung.instruction,
    context:
      'Verbinde mit "sowohl ... als auch": "Mein Bruder spricht Englisch." + "Mein Bruder spricht Spanisch."',
    translation: 'Мой брат говорит и по-английски, и по-испански.',
    options: [
      'Mein Bruder spricht sowohl Englisch als auch Spanisch.',
      'Mein Bruder spricht sowohl Englisch als Spanisch.',
      'Mein Bruder spricht sowohl Englisch oder auch Spanisch.',
      'Mein Bruder spricht sowohl Englisch als auch er spricht Spanisch.',
    ],
    correct: 0,
    rule: 'sowohl … als auch соединяет однородные части — здесь два дополнения: Englisch и Spanisch. als без auch и смешанная пара sowohl … oder — ошибки.',
  },
  {
    level: 'B1',
    lexicalTopic: 'Schule & Lernen',
    grammarTopic: 'damit-Sätze',
    format: 'verbindung',
    prompt: TASK_FORMATS.verbindung.instruction,
    context:
      'Verbinde zu einem Satz mit Zweck: "Ich erkläre dir die Aufgabe noch einmal." + "Du verstehst sie."',
    translation: 'Я объясню тебе задание ещё раз, чтобы ты его понял.',
    options: [
      'Ich erkläre dir die Aufgabe noch einmal, damit du sie verstehst.',
      'Ich erkläre dir die Aufgabe noch einmal, um du sie zu verstehen.',
      'Ich erkläre dir die Aufgabe noch einmal, um sie zu verstehen.',
      'Ich erkläre dir die Aufgabe noch einmal, damit du verstehst sie.',
    ],
    correct: 0,
    rule: 'Подлежащие разные (объясняю я, понимаешь ты), поэтому только damit; um … zu возможен лишь при одном подлежащем. После damit глагол в конце.',
  },
  {
    level: 'B1',
    lexicalTopic: 'Studium & Universität',
    grammarTopic: 'Indirekte Fragen',
    format: 'umformung',
    prompt: TASK_FORMATS.umformung.instruction,
    context: 'Als indirekte Frage nach "Kannst du mir sagen": "Wann beginnt der Kurs?"',
    translation: 'Можешь сказать мне, когда начинается курс?',
    options: [
      'Kannst du mir sagen, wann der Kurs beginnt?',
      'Kannst du mir sagen, wann beginnt der Kurs?',
      'Kannst du mir sagen, ob der Kurs beginnt?',
      'Kannst du mir sagen, wenn der Kurs beginnt?',
    ],
    correct: 0,
    rule: 'Косвенный вопрос — придаточное: wann остаётся, глагол уходит в конец. ob — только для вопросов «да/нет», wenn здесь невозможен.',
  },
  {
    level: 'B1',
    lexicalTopic: 'Wetter & Jahreszeiten',
    grammarTopic: 'obwohl-Sätze',
    format: 'verbindung',
    prompt: TASK_FORMATS.verbindung.instruction,
    context: 'Verbinde mit "obwohl": "Es regnet stark." + "Wir gehen spazieren."',
    translation: 'Хотя идёт сильный дождь, мы идём гулять.',
    options: [
      'Obwohl es stark regnet, gehen wir spazieren.',
      'Obwohl es regnet stark, gehen wir spazieren.',
      'Obwohl es stark regnet, wir gehen spazieren.',
      'Trotzdem es stark regnet, gehen wir spazieren.',
    ],
    correct: 0,
    rule: 'obwohl вводит придаточное: глагол в конец. Придаточное впереди занимает первое место, поэтому дальше сразу глагол: gehen wir. trotzdem — наречие, не союз.',
  },
  {
    level: 'B1',
    lexicalTopic: 'Büro & Remote Work',
    grammarTopic: 'Wortstellung im Hauptsatz',
    format: 'fehlerkorrektur',
    prompt: TASK_FORMATS.fehlerkorrektur.instruction,
    context: 'Er hat sich verspätet, trotzdem er kommt noch zur Besprechung.',
    translation: 'Он опоздал, но всё равно приходит на совещание.',
    options: [
      'Er hat sich verspätet, trotzdem kommt er noch zur Besprechung.',
      'Er hat sich verspätet, trotzdem er kommt noch zur Besprechung.',
      'Er hat sich verspätet, trotzdem er noch zur Besprechung kommt.',
      'Er hat sich verspätet, aber kommt er noch zur Besprechung.',
    ],
    correct: 0,
    rule: 'trotzdem — наречие и занимает первое место, поэтому глагол сразу за ним: trotzdem kommt er. После aber инверсии нет.',
  },
  {
    level: 'B1',
    lexicalTopic: 'Arbeit & Beruf',
    grammarTopic: 'Wortstellung im Nebensatz',
    format: 'wortstellung',
    prompt: TASK_FORMATS.wortstellung.instruction,
    context: 'arbeiten / ob / Er fragt, / muss / ich / morgen',
    translation: 'Он спрашивает, нужно ли мне завтра работать.',
    options: [
      'Er fragt, ob ich morgen arbeiten muss.',
      'Er fragt, ob ich muss morgen arbeiten.',
      'Er fragt, ob muss ich morgen arbeiten.',
      'Er fragt, ob ich morgen muss arbeiten.',
    ],
    correct: 0,
    rule: 'В придаточном с ob модальный глагол закрывает предложение: ob ich morgen arbeiten muss.',
  },
  {
    level: 'B2',
    lexicalTopic: 'Büro & Remote Work',
    grammarTopic: 'Genitiv',
    format: 'luecke',
    prompt: TASK_FORMATS.luecke.instruction,
    context: 'Während ___ blieben alle Handys im Besprechungsraum ausgeschaltet.',
    translation: 'Во время долгой встречи все телефоны в переговорной оставались выключенными.',
    options: ['des langen Treffens', 'dem langen Treffen', 'des langen Treffen', 'des langes Treffens'],
    correct: 0,
    rule: 'während требует Genitiv: des + прилагательное на -en + существительное с -s: des langen Treffens.',
  },
  {
    level: 'B2',
    lexicalTopic: 'Essen & Ernährung',
    grammarTopic: 'Plusquamperfekt',
    format: 'verbindung',
    prompt: TASK_FORMATS.verbindung.instruction,
    context: 'Verbinde mit "nachdem": "Er aß zu Mittag." + "Dann ging er spazieren."',
    translation: 'После того как он пообедал, он пошёл гулять.',
    options: [
      'Nachdem er zu Mittag gegessen hatte, ging er spazieren.',
      'Nachdem er zu Mittag gegessen hat, ging er spazieren.',
      'Nachdem er zu Mittag gegessen hatte, er ging spazieren.',
      'Nachdem er zu Mittag aß, ging er spazieren.',
    ],
    correct: 0,
    rule: 'Обед был раньше прогулки, которая уже в прошлом, поэтому Plusquamperfekt: gegessen hatte. После придаточного — инверсия: ging er.',
  },
];

// Резерв аудирования из пула See Escape. `translation` пуст намеренно — напечатанный перевод
// выдал бы ответ, — а `rule` несёт немецкую фразу, чтобы строка разбора показала, что прозвучало.
const AUDIO_FALLBACK_DATA: Array<Omit<GameQuestion, 'id'>> = [
  {
    level: 'A1',
    lexicalTopic: 'Einkaufen & Konsum',
    prompt: EXERCISE_FORMATS.audio.instruction,
    context: AUDIO_DISPLAY_CONTEXT,
    translation: '',
    audioText: 'Ich kaufe heute Brot und Käse.',
    options: [
      'Сегодня я покупаю хлеб и сыр.',
      'Сегодня я продаю хлеб и сыр.',
      'Сегодня я покупаю булочки и сыр.',
      'Сегодня я покупаю хлеб и колбасу.',
    ],
    correct: 0,
    rule: 'Ich kaufe heute Brot und Käse.',
  },
  {
    level: 'A1',
    lexicalTopic: 'Verkehr & Mobilität',
    prompt: EXERCISE_FORMATS.audio.instruction,
    context: AUDIO_DISPLAY_CONTEXT,
    translation: '',
    audioText: 'Der Zug kommt um acht Uhr an.',
    options: [
      'Поезд прибывает в восемь часов.',
      'Поезд отправляется в восемь часов.',
      'Поезд прибывает на восьмой путь.',
      'На поезд нужно пересесть в восемь часов.',
    ],
    correct: 0,
    rule: 'Der Zug kommt um acht Uhr an.',
  },
  {
    level: 'A2',
    lexicalTopic: 'Gesundheit & Wohlbefinden',
    prompt: EXERCISE_FORMATS.audio.instruction,
    context: AUDIO_DISPLAY_CONTEXT,
    translation: '',
    audioText: 'Wir müssen morgen früh zum Arzt gehen.',
    options: [
      'Завтра рано мы должны пойти к врачу.',
      'Завтра рано мы хотим пойти к врачу.',
      'Завтра рано мы должны пойти в аптеку.',
      'Завтра рано нам разрешено пойти к врачу.',
    ],
    correct: 0,
    rule: 'Wir müssen morgen früh zum Arzt gehen.',
  },
  {
    level: 'A2',
    lexicalTopic: 'Wohnen & Nachbarschaft',
    prompt: EXERCISE_FORMATS.audio.instruction,
    context: AUDIO_DISPLAY_CONTEXT,
    translation: '',
    audioText: 'Sie hat den Schlüssel auf dem Tisch gelassen.',
    options: [
      'Она оставила ключ на столе.',
      'Она положила ключ на стул.',
      'Она оставила ключ в столе.',
      'Она забыла замок на столе.',
    ],
    correct: 0,
    rule: 'Sie hat den Schlüssel auf dem Tisch gelassen.',
  },
  {
    level: 'B1',
    lexicalTopic: 'Wetter & Jahreszeiten',
    prompt: EXERCISE_FORMATS.audio.instruction,
    context: AUDIO_DISPLAY_CONTEXT,
    translation: '',
    audioText: 'Obwohl es regnet, gehen die Kinder nach draußen.',
    options: [
      'Хотя идёт дождь, дети выходят на улицу.',
      'Пока идёт дождь, дети выходят на улицу.',
      'Потому что идёт дождь, дети выходят на улицу.',
      'Хотя идёт дождь, дети идут внутрь.',
    ],
    correct: 0,
    rule: 'Obwohl es regnet, gehen die Kinder nach draußen.',
  },
  {
    level: 'B1',
    lexicalTopic: 'Freundschaft & Partnerschaft',
    prompt: EXERCISE_FORMATS.audio.instruction,
    context: AUDIO_DISPLAY_CONTEXT,
    translation: '',
    audioText: 'Ich freue mich darauf, dich wiederzusehen.',
    options: [
      'Я рад снова тебя увидеть.',
      'Я боюсь снова тебя увидеть.',
      'Я рад снова тебя проводить.',
      'Я рад снова с тобой познакомиться.',
    ],
    correct: 0,
    rule: 'Ich freue mich darauf, dich wiederzusehen.',
  },
  {
    level: 'B2',
    lexicalTopic: 'Arbeit & Beruf',
    prompt: EXERCISE_FORMATS.audio.instruction,
    context: AUDIO_DISPLAY_CONTEXT,
    translation: '',
    audioText: 'Nachdem der Vertrag unterschrieben worden war, begann die Lieferung.',
    options: [
      'После того как договор был подписан, началась поставка.',
      'После того как договор подписали, поставка была отменена.',
      'После того как договор был отправлен, началась поставка.',
      'После того как заявка была подписана, началась поставка.',
    ],
    correct: 0,
    rule: 'Nachdem der Vertrag unterschrieben worden war, begann die Lieferung.',
  },
  {
    level: 'B2',
    lexicalTopic: 'Termine & Zeitmanagement',
    prompt: EXERCISE_FORMATS.audio.instruction,
    context: AUDIO_DISPLAY_CONTEXT,
    translation: '',
    audioText: 'Je länger wir warten, desto schwieriger wird die Entscheidung.',
    options: [
      'Чем дольше мы ждём, тем труднее становится решение.',
      'Чем дольше мы ждём, тем труднее становится обсуждение.',
      'Чем дольше мы советуемся, тем труднее становится решение.',
      'Чем дольше мы ждём, тем надёжнее становится решение.',
    ],
    correct: 0,
    rule: 'Je länger wir warten, desto schwieriger wird die Entscheidung.',
  },
];

// Резерв синонимов. `translation` намеренно держит нейтральное слово: назови нюанс по-русски —
// и задание решится само.
const WORD_FIELD_FALLBACK_DATA: Array<Omit<GameQuestion, 'id'>> = [
  {
    level: 'A1',
    lexicalTopic: 'Familie & Beziehungen',
    grammarTopic: WORD_FIELD_TOPIC,
    wordFieldBase: 'sagen',
    prompt: wordFieldInstruction('sagen'),
    context: 'Das Baby schläft, deshalb ___ wir nur noch.',
    translation: 'Малыш спит, поэтому мы теперь только говорим.',
    options: ['flüstern', 'rufen', 'murmeln', 'behaupten'],
    correct: 0,
    rule: 'flüstern — говорить очень тихо, почти на ухо; на это указывает «Das Baby schläft».',
  },
  {
    level: 'A1',
    lexicalTopic: 'Reisen & Tourismus',
    grammarTopic: WORD_FIELD_TOPIC,
    wordFieldBase: 'gehen',
    prompt: wordFieldInstruction('gehen'),
    context: 'Wir haben viel Zeit und ___ durch die Altstadt.',
    translation: 'У нас много времени, и мы идём по старому городу.',
    options: ['schlendern', 'rennen', 'eilen', 'stapfen'],
    correct: 0,
    rule: 'schlendern — идти не спеша, прогуливаясь; «viel Zeit» исключает спешку.',
  },
  {
    level: 'A1',
    lexicalTopic: 'Essen & Ernährung',
    grammarTopic: WORD_FIELD_TOPIC,
    wordFieldBase: 'gut',
    prompt: wordFieldInstruction('gut'),
    context: 'Der Kuchen war wirklich ___, alle wollten noch ein Stück.',
    translation: 'Пирог был действительно хорошим, все хотели ещё кусок.',
    options: ['lecker', 'solide', 'brauchbar', 'angenehm'],
    correct: 0,
    rule: 'lecker — вкусный, и только о еде или напитках; речь о пироге.',
  },
  {
    level: 'A1',
    lexicalTopic: 'Essen & Ernährung',
    grammarTopic: WORD_FIELD_TOPIC,
    wordFieldBase: 'essen',
    prompt: wordFieldInstruction('essen'),
    context: 'Die Soße sieht gut aus — darf ich sie kurz ___?',
    translation: 'Соус выглядит хорошо — можно я его немного поем?',
    options: ['probieren', 'schlingen', 'naschen', 'speisen'],
    correct: 0,
    rule: 'probieren — взять маленький кусочек на пробу; на это указывает «kurz».',
  },
  {
    level: 'A2',
    lexicalTopic: 'Natur & Tiere',
    grammarTopic: WORD_FIELD_TOPIC,
    wordFieldBase: 'sehen',
    prompt: wordFieldInstruction('sehen'),
    context: 'Der Forscher ___ die Vögel jeden Morgen zwei Stunden lang.',
    translation: 'Исследователь видит птиц каждое утро по два часа.',
    options: ['beobachtet', 'bemerkt', 'erblickt', 'glotzt'],
    correct: 0,
    rule: 'beobachten — долго и внимательно наблюдать; длительность задаёт «zwei Stunden lang».',
  },
  {
    level: 'A2',
    lexicalTopic: 'Essen & Ernährung',
    grammarTopic: WORD_FIELD_TOPIC,
    wordFieldBase: 'machen',
    prompt: wordFieldInstruction('machen'),
    context: 'Am Wochenende ___ mein Vater immer eine Suppe.',
    translation: 'На выходных мой отец всегда делает суп.',
    options: ['kocht', 'bastelt', 'produziert', 'verursacht'],
    correct: 0,
    rule: 'kochen — готовить еду на плите; в предложении речь о супе.',
  },
  {
    level: 'B1',
    lexicalTopic: 'Feste, Traditionen & Feiertage',
    grammarTopic: WORD_FIELD_TOPIC,
    wordFieldBase: 'geben',
    prompt: wordFieldInstruction('geben'),
    context: 'Feierlich, vor allen Gästen, ___ der Bürgermeister dem Gewinner den Pokal.',
    translation: 'Торжественно, перед всеми гостями, мэр дал победителю кубок.',
    options: ['überreichte', 'reichte', 'schenkte', 'spendete'],
    correct: 0,
    rule: 'überreichen — вручить торжественно; на это указывает «Feierlich, vor allen Gästen».',
  },
  {
    level: 'B2',
    lexicalTopic: 'Termine & Zeitmanagement',
    grammarTopic: WORD_FIELD_TOPIC,
    wordFieldBase: 'wichtig',
    prompt: wordFieldInstruction('wichtig'),
    context: 'Der Termin ist ___ — die Unterlagen müssen noch heute im Amt sein.',
    translation: 'Этот срок важный — документы должны быть в ведомстве ещё сегодня.',
    options: ['dringend', 'wesentlich', 'maßgeblich', 'unverzichtbar'],
    correct: 0,
    rule: 'dringend — срочный, не терпит отлагательства; срок задаёт «noch heute».',
  },
];

// Упражнение на синонимы узнаётся по своему полю, так что резервное задание получает нужную
// форму и без грамматической темы рядом; грамматическое задание несёт формат само.
export function exerciseFormatOf(
  question: Pick<GameQuestion, 'grammarTopic' | 'audioText' | 'wordFieldBase' | 'format'>,
  mode?: string,
) {
  return exerciseFormatFor(
    question.wordFieldBase ? WORD_FIELD_TOPIC : question.grammarTopic,
    question.audioText ? 'audio' : mode,
    question.format,
  );
}

function toReserve(question: Omit<GameQuestion, 'id'>): GameQuestion {
  return {
    ...question,
    id: `reserve-${hashText([question.audioText ?? question.context, ...question.options].join('|'))}`,
  };
}

export const FALLBACK_QUESTIONS: GameQuestion[] = FALLBACK_DATA.map(toReserve);

export const AUDIO_FALLBACK_QUESTIONS: GameQuestion[] = AUDIO_FALLBACK_DATA.map(toReserve);

export const WORD_FIELD_FALLBACK_QUESTIONS: GameQuestion[] = WORD_FIELD_FALLBACK_DATA.map(toReserve);

function cleanText(value: unknown, maximum: number) {
  if (typeof value !== 'string') return '';
  const withoutControls = Array.from(value)
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 || character === '<' || character === '>' ? ' ' : character;
    })
    .join('');
  return withoutControls.replace(/\s+/gu, ' ').trim().slice(0, maximum);
}

export function questionFingerprint(question: Pick<GameQuestion, 'context' | 'options' | 'audioText'>) {
  // У всех заданий аудирования одна строка на экране, поэтому их личность — звучащая фраза,
  // а не то, что видит игрок.
  return [
    question.audioText || question.context,
    ...[...question.options].sort((left, right) => left.localeCompare(right, 'de')),
  ]
    .map((value) => cleanText(value, 360).normalize('NFKC').toLocaleLowerCase('de-DE'))
    .join('|');
}

export function questionHistoryLabel(question: Pick<GameQuestion, 'prompt' | 'context' | 'audioText'>) {
  return (question.audioText || `${question.prompt} ${question.context}`).trim();
}

export function normalizeQuestion(candidate: unknown, sequence = 0): GameQuestion | null {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const source = candidate as Record<string, unknown>;
  const sourcePrompt = cleanText(source.prompt ?? source.question ?? source.instruction, 360);
  const sourceContext = cleanText(source.context ?? source.sentence ?? source.display, 360);
  const context = sourceContext || sourcePrompt;
  const format = isTaskFormatId(source.format) ? source.format : undefined;
  const prompt = sourceContext ? sourcePrompt : TASK_FORMATS[format ?? 'luecke'].instruction;
  const translation = cleanText(source.translation ?? source.russianTranslation ?? source.ru, 360);
  const rule = cleanText(source.rule ?? source.explanation ?? source.rationale ?? source.grammarTopic, 360);
  const rawOptions = source.options ?? source.answers ?? source.choices;
  if (
    prompt.length < 4 ||
    context.length < 2 ||
    rule.length < 4 ||
    !Array.isArray(rawOptions) ||
    rawOptions.length !== 4
  )
    return null;

  const options = rawOptions.map((option) => cleanText(option, 180));
  if (options.some((option) => !option)) return null;
  if (new Set(options.map((option) => option.normalize('NFKC').toLocaleLowerCase('de-DE'))).size !== 4)
    return null;
  const numericCorrect = Number(source.correct ?? source.correctIndex);
  if (!Number.isInteger(numericCorrect) || numericCorrect < 0 || numericCorrect > 3) return null;
  const declaredAnswer = cleanText(source.correctAnswer ?? source.answer, 180);
  if (declaredAnswer && declaredAnswer !== options[numericCorrect]) return null;

  const tuple = options as GameQuestion['options'];
  const correct = numericCorrect as GameQuestion['correct'];
  const audioText = cleanText(source.audioText ?? source.audio ?? source.satz, 360) || undefined;
  // Поле ищется по каталогу, а не берётся на веру: так банк слов на экране совпадает
  // с четырьмя вариантами.
  const wordField = wordFieldFor(cleanText(source.wordFieldBase ?? source.wordField, 40));
  const identity = questionFingerprint({ context, options: tuple, audioText });
  return {
    id: cleanText(source.id, 100) || `question-${hashText(identity)}-${sequence}`,
    prompt,
    context,
    translation,
    options: tuple,
    correct,
    rule,
    level: cleanText(source.level, 8) || undefined,
    lexicalTopic: cleanText(source.lexicalTopic ?? source.topic, 80) || undefined,
    grammarTopic: cleanText(source.grammarTopic, 80) || undefined,
    audioText,
    wordFieldBase: wordField?.base,
    ...(format ? { format } : {}),
  };
}

export function shuffleQuestion(question: GameQuestion, random = Math.random): GameQuestion {
  const entries = question.options.map((label, originalIndex) => ({
    label,
    originalIndex,
  }));
  for (let index = entries.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [entries[index], entries[swapIndex]] = [entries[swapIndex], entries[index]];
  }
  return {
    ...question,
    options: entries.map((entry) => entry.label) as GameQuestion['options'],
    correct: entries.findIndex(
      (entry) => entry.originalIndex === question.correct,
    ) as GameQuestion['correct'],
  };
}

export function fallbackQuestionsFor(
  settings: Pick<LearningSettings, 'level' | 'lexicalTopic' | 'grammarTopic'> & {
    mode?: string;
  },
) {
  const levelRank = { A1: 0, A2: 1, B1: 2, B2: 3 } as const;
  const pool =
    settings.mode === 'audio'
      ? AUDIO_FALLBACK_QUESTIONS
      : isWordFieldTopic(settings.grammarTopic)
        ? WORD_FIELD_FALLBACK_QUESTIONS
        : FALLBACK_QUESTIONS;
  const eligible = pool.filter((question) => {
    const questionLevel =
      question.level && question.level in levelRank ? (question.level as keyof typeof levelRank) : 'A1';
    return levelRank[questionLevel] <= levelRank[settings.level];
  });
  const score = (question: GameQuestion) =>
    (question.level === settings.level ? 8 : 0) +
    (question.grammarTopic === settings.grammarTopic ? 5 : 0) +
    (question.lexicalTopic === settings.lexicalTopic ? 3 : 0);
  const preferred = eligible.filter(
    (question) =>
      (question.grammarTopic !== undefined && question.grammarTopic === settings.grammarTopic) ||
      question.lexicalTopic === settings.lexicalTopic,
  );
  const supplemental = eligible.filter((question) => !preferred.includes(question));
  return [
    ...preferred.sort((left, right) => score(right) - score(left)),
    ...supplemental.sort((left, right) => score(right) - score(left)),
  ];
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
