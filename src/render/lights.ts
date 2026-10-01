// Источники света (раздел 8.2). Мерцание и пульсы считаются на CPU, в фильтр уходят готовые значения.
// Не больше 12 источников: постоянные (факелы, фонарь, дверь, часы) всегда, затем камни
// ближе к герою, затем кристаллы. Остальные светят только ореолом.

import { balance } from '../config/balance';
import { hexToRgb01, palette } from '../config/palette';
import type { LightSource } from './ComicLightFilter';
import { CELL } from './geometry';

export type Rgb = [number, number, number];

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Дешёвый гладкий шум для мерцания. */
export function noise1(t: number, seed: number): number {
  const s = Math.sin(t * 1.7 + seed * 12.9) * 0.5 + Math.sin(t * 3.1 + seed * 4.1) * 0.3 + Math.sin(t * 7.3 + seed * 1.3) * 0.2;
  return s;
}

export interface LightInputs {
  timeMs: number;
  torches: { x: number; y: number }[];
  lantern: { x: number; y: number } | null;
  door: { x: number; floorY: number; gapFrac: number; lateFrac: number; beamLen: number } | null;
  hourglass: { x: number; y: number } | null;
  gems: { x: number; y: number; color: string; phase: number }[];
  crystals: { x: number; y: number; phase: number }[];
  hero: { x: number; y: number } | null;
  /** Ускорение мерцания факелов во второй половине раунда. */
  flickerBoost: number;
  reducedMotion: boolean;
}

export interface LightFrame {
  lights: LightSource[];
  /** Камни, которым не хватило места в фильтре: светят ореолом. */
  overflowGems: number[];
}

const torchRgb = hexToRgb01(palette.torch);
const lanternRgb = hexToRgb01(palette.hero.lantern);
const dayEarly = hexToRgb01(palette.daylight.early);
const dayLate = hexToRgb01(palette.daylight.late);
const crystalRgb = hexToRgb01(palette.crystal.glow);
const sandRgb = hexToRgb01(palette.sand.light);

export function computeLights(inp: LightInputs): LightFrame {
  const L = balance.light;
  const t = inp.timeMs / 1000;
  const out: LightSource[] = [];
  const still = inp.reducedMotion;

  inp.torches.forEach((tp, i) => {
    const speed = 1 + inp.flickerBoost;
    const n = still ? 0 : noise1(t * 2.2 * speed, i + 1);
    const n2 = still ? 0 : noise1(t * 1.6 * speed + 10, i + 7);
    out.push({
      x: tp.x,
      y: tp.y + CELL * 0.5,
      radius: L.torch.radius * CELL * (1 + L.torch.flickerRadius * n2),
      color: torchRgb,
      intensity: L.torch.intensity * (1 + L.torch.flickerIntensity * n),
    });
  });

  if (inp.lantern) {
    const n = still ? 0 : noise1(t * 3, 99) * 0.05;
    out.push({ x: inp.lantern.x, y: inp.lantern.y, radius: L.lantern.radius * CELL, color: lanternRgb, intensity: L.lantern.intensity * (1 + n) });
  }

  if (inp.door && inp.door.gapFrac > 0.001) {
    const d = inp.door;
    const col = mixRgb(dayEarly, dayLate, d.lateFrac);
    const pts = L.door.points;
    for (let k = 0; k < pts; k++) {
      const f = k / Math.max(1, pts - 1);
      out.push({
        x: d.x,
        y: d.floorY - CELL * 0.35 + f * d.beamLen,
        radius: L.door.radius * CELL * (0.55 + 0.45 * d.gapFrac) * (k === 0 ? 0.8 : 1),
        color: col,
        intensity: L.door.intensity * Math.sqrt(d.gapFrac) * (1 - f * 0.25),
      });
    }
  }

  if (inp.hourglass) {
    out.push({ x: inp.hourglass.x, y: inp.hourglass.y, radius: L.hourglass.radius * CELL, color: sandRgb, intensity: L.hourglass.intensity });
  }

  // Камни: ближе к герою — важнее.
  const free = L.maxLights - out.length;
  const order = inp.gems.map((g, i) => ({ g, i, d: inp.hero ? Math.hypot(g.x - inp.hero.x, g.y - inp.hero.y) : 0 }));
  order.sort((a, b) => a.d - b.d);
  const overflowGems: number[] = [];
  let used = 0;
  for (const o of order) {
    if (used < free) {
      const pulse = still ? 0 : Math.sin((inp.timeMs / L.gem.pulseMs) * Math.PI * 2 + o.g.phase);
      out.push({
        x: o.g.x,
        y: o.g.y - CELL * 0.2,
        radius: L.gem.radius * CELL * (1 + 0.08 * pulse),
        color: hexToRgb01(o.g.color),
        intensity: L.gem.intensity * (1 + 0.2 * pulse),
      });
      used++;
    } else overflowGems.push(o.i);
  }
  for (const c of inp.crystals) {
    if (out.length >= L.maxLights) break;
    const pulse = still ? 0 : Math.sin((inp.timeMs / L.crystal.pulseMs) * Math.PI * 2 + c.phase);
    out.push({ x: c.x, y: c.y, radius: L.crystal.radius * CELL, color: crystalRgb, intensity: L.crystal.intensity * (1 + 0.25 * pulse) });
  }
  return { lights: out, overflowGems };
}

export function ambientRgb(): Rgb {
  const a = hexToRgb01(palette.ambient);
  const m = Math.max(a[0], a[1], a[2]);
  return [(a[0] / m) * balance.light.ambient, (a[1] / m) * balance.light.ambient, (a[2] / m) * balance.light.ambient];
}
