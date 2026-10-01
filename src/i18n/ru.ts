// Все строки интерфейса. Текст набирается в обычном регистре; капсом пишутся только слова-звуки.

const plural = new Intl.PluralRules('ru');

/** Склонение: one / few / many. */
export function ruPlural(n: number, forms: { one: string; few: string; many: string }): string {
  const r = plural.select(n);
  if (r === 'one') return forms.one;
  if (r === 'few') return forms.few;
  return forms.many;
}

const answersForms = { one: 'ответ', few: 'ответа', many: 'ответов' };
const stepsForms = { one: 'шаг', few: 'шага', many: 'шагов' };
const secondsForms = { one: 'секунду', few: 'секунды', many: 'секунд' };

export const ru = {
  title: 'Сокровищница',
  subtitle: 'Die Schatzkammer',
  tagline: 'Учи немецкий — выноси сокровища',
  loading: 'Lädt…',

  play: 'Играть',
  levels: 'Залы',
  settings: 'Настройки',
  back: 'Назад',
  close: 'Закрыть',
  resume: 'Продолжить',
  restart: 'Заново',
  toMenu: 'В меню',
  again: 'Ещё раз',
  next: 'Дальше',
  endless: 'Бесконечный зал',
  levelLabel: (n: number) => (n >= 7 ? 'Зал ∞' : `Зал ${n}`),
  locked: 'Закрыт',
  lockedHint: 'Пройди предыдущий зал хотя бы на одну звезду',
  best: (n: number) => `рекорд: ${n}`,

  pause: 'Пауза',
  pauseHint: 'Вопрос спрятан, пока игра на паузе',
  pauseButton: 'Пауза (P)',

  stepCost: (n: number) => `Шаг — ${n} ${ruPlural(n, answersForms)}`,
  chooseTarget: 'Выбери, куда шагнуть',
  getReady: 'Приготовься…',
  questionGroup: 'Вопрос: каждый верный ответ — заряд шага',
  optionLabel: (i: number, text: string) => `Вариант ${i}: ${text}`,
  pipsLabel: (have: number, need: number) => `Заряды шага: ${have} из ${need}`,

  bagLabel: 'Мешок',
  bagScore: (n: number) => `${n}`,
  dropCoin: 'Выбросить монету (Q)',
  dropGem: 'Выбросить камень (E)',
  toExit: 'К выходу',
  toExitHint: 'К выходу (H)',
  coins: 'монеты',
  gems: 'камни',

  introDoor: (sec: number) => `Дверь закроется примерно через ${sec} ${ruPlural(sec, secondsForms)}. Бери, сколько унесёшь`,
  tapToSkip: 'Нажми, чтобы начать',

  tutorialStart: 'Нажми на плиту — я пойду туда. Каждый верный ответ — мой шаг',
  tutorialHeavy: 'Тяжело! Теперь шаг стоит два ответа. Лишнее можно выбросить',
  tutorialRisk: 'Следы краснеют — пора к выходу',
  tutorialOk: 'Понятно',

  resultsWin: 'Вырвался!',
  resultsLose: 'Дверь закрылась',
  carried: (got: number, total: number) => `Унёс ${got} из ${total}`,
  lostAll: 'Всё осталось в сокровищнице',
  statCorrect: (n: number) => `Верных ответов: ${n}`,
  statWrong: (n: number) => `Ошибок: ${n}`,
  statMedian: (s: string) => `Медиана ответа: ${s} с`,
  statBest: (n: number) => `Лучший результат: ${n}`,
  statMargin: (s: string) => `Вышел за ${s} с до закрытия`,
  statSteps: (n: number) => `${n} ${ruPlural(n, stepsForms)}`,
  newRecord: 'Новый рекорд!',
  stars: (n: number) => `Звёзд: ${n} из 3`,

  stepsBadge: (n: number) => `${n}`,
  toTargetLabel: (n: number) => `До цели: ${n} ${ruPlural(n, stepsForms)}`,

  settingsTitle: 'Настройки',
  sfxVolume: 'Звуки',
  ambientVolume: 'Атмосфера',
  soundOn: 'Звук',
  reducedMotion: 'Меньше движения',
  quality: 'Качество графики',
  qualityHigh: 'Высокое',
  qualityLow: 'Экономное',
  qualityAutoNote: 'Включено автоматически: игра шла медленно',
  trailHints: 'Подсказка следов',
  trailUnavailable: 'На этом уровне подсказки нет',
  sfxLanguage: 'Язык слов-звуков',
  sfxLangDe: 'Deutsch',
  sfxLangRu: 'Русский',
  keyboardHelp: 'Клавиши: 1–4 — ответ, стрелки — шаг, H — к выходу, Пробел — отменить цель, Q/E — выбросить, P — пауза',

  menuHint: 'Каждый верный ответ — шаг. Золото тяжелеет. Дверь опускается.',
  footerControls: 'Плитка — цель · 1–4 — ответ · H — к выходу · P — пауза',
  webglMissing: 'Нет WebGL: включён упрощённый свет',
} as const;
