// Генерация уровня (раздел 5): дверь, препятствия, предметы по полосам дистанции,
// проверка, что дилемма «беру ещё или пора к выходу» существует, пороги звёзд.

import { balance } from '../config/balance';
import { scaleLevelForGrid, type LevelConfig } from '../config/levels';
import { cellCount, cellXY, exitIndex, startIndex, type GridShape } from './grid';
import { allConnected, bfsDistances } from './pathfinding';
import { createPlanner } from './planner';
import { hashSeed, mulberry32, pick, randInt, shuffle, type Rng } from './rng';
import { GEM_CODES, Item, isGem, itemValue } from './rules';
import { walkLeg } from './risk';

export const Obstacle = { None: 0, Column: 1, Rubble: 2, Head: 3 } as const;

export interface GeneratedLevel {
  seed: number;
  usedSeed: number;
  config: LevelConfig;
  g: GridShape;
  blocked: Uint8Array;
  obstacleKind: Uint8Array;
  items: Uint8Array;
  /** Длина кратчайшего пути от старта; -1 — стена/препятствие. */
  dist: Int32Array;
  maxDist: number;
  /** Бюджет B в верных ответах. */
  budget: number;
  s2: number;
  s3: number;
  allCost: number;
  gemCost: number;
  totalValue: number;
  attempts: number;
  relaxed: number;
  warnings: string[];
}

interface Attempt {
  doorCol: number;
  blocked: Uint8Array;
  obstacleKind: Uint8Array;
  items: Uint8Array;
  dist: Int32Array;
  maxDist: number;
}

function chebyshevOk(g: GridShape, gems: number[], c: number, minD: number): boolean {
  const p = cellXY(g, c);
  for (const o of gems) {
    const q = cellXY(g, o);
    const dx = Math.abs(p.x - q.x);
    const dy = Math.abs(p.y - q.y);
    if (minD === 2 ? Math.max(dx, dy) < 2 : dx + dy < 2) return false;
  }
  return true;
}

function buildAttempt(
  cfg: LevelConfig,
  cols: number,
  rows: number,
  rng: Rng,
  gemMaxDist: number,
): Attempt | null {
  const lg = balance.levelGen;
  const doorCol = randInt(rng, lg.doorCornerMargin, cols - 1 - lg.doorCornerMargin);
  const g: GridShape = { cols, rows, doorCol };
  const n = cellCount(g);
  const exit = exitIndex(g);
  const start = startIndex(g);
  const blocked = new Uint8Array(n);
  const obstacleKind = new Uint8Array(n);

  // Препятствия — не в квадрате 3 × 3 вокруг старта; все свободные клетки должны оставаться связанными.
  const candidates: number[] = [];
  for (let i = 0; i < exit; i++) {
    const { x, y } = cellXY(g, i);
    if (Math.abs(x - doorCol) <= 1 && y <= 1) continue;
    candidates.push(i);
  }
  shuffle(rng, candidates);
  let placed = 0;
  for (const c of candidates) {
    if (placed >= cfg.obstacles) break;
    blocked[c] = 1;
    if (!allConnected(g, blocked, start)) {
      blocked[c] = 0;
      continue;
    }
    obstacleKind[c] = pick(rng, [Obstacle.Column, Obstacle.Rubble, Obstacle.Head, Obstacle.Column]);
    placed++;
  }
  if (placed < cfg.obstacles) return null;

  const dist = bfsDistances(g, blocked, start);
  let maxDist = 0;
  for (let i = 0; i < exit; i++) if (dist[i] > maxDist) maxDist = dist[i];
  if (maxDist <= 0) return null;

  // Полосы дистанции.
  const near: number[] = [];
  const mid: number[] = [];
  const far: number[] = [];
  for (let i = 0; i < exit; i++) {
    if (blocked[i] || i === start) continue;
    const f = dist[i] / maxDist;
    if (f < lg.nearBand) near.push(i);
    else if (f <= lg.midBand) mid.push(i);
    else far.push(i);
  }
  shuffle(rng, near);
  shuffle(rng, mid);
  shuffle(rng, far);

  const items = new Uint8Array(n);
  const gems: number[] = [];
  const takeGem = (pool: number[]): boolean => {
    for (const minD of [2, 1]) {
      const idx = pool.findIndex((c) => !items[c] && chebyshevOk(g, gems, c, minD));
      if (idx >= 0) {
        const c = pool[idx];
        pool.splice(idx, 1);
        items[c] = pick(rng, GEM_CODES);
        gems.push(c);
        return true;
      }
    }
    return false;
  };

  const gemsMid = Math.min(cfg.gems, randInt(rng, lg.midGemsMin, lg.midGemsMax));
  // Первый камень средней полосы кладётся туда, откуда его можно вынести за gemReach × B (раздел 5.5).
  const reachable = mid.filter((c) => dist[c] <= gemMaxDist);
  if (gemsMid > 0 && reachable.length) {
    if (!takeGem(reachable)) return null;
    mid.splice(mid.indexOf(gems[gems.length - 1]), 1);
  } else if (gemsMid > 0 && !takeGem(mid) && !takeGem(far)) return null;
  for (let k = 1; k < gemsMid; k++) if (!takeGem(mid) && !takeGem(far)) return null;
  for (let k = gemsMid; k < cfg.gems; k++) if (!takeGem(far) && !takeGem(mid)) return null;

  const takeCoin = (pool: number[]): boolean => {
    const idx = pool.findIndex((c) => !items[c]);
    if (idx < 0) return false;
    items[pool[idx]] = Item.Coin;
    pool.splice(idx, 1);
    return true;
  };
  const nearCoins = Math.min(near.length, Math.round(cfg.coins * lg.nearCoinShare));
  let left = cfg.coins;
  for (let k = 0; k < nearCoins; k++) if (takeCoin(near)) left--;
  const midFree = mid.length;
  const farFree = far.length;
  const midCoins = midFree + farFree > 0 ? Math.round((left * midFree) / (midFree + farFree)) : 0;
  for (let k = 0; k < midCoins && left > 0; k++) if (takeCoin(mid)) left--;
  while (left > 0 && (takeCoin(far) || takeCoin(mid) || takeCoin(near))) left--;
  if (left > 0) return null;

  return { doorCol, blocked, obstacleKind, items, dist, maxDist };
}

/** Оценка «собрать всё и выйти»: жадный обход ближайшего по цене предмета. */
function estimateAllCost(g: GridShape, blocked: Uint8Array, items0: Uint8Array): number {
  const items = items0.slice();
  const exit = exitIndex(g);
  let pos = startIndex(g);
  let n = 0;
  let cost = 0;
  for (;;) {
    const d = bfsDistances(g, blocked, pos);
    let bestC = -1;
    let bestD = Infinity;
    for (let i = 0; i < exit; i++) {
      if (items[i] && d[i] >= 0 && d[i] < bestD) {
        bestD = d[i];
        bestC = i;
      }
    }
    if (bestC < 0) break;
    // Вместимость мешка не ограничивает обход: оценивается именно «унести всё».
    const leg = walkLeg(g, blocked, items, pos, bestC, n, Infinity);
    cost += leg.cost;
    n = leg.nAfter;
    pos = bestC;
  }
  cost += walkLeg(g, blocked, items, pos, exit, n, Infinity).cost;
  return cost;
}

/** Самый дешёвый камень «туда и обратно». */
function estimateGemCost(g: GridShape, blocked: Uint8Array, items0: Uint8Array): number {
  const exit = exitIndex(g);
  const start = startIndex(g);
  let best = Infinity;
  for (let i = 0; i < exit; i++) {
    if (!isGem(items0[i])) continue;
    const items = items0.slice();
    const a = walkLeg(g, blocked, items, start, i, 0);
    if (!a.reachable) continue;
    const b = walkLeg(g, blocked, items, i, exit, a.nAfter);
    best = Math.min(best, a.cost + b.cost);
  }
  return best;
}

export interface GenerateOptions {
  cols?: number;
  rows?: number;
  seed: number;
}

export function generateLevel(baseCfg: LevelConfig, opts: GenerateOptions): GeneratedLevel {
  const lg = balance.levelGen;
  const cols = opts.cols ?? balance.grid.cols;
  const rows = opts.rows ?? balance.grid.rows;
  const cfg = scaleLevelForGrid(baseCfg, cols, rows, balance.grid.cols, balance.grid.rows);
  const budget = cfg.doorAnswers * lg.budgetAccuracy;
  const warnings: string[] = [];

  let fallback: GeneratedLevel | null = null;
  let attempts = 0;
  for (let relax = 0; relax <= 5; relax++) {
    const mustExceed = lg.mustExceed * (1 - lg.relaxStep * relax);
    const gemReach = lg.gemReach * (1 + lg.relaxStep * relax);
    const starGap = lg.starGap * (1 - lg.relaxStep * relax);
    for (let a = 0; a < lg.maxAttempts; a++) {
      attempts++;
      const usedSeed = hashSeed(opts.seed, relax, a);
      // Туда и обратно за 2·dist + 1 ответов при пустом мешке.
      const gemMaxDist = Math.floor((gemReach * budget - 1) / 2);
      const att = buildAttempt(cfg, cols, rows, mulberry32(usedSeed), gemMaxDist);
      if (!att) continue;
      const g: GridShape = { cols, rows, doorCol: att.doorCol };
      // Сначала дешёвые проверки, планировщик — только для прошедших.
      const gemCost = estimateGemCost(g, att.blocked, att.items);
      const allCost = estimateAllCost(g, att.blocked, att.items);
      const cheapOk = allCost >= mustExceed * budget && gemCost <= gemReach * budget;
      if (!cheapOk && fallback) continue;
      const planner = createPlanner({ g, blocked: att.blocked, items: att.items, start: startIndex(g) });
      const s2 = planner.best(budget * lg.s2Frac).score;
      const s3 = planner.best(budget * lg.s3Frac).score;
      let totalValue = 0;
      for (const c of att.items) totalValue += itemValue(c);
      const level: GeneratedLevel = {
        seed: opts.seed,
        usedSeed,
        config: cfg,
        g,
        blocked: att.blocked,
        obstacleKind: att.obstacleKind,
        items: att.items,
        dist: att.dist,
        maxDist: att.maxDist,
        budget,
        s2,
        s3,
        allCost,
        gemCost,
        totalValue,
        attempts,
        relaxed: relax,
        warnings,
      };
      const ok = cheapOk && s3 >= s2 + starGap;
      if (ok) {
        if (relax > 0) {
          warnings.push(
            `levelGen: требования ослаблены на ${relax * 10}% (уровень ${cfg.id}, сид ${opts.seed})`,
          );
        }
        return level;
      }
      if (!fallback || s3 - s2 > fallback.s3 - fallback.s2) fallback = level;
    }
  }
  if (!fallback) throw new Error(`levelGen: не удалось построить зал (уровень ${cfg.id}, сид ${opts.seed})`);
  warnings.push(
    `levelGen: проверка дилеммы не пройдена, взят лучший вариант (уровень ${cfg.id}, сид ${opts.seed})`,
  );
  return fallback;
}
