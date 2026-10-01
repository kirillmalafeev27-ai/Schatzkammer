// Препятствия (раздел 7.5.4): резная колонна с обломанным верхом, завал из камней,
// упавшая каменная голова статуи с комичным выражением. Холодные цвета.

import { palette, rgba, shiftHex } from '../../config/palette';
import type { AddSprite } from '../ArtFactory';
import {
  blob,
  bounds,
  brush,
  celShade,
  clipShadowCrescent,
  crack,
  ellipsePath,
  fillPath,
  halftone,
  hatch,
  ink,
  line,
  mulberry32,
  polyPath,
  tracePath,
  wobble,
  type Ctx,
  type Path,
  type Rng,
  type Tones,
} from '../comicKit';
import { SPR } from '../manifest';
import { INK, moss, stone, tonesFrom, tonesVar } from './common';

const COLD: Tones = { base: shiftHex(palette.rock.base, 1.08, -6), shadow: palette.rock.shadow, light: palette.rock.light };

function column(ctx: Ctx, rng: Rng): void {
  const W = 92;
  const cx = W / 2;
  const base = 186;
  const shaftW = 52;
  const tones = tonesVar(rng, COLD, 0.05, 4);
  // Плинт.
  const plinthTop = base - 24;
  const plinth: Path = wobble(
    polyPath([
      [cx - 38, plinthTop],
      [cx + 38, plinthTop],
      [cx + 40, base],
      [cx - 40, base],
    ]),
    0.7,
    rng,
    8,
  );
  celShade(ctx, plinth, tones, 7, { lightK: 3 });
  fillPath(ctx, polyPath([[cx - 38, plinthTop], [cx + 38, plinthTop], [cx + 36, plinthTop + 7], [cx - 36, plinthTop + 7]]), tones.light);
  ink(ctx, plinth, 6);
  // Ствол с каннелюрами; верх обломан.
  const topY = 26 + rng() * 14;
  const jag: [number, number][] = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const x = cx - shaftW / 2 + (shaftW * i) / n;
    jag.push([x, topY + (i % 2 ? 10 + rng() * 10 : rng() * 6) + (i === 0 || i === n ? 12 : 0)]);
  }
  const shaft: Path = polyPath([...jag, [cx + shaftW / 2 + 2, plinthTop + 2], [cx - shaftW / 2 - 2, plinthTop + 2]]);
  fillPath(ctx, shaft, tones.base);
  ctx.save();
  ctx.beginPath();
  tracePath(ctx, shaft);
  ctx.clip();
  // Цилиндр: свет слева, тень справа с растром и штриховкой у самого края.
  ctx.fillStyle = tones.light;
  ctx.fillRect(cx - shaftW / 2 - 4, 0, shaftW * 0.26, 220);
  ctx.fillStyle = tones.shadow;
  ctx.fillRect(cx + shaftW * 0.18, 0, shaftW, 220);
  halftone(ctx, rgba(palette.ink, 0.5), { region: { x: cx, y: topY, w: shaftW / 2 + 4, h: plinthTop - topY }, spacing: 6, rMin: 0.4, rMax: 2.6, dir: { x: 1, y: 0 } });
  hatch(ctx, { x: cx + shaftW * 0.36, y: topY, w: shaftW * 0.2, h: plinthTop - topY }, -Math.PI / 3, 5, 1.6, rgba(palette.ink, 0.6));
  // Каннелюры.
  for (let i = 1; i < 5; i++) {
    const x = cx - shaftW / 2 + (shaftW * i) / 5;
    line(ctx, [{ x: x + 1.2, y: topY + 14 }, { x: x + 1.2, y: plinthTop }], 2, rgba('#ffffff', 0.18));
    line(ctx, [{ x, y: topY + 14 }, { x, y: plinthTop }], 2.2, rgba(palette.ink, 0.5));
  }
  // Резной поясок.
  const band = topY + (plinthTop - topY) * 0.32;
  line(ctx, [{ x: cx - shaftW / 2, y: band }, { x: cx + shaftW / 2, y: band }], 3, rgba(palette.ink, 0.7));
  line(ctx, [{ x: cx - shaftW / 2, y: band + 7 }, { x: cx + shaftW / 2, y: band + 7 }], 3, rgba(palette.ink, 0.7));
  for (let x = cx - shaftW / 2 + 5; x < cx + shaftW / 2 - 2; x += 9) {
    line(ctx, [{ x, y: band + 1.5 }, { x: x + 4, y: band + 5.5 }], 1.6, rgba(palette.ink, 0.6));
  }
  crack(ctx, rng, { x: cx - 8 + rng() * 16, y: topY + 16 }, 50, Math.PI / 2 + (rng() - 0.5) * 0.6, 1.8);
  ctx.restore();
  // Слом сверху: видим поверхность обломка.
  const brk = polyPath(jag.map(([x, y], i) => [x, y + (i === 0 || i === n ? 0 : -2)] as [number, number]));
  const surf: Path = [...brk, ...polyPath([[cx + shaftW / 2 - 3, jag[n][1] + 4], [cx, jag[Math.floor(n / 2)][1] + 9], [cx - shaftW / 2 + 3, jag[0][1] + 4]])];
  fillPath(ctx, surf, shiftHex(tones.light, 1.05));
  line(ctx, surf, 2, rgba(palette.ink, 0.6), true);
  ink(ctx, shaft, INK);
  if (rng() < 0.7) moss(ctx, rng, cx - 20 + rng() * 40, plinthTop - 2, 9);
  // Обломки у основания.
  for (let i = 0; i < 2; i++) stone(ctx, rng, 14 + rng() * 8, 10 + rng() * 5, tones, { cx: cx + (i ? 30 : -32), cy: base - 6, inkW: 3, dots: false, specks: 0 });
}

function rubble(ctx: Ctx, rng: Rng): void {
  const W = 128;
  const cx = W / 2;
  const base = 104;
  const n = 3 + Math.floor(rng() * 3);
  const rocks: { x: number; y: number; w: number; h: number }[] = [];
  // Нижний ряд крупнее, верхние камни лежат на нижних.
  for (let i = 0; i < n; i++) {
    const row = i < 3 ? 0 : 1;
    const w = row ? 36 + rng() * 14 : 44 + rng() * 22;
    const h = w * (0.62 + rng() * 0.2);
    const x = row ? cx + (rng() - 0.5) * 30 : cx + (i - 1) * 32 + (rng() - 0.5) * 10;
    const y = row ? base - 44 - h * 0.3 : base - h * 0.45;
    rocks.push({ x, y, w, h });
  }
  rocks.sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  for (const r of rocks) stone(ctx, rng, r.w, r.h, tonesVar(rng, COLD, 0.07, 4), { cx: r.x, cy: r.y, inkW: 6.5, flatBottom: 0.15, cracks: rng() < 0.5 ? 1 : 0, hatchDeep: rng() < 0.4 });
  for (let i = 0; i < 4; i++) stone(ctx, rng, 10 + rng() * 8, 7 + rng() * 5, COLD, { cx: cx + (rng() - 0.5) * 100, cy: base - 3 - rng() * 4, inkW: 2.6, dots: false, specks: 0 });
  if (rng() < 0.6) moss(ctx, rng, rocks[0].x, rocks[0].y - rocks[0].h * 0.35, 8);
}

/** Голова статуи: лежит на боку, нос картошкой, брови нахмурены — комично. */
function head(ctx: Ctx, rng: Rng, variant: number): void {
  const tones = tonesVar(rng, tonesFrom(shiftHex(palette.rock.light, 0.86, -4), 0.62, 1.25), 0.04, 3);
  const cx = 66;
  const cy = 64;
  const tilt = variant ? 0.22 : -0.18;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  // Головной убор — ступенчатая корона.
  const crown: Path = polyPath([
    [-40, -30],
    [-30, -52],
    [-14, -44],
    [0, -60],
    [14, -44],
    [30, -52],
    [40, -30],
  ]);
  celShade(ctx, crown, tones, 6);
  ink(ctx, crown, 5.5);
  // Лицо.
  const face = blob(mulberry32(variant * 31 + 7), 92, 84, { cx: 0, cy: 0, points: 10, jitter: 0.06, flatBottom: 0.1 });
  celShade(ctx, face, tones, 12, { lightK: 6 });
  ctx.save();
  clipShadowCrescent(ctx, face, 12);
  halftone(ctx, rgba(palette.ink, 0.5), { region: bounds(face), spacing: 6, rMin: 0.3, rMax: 2.8 });
  ctx.restore();
  // Брови.
  brush(ctx, [{ x: -30, y: -16 }, { x: -18, y: -24 }, { x: -6, y: -18 }], 7, palette.ink, 0.4);
  brush(ctx, [{ x: 6, y: -18 }, { x: 18, y: variant ? -27 : -23 }, { x: 30, y: -15 }], 7, palette.ink, 0.4);
  // Глаза: один закрыт, другой — каменная щёлочка или круглый.
  line(ctx, [{ x: -26, y: -6 }, { x: -18, y: -2 }, { x: -9, y: -6 }], 3.6, palette.ink);
  if (variant) {
    fillPath(ctx, ellipsePath(18, -6, 7, 6), shiftHex(tones.shadow, 0.8));
    line(ctx, ellipsePath(18, -6, 7, 6), 3, palette.ink, true);
    fillPath(ctx, ellipsePath(19, -5, 2.5, 2.5), palette.ink);
  } else line(ctx, [{ x: 9, y: -6 }, { x: 18, y: -2 }, { x: 27, y: -6 }], 3.6, palette.ink);
  // Нос картошкой.
  const nose = blob(mulberry32(variant + 3), 26, 22, { cx: 0, cy: 10, points: 8, jitter: 0.05 });
  celShade(ctx, nose, tones, 5);
  ink(ctx, nose, 4);
  // Рот.
  if (variant) {
    fillPath(ctx, ellipsePath(2, 30, 8, 6), shiftHex(tones.shadow, 0.6));
    line(ctx, ellipsePath(2, 30, 8, 6), 3.4, palette.ink, true);
  } else {
    brush(ctx, [{ x: -14, y: 30 }, { x: 0, y: 26 }, { x: 14, y: 31 }], 5, palette.ink, 0.5);
  }
  // Уши.
  for (const s of [-1, 1]) {
    const ear = blob(mulberry32(s + 10), 14, 26, { cx: s * 47, cy: 2, points: 7, jitter: 0.08 });
    celShade(ctx, ear, tones, 4);
    ink(ctx, ear, 4.5);
  }
  crack(ctx, rng, { x: -10, y: -40 }, 40, Math.PI / 2 + 0.3, 1.8);
  ink(ctx, face, INK);
  ctx.restore();
  moss(ctx, rng, cx - 20, cy - 52, 9);
}

export function obstacleSprites(add: AddSprite, rng: Rng): void {
  SPR.column.forEach((name, i) => add(name, { w: 92, h: 196, ox: 46, oy: 182, draw: (c) => column(c, mulberry32(Math.floor(rng() * 1e9) + i)) }));
  SPR.rubble.forEach((name, i) => add(name, { w: 128, h: 112, ox: 64, oy: 100, draw: (c) => rubble(c, mulberry32(Math.floor(rng() * 1e9) + i)) }));
  SPR.head.forEach((name, i) => add(name, { w: 132, h: 132, ox: 66, oy: 118, draw: (c) => head(c, mulberry32(Math.floor(rng() * 1e9) + i), i) }));
}
