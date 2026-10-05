import { describe, expect, it } from 'vitest';
import { doorDurationMs, Item, itemValue, starsFor, stepCost } from '../src/core/rules';

describe('цена шага (2.2.3)', () => {
  it('меняется ровно на 3, 6, 9 и 12 предметах', () => {
    const expected = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5];
    expected.forEach((c, n) => expect(stepCost(n)).toBe(c));
  });
});

describe('ценность', () => {
  it('монета — 1, камень — 5', () => {
    expect(itemValue(Item.Coin)).toBe(1);
    expect(itemValue(Item.Ruby)).toBe(5);
    expect(itemValue(Item.Emerald)).toBe(5);
    expect(itemValue(Item.Sapphire)).toBe(5);
    expect(itemValue(Item.None)).toBe(0);
  });
});

describe('дверь (2.4.1)', () => {
  it('D = 2 × doorAnswers × T_med в пределах 120–300 с: времени на дверь вдвое больше', () => {
    expect(doorDurationMs(24, 5000)).toBe(240_000);
    expect(doorDurationMs(24, 1000)).toBe(120_000);
    expect(doorDurationMs(24, 10_000)).toBe(300_000);
  });
});

describe('звёзды (2.6)', () => {
  it('★ — вышел, ★★ — S2, ★★★ — S3, 0 — не вышел', () => {
    expect(starsFor(false, 99, 10, 20)).toBe(0);
    expect(starsFor(true, 0, 10, 20)).toBe(1);
    expect(starsFor(true, 10, 10, 20)).toBe(2);
    expect(starsFor(true, 20, 10, 20)).toBe(3);
  });
});
