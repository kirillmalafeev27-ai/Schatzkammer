import { describe, expect, it } from 'vitest';
import { cellIndex, startIndex } from '../src/core/grid';
import { createPlanner } from '../src/core/planner';
import { estimateRoute, riskLevel, walkLeg } from '../src/core/risk';
import { Item } from '../src/core/rules';
import { handLevel } from './helpers';

describe('планировщик', () => {
  const lvl = handLevel({
    cols: 7,
    rows: 6,
    doorCol: 3,
    items: [
      [3, 2, Item.Coin],
      [3, 5, Item.Ruby],
      [0, 5, Item.Emerald],
      [6, 0, Item.Coin],
    ],
  });
  const planner = createPlanner({ g: lvl.g, blocked: lvl.blocked, items: lvl.items, start: startIndex(lvl.g) });

  it('без бюджета на дорогу домой план невыполним', () => {
    expect(planner.best(0.5).feasible).toBe(false);
  });

  it('с бюджетом только на выход — ноль очков', () => {
    const p = planner.best(1);
    expect(p.feasible).toBe(true);
    expect(p.score).toBe(0);
  });

  it('берёт камень, когда на него хватает бюджета', () => {
    // старт (3,0) → монета (3,2) → рубин (3,5): 5 шагов × 1; обратно 5 × 1 + выход 1 → 11
    const p = planner.best(11);
    expect(p.score).toBe(6);
    expect(p.cells).toContain(cellIndex(lvl.g, 3, 5));
    expect(p.cost).toBeLessThanOrEqual(11);
  });

  it('результат не убывает с ростом бюджета', () => {
    let prev = -1;
    for (let b = 1; b <= 60; b += 3) {
      const s = planner.best(b).score;
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
});

describe('оценка риска (2.8)', () => {
  it('считает цену с подборами по пути', () => {
    const lvl = handLevel({
      cols: 9,
      rows: 2,
      doorCol: 0,
      items: [
        [1, 0, Item.Coin],
        [2, 0, Item.Coin],
        [3, 0, Item.Coin],
      ],
    });
    const leg = walkLeg(lvl.g, lvl.blocked, lvl.items.slice(), startIndex(lvl.g), cellIndex(lvl.g, 5, 0), 0);
    // шаги: 1,1,1 (подобрали 3) затем 2,2
    expect(leg.stepCosts).toEqual([1, 1, 1, 2, 2]);
    expect(leg.cost).toBe(7);
    expect(leg.nAfter).toBe(3);
  });

  it('r = need × T_med / p / (D − t) и пороги 0.75 / 1.0', () => {
    const lvl = handLevel({ cols: 5, rows: 4, doorCol: 2 });
    const est = estimateRoute({
      g: lvl.g,
      blocked: lvl.blocked,
      items: lvl.items,
      hero: cellIndex(lvl.g, 2, 3),
      target: null,
      bagCount: 0,
      pips: 0,
      tMed: 5000,
      p: 0.8,
      remainingMs: 50_000,
    });
    expect(est.need).toBe(4);
    expect(est.estMs).toBeCloseTo(25_000);
    expect(est.r).toBeCloseTo(0.5);
    expect(est.level).toBe('safe');
    expect(riskLevel(0.8)).toBe('warn');
    expect(riskLevel(1.01)).toBe('danger');
  });

  it('накопленные заряды уменьшают need', () => {
    const lvl = handLevel({ cols: 5, rows: 4, doorCol: 2 });
    const est = estimateRoute({
      g: lvl.g,
      blocked: lvl.blocked,
      items: lvl.items,
      hero: cellIndex(lvl.g, 2, 3),
      target: cellIndex(lvl.g, 4, 3),
      bagCount: 0,
      pips: 1,
      tMed: 5000,
      p: 1,
      remainingMs: 100_000,
    });
    // к цели 2 шага, от цели к выходу 2 + 3 + 1 = 6 → 8 − 1 заряд
    expect(est.need).toBe(7);
    expect(est.toTarget?.path.length).toBe(2);
  });
});
