// Детерминированный генератор случайных чисел. Одинаковый сид — одинаковый мир.

export type Rng = () => number;

/** mulberry32: быстрый 32-битный генератор, значения в [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Целое в [min, max] включительно. */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function randRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Перемешивание Фишера — Йетса на месте. */
export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/** Смешивание чисел в новый 32-битный сид. */
export function hashSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    let v = Math.floor(p) >>> 0;
    for (let i = 0; i < 4; i++) {
      h ^= v & 255;
      h = Math.imul(h, 0x01000193) >>> 0;
      v >>>= 8;
    }
  }
  return h >>> 0;
}

/** Нормальное распределение (Бокс — Мюллер). */
export function gaussian(rng: Rng): number {
  let u = 0;
  while (u <= Number.EPSILON) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Логнормальное распределение с заданной медианой и σ. */
export function lognormal(rng: Rng, median: number, sigma: number): number {
  return median * Math.exp(sigma * gaussian(rng));
}

/** Случайный сид из времени и Math.random — только для новых раундов, не для логики. */
export function freshSeed(): number {
  return hashSeed(Date.now(), Math.floor(Math.random() * 0xffffffff));
}
