import { describe, expect, it } from 'vitest';
import { levels } from '../src/config/levels';
import { cellXY, exitIndex, startIndex } from '../src/core/grid';
import { generateLevel } from '../src/core/levelGen';
import { allConnected } from '../src/core/pathfinding';
import { isGem, Item } from '../src/core/rules';

describe('генератор уровней (раздел 5)', () => {
  it('на 1000 сидов не выдаёт ни одного несвязного зала', () => {
    let disconnected = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const cfg = levels[seed % levels.length];
      const lvl = generateLevel(cfg, { seed });
      if (!allConnected(lvl.g, lvl.blocked, startIndex(lvl.g))) disconnected++;
    }
    expect(disconnected).toBe(0);
  }, 180_000);

  it('соблюдает раскладку: дверь, старт, препятствия, предметы, камни не рядом', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const cfg = levels[seed % levels.length];
      const lvl = generateLevel(cfg, { seed });
      const { g } = lvl;
      expect(g.doorCol).toBeGreaterThanOrEqual(2);
      expect(g.doorCol).toBeLessThanOrEqual(g.cols - 3);
      const start = startIndex(g);
      let coins = 0;
      let gems = 0;
      let obstacles = 0;
      const gemCells: number[] = [];
      for (let i = 0; i < exitIndex(g); i++) {
        const { x, y } = cellXY(g, i);
        if (lvl.blocked[i]) {
          obstacles++;
          expect(Math.abs(x - g.doorCol) <= 1 && y <= 1).toBe(false);
          expect(lvl.items[i]).toBe(0);
        }
        if (lvl.items[i] === Item.Coin) coins++;
        if (isGem(lvl.items[i])) {
          gems++;
          gemCells.push(i);
        }
      }
      expect(lvl.items[start]).toBe(0);
      expect(coins).toBe(lvl.config.coins);
      expect(gems).toBe(lvl.config.gems);
      expect(obstacles).toBe(lvl.config.obstacles);
      for (const a of gemCells)
        for (const b of gemCells) {
          if (a === b) continue;
          const p = cellXY(g, a);
          const q = cellXY(g, b);
          expect(Math.abs(p.x - q.x) + Math.abs(p.y - q.y)).toBeGreaterThan(1);
        }
      // Ближняя полоса — только монеты.
      for (let i = 0; i < exitIndex(g); i++) {
        if (lvl.dist[i] >= 0 && lvl.dist[i] < 0.3 * lvl.maxDist) expect(isGem(lvl.items[i])).toBe(false);
      }
    }
  }, 60_000);

  it('дилемма существует: всё не унести, камень достижим, жадность может окупиться', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const cfg = levels[seed % levels.length];
      const lvl = generateLevel(cfg, { seed });
      if (lvl.relaxed > 0 || lvl.warnings.length) continue;
      expect(lvl.allCost).toBeGreaterThanOrEqual(1.5 * lvl.budget);
      expect(lvl.gemCost).toBeLessThanOrEqual(0.7 * lvl.budget);
      expect(lvl.s3).toBeGreaterThanOrEqual(lvl.s2 + 5);
    }
  }, 60_000);

  it('детерминирован по сиду', () => {
    const a = generateLevel(levels[2], { seed: 777 });
    const b = generateLevel(levels[2], { seed: 777 });
    expect([...a.items]).toEqual([...b.items]);
    expect([...a.blocked]).toEqual([...b.blocked]);
    expect(a.g).toEqual(b.g);
    expect([a.s2, a.s3]).toEqual([b.s2, b.s3]);
  });

  it('на маленькой сетке уменьшает число предметов пропорционально площади', () => {
    const lvl = generateLevel(levels[5], { seed: 5, cols: 7, rows: 7 });
    expect(lvl.g.cols).toBe(7);
    expect(lvl.config.coins).toBeLessThan(levels[5].coins);
  });
});
