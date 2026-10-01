// Контроллер раунда: держит GameState, прогоняет действия через редуктор и раздаёт события видам.
// Вид никогда не меняет состояние напрямую (раздел 13.3.4).

import { balance } from '../config/balance';
import type { Action, GameEvent } from '../core/events';
import type { GeneratedLevel } from '../core/levelGen';
import type { Pace } from '../core/pace';
import { estimateRoute, type RouteEstimate } from '../core/risk';
import { createState, reduce, remainingMs, type GameState } from '../core/state';

export type RoundListener = (events: GameEvent[], state: GameState, prev: GameState) => void;

export class Round {
  state: GameState;
  readonly level: GeneratedLevel;
  readonly pace: Pace;
  readonly log: Action[] = [];
  private readonly listeners = new Set<RoundListener>();
  private riskCache: RouteEstimate | null = null;
  private riskAge = Infinity;
  /** Бессмертие для отладки: дверь не закрывается. */
  immortal = false;

  constructor(level: GeneratedLevel, pace: Pace) {
    this.level = level;
    this.pace = pace;
    this.state = createState(level, pace);
  }

  on(fn: RoundListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispatch(action: Action): GameEvent[] {
    if (this.immortal && action.type === 'TICK' && this.state.D - this.state.t - action.dt < 1500) {
      return [];
    }
    const prev = this.state;
    const r = reduce(prev, action);
    this.state = r.state;
    this.log.push(action);
    if (r.events.length) this.riskAge = Infinity;
    if (r.state !== prev) {
      if (action.type === 'TICK') this.riskAge += action.dt;
      for (const fn of this.listeners) fn(r.events, r.state, prev);
    }
    return r.events;
  }

  /** Оценка маршрута; пересчитывается раз в 250 мс и после каждого события (раздел 2.8.4). */
  risk(): RouteEstimate {
    if (!this.riskCache || this.riskAge >= balance.risk.recalcMs) {
      const s = this.state;
      this.riskCache = estimateRoute({
        g: s.g,
        blocked: s.level.blocked,
        items: s.items,
        hero: s.hero,
        target: s.target,
        bagCount: s.bag.length,
        pips: s.pips,
        tMed: s.tMed,
        p: s.p,
        remainingMs: remainingMs(s),
      });
      this.riskAge = 0;
    }
    return this.riskCache;
  }

  invalidateRisk(): void {
    this.riskAge = Infinity;
  }
}
