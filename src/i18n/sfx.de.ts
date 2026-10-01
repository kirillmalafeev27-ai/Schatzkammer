// Слова-звуки (раздел 9.3). Немецкие — это и погружение в язык, и традиция немецких комиксов.
// Капсом пишутся только они и отсчёт.

export type SfxKey =
  | 'los'
  | 'kling'
  | 'funkel'
  | 'aechz'
  | 'puh'
  | 'klirr'
  | 'hoppla'
  | 'riesel'
  | 'plumps'
  | 'knirsch'
  | 'voll'
  | 'geschafft'
  | 'knapp'
  | 'rumms'
  | 'zuSpaet';

export const sfxDe: Record<SfxKey, string> = {
  los: 'LOS!',
  kling: 'KLING!',
  funkel: 'FUNKEL!',
  aechz: 'ÄCHZ!',
  puh: 'PUH!',
  klirr: 'KLIRR!',
  hoppla: 'HOPPLA!',
  riesel: 'RIESEL…',
  plumps: 'PLUMPS!',
  knirsch: 'KNIRSCH!',
  voll: 'VOLL!',
  geschafft: 'GESCHAFFT!',
  knapp: 'KNAPP!',
  rumms: 'RUMMS!',
  zuSpaet: 'ZU SPÄT!',
};

export const sfxRu: Record<SfxKey, string> = {
  los: 'ВПЕРЁД!',
  kling: 'ДЗЫНЬ!',
  funkel: 'БЛЕСК!',
  aechz: 'КРЯХ!',
  puh: 'УФ!',
  klirr: 'ДЗИНЬ!',
  hoppla: 'ОПА!',
  riesel: 'ШУРХ…',
  plumps: 'ПЛЮХ!',
  knirsch: 'СКРЕЖЕТ!',
  voll: 'ПОЛОН!',
  geschafft: 'ПОЛУЧИЛОСЬ!',
  knapp: 'ЕЛЕ УСПЕЛ!',
  rumms: 'БУМ!',
  zuSpaet: 'ПОЗДНО!',
};

/** Отсчёт последних 10 секунд: цифра и немецкое слово под ней. */
export const countdownDe: Record<number, string> = {
  10: 'ZEHN!',
  9: 'NEUN!',
  8: 'ACHT!',
  7: 'SIEBEN!',
  6: 'SECHS!',
  5: 'FÜNF!',
  4: 'VIER!',
  3: 'DREI!',
  2: 'ZWEI!',
  1: 'EINS!',
};

export const countdownRu: Record<number, string> = {
  10: 'ДЕСЯТЬ!',
  9: 'ДЕВЯТЬ!',
  8: 'ВОСЕМЬ!',
  7: 'СЕМЬ!',
  6: 'ШЕСТЬ!',
  5: 'ПЯТЬ!',
  4: 'ЧЕТЫРЕ!',
  3: 'ТРИ!',
  2: 'ДВА!',
  1: 'ОДИН!',
};
