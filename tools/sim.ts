// Симуляция ботами на настоящем движке правил, без графики (раздел 14).
// npm run sim -- --level 3 --runs 2000 [--tmed 5000] [--p 0.8]

import { balance } from '../src/config/balance';
import { getLevel, levels, type LevelConfig } from '../src/config/levels';
import { exitIndex } from '../src/core/grid';
import { generateLevel, type GeneratedLevel } from '../src/core/levelGen';
import { createPlanner } from '../src/core/planner';
import { walkLeg } from '../src/core/risk';
import { hashSeed, lognormal, mulberry32 } from '../src/core/rng';
import { bagScore, starsFor } from '../src/core/rules';
import { createState, reduce, type GameState } from '../src/core/state';
import type { Action } from '../src/core/events';

export type Strategy = keyof typeof balance.sim.strategies;

export interface RunResult {
  escaped: boolean;
  score: number;
  stars: number;
  timeLeftMs: number;
  answers: number;
}

function dispatch(s: GameState, a: Action): GameState {
  return reduce(s, a).state;
}

function advance(s: GameState, ms: number): GameState {
  while (ms > 0 && s.status === 'playing') {
    const dt = Math.min(balance.frame.maxDtMs, ms);
    s = dispatch(s, { type: 'TICK', dt });
    ms -= dt;
  }
  return s;
}

export function runBot(
  cfg: LevelConfig,
  seed: number,
  strategy: Strategy,
  tMed = 5000,
  p = 0.8,
  pre?: GeneratedLevel,
): RunResult {
  const level = pre ?? generateLevel(cfg, { seed });
  const rng = mulberry32(hashSeed(seed, 99));
  let s = createState(level, { tMed, p });
  s = dispatch(s, { type: 'START' });
  const exit = exitIndex(s.g);
  const factor = balance.sim.strategies[strategy];
  const plan = createPlanner({ g: s.g, blocked: level.blocked, items: s.items, start: s.hero }).best(level.budget * factor);
  const queue = [...plan.cells];
  let goingHome = false;
  let answers = 0;

  while (s.status === 'playing') {
    // Решение о цели перед каждым ответом.
    if (!goingHome) {
      const home = walkLeg(s.g, level.blocked, s.items.slice(), s.hero, exit, s.bag.length);
      const need = Math.max(0, home.cost - s.pips);
      const est = ((need * s.tMed) / s.p) * balance.sim.homeMargin;
      if (est >= s.D - s.t) goingHome = true;
    }
    while (!goingHome && queue.length && !s.items[queue[0]]) queue.shift();
    const want = goingHome || !queue.length ? exit : queue[0];
    if (s.target !== want) s = dispatch(s, { type: 'SET_TARGET', cell: want });
    if (s.status !== 'playing') break;

    const dt = lognormal(rng, s.tMed, balance.sim.answerSigma);
    s = advance(s, dt);
    if (s.status !== 'playing') break;
    const correct = rng() < p;
    s = dispatch(s, { type: 'ANSWER', correct, timeMs: dt });
    answers++;
    // После ошибки следующий вопрос появляется через wrongFeedbackMs, часы идут.
    if (!correct) s = advance(s, balance.answers.wrongFeedbackMs);
  }
  const escaped = s.status === 'escaped';
  const score = escaped ? bagScore(s.bag) : 0;
  return {
    escaped,
    score,
    stars: starsFor(escaped, score, level.s2, level.s3),
    timeLeftMs: escaped ? s.D - (s.escapedAt ?? s.D) : 0,
    answers,
  };
}

export interface Report {
  level: number;
  strategy: Strategy;
  runs: number;
  escapeRate: number;
  meanLoot: number;
  ev: number;
  meanStars: number;
}

export function simulate(levelId: number, runs: number, tMed = 5000, p = 0.8, cfgOverride?: LevelConfig): Report[] {
  const cfg = cfgOverride ?? getLevel(levelId);
  const out: Report[] = [];
  const halls: GeneratedLevel[] = [];
  for (let i = 0; i < runs; i++) halls.push(generateLevel(cfg, { seed: hashSeed(levelId, i, 7) }));
  for (const strategy of Object.keys(balance.sim.strategies) as Strategy[]) {
    let esc = 0;
    let loot = 0;
    let stars = 0;
    for (let i = 0; i < runs; i++) {
      const r = runBot(cfg, hashSeed(levelId, i, 7), strategy, tMed, p, halls[i]);
      if (r.escaped) {
        esc++;
        loot += r.score;
      }
      stars += r.stars;
    }
    const escapeRate = esc / runs;
    const meanLoot = esc ? loot / esc : 0;
    out.push({ level: levelId, strategy, runs, escapeRate, meanLoot, ev: escapeRate * meanLoot, meanStars: stars / runs });
  }
  return out;
}

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('tools/sim.ts');
if (isMain) {
  const runs = Number(arg('runs', '300'));
  const tMed = Number(arg('tmed', '5000'));
  const p = Number(arg('p', '0.8'));
  const lv = arg('level', 'all');
  const ids = lv === 'all' ? levels.map((l) => l.id) : [Number(lv)];
  const pct = (x: number) => `${(x * 100).toFixed(0).padStart(3)}%`;
  console.log(`Симуляция: ${runs} раундов на стратегию, T_med = ${tMed} мс, p = ${p}`);
  console.log('ур. | стратегия  | выход | добыча | ценность | звёзды | цель');
  for (const id of ids) {
    const rep = simulate(id, runs, tMed, p);
    const bestEv = Math.max(...rep.map((r) => r.ev));
    for (const r of rep) {
      const goal =
        r.strategy === 'cautious'
          ? r.escapeRate >= 0.95
          : r.strategy === 'balanced'
            ? r.escapeRate >= 0.7 && r.escapeRate <= 0.9 && r.ev === bestEv
            : r.escapeRate >= 0.3 && r.escapeRate <= 0.6;
      console.log(
        `${String(id === 7 ? '∞' : id).padStart(3)} | ${r.strategy.padEnd(10)} | ${pct(r.escapeRate)}  | ${r.meanLoot.toFixed(1).padStart(6)} | ${r.ev.toFixed(1).padStart(8)} | ${r.meanStars.toFixed(2).padStart(6)} | ${goal ? 'ok' : '—'}`,
      );
    }
  }
}
