// Базовые правила: предметы, цена шага, длительность двери, звёзды (раздел 2).

import { balance } from '../config/balance';

export const Item = {
  None: 0,
  Coin: 1,
  Ruby: 2,
  Emerald: 3,
  Sapphire: 4,
} as const;
export type ItemCode = (typeof Item)[keyof typeof Item];

export type ItemKind = 'coin' | 'gem';

export const GEM_CODES = [Item.Ruby, Item.Emerald, Item.Sapphire] as const;

export function isGem(code: number): boolean {
  return code >= Item.Ruby && code <= Item.Sapphire;
}

export function itemKind(code: number): ItemKind {
  return isGem(code) ? 'gem' : 'coin';
}

export function itemValue(code: number): number {
  if (code === Item.Coin) return balance.values.coin;
  if (isGem(code)) return balance.values.gem;
  return 0;
}

/** cost = 1 + floor(n / 3): 0–2 предмета → 1 ответ, 3–5 → 2, 6–8 → 3, 9–11 → 4, 12 → 5. */
export function stepCost(n: number): number {
  return 1 + Math.floor(n / balance.bag.itemsPerCostStep);
}

export function bagScore(bag: readonly number[]): number {
  let s = 0;
  for (const c of bag) s += itemValue(c);
  return s;
}

export function countKind(bag: readonly number[], kind: ItemKind): number {
  let n = 0;
  for (const c of bag) if (itemKind(c) === kind) n++;
  return n;
}

/**
 * D = timeScale × doorAnswers × T_med в пределах timeScale × 60…150 секунд (timeScale = 2:
 * 120…300 с). Множитель не трогает бюджет генератора — зал тот же, времени на него больше.
 */
export function doorDurationMs(doorAnswers: number, tMedMs: number): number {
  const { minMs, maxMs, timeScale } = balance.door;
  return timeScale * Math.min(maxMs, Math.max(minMs, doorAnswers * tMedMs));
}

export type Stars = 0 | 1 | 2 | 3;

export function starsFor(escaped: boolean, score: number, s2: number, s3: number): Stars {
  if (!escaped) return 0;
  if (score >= s3) return 3;
  if (score >= s2) return 2;
  return 1;
}
