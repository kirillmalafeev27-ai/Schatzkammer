// Геометрия мира в виртуальных единицах: 128 на клетку (раздел 13.5).
// Общая для арта (запекание стен и пола) и для видов.

import { balance } from '../config/balance';
import { cellXY, exitIndex, type GridShape } from '../core/grid';
import { hashSeed, mulberry32 } from '../core/rng';

export const CELL = balance.world.cell;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WorldGeom {
  g: GridShape;
  seed: number;
  floorW: number;
  floorH: number;
  sideW: number;
  northH: number;
  ceilH: number;
  southH: number;
  /** Весь мир: стены + пол. */
  bounds: Rect;
  door: {
    cx: number;
    /** Проём (дыра в стене), нижняя кромка — линия пола y = 0. */
    opening: Rect;
    frameW: number;
    lintelH: number;
    /** Центр клетки выхода — куда ныряет герой. */
    exitX: number;
    exitY: number;
  };
  hourglass: { x: number; y: number; w: number; h: number; side: -1 | 1 };
  torches: { x: number; y: number }[];
  crystals: { x: number; y: number; s: number }[];
}

export function cellCenter(g: GridShape, i: number): { x: number; y: number } {
  if (i === exitIndex(g)) return { x: (g.doorCol + 0.5) * CELL, y: -0.38 * CELL };
  const { x, y } = cellXY(g, i);
  return { x: (x + 0.5) * CELL, y: (y + 0.5) * CELL };
}

/** Точка, где стоят ноги героя и основание предметов: чуть ниже центра клетки. */
export function cellBase(g: GridShape, i: number): { x: number; y: number } {
  const c = cellCenter(g, i);
  if (i === exitIndex(g)) return c;
  return { x: c.x, y: c.y + 0.22 * CELL };
}

export function worldGeom(g: GridShape, seed: number): WorldGeom {
  const w = balance.world;
  const floorW = g.cols * CELL;
  const floorH = g.rows * CELL;
  const sideW = Math.round(w.sideWall * CELL);
  const northH = Math.round(w.northWall * CELL);
  const ceilH = Math.round(w.ceiling * CELL);
  const southH = Math.round(w.southLedge * CELL);
  const bounds = { x: -sideW, y: -(northH + ceilH), w: floorW + sideW * 2, h: northH + ceilH + floorH + southH };

  const cx = (g.doorCol + 0.5) * CELL;
  const openW = Math.round(0.84 * CELL);
  const openH = Math.round(1.22 * CELL);
  const opening = { x: cx - openW / 2, y: -openH, w: openW, h: openH };
  const frameW = Math.round(0.24 * CELL);
  const lintelH = Math.round(0.26 * CELL);

  const rng = mulberry32(hashSeed(seed, 31337));
  // Песочные часы — с той стороны двери, где больше места.
  const side: -1 | 1 = g.doorCol < g.cols / 2 ? 1 : -1;
  const hgW = Math.round(0.42 * CELL);
  const hgH = Math.round(0.72 * CELL);
  const hourglass = { x: cx + side * 1.12 * CELL, y: -0.86 * CELL, w: hgW, h: hgH, side };

  // Факелы: равномерно вдоль стены, не ближе 0.9 клетки к двери и 0.6 к часам.
  const torches: { x: number; y: number }[] = [];
  const count = g.cols >= 9 ? 4 : 3;
  const slots: number[] = [];
  for (let k = 0; k < count + 3; k++) slots.push(((k + 0.5) / (count + 3)) * floorW);
  const free = slots.filter((x) => Math.abs(x - cx) > 1.0 * CELL && Math.abs(x - hourglass.x) > 0.7 * CELL);
  // Берём самые разнесённые из свободных слотов.
  const pickN = Math.min(count, free.length);
  for (let k = 0; k < pickN; k++) {
    const idx = Math.round((k * (free.length - 1)) / Math.max(1, pickN - 1));
    const x = free[idx];
    if (!torches.some((t) => Math.abs(t.x - x) < 1)) torches.push({ x, y: -0.98 * CELL });
  }

  const crystals: { x: number; y: number; s: number }[] = [];
  const nCrystals = 2 + (rng() < 0.5 ? 1 : 0);
  for (let tries = 0; tries < 40 && crystals.length < nCrystals; tries++) {
    const x = (0.4 + rng() * (g.cols - 0.8)) * CELL;
    const y = -(0.25 + rng() * 1.05) * CELL;
    const s = 0.7 + rng() * 0.5;
    const near = (px: number, py: number, d: number) => Math.hypot(px - x, py - y) < d;
    if (Math.abs(x - cx) < 1.1 * CELL) continue;
    if (near(hourglass.x, hourglass.y, 0.8 * CELL)) continue;
    if (torches.some((t) => near(t.x, t.y, 0.75 * CELL))) continue;
    if (crystals.some((c) => near(c.x, c.y, 1.2 * CELL))) continue;
    crystals.push({ x, y, s });
  }

  return {
    g,
    seed,
    floorW,
    floorH,
    sideW,
    northH,
    ceilH,
    southH,
    bounds,
    door: { cx, opening, frameW, lintelH, exitX: cx, exitY: cellCenter(g, exitIndex(g)).y },
    hourglass,
    torches,
    crystals,
  };
}
