// Уровни (раздел 4 плана). Числа подобраны симуляцией (раздел 14), отчёт и отличия от плана — в DECISIONS.md.

export type TrailMode = 'risk' | 'steps' | 'none';

export interface LevelConfig {
  id: number;
  /** Длительность двери в «ответах»: D = doorAnswers × T_med. */
  doorAnswers: number;
  coins: number;
  gems: number;
  obstacles: number;
  /** Доля D, когда засыпаются самые дальние клетки. */
  sandStartFrac: number;
  /** Доля D, когда засыпаются ближайшие из засыпаемых клеток. */
  sandEndFrac: number;
  sandMinDistFrac: number;
  trail: TrailMode;
}

// prettier-ignore
export const levels: readonly LevelConfig[] = [
  { id: 1, doorAnswers: 22, coins: 14, gems: 3, obstacles: 3, sandStartFrac: 0.35, sandEndFrac: 0.9, sandMinDistFrac: 0.55, trail: 'risk' },
  { id: 2, doorAnswers: 22, coins: 12, gems: 4, obstacles: 4, sandStartFrac: 0.3, sandEndFrac: 0.85, sandMinDistFrac: 0.5, trail: 'risk' },
  { id: 3, doorAnswers: 22, coins: 14, gems: 4, obstacles: 4, sandStartFrac: 0.3, sandEndFrac: 0.8, sandMinDistFrac: 0.5, trail: 'risk' },
  { id: 4, doorAnswers: 21, coins: 14, gems: 5, obstacles: 5, sandStartFrac: 0.25, sandEndFrac: 0.8, sandMinDistFrac: 0.45, trail: 'risk' },
  { id: 5, doorAnswers: 19, coins: 15, gems: 5, obstacles: 6, sandStartFrac: 0.25, sandEndFrac: 0.75, sandMinDistFrac: 0.45, trail: 'steps' },
  { id: 6, doorAnswers: 19, coins: 16, gems: 6, obstacles: 6, sandStartFrac: 0.2, sandEndFrac: 0.7, sandMinDistFrac: 0.4, trail: 'steps' },
  // ∞ — бесконечный уровень
  { id: 7, doorAnswers: 18, coins: 16, gems: 6, obstacles: 6, sandStartFrac: 0.2, sandEndFrac: 0.7, sandMinDistFrac: 0.4, trail: 'none' },
];

export const ENDLESS_LEVEL_ID = 7;

export function getLevel(id: number): LevelConfig {
  const found = levels.find((l) => l.id === id);
  return found ?? levels[levels.length - 1];
}

/**
 * Если зал меньше 9 × 8, число предметов и препятствий уменьшается пропорционально площади.
 */
export function scaleLevelForGrid(
  level: LevelConfig,
  cols: number,
  rows: number,
  baseCols = 9,
  baseRows = 8,
): LevelConfig {
  const k = Math.min(1, (cols * rows) / (baseCols * baseRows));
  if (k >= 1) return level;
  return {
    ...level,
    coins: Math.max(4, Math.round(level.coins * k)),
    gems: Math.max(2, Math.round(level.gems * k)),
    obstacles: Math.max(1, Math.round(level.obstacles * k)),
  };
}
