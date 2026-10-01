// Факелы (7.5.11), песок (7.5.10), следы (7.5.13), подсветка цели (7.5.14), сапоги-заряды,
// слова-звуки (7.4 sfxWord).

import { palette, rgba, shiftHex } from '../../config/palette';
import type { AddSprite, SfxStyle } from '../ArtFactory';
import type { DrawSpec } from '../atlas';
import {
  blob,
  brush,
  burstPath,
  celShade,
  chaikin,
  ellipsePath,
  fillPath,
  glint,
  halftone,
  halftoneFlat,
  ink,
  line,
  mulberry32,
  polyPath,
  radialSpot,
  tracePath,
  translatePath,
  type Ctx,
  type Path,
  type Rng,
  type Tones,
} from '../comicKit';
import { SPR } from '../manifest';
import { tonesFrom } from './common';

const IRON: Tones = { base: palette.iron, shadow: palette.ironDark, light: palette.ironLight };

// ── Факел ─────────────────────────────────────────────────────────────────

function torchHolder(ctx: Ctx): void {
  // Кронштейн в стене + деревянная рукоять с намоткой ткани.
  const plate = polyPath([[12, 30], [28, 30], [28, 56], [12, 56]]);
  celShade(ctx, plate, IRON, 3);
  ink(ctx, plate, 3.6);
  for (const y of [35, 51]) fillPath(ctx, ellipsePath(20, y, 2.4, 2.4), palette.ink);
  const arm = polyPath([[17, 34], [23, 34], [23, 46], [17, 46]]);
  fillPath(ctx, arm, IRON.shadow);
  // Рукоять.
  const stick = polyPath([[16, 10], [24, 10], [22, 44], [18, 44]]);
  celShade(ctx, stick, tonesFrom('#6a4a3a', 0.7, 1.3), 2.5);
  ink(ctx, stick, 3.4);
  // Кольцо держателя.
  const ring = polyPath([[13, 30], [27, 30], [27, 35], [13, 35]]);
  celShade(ctx, ring, IRON, 1.5);
  ink(ctx, ring, 3);
  // Намотка.
  const wrap = polyPath([[13, 2], [27, 2], [26, 14], [14, 14]]);
  celShade(ctx, wrap, tonesFrom('#7d6a62', 0.68, 1.3), 2.5);
  for (let y = 4; y < 14; y += 3.5) line(ctx, [{ x: 13, y }, { x: 27, y: y + 2 }], 1.4, rgba(palette.ink, 0.6));
  ink(ctx, wrap, 3.4);
}

function flame(ctx: Ctx, rng: Rng, frame: number): void {
  // Три слоя-капли: красный → оранжевый → жёлтый, контур тушью на внешнем.
  const W = 48;
  const cx = W / 2;
  const base = 58;
  const sway = Math.sin((frame / 6) * Math.PI * 2) * 4;
  const drop = (w: number, h: number, dx: number, tilt: number): Path => {
    const tip = { x: cx + dx + tilt, y: base - h };
    const pts: Path = [
      tip,
      { x: cx + dx + w * 0.42 + tilt * 0.4, y: base - h * 0.55 },
      { x: cx + dx + w * 0.5, y: base - h * 0.2 },
      { x: cx + dx + w * 0.26, y: base },
      { x: cx + dx - w * 0.26, y: base },
      { x: cx + dx - w * 0.5, y: base - h * 0.2 },
      { x: cx + dx - w * 0.42 + tilt * 0.4, y: base - h * 0.55 },
    ];
    return chaikin(pts, 2, true);
  };
  const h0 = 46 + rng() * 6;
  const outer = drop(30, h0, 0, sway);
  fillPath(ctx, outer, palette.flame.outer);
  // Язычки.
  const tongue = drop(10, h0 * 0.55, (frame % 2 ? -1 : 1) * 9, sway * 1.4);
  fillPath(ctx, translatePath(tongue, 0, -h0 * 0.18), palette.flame.outer);
  ink(ctx, outer, 3.6);
  fillPath(ctx, drop(21, h0 * 0.72, 1, sway * 0.7), palette.flame.mid);
  fillPath(ctx, drop(12, h0 * 0.45, 1.5, sway * 0.4), palette.flame.core);
  fillPath(ctx, ellipsePath(cx + 1.5, base - h0 * 0.16, 3.4, 5), palette.flame.white);
}

// ── Песок ─────────────────────────────────────────────────────────────────

function sandStream(ctx: Ctx, rng: Rng): void {
  // Струя песка: светлый луч вокруг, столб с рваными краями, крупинки, ярче к сердцевине.
  const W = 44;
  const H = 200;
  const cx = W / 2;
  // Тонкий луч света, в котором летит песок.
  fillPath(ctx, polyPath([[cx - 7, 0], [cx + 7, 0], [cx + 18, H], [cx - 18, H]]), rgba(palette.sand.light, 0.16));
  const left: Path = [];
  const right: Path = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const y = t * H;
    const w = 3.5 + t * 7 + Math.sin(t * 17 + rng() * 2) * 1.2;
    left.push({ x: cx - w + (rng() - 0.5) * 1.6, y });
    right.push({ x: cx + w + (rng() - 0.5) * 1.6, y });
  }
  const body: Path = [...left, ...right.reverse()];
  fillPath(ctx, body, rgba(palette.sand.base, 0.95));
  ctx.save();
  ctx.beginPath();
  tracePath(ctx, body);
  ctx.clip();
  // Тень справа, свет слева.
  ctx.fillStyle = rgba(palette.sand.shadow, 0.95);
  ctx.beginPath();
  ctx.moveTo(cx + 1, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, H);
  ctx.lineTo(cx + 4, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = palette.sand.light;
  ctx.beginPath();
  ctx.moveTo(cx - 2.5, 0);
  ctx.lineTo(cx - 0.5, 0);
  ctx.lineTo(cx - 1, H);
  ctx.lineTo(cx - 6, H);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = rng() < 0.5 ? palette.sand.shadow : rgba('#ffffff', 0.75);
    ctx.beginPath();
    ctx.arc(cx + (rng() - 0.5) * 16, rng() * H, 0.7 + rng() * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Отлетающие крупинки по краям.
  for (let i = 0; i < 26; i++) {
    const y = rng() * H;
    const side = rng() < 0.5 ? -1 : 1;
    const w = 4 + (y / H) * 9;
    ctx.fillStyle = rgba(palette.sand.light, 0.9);
    ctx.beginPath();
    ctx.arc(cx + side * (w + 2 + rng() * 6), y, 0.8 + rng() * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  line(ctx, left, 1.8, rgba(palette.ink, 0.5));
  line(ctx, right, 1.8, rgba(palette.ink, 0.5));
}

function dune(ctx: Ctx, rng: Rng, stage: number): void {
  // Дюна: широкий холм с гребнем, рябью и растровой тенью; края выходят за клетку.
  const W = 156;
  const H = 104;
  const cx = W / 2;
  const base = H - 24;
  const half = [44, 58, 68][stage];
  const h = [10, 26, 44][stage];
  const pts: Path = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const x = cx - half + t * half * 2;
    const bump = Math.pow(Math.sin(Math.PI * t), 1.4);
    const y = base - h * bump + (rng() - 0.5) * 2.4 - (stage > 0 ? Math.sin(t * 9) * 1.4 : 0);
    pts.push({ x, y });
  }
  for (let i = 16; i >= 0; i--) {
    const t = i / 16;
    pts.push({ x: cx - half * 1.04 + t * half * 2.08, y: base + 8 + Math.sin(Math.PI * t) * (6 + stage * 3) + (rng() - 0.5) * 2 });
  }
  const p = chaikin(pts, 2, true);
  fillPath(ctx, p, palette.sand.base);
  ctx.save();
  ctx.beginPath();
  tracePath(ctx, p);
  ctx.clip();
  // Свет на левом склоне, тень на правом.
  fillPath(ctx, polyPath([[cx - half - 4, base + 20], [cx - half - 4, base - h - 10], [cx + 4, base - h - 10], [cx - 6, base + 20]]), palette.sand.light);
  fillPath(ctx, polyPath([[cx + half * 0.25, base - h], [cx + half + 6, base - 4], [cx + half + 6, base + 24], [cx + 4, base + 24]]), palette.sand.shadow);
  halftone(ctx, rgba(palette.sand.shadow, 0.95), { region: { x: cx - half, y: base - h, w: half * 2, h: h + 22 }, spacing: 5, rMin: 0, rMax: 1.9, dir: { x: 0.5, y: 1 } });
  for (let i = 0; i < 1 + stage; i++) {
    const y = base - h * 0.35 + i * 7;
    brush(ctx, [{ x: cx - half * 0.55, y }, { x: cx - half * 0.15, y: y - 3 }, { x: cx + half * 0.3, y: y + 1 }], 2.2, rgba(palette.sand.shadow, 0.9), 0.25);
  }
  ctx.restore();
  ink(ctx, p, stage === 0 ? 2.4 : 3.2, true, shiftHex(palette.sand.shadow, 0.55, 6));
  void blob;
}

function puff(ctx: Ctx, rng: Rng): void {
  // Комиксное облачко пыли: кружки с тонкой тушью.
  const parts: Path[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(ellipsePath(32 + Math.cos(a) * 11, 24 + Math.sin(a) * 6, 10 + rng() * 4, 8 + rng() * 3, 20));
  }
  for (const p of parts) line(ctx, p, 4, rgba(palette.ink, 0.5), true);
  for (const p of parts) fillPath(ctx, p, rgba(palette.sand.light, 0.95));
  for (const p of parts) fillPath(ctx, translatePath(p, 3, 3), rgba(palette.sand.base, 0.5));
}

// ── Следы и цель ──────────────────────────────────────────────────────────

/** Подошва сапога (носок вверх). */
function solePath(left: boolean): { front: Path; heel: Path } {
  const s = left ? -1 : 1;
  const front = chaikin(
    polyPath([
      [13 + s * 1, 3],
      [20 + s * 1, 6],
      [21, 15],
      [18, 22],
      [8, 22],
      [5, 15],
      [6 + s * 1, 6],
    ]),
    2,
    true,
  );
  const heel = chaikin(polyPath([[7, 26], [19, 26], [19, 34], [7, 34]]), 2, true);
  return { front, heel };
}

function print(ctx: Ctx, rng: Rng, left: boolean, style: 'safe' | 'warn' | 'danger' | 'plain'): void {
  const { front, heel } = solePath(left);
  const fill = style === 'safe' ? palette.footprints.safe : style === 'warn' ? palette.footprints.warn : style === 'danger' ? palette.footprints.danger : '#e9e4f2';
  for (const p of [front, heel]) {
    fillPath(ctx, p, fill);
    if (style === 'safe' || style === 'plain') line(ctx, p, style === 'plain' ? 2 : 2.8, palette.ink, true);
    else {
      // Пунктирный контур тушью.
      ctx.save();
      ctx.setLineDash([4, 3]);
      line(ctx, p, 2.8, palette.ink, true);
      ctx.restore();
    }
  }
  // Протектор.
  for (const y of [11, 16]) line(ctx, [{ x: 8, y }, { x: 18, y }], 1.6, rgba(palette.ink, 0.45));
  if (style === 'danger') {
    // Трещины: «не успеть» — различимо и без цвета.
    ctx.save();
    ctx.beginPath();
    tracePath(ctx, front);
    tracePath(ctx, heel);
    ctx.clip();
    line(ctx, [{ x: 6, y: 8 }, { x: 12, y: 14 }, { x: 10, y: 20 }, { x: 16, y: 30 }], 2, palette.ink);
    line(ctx, [{ x: 12, y: 14 }, { x: 19, y: 12 }], 1.6, palette.ink);
    ctx.restore();
  }
  void rng;
}

function badge(ctx: Ctx): void {
  const p = ellipsePath(24, 24, 19, 19, 32);
  fillPath(ctx, translatePath(p, 2.5, 2.5), palette.ink);
  celShade(ctx, p, { base: palette.caption, shadow: shiftHex(palette.caption, 0.8, -4), light: '#fff6b8' }, 4);
  line(ctx, p, 3.4, palette.ink, true);
}

function targetGlow(ctx: Ctx): void {
  const S = 128;
  const inner = { x: 7, y: 7, w: S - 14, h: S - 14 };
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(inner.x, inner.y, inner.w, inner.h, 14);
  ctx.clip();
  ctx.fillStyle = rgba('#fff4c8', 0.32);
  ctx.fillRect(0, 0, S, S);
  // Растр гуще к краям — свечение плиты без плавного градиента.
  for (const d of [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ]) {
    const r = { x: d.x > 0 ? S / 2 : 0, y: d.y > 0 ? S / 2 : 0, w: d.x === 0 ? S : S / 2, h: d.y === 0 ? S : S / 2 };
    halftone(ctx, rgba('#fff4c8', 0.55), { region: r, spacing: 7, rMin: 0, rMax: 2.6, dir: d });
  }
  ctx.restore();
}

function targetRing(ctx: Ctx): void {
  const S = 128;
  ctx.save();
  ctx.setLineDash([12, 8]);
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(8, 8, S - 16, S - 16, 14);
  ctx.stroke();
  ctx.restore();
}

/** Сапог-заряд на тёмной подложке (читается на любом фоне): полный — зелёный, пустой — белый. */
function pipBoot(ctx: Ctx, full: boolean): void {
  fillPath(ctx, ellipsePath(18, 17, 16, 15, 28), palette.ink);
  if (!full) line(ctx, ellipsePath(18, 17, 13, 12, 28), 1.6, rgba('#ffffff', 0.35), true);
  const p = translatePath(
    chaikin(
      polyPath([
        [6, 2],
        [16, 2],
        [16, 12],
        [24, 14],
        [25, 21],
        [3, 21],
        [4, 12],
      ]),
      2,
      true,
    ),
    4,
    5,
  );
  if (full) celShade(ctx, p, { base: palette.good, shadow: shiftHex(palette.good, 0.7, 10), light: '#b6ffd5' }, 3);
  else fillPath(ctx, p, '#5d5470');
  line(ctx, p, 2.2, full ? palette.ink : rgba('#ffffff', 0.55), true);
  line(ctx, [{ x: 8, y: 24 }, { x: 28, y: 24 }], 1.8, full ? palette.ink : rgba('#ffffff', 0.45));
  if (full) glint(ctx, 13, 13, 3.4);
}

function crackDecal(ctx: Ctx, rng: Rng): void {
  const pts: Path = [{ x: 4, y: 10 }];
  for (let i = 1; i <= 6; i++) pts.push({ x: 4 + i * 9, y: 10 + (rng() - 0.5) * 8 });
  brush(ctx, pts, 4, palette.ink, 0.3);
}

export function effectSprites(add: AddSprite, rng: Rng): void {
  add(SPR.torchHolder, { w: 40, h: 60, ox: 20, oy: 30, draw: torchHolder });
  SPR.flames.forEach((n, i) => add(n, { w: 48, h: 62, ox: 24, oy: 58, draw: (c) => flame(c, mulberry32(100 + i), i) }));
  add(SPR.ember, { w: 10, h: 10, ox: 5, oy: 5, draw: (c) => fillPath(c, ellipsePath(5, 5, 3, 3), palette.flame.core) });
  add(SPR.sandStream, { w: 44, h: 200, ox: 22, oy: 200, draw: (c) => sandStream(c, mulberry32(7)) });
  add(SPR.sandGrain, { w: 8, h: 8, ox: 4, oy: 4, draw: (c) => fillPath(c, ellipsePath(4, 4, 2.6, 2.6), palette.sand.light) });
  SPR.dunes.forEach((n, i) => add(n, { w: 156, h: 104, ox: 78, oy: 64, draw: (c) => dune(c, mulberry32(300 + i), i) }));
  add(SPR.puff, { w: 64, h: 48, ox: 32, oy: 24, draw: (c) => puff(c, mulberry32(9)) });
  add(SPR.crack, { w: 64, h: 20, ox: 32, oy: 10, draw: (c) => crackDecal(c, rng) });
  for (const style of ['safe', 'warn', 'danger', 'plain'] as const) {
    SPR.print[style].forEach((n, i) => add(n, { w: 26, h: 38, ox: 13, oy: 19, draw: (c) => print(c, rng, i === 0, style) }));
  }
  add(SPR.badge, { w: 50, h: 50, ox: 24, oy: 24, draw: badge });
  add(SPR.targetGlow, { w: 128, h: 128, ox: 64, oy: 64, draw: targetGlow });
  add(SPR.targetRing, { w: 128, h: 128, ox: 64, oy: 64, draw: targetRing });
  add(SPR.pipFull, { w: 36, h: 34, ox: 18, oy: 17, draw: (c) => pipBoot(c, true) });
  add(SPR.pipEmpty, { w: 36, h: 34, ox: 18, oy: 17, draw: (c) => pipBoot(c, false) });
  add(SPR.chest, { w: 8, h: 8, ox: 4, oy: 4, draw: () => undefined });
  void halftoneFlat;
  void radialSpot;
}

/** Слово-звук шрифтом Bangers: заливка, толстая обводка тушью, внешняя цветная обводка, наклон. */
export function sfxWordSpec(text: string, style: SfxStyle, rng: Rng): DrawSpec {
  const size = style.size;
  const latin = /^[\x20-\x7EÄÖÜäöüß…!]+$/.test(text);
  const font = latin ? `${size}px Bangers, Rubik, sans-serif` : `italic 900 ${size * 0.86}px Rubik, sans-serif`;
  const meas = document.createElement('canvas').getContext('2d')!;
  meas.font = font;
  const tw = meas.measureText(text).width + size * 0.12 * text.length * 0;
  const padX = size * 0.6;
  const padY = size * 0.55;
  const burstPad = style.burst ? size * 0.5 : 0;
  const w = tw + padX * 2 + burstPad * 2;
  const h = size * 1.25 + padY * 2 + burstPad * 2;
  return {
    w,
    h,
    ox: w / 2,
    oy: h / 2,
    draw(ctx) {
      ctx.save();
      ctx.translate(w / 2, h / 2);
      if (style.burst) {
        const p = burstPath(0, 0, Math.max(tw, size) * 0.42 + size * 0.2, Math.max(tw, size) * 0.62 + size * 0.45, 13, rng, 0.62);
        fillPath(ctx, translatePath(p, 4, 5), palette.ink);
        fillPath(ctx, p, style.burst);
        ink(ctx, p, Math.max(3, size * 0.07));
      }
      ctx.transform(1, 0, style.skew ?? -0.12, 1, 0, 0);
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      const y = size * 0.05;
      // Внешняя цветная обводка + жёсткая тень.
      ctx.strokeStyle = palette.ink;
      ctx.lineWidth = size * 0.42;
      ctx.strokeText(text, size * 0.06, y + size * 0.08);
      ctx.strokeStyle = style.outer;
      ctx.lineWidth = size * 0.3;
      ctx.strokeText(text, 0, y);
      ctx.strokeStyle = palette.ink;
      ctx.lineWidth = size * 0.14;
      ctx.strokeText(text, 0, y);
      ctx.fillStyle = style.fill;
      ctx.fillText(text, 0, y);
      // Двухтонная заливка: верх букв светлее.
      ctx.save();
      ctx.beginPath();
      ctx.rect(-w, y - size * 0.6, w * 2, size * 0.42);
      ctx.clip();
      ctx.fillStyle = shiftHex(style.fill, 1.18, 0, 0.9);
      ctx.fillText(text, 0, y);
      ctx.restore();
      ctx.restore();
      void blob;
    },
  };
}
