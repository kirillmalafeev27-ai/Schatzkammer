import { describe, expect, it } from 'vitest';
import { exitIndex } from '../src/core/grid';
import { Item } from '../src/core/rules';
import {
  awaitingTarget,
  canAnswer,
  createState,
  currentCost,
  reduce,
  replay,
  score,
} from '../src/core/state';
import type { Action } from '../src/core/events';
import { mulberry32 } from '../src/core/rng';
import { Driver, handLevel, types } from './helpers';

/** Коридор: старт в (0,0), 13 монет справа. */
function corridor(itemsCount = 13) {
  const items: [number, number, number][] = [];
  for (let x = 1; x <= itemsCount; x++) items.push([x, 0, Item.Coin]);
  return handLevel({ cols: itemsCount + 2, rows: 2, doorCol: 0, items });
}

describe('часы', () => {
  it('стоят на интро', () => {
    const d = new Driver(handLevel({ cols: 5, rows: 4, doorCol: 2 }));
    d.tick(5000);
    expect(d.state.t).toBe(0);
    expect(d.state.status).toBe('intro');
    d.start();
    d.tick(500);
    expect(d.state.t).toBe(500);
  });

  it('стоят на паузе и подсказках; причины паузы независимы', () => {
    const d = new Driver(handLevel({ cols: 5, rows: 4, doorCol: 2 })).start();
    d.do({ type: 'PAUSE', reason: 'user' });
    d.do({ type: 'PAUSE', reason: 'tutorial' });
    d.tick(1000);
    expect(d.state.t).toBe(0);
    d.do({ type: 'RESUME', reason: 'user' });
    d.tick(1000);
    expect(d.state.t).toBe(0);
    d.do({ type: 'RESUME', reason: 'tutorial' });
    d.tick(1000);
    expect(d.state.t).toBe(1000);
  });

  it('шаг времени кадра ограничен 100 мс', () => {
    const d = new Driver(handLevel({ cols: 5, rows: 4, doorCol: 2 })).start();
    d.do({ type: 'TICK', dt: 5000 });
    expect(d.state.t).toBe(100);
  });

  it('на паузе ответы и цели не принимаются', () => {
    const d = new Driver(handLevel({ cols: 5, rows: 4, doorCol: 2 })).start();
    d.do({ type: 'PAUSE', reason: 'hidden' });
    d.correct();
    d.target(2, 3);
    expect(d.state.pips).toBe(0);
    expect(d.state.target).toBeNull();
  });
});

describe('ход (2.3)', () => {
  it('каждый верный ответ — заряд; шаг в момент последнего заряда', () => {
    const d = new Driver(handLevel({ cols: 5, rows: 4, doorCol: 2 })).start();
    d.target(2, 3);
    expect(d.state.target).toBe(d.cell(2, 3));
    const ev = d.correct();
    expect(types(ev)).toEqual(['PIP', 'STEP']);
    expect(d.state.hero).toBe(d.cell(2, 1));
    expect(d.state.pips).toBe(0);
  });

  it('больше одного шага накопить нельзя', () => {
    const d = new Driver(handLevel({ cols: 5, rows: 4, doorCol: 2 })).start();
    d.correct(5);
    expect(d.state.pips).toBe(1);
    expect(awaitingTarget(d.state)).toBe(true);
    expect(canAnswer(d.state)).toBe(false);
    const ev = d.target(2, 3);
    expect(types(ev)).toEqual(['TARGET_SET', 'STEP']);
    expect(d.state.hero).toBe(d.cell(2, 1));
    expect(d.state.pips).toBe(0);
  });

  it('цель держится до достижения, маршрут пересчитывается', () => {
    const d = new Driver(handLevel({ cols: 5, rows: 4, doorCol: 2 })).start();
    d.target(4, 2);
    d.correct(3);
    expect(d.state.target).toBe(d.cell(4, 2));
    expect(d.state.route.length).toBe(1);
    const ev = d.correct();
    expect(types(ev)).toContain('TARGET_REACHED');
    expect(d.state.target).toBeNull();
    expect(d.state.route).toEqual([]);
  });

  it('неверный ответ не меняет заряды', () => {
    const d = new Driver(handLevel({ cols: 5, rows: 4, doorCol: 2 })).start();
    d.target(2, 3);
    const ev = d.wrong();
    expect(types(ev)).toEqual(['WRONG']);
    expect(d.state.pips).toBe(0);
    expect(d.state.stats.wrong).toBe(1);
  });

  it('тап по препятствию не ставит цель; тап по герою снимает цель', () => {
    const d = new Driver(handLevel({ cols: 5, rows: 4, doorCol: 2, obstacles: [[0, 3]] })).start();
    expect(types(d.target(0, 3))).toEqual(['BUMP']);
    expect(d.state.target).toBeNull();
    d.target(4, 3);
    expect(d.state.target).not.toBeNull();
    expect(types(d.target(2, 0))).toEqual(['TARGET_CLEARED']);
    expect(d.state.target).toBeNull();
  });

  it('герой смотрит туда, куда последний раз шагнул по горизонтали', () => {
    const d = new Driver(handLevel({ cols: 5, rows: 4, doorCol: 2 })).start();
    d.target(0, 0);
    d.correct();
    expect(d.state.facing).toBe(-1);
  });
});

describe('добыча и вес (2.2)', () => {
  it('цена шага меняется ровно на 3, 6, 9 и 12 предметах', () => {
    const d = new Driver(corridor()).start();
    d.target(14, 0);
    const changes: [number, number][] = [];
    for (let i = 0; i < 12; i++) {
      const cost = currentCost(d.state);
      const ev = d.correct(cost);
      for (const e of ev) if (e.type === 'COST_CHANGED') changes.push([d.state.bag.length, e.to]);
    }
    expect(changes).toEqual([
      [3, 2],
      [6, 3],
      [9, 4],
      [12, 5],
    ]);
  });

  it('полный мешок: предмет остаётся, VOLL; выброс подбирает предмет под героем', () => {
    const d = new Driver(corridor()).start();
    d.target(13, 0);
    for (let i = 0; i < 13; i++) d.correct(currentCost(d.state));
    expect(d.state.hero).toBe(d.cell(13, 0));
    expect(d.state.bag.length).toBe(12);
    expect(d.events.some((e) => e.type === 'PICKUP_BLOCKED')).toBe(true);
    expect(d.state.items[d.cell(13, 0)]).toBe(Item.Coin);
    const ev = d.do({ type: 'DROP', kind: 'coin' });
    expect(types(ev)).toEqual(['DROPPED', 'COST_CHANGED', 'PICKUP', 'COST_CHANGED']);
    expect(d.state.bag.length).toBe(12);
    expect(d.state.items[d.cell(13, 0)]).toBe(0);
  });

  it('выброс мгновенно снижает цену, и полный заряд сразу даёт шаг', () => {
    const d = new Driver(corridor()).start();
    d.target(3, 0);
    d.correct(3); // три монеты, цена 2
    expect(currentCost(d.state)).toBe(2);
    d.target(3, 1);
    d.correct(1);
    expect(d.state.pips).toBe(1);
    const ev = d.do({ type: 'DROP', kind: 'coin' });
    expect(types(ev)).toEqual(['DROPPED', 'COST_CHANGED', 'STEP', 'TARGET_REACHED']);
    expect(d.state.hero).toBe(d.cell(3, 1));
  });

  it('выбросить нечего — ничего не происходит', () => {
    const d = new Driver(corridor()).start();
    expect(d.do({ type: 'DROP', kind: 'gem' })).toEqual([]);
  });
});

describe('дверь (2.4)', () => {
  it('выход в последнюю долю секунды засчитывается по моменту шага', () => {
    const d = new Driver(handLevel({ cols: 5, rows: 4, doorCol: 2, items: [[2, 1, Item.Ruby]] })).start();
    d.target(2, 1);
    d.correct();
    d.do({ type: 'SET_TARGET', cell: exitIndex(d.state.g) });
    d.tick(d.state.D - 1);
    expect(d.state.status).toBe('playing');
    d.correct(); // шаг к старту
    const ev = d.correct(); // шаг в проём
    expect(types(ev)).toContain('ESCAPED');
    expect(d.state.status).toBe('escaped');
    expect(score(d.state)).toBe(5);
  });

  it('при t = D герой внутри — поражение, ответы больше не принимаются', () => {
    const d = new Driver(handLevel({ cols: 5, rows: 4, doorCol: 2 })).start();
    const ev = d.tick(d.state.D);
    expect(types(ev)).toContain('LOCKED_IN');
    expect(d.state.status).toBe('locked');
    expect(d.correct()).toEqual([]);
  });

  it('механизм щёлкает каждые 10%, отсчёт 10…1', () => {
    const d = new Driver(handLevel({ cols: 5, rows: 4, doorCol: 2 })).start();
    const ev = d.tick(d.state.D - 1);
    expect(ev.filter((e) => e.type === 'DOOR_NOTCH').map((e) => (e as { n: number }).n)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(ev.filter((e) => e.type === 'COUNTDOWN').map((e) => (e as { n: number }).n)).toEqual([
      10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
    ]);
  });
});

describe('песок (2.5)', () => {
  const lvl = () =>
    handLevel({
      cols: 7,
      rows: 6,
      doorCol: 3,
      items: [
        [0, 5, Item.Ruby],
        [3, 1, Item.Coin],
      ],
      config: { sandStartFrac: 0.3, sandEndFrac: 0.8, sandMinDistFrac: 0.5 },
    });

  it('не засыпает клетки ближе sandMinDistFrac × maxDist', () => {
    const s = createState(lvl(), { tMed: 5000, p: 0.8 });
    const { dist, maxDist } = s.level;
    for (let i = 0; i < s.sandAt.length - 1; i++) {
      if (dist[i] < 0.5 * maxDist) expect(s.sandAt[i]).toBe(Infinity);
      else expect(Number.isFinite(s.sandAt[i])).toBe(true);
    }
  });

  it('дальние засыпаются в sandStartFrac × D, ближайшие из засыпаемых — в sandEndFrac × D', () => {
    const s = createState(lvl(), { tMed: 5000, p: 0.8 });
    const finite = [...s.sandAt].filter(Number.isFinite);
    expect(Math.min(...finite)).toBeCloseTo(0.3 * s.D);
    expect(Math.max(...finite)).toBeCloseTo(0.8 * s.D);
  });

  it('предупреждает за 3 с, засыпает предмет, клетка остаётся проходимой', () => {
    const d = new Driver(lvl()).start();
    const cell = d.cell(0, 5);
    const at = d.state.sandAt[cell];
    const warnEv = d.tick(at - 3000);
    expect(warnEv.some((e) => e.type === 'SAND_WARN' && e.cell === cell)).toBe(true);
    expect(d.state.buried[cell]).toBe(0);
    const ev = d.tick(3000);
    expect(ev.some((e) => e.type === 'SAND_BURIED' && e.cell === cell && e.item === Item.Ruby)).toBe(true);
    expect(d.state.items[cell]).toBe(0);
    d.target(0, 5);
    expect(d.state.target).toBe(cell);
  });
});

describe('детерминизм (13.3.5)', () => {
  it('одинаковые сид и журнал дают одинаковый результат', () => {
    const level = handLevel({
      cols: 7,
      rows: 6,
      doorCol: 3,
      items: [
        [1, 1, Item.Coin],
        [5, 4, Item.Emerald],
        [2, 3, Item.Coin],
      ],
    });
    const rng = mulberry32(42);
    const log: Action[] = [{ type: 'START' }];
    for (let i = 0; i < 400; i++) {
      const r = rng();
      if (r < 0.5) log.push({ type: 'TICK', dt: Math.floor(rng() * 120) });
      else if (r < 0.8) log.push({ type: 'ANSWER', correct: rng() < 0.8, timeMs: 2000 });
      else if (r < 0.95) log.push({ type: 'SET_TARGET', cell: Math.floor(rng() * 43) });
      else log.push({ type: 'DROP', kind: rng() < 0.5 ? 'coin' : 'gem' });
    }
    const a = replay(createState(level, { tMed: 5000, p: 0.8 }), log);
    const b = replay(createState(level, { tMed: 5000, p: 0.8 }), log);
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    expect(a.state.hero).toBe(b.state.hero);
    expect(a.state.bag).toEqual(b.state.bag);
    expect(a.state.t).toBe(b.state.t);
  });

  it('редуктор не мутирует исходное состояние', () => {
    const level = handLevel({ cols: 5, rows: 4, doorCol: 2, items: [[2, 1, Item.Coin]] });
    const s0 = reduce(createState(level, { tMed: 5000, p: 0.8 }), { type: 'START' }).state;
    const snapshot = JSON.stringify({ ...s0, level: null });
    const s1 = reduce(reduce(s0, { type: 'SET_TARGET', cell: 7 }).state, {
      type: 'ANSWER',
      correct: true,
      timeMs: 1,
    }).state;
    expect(JSON.stringify({ ...s0, level: null })).toBe(snapshot);
    expect(s1.bag.length).toBe(1);
  });
});
