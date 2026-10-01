// Планировщик (раздел 5): лучевой поиск по последовательностям «предмет → … → выход».
// Расстояния между ключевыми точками — через BFS; переход стоит расстояние × cost(n) в момент перехода.
// Попутные подборы и выбрасывания не моделируются: это оценка, а не точный решатель.

import { balance } from '../config/balance';
import { exitIndex, type GridShape } from './grid';
import { bfsDistances, type Blocked } from './pathfinding';
import { itemValue, stepCost } from './rules';

export interface PlannerInput {
  g: GridShape;
  blocked: Blocked;
  items: ArrayLike<number>;
  /** Где сейчас герой. */
  start: number;
  /** Сколько предметов уже в мешке. */
  bagCount?: number;
  capacity?: number;
}

export interface Plan {
  /** Сколько очков план добавит к мешку. */
  score: number;
  /** Сколько верных ответов он стоит, включая путь к выходу. */
  cost: number;
  /** Клетки предметов в порядке посещения. */
  cells: number[];
  feasible: boolean;
}

export interface Planner {
  best(budget: number, opts?: { beamWidth?: number; maxDepth?: number }): Plan;
  readonly itemCells: readonly number[];
}

// Узлы хранятся в плоских массивах; последовательность восстанавливается по ссылкам на родителя.
class NodePool {
  pos: Int32Array;
  n: Int32Array;
  score: Float64Array;
  spent: Float64Array;
  mask: Float64Array;
  parent: Int32Array;
  size = 0;
  constructor(cap: number) {
    this.pos = new Int32Array(cap);
    this.n = new Int32Array(cap);
    this.score = new Float64Array(cap);
    this.spent = new Float64Array(cap);
    this.mask = new Float64Array(cap);
    this.parent = new Int32Array(cap);
  }
  add(pos: number, n: number, score: number, spent: number, mask: number, parent: number): number {
    if (this.size >= this.pos.length) this.grow();
    const i = this.size++;
    this.pos[i] = pos;
    this.n[i] = n;
    this.score[i] = score;
    this.spent[i] = spent;
    this.mask[i] = mask;
    this.parent[i] = parent;
    return i;
  }
  private grow(): void {
    const cap = this.pos.length * 2;
    const re = <T extends Int32Array | Float64Array>(a: T): T => {
      const b = new (a.constructor as { new (n: number): T })(cap);
      b.set(a);
      return b;
    };
    this.pos = re(this.pos);
    this.n = re(this.n);
    this.score = re(this.score);
    this.spent = re(this.spent);
    this.mask = re(this.mask);
    this.parent = re(this.parent);
  }
}

export function createPlanner(input: PlannerInput): Planner {
  const { g, blocked, items, start } = input;
  const capacity = input.capacity ?? balance.bag.capacity;
  const bag0 = input.bagCount ?? 0;
  const exit = exitIndex(g);

  // Ключевые точки: 0 — герой, 1..m — предметы, m+1 — выход.
  const itemCells: number[] = [];
  for (let i = 0; i < exit; i++) if (items[i] && i !== start) itemCells.push(i);
  if (itemCells.length > 30) itemCells.length = 30; // битовая маска ограничена 30 предметами
  const keys = [start, ...itemCells, exit];
  const K = keys.length;
  const exitKey = K - 1;
  const dm = new Int32Array(K * K);
  for (let a = 0; a < K; a++) {
    const d = bfsDistances(g, blocked, keys[a]);
    for (let b = 0; b < K; b++) dm[a * K + b] = d[keys[b]];
  }
  const values = keys.map((k, idx) => (idx === 0 || idx === exitKey ? 0 : itemValue(items[k])));
  const bits = keys.map((_, idx) => (idx === 0 || idx === exitKey ? 0 : 2 ** (idx - 1)));

  function best(budget: number, opts: { beamWidth?: number; maxDepth?: number } = {}): Plan {
    const beamWidth = opts.beamWidth ?? balance.planner.beamWidth;
    const maxDepth = opts.maxDepth ?? balance.planner.maxDepth;
    const homeDirect = dm[exitKey];
    if (homeDirect < 0) return { score: 0, cost: Infinity, cells: [], feasible: false };
    const homeCost0 = homeDirect * stepCost(bag0);
    if (homeCost0 > budget) return { score: 0, cost: homeCost0, cells: [], feasible: false };

    const pool = new NodePool(4096);
    let bestNode = -1;
    let bestScore = 0;
    let bestCost = homeCost0;
    let beam = [pool.add(0, bag0, 0, 0, 0, -1)];

    for (let depth = 0; depth < maxDepth && beam.length; depth++) {
      const next = new Map<number, number>();
      for (const node of beam) {
        const nn = pool.n[node];
        if (nn >= capacity) continue;
        const pos = pool.pos[node];
        const c = stepCost(nn);
        const c1 = stepCost(nn + 1);
        const mask = pool.mask[node];
        for (let k = 1; k < exitKey; k++) {
          const bit = bits[k];
          if (Math.floor(mask / bit) % 2 === 1) continue;
          const dk = dm[pos * K + k];
          const dh = dm[k * K + exitKey];
          if (dk < 0 || dh < 0) continue;
          const spent = pool.spent[node] + dk * c;
          const total = spent + dh * c1;
          if (total > budget) continue;
          const nmask = mask + bit;
          const key = nmask * 64 + k;
          const prev = next.get(key);
          if (prev !== undefined && pool.spent[prev] <= spent) continue;
          const sc = pool.score[node] + values[k];
          const child = pool.add(k, nn + 1, sc, spent, nmask, node);
          next.set(key, child);
          if (sc > bestScore || (sc === bestScore && total < bestCost)) {
            bestScore = sc;
            bestCost = total;
            bestNode = child;
          }
        }
      }
      beam = [...next.values()];
      beam.sort((a, b) => pool.score[b] - pool.score[a] || pool.spent[a] - pool.spent[b]);
      if (beam.length > beamWidth) beam.length = beamWidth;
    }

    const cells: number[] = [];
    for (let i = bestNode; i > 0; i = pool.parent[i]) cells.push(keys[pool.pos[i]]);
    cells.reverse();
    return { score: bestScore, cost: bestCost, cells, feasible: true };
  }

  return { best, itemCells };
}
