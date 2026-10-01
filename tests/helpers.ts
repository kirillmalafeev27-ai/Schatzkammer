import { getLevel, type LevelConfig } from '../src/config/levels';
import { cellCount, cellIndex, exitIndex, startIndex, type GridShape } from '../src/core/grid';
import type { GeneratedLevel } from '../src/core/levelGen';
import { bfsDistances } from '../src/core/pathfinding';
import { itemValue } from '../src/core/rules';
import { createState, reduce, type GameState } from '../src/core/state';
import type { Action, GameEvent } from '../src/core/events';

export interface HandLevel {
  cols: number;
  rows: number;
  doorCol: number;
  obstacles?: [number, number][];
  items?: [number, number, number][];
  config?: Partial<LevelConfig>;
}

/** Собрать уровень вручную — для точных тестов правил. */
export function handLevel(h: HandLevel): GeneratedLevel {
  const g: GridShape = { cols: h.cols, rows: h.rows, doorCol: h.doorCol };
  const n = cellCount(g);
  const blocked = new Uint8Array(n);
  const obstacleKind = new Uint8Array(n);
  for (const [x, y] of h.obstacles ?? []) {
    blocked[cellIndex(g, x, y)] = 1;
    obstacleKind[cellIndex(g, x, y)] = 1;
  }
  const items = new Uint8Array(n);
  for (const [x, y, c] of h.items ?? []) items[cellIndex(g, x, y)] = c;
  const dist = bfsDistances(g, blocked, startIndex(g));
  let maxDist = 0;
  for (let i = 0; i < exitIndex(g); i++) maxDist = Math.max(maxDist, dist[i]);
  let totalValue = 0;
  for (const c of items) totalValue += itemValue(c);
  const config: LevelConfig = { ...getLevel(1), ...h.config };
  return {
    seed: 1,
    usedSeed: 1,
    config,
    g,
    blocked,
    obstacleKind,
    items,
    dist,
    maxDist,
    budget: config.doorAnswers * 0.8,
    s2: 5,
    s3: 10,
    allCost: 100,
    gemCost: 5,
    totalValue,
    attempts: 1,
    relaxed: 0,
    warnings: [],
  };
}

export class Driver {
  state: GameState;
  events: GameEvent[] = [];
  log: Action[] = [];
  constructor(level: GeneratedLevel, tMed = 5000, p = 0.8) {
    this.state = createState(level, { tMed, p });
  }
  do(a: Action): GameEvent[] {
    this.log.push(a);
    const r = reduce(this.state, a);
    this.state = r.state;
    this.events.push(...r.events);
    return r.events;
  }
  start(): this {
    this.do({ type: 'START' });
    return this;
  }
  correct(times = 1): GameEvent[] {
    const out: GameEvent[] = [];
    for (let i = 0; i < times; i++) out.push(...this.do({ type: 'ANSWER', correct: true, timeMs: 3000 }));
    return out;
  }
  wrong(): GameEvent[] {
    return this.do({ type: 'ANSWER', correct: false, timeMs: 3000 });
  }
  target(x: number, y: number): GameEvent[] {
    return this.do({ type: 'SET_TARGET', cell: cellIndex(this.state.g, x, y) });
  }
  tick(ms: number): GameEvent[] {
    const out: GameEvent[] = [];
    while (ms > 0) {
      const dt = Math.min(100, ms);
      out.push(...this.do({ type: 'TICK', dt }));
      ms -= dt;
    }
    return out;
  }
  cell(x: number, y: number): number {
    return cellIndex(this.state.g, x, y);
  }
}

export const types = (ev: GameEvent[]) => ev.map((e) => e.type);
