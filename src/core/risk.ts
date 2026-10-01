// Оценка маршрута и риска (раздел 2.8): сколько ответов нужно, успеет ли герой к выходу.

import { balance } from '../config/balance';
import { exitIndex, type GridShape } from './grid';
import { findPath, type Blocked } from './pathfinding';
import { stepCost } from './rules';

export interface Leg {
  path: number[];
  /** Сумма цен шагов с учётом подборов по пути. */
  cost: number;
  /** Число предметов в мешке после ноги. */
  nAfter: number;
  /** Цена каждого шага ноги (для значков и отладки). */
  stepCosts: number[];
  reachable: boolean;
}

/**
 * Стоимость пути `from → to` в ответах: каждый шаг стоит cost(n) в момент шага, предмет на клетке
 * подбирается, если в мешке есть место. Массив `items` изменяется — передайте копию.
 */
export function walkLeg(
  g: GridShape,
  blocked: Blocked,
  items: Uint8Array,
  from: number,
  to: number,
  n: number,
  capacity: number = balance.bag.capacity,
): Leg {
  const path = findPath(g, blocked, items, from, to);
  if (!path) return { path: [], cost: Infinity, nAfter: n, stepCosts: [], reachable: false };
  let cost = 0;
  const stepCosts: number[] = [];
  for (const c of path) {
    const sc = stepCost(n);
    cost += sc;
    stepCosts.push(sc);
    if (items[c] && n < capacity) {
      items[c] = 0;
      n++;
    }
  }
  return { path, cost, nAfter: n, stepCosts, reachable: true };
}

export type RiskLevel = 'safe' | 'warn' | 'danger';

export interface RouteEstimate {
  toTarget: Leg | null;
  toExit: Leg;
  /** Сколько верных ответов ещё нужно (с учётом накопленных зарядов). */
  need: number;
  /** Оценка времени в мс: need × T_med / p. */
  estMs: number;
  r: number;
  level: RiskLevel;
}

export function riskLevel(r: number): RiskLevel {
  if (r < balance.risk.safeBelow) return 'safe';
  if (r <= balance.risk.dangerAbove) return 'warn';
  return 'danger';
}

export interface RouteInput {
  g: GridShape;
  blocked: Blocked;
  items: ArrayLike<number>;
  hero: number;
  target: number | null;
  bagCount: number;
  pips: number;
  tMed: number;
  p: number;
  remainingMs: number;
}

export function estimateRoute(inp: RouteInput): RouteEstimate {
  const exit = exitIndex(inp.g);
  const items = Uint8Array.from(inp.items as ArrayLike<number>);
  let n = inp.bagCount;
  let from = inp.hero;
  let toTarget: Leg | null = null;
  if (inp.target != null && inp.target !== exit && inp.target !== inp.hero) {
    toTarget = walkLeg(inp.g, inp.blocked, items, from, inp.target, n);
    if (toTarget.reachable) {
      n = toTarget.nAfter;
      from = inp.target;
    }
  }
  const toExit = walkLeg(inp.g, inp.blocked, items, from, exit, n);
  const total = (toTarget?.reachable ? toTarget.cost : 0) + toExit.cost;
  const need = Math.max(0, total - inp.pips);
  const estMs = (need * inp.tMed) / Math.max(0.01, inp.p);
  const r = inp.remainingMs > 0 ? estMs / inp.remainingMs : Infinity;
  return { toTarget, toExit, need, estMs, r, level: riskLevel(r) };
}
