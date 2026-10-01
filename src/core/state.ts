// Состояние раунда и редуктор. Состояние меняется только через reduce(state, action);
// редуктор возвращает новое состояние и список событий. Никакой случайности внутри:
// одинаковые сид и журнал действий дают одинаковый результат.

import { balance } from '../config/balance';
import type { Action, GameEvent, PauseReason } from './events';
import { cellXY, exitIndex, startIndex, type GridShape } from './grid';
import type { GeneratedLevel } from './levelGen';
import { findPath } from './pathfinding';
import { bagScore, doorDurationMs, isGem, itemValue, stepCost } from './rules';

export type Status = 'intro' | 'playing' | 'escaped' | 'locked';

export interface RoundStats {
  correct: number;
  wrong: number;
  answerTimes: number[];
  steps: number;
  lostToSand: number;
  dropped: number;
}

export interface GameState {
  readonly level: GeneratedLevel;
  readonly g: GridShape;
  readonly tMed: number;
  readonly p: number;
  /** Длительность двери, мс. */
  readonly D: number;
  /** Момент засыпания каждой клетки, мс; Infinity — не засыпается. */
  readonly sandAt: Float64Array;
  items: Uint8Array;
  warned: Uint8Array;
  buried: Uint8Array;
  bag: number[];
  pips: number;
  hero: number;
  facing: 1 | -1;
  target: number | null;
  route: number[];
  t: number;
  status: Status;
  pauseReasons: PauseReason[];
  notches: number;
  countdown: number;
  escapedAt: number | null;
  stats: RoundStats;
}

export interface CreateStateOptions {
  tMed: number;
  p: number;
}

/** Расписание песка (раздел 2.5): дальние клетки засыпаются первыми, линейно по дистанции. */
export function buildSandSchedule(level: GeneratedLevel, D: number): Float64Array {
  const { g, dist, maxDist, config } = level;
  const n = g.cols * g.rows + 1;
  const at = new Float64Array(n).fill(Infinity);
  const minD = config.sandMinDistFrac * maxDist;
  let dLo = Infinity;
  for (let i = 0; i < n - 1; i++) {
    if (dist[i] >= 0 && dist[i] >= minD) dLo = Math.min(dLo, dist[i]);
  }
  if (!Number.isFinite(dLo)) return at;
  for (let i = 0; i < n - 1; i++) {
    const d = dist[i];
    if (d < 0 || d < minD) continue;
    const f = maxDist > dLo ? (d - dLo) / (maxDist - dLo) : 1;
    // f = 1 — самые дальние: засыпаются в sandStartFrac × D; f = 0 — ближайшие: в sandEndFrac × D.
    const frac = config.sandEndFrac + (config.sandStartFrac - config.sandEndFrac) * f;
    at[i] = frac * D;
  }
  return at;
}

export function createState(level: GeneratedLevel, opts: CreateStateOptions): GameState {
  const D = doorDurationMs(level.config.doorAnswers, opts.tMed);
  const n = level.g.cols * level.g.rows + 1;
  return {
    level,
    g: level.g,
    tMed: opts.tMed,
    p: opts.p,
    D,
    sandAt: buildSandSchedule(level, D),
    items: level.items.slice(),
    warned: new Uint8Array(n),
    buried: new Uint8Array(n),
    bag: [],
    pips: 0,
    hero: startIndex(level.g),
    facing: 1,
    target: null,
    route: [],
    t: 0,
    status: 'intro',
    pauseReasons: [],
    notches: 0,
    countdown: balance.door.countdownFrom + 1,
    escapedAt: null,
    stats: { correct: 0, wrong: 0, answerTimes: [], steps: 0, lostToSand: 0, dropped: 0 },
  };
}

// ── Селекторы ────────────────────────────────────────────────────────────────

export const currentCost = (s: GameState): number => stepCost(s.bag.length);
export const score = (s: GameState): number => bagScore(s.bag);
export const isPaused = (s: GameState): boolean => s.pauseReasons.length > 0;
export const remainingMs = (s: GameState): number => Math.max(0, s.D - s.t);
export const isActive = (s: GameState): boolean => s.status === 'playing' && !isPaused(s);
/** Заряды полны, а цели нет — ответы неактивны (раздел 2.3.4). */
export const awaitingTarget = (s: GameState): boolean => s.pips >= currentCost(s) && s.target == null;
export const canAnswer = (s: GameState): boolean => isActive(s) && !awaitingTarget(s);
export const coinsInBag = (s: GameState): number => s.bag.filter((c) => !isGem(c)).length;
export const gemsInBag = (s: GameState): number => s.bag.filter((c) => isGem(c)).length;

export function isReachable(s: GameState, cell: number): boolean {
  return findPath(s.g, s.level.blocked, s.items, s.hero, cell) != null;
}

// ── Редуктор ─────────────────────────────────────────────────────────────────

function draft(s: GameState): GameState {
  return {
    ...s,
    items: s.items.slice(),
    warned: s.warned.slice(),
    buried: s.buried.slice(),
    bag: s.bag.slice(),
    route: s.route.slice(),
    pauseReasons: s.pauseReasons.slice(),
    stats: { ...s.stats, answerTimes: s.stats.answerTimes.slice() },
  };
}

function recomputeRoute(s: GameState): void {
  if (s.target == null) {
    s.route = [];
    return;
  }
  s.route = findPath(s.g, s.level.blocked, s.items, s.hero, s.target) ?? [];
}

function pickupAt(s: GameState, cell: number, ev: GameEvent[]): void {
  const it = s.items[cell];
  if (!it) return;
  if (s.bag.length >= balance.bag.capacity) {
    ev.push({ type: 'PICKUP_BLOCKED', cell, item: it });
    return;
  }
  const before = stepCost(s.bag.length);
  s.items[cell] = 0;
  s.bag.push(it);
  ev.push({ type: 'PICKUP', cell, item: it, bagCount: s.bag.length });
  const after = stepCost(s.bag.length);
  if (after !== before) ev.push({ type: 'COST_CHANGED', from: before, to: after });
}

function tryStep(s: GameState, ev: GameEvent[]): void {
  const cost = stepCost(s.bag.length);
  if (s.pips < cost || s.target == null || s.status !== 'playing') return;
  const route = findPath(s.g, s.level.blocked, s.items, s.hero, s.target);
  if (!route || route.length === 0) {
    s.target = null;
    s.route = [];
    ev.push({ type: 'TARGET_CLEARED' });
    return;
  }
  const from = s.hero;
  const to = route[0];
  const dx = cellXY(s.g, to).x - cellXY(s.g, from).x;
  if (dx !== 0) s.facing = dx > 0 ? 1 : -1;
  s.hero = to;
  s.pips = 0;
  s.stats.steps++;
  ev.push({ type: 'STEP', from, to, cost, facing: s.facing });

  if (to === exitIndex(s.g)) {
    s.status = 'escaped';
    s.escapedAt = s.t;
    s.target = null;
    s.route = [];
    ev.push({ type: 'ESCAPED', score: bagScore(s.bag), timeLeftMs: s.D - s.t });
    return;
  }
  pickupAt(s, to, ev);
  if (s.hero === s.target) {
    ev.push({ type: 'TARGET_REACHED', cell: s.target });
    s.target = null;
  }
  recomputeRoute(s);
}

function clampPips(s: GameState): void {
  const cost = stepCost(s.bag.length);
  if (s.pips > cost) s.pips = cost;
}

export interface ReduceResult {
  state: GameState;
  events: GameEvent[];
}

export function reduce(state: GameState, action: Action): ReduceResult {
  const ev: GameEvent[] = [];
  const same = (): ReduceResult => ({ state, events: ev });

  switch (action.type) {
    case 'START': {
      if (state.status !== 'intro') return same();
      const s = draft(state);
      s.status = 'playing';
      ev.push({ type: 'STARTED' });
      return { state: s, events: ev };
    }

    case 'PAUSE': {
      if (state.pauseReasons.includes(action.reason)) return same();
      const s = draft(state);
      const was = isPaused(s);
      s.pauseReasons.push(action.reason);
      if (!was) ev.push({ type: 'PAUSED' });
      return { state: s, events: ev };
    }

    case 'RESUME': {
      if (!state.pauseReasons.includes(action.reason)) return same();
      const s = draft(state);
      s.pauseReasons = s.pauseReasons.filter((r) => r !== action.reason);
      if (!isPaused(s)) ev.push({ type: 'RESUMED' });
      return { state: s, events: ev };
    }

    case 'TICK': {
      if (!isActive(state)) return same();
      const dt = Math.max(0, Math.min(balance.frame.maxDtMs, action.dt));
      if (dt === 0) return same();
      // Быстрый путь: если за этот кадр не случается ни одного события, меняется только t.
      if (!eventDue(state, state.t + dt)) return { state: { ...state, t: state.t + dt }, events: ev };
      const s = draft(state);
      s.t += dt;
      advanceWorld(s, ev);
      return { state: s, events: ev };
    }

    case 'DEBUG_SET_TIME': {
      if (state.status !== 'playing') return same();
      const s = draft(state);
      s.t = Math.max(s.t, Math.min(action.t, s.D));
      advanceWorld(s, ev);
      return { state: s, events: ev };
    }

    case 'ANSWER': {
      if (!isActive(state)) return same();
      const s = draft(state);
      s.stats.answerTimes.push(action.timeMs);
      if (!action.correct) {
        s.stats.wrong++;
        ev.push({ type: 'WRONG' });
        return { state: s, events: ev };
      }
      s.stats.correct++;
      const cost = stepCost(s.bag.length);
      if (s.pips < cost) {
        s.pips++;
        ev.push({ type: 'PIP', pips: s.pips, cost });
      }
      tryStep(s, ev);
      return { state: s, events: ev };
    }

    case 'SET_TARGET': {
      if (!isActive(state)) return same();
      const cell = action.cell;
      const total = state.g.cols * state.g.rows + 1;
      if (cell < 0 || cell >= total) return same();
      if (cell === state.hero) return reduce(state, { type: 'CANCEL_TARGET' });
      if (state.level.blocked[cell] || !isReachable(state, cell)) {
        ev.push({ type: 'BUMP', cell });
        return same();
      }
      const s = draft(state);
      s.target = cell;
      recomputeRoute(s);
      ev.push({ type: 'TARGET_SET', cell });
      tryStep(s, ev);
      return { state: s, events: ev };
    }

    case 'CANCEL_TARGET': {
      if (!isActive(state) || state.target == null) return same();
      const s = draft(state);
      s.target = null;
      s.route = [];
      ev.push({ type: 'TARGET_CLEARED' });
      return { state: s, events: ev };
    }

    case 'DROP': {
      if (!isActive(state)) return same();
      const want = action.kind === 'gem';
      let idx = -1;
      for (let i = state.bag.length - 1; i >= 0; i--) {
        if (isGem(state.bag[i]) === want) {
          idx = i;
          break;
        }
      }
      if (idx < 0) return same();
      const s = draft(state);
      const before = stepCost(s.bag.length);
      const [item] = s.bag.splice(idx, 1);
      s.stats.dropped++;
      ev.push({ type: 'DROPPED', item });
      const after = stepCost(s.bag.length);
      if (after !== before) ev.push({ type: 'COST_CHANGED', from: before, to: after });
      // Если под героем лежит предмет, а место освободилось — он подбирается сразу.
      pickupAt(s, s.hero, ev);
      clampPips(s);
      recomputeRoute(s);
      tryStep(s, ev);
      return { state: s, events: ev };
    }
  }
  return same();
}

/** Случится ли к моменту `t` хоть одно событие мира (песок, механизм, отсчёт, закрытие). */
function eventDue(s: GameState, t: number): boolean {
  if (t >= s.D) return true;
  const maxNotch = Math.round(1 / balance.door.notchFrac) - 1;
  if (s.notches < maxNotch && t >= (s.notches + 1) * balance.door.notchFrac * s.D) return true;
  if (s.countdown > 1 && s.D - t <= (s.countdown - 1) * 1000) return true;
  const warnMs = balance.sand.warnMs;
  for (let i = 0; i < s.sandAt.length; i++) {
    const at = s.sandAt[i];
    if (at === Infinity) continue;
    if ((!s.warned[i] && t >= at - warnMs) || (!s.buried[i] && t >= at)) return true;
  }
  return false;
}

function advanceWorld(s: GameState, ev: GameEvent[]): void {
  const warnMs = balance.sand.warnMs;
  let routeDirty = false;
  const n = s.sandAt.length;
  for (let i = 0; i < n; i++) {
    const at = s.sandAt[i];
    if (!Number.isFinite(at)) continue;
    if (!s.warned[i] && s.t >= at - warnMs) {
      s.warned[i] = 1;
      ev.push({ type: 'SAND_WARN', cell: i });
    }
    if (!s.buried[i] && s.t >= at) {
      s.buried[i] = 1;
      const item = s.items[i];
      if (item) {
        s.items[i] = 0;
        s.stats.lostToSand++;
        routeDirty = true;
      }
      ev.push({ type: 'SAND_BURIED', cell: i, item });
    }
  }
  if (routeDirty) recomputeRoute(s);

  const notchMs = balance.door.notchFrac * s.D;
  const maxNotch = Math.round(1 / balance.door.notchFrac) - 1;
  while (s.notches < maxNotch && s.t >= (s.notches + 1) * notchMs) {
    s.notches++;
    ev.push({ type: 'DOOR_NOTCH', n: s.notches });
  }
  while (s.countdown > 1 && s.D - s.t <= (s.countdown - 1) * 1000) {
    s.countdown--;
    ev.push({ type: 'COUNTDOWN', n: s.countdown });
  }
  if (s.t >= s.D && s.status === 'playing') {
    s.status = 'locked';
    s.target = null;
    s.route = [];
    let lost = 0;
    for (const c of s.bag) lost += itemValue(c);
    ev.push({ type: 'LOCKED_IN', lost });
  }
}

/** Свернуть журнал действий — для тестов, повторов и симуляции. */
export function replay(state: GameState, actions: readonly Action[]): ReduceResult {
  let s = state;
  const all: GameEvent[] = [];
  for (const a of actions) {
    const r = reduce(s, a);
    s = r.state;
    all.push(...r.events);
  }
  return { state: s, events: all };
}
