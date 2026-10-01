// Общие рецепты комикс-арта: камни, крапины, вариации тона.

import { palette, rgba, shiftHex } from '../../config/palette';
import {
  blob,
  bounds,
  celShade,
  clipShadowCrescent,
  crack,
  halftone,
  hatch,
  ink,
  type BlobOpts,
  type Ctx,
  type Path,
  type Rng,
  type Tones,
} from '../comicKit';

/** Толщина основного контура при 128 px на клетку. */
export const INK = 9;
export const INK_MID = 6.5;
export const INK_THIN = 4;

export function toneVar(rng: Rng, hex: string, light = 0.06, hue = 4): string {
  return shiftHex(hex, 1 + (rng() * 2 - 1) * light, (rng() * 2 - 1) * hue, 1);
}

export function tonesVar(rng: Rng, t: Tones, light = 0.06, hue = 4): Tones {
  const l = 1 + (rng() * 2 - 1) * light;
  const h = (rng() * 2 - 1) * hue;
  return { base: shiftHex(t.base, l, h), shadow: shiftHex(t.shadow, l, h), light: shiftHex(t.light, l, h) };
}

export function tonesFrom(base: string, shadowMul = 0.68, lightMul = 1.35, shadowHue = 8): Tones {
  // Тени сдвинуты по оттенку к фиолетовому.
  return { base, shadow: shiftHex(base, shadowMul, shadowHue, 1.05), light: shiftHex(base, lightMul, -4, 0.95) };
}

export interface StoneOpts extends BlobOpts {
  inkW?: number;
  k?: number;
  dots?: boolean;
  hatchDeep?: boolean;
  cracks?: number;
  specks?: number;
}

/** Валун: неровная форма, светотень в три тона, растр в тени, тушь. */
export function stone(ctx: Ctx, rng: Rng, w: number, h: number, tones: Tones, o: StoneOpts = {}): Path {
  const path = blob(rng, w, h, { points: 8, jitter: 0.14, ...o });
  const k = o.k ?? Math.max(4, Math.min(w, h) * 0.16);
  celShade(ctx, path, tones, k);
  const b = bounds(path);
  if (o.dots !== false) {
    ctx.save();
    clipShadowCrescent(ctx, path, k);
    const sp = Math.max(4.5, Math.min(w, h) * 0.09);
    halftone(ctx, rgba(palette.ink, 0.55), { region: b, spacing: sp, rMin: sp * 0.08, rMax: sp * 0.42 });
    ctx.restore();
  }
  if (o.hatchDeep) {
    ctx.save();
    clipShadowCrescent(ctx, path, k * 0.55);
    hatch(ctx, b, -Math.PI / 4, 5, 1.6, rgba(palette.ink, 0.7));
    ctx.restore();
  }
  const specks = o.specks ?? Math.round((w * h) / 900);
  if (specks) {
    ctx.save();
    ctx.beginPath();
    for (const p of path) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.clip();
    for (let i = 0; i < specks; i++) {
      const x = b.x + rng() * b.w;
      const y = b.y + rng() * b.h;
      ctx.fillStyle = rng() < 0.5 ? rgba(palette.ink, 0.35) : rgba('#ffffff', 0.18);
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + rng() * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < (o.cracks ?? (rng() < 0.4 ? 1 : 0)); i++) {
      const c = { x: b.x + b.w * (0.3 + rng() * 0.4), y: b.y + b.h * (0.25 + rng() * 0.4) };
      crack(ctx, rng, c, Math.min(w, h) * 0.45, rng() * Math.PI * 2, 1.6);
    }
    ctx.restore();
  }
  ink(ctx, path, o.inkW ?? INK_MID);
  return path;
}

/** Пучок мха: несколько кружков с тушью. */
export function moss(ctx: Ctx, rng: Rng, x: number, y: number, s: number): void {
  const n = 3 + Math.floor(rng() * 3);
  const tones = tonesFrom(palette.moss, 0.65, 1.35);
  for (let i = 0; i < n; i++) {
    const cx = x + (rng() - 0.5) * s * 1.6;
    const cy = y + (rng() - 0.5) * s * 0.7;
    const r = s * (0.35 + rng() * 0.35);
    const p = blob(rng, r * 2, r * 1.6, { cx, cy, points: 7, jitter: 0.2 });
    celShade(ctx, p, tones, r * 0.4);
    ink(ctx, p, 2.6);
  }
}

/** Тень-растр: точки гуще к краю (для AO у стен). */
export function edgeDots(
  ctx: Ctx,
  region: { x: number; y: number; w: number; h: number },
  dir: { x: number; y: number },
  spacing: number,
  color: string,
  rMax: number,
): void {
  halftone(ctx, color, { region, spacing, rMin: 0, rMax, dir });
}

/**
 * Гранёная скала: угловатый многоугольник, светотень, светлая грань сверху слева,
 * линии граней, растр в тени, трещины. Камень, а не подушка.
 */
export function rock(ctx: Ctx, rng: Rng, w: number, h: number, tones: Tones, o: StoneOpts = {}): Path {
  const n = 6 + Math.floor(rng() * 3);
  const cx = o.cx ?? 0;
  const cy = o.cy ?? 0;
  const raw: Path = [];
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2 + (rng() - 0.5) * 0.35;
    const r = 1 + (rng() * 2 - 1) * (o.jitter ?? 0.16);
    let y = Math.sin(a) * (h / 2) * r;
    if (o.flatBottom && y > 0) y *= 1 - o.flatBottom;
    raw.push({ x: cx + Math.cos(a) * (w / 2) * r, y: cy + y });
  }
  const path = chaikinOnce(raw);
  const k = o.k ?? Math.max(4, Math.min(w, h) * 0.17);
  celShade(ctx, path, tones, k, { lightK: k * 0.5 });
  // Светлая грань: треугольники от центра к вершинам верхне-левого сектора.
  ctx.save();
  ctx.beginPath();
  for (const p of path) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.clip();
  const c = { x: cx + w * 0.06, y: cy + h * 0.04 };
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    const b = raw[(i + 1) % raw.length];
    const mx = (a.x + b.x) / 2 - c.x;
    const my = (a.y + b.y) / 2 - c.y;
    const facing = -(mx * 0.7071 + my * 0.7071) / Math.max(1, Math.hypot(mx, my));
    if (facing > 0.45) {
      ctx.fillStyle = rgba(tones.light, 0.55);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Рёбра граней.
  for (let i = 0; i < raw.length; i += 2) {
    const v = raw[i];
    ctx.strokeStyle = rgba(palette.ink, 0.45);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(c.x + (v.x - c.x) * 0.25, c.y + (v.y - c.y) * 0.25);
    ctx.lineTo(c.x + (v.x - c.x) * 0.92, c.y + (v.y - c.y) * 0.92);
    ctx.stroke();
  }
  ctx.restore();
  const b = bounds(path);
  if (o.dots !== false) {
    ctx.save();
    clipShadowCrescent(ctx, path, k);
    const sp = Math.max(4.5, Math.min(w, h) * 0.09);
    halftone(ctx, rgba(palette.ink, 0.55), { region: b, spacing: sp, rMin: sp * 0.08, rMax: sp * 0.42 });
    ctx.restore();
  }
  if (o.hatchDeep) {
    ctx.save();
    clipShadowCrescent(ctx, path, k * 0.55);
    hatch(ctx, b, -Math.PI / 4, 5, 1.6, rgba(palette.ink, 0.7));
    ctx.restore();
  }
  const cracks = o.cracks ?? (rng() < 0.45 ? 1 : 0);
  if (cracks) {
    ctx.save();
    ctx.beginPath();
    for (const p of path) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.clip();
    for (let i = 0; i < cracks; i++) crack(ctx, rng, { x: b.x + b.w * (0.3 + rng() * 0.4), y: b.y + b.h * (0.25 + rng() * 0.4) }, Math.min(w, h) * 0.5, rng() * Math.PI * 2, 1.7);
    ctx.restore();
  }
  ink(ctx, path, o.inkW ?? INK_MID);
  return path;
}

function chaikinOnce(p: Path): Path {
  const out: Path = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    out.push({ x: a.x * 0.82 + b.x * 0.18, y: a.y * 0.82 + b.y * 0.18 }, { x: a.x * 0.18 + b.x * 0.82, y: a.y * 0.18 + b.y * 0.82 });
  }
  return out;
}

/** Тёсаный блок кладки: неровный прямоугольник, фаска, сколы. */
export function block(ctx: Ctx, rng: Rng, x: number, y: number, w: number, h: number, tones: Tones, inkW = 4.6): Path {
  const p: Path = [];
  const j = () => (rng() - 0.5) * 3;
  const pts: [number, number][] = [
    [x + j(), y + j()],
    [x + w + j(), y + j()],
    [x + w + j(), y + h + j()],
    [x + j(), y + h + j()],
  ];
  for (const [px, py] of pts) p.push({ x: px, y: py });
  const path = chaikinOnce(chaikinOnce(p));
  const k = Math.min(w, h) * 0.2;
  celShade(ctx, path, tones, k, { lightK: k * 0.45 });
  ctx.save();
  clipShadowCrescent(ctx, path, k);
  halftone(ctx, rgba(palette.ink, 0.5), { region: bounds(path), spacing: 5, rMin: 0.3, rMax: 2 });
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  for (const q of path) ctx.lineTo(q.x, q.y);
  ctx.closePath();
  ctx.clip();
  for (let i = 0; i < (w * h) / 260; i++) {
    ctx.fillStyle = rng() < 0.6 ? rgba(palette.ink, 0.25) : rgba('#ffffff', 0.14);
    ctx.beginPath();
    ctx.arc(x + rng() * w, y + rng() * h, 0.7 + rng() * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (rng() < 0.3) crack(ctx, rng, { x: x + w * (0.2 + rng() * 0.6), y: y + h * 0.3 }, Math.min(w, h) * 0.7, Math.PI / 2 + (rng() - 0.5), 1.5);
  ctx.restore();
  ink(ctx, path, inkW);
  return path;
}
