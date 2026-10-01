// Дверь (раздел 7.5.8) и песочные часы (7.5.9).

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
  glint,
  halftone,
  halftoneFlat,
  hatch,
  ink,
  line,
  mulberry32,
  polyPath,
  radialSpot,
  roughRect,
  tracePath,
  type Ctx,
  type Path,
  type Rng,
  type Tones,
} from '../comicKit';
import { SPR } from '../manifest';
import { INK } from './common';

const DOOR: Tones = {
  base: palette.doorStone.base,
  shadow: palette.doorStone.shadow,
  light: palette.doorStone.light,
};
const BRONZE: Tones = {
  base: palette.bronze.base,
  shadow: palette.bronze.shadow,
  light: palette.bronze.light,
};
const IRON: Tones = { base: palette.iron, shadow: palette.ironDark, light: palette.ironLight };

const SLAB_W = 108;
const SLAB_H = 172;

function slab(ctx: Ctx, rng: Rng): void {
  const p = roughRect(rng, 2, 2, SLAB_W - 4, SLAB_H - 4, 5, 1.2);
  celShade(ctx, p, DOOR, 10, { lightK: 4 });
  ctx.save();
  clipShadowCrescent(ctx, p, 10);
  halftone(ctx, rgba(palette.ink, 0.45), { region: bounds(p), spacing: 6, rMin: 0.3, rMax: 2.4 });
  ctx.restore();
  // Рамка-бордюр рельефом.
  const inner = roughRect(rng, 12, 12, SLAB_W - 24, SLAB_H - 24, 3, 0.8);
  line(
    ctx,
    inner.map((q) => ({ x: q.x + 1.5, y: q.y + 1.5 })),
    3,
    rgba('#ffffff', 0.3),
    true,
  );
  line(ctx, inner, 3, rgba(palette.ink, 0.6), true);
  // Солнце: круг, лучи.
  const cx = SLAB_W / 2;
  const cy = SLAB_H * 0.56;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r0 = 22;
    const r1 = i % 2 ? 32 : 38;
    const tri = polyPath([
      [cx + Math.cos(a - 0.13) * r0, cy + Math.sin(a - 0.13) * r0],
      [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1],
      [cx + Math.cos(a + 0.13) * r0, cy + Math.sin(a + 0.13) * r0],
    ]);
    fillPath(ctx, tri, i % 2 ? DOOR.light : DOOR.base);
    line(ctx, tri, 2, rgba(palette.ink, 0.65), true);
  }
  const disc = ellipsePath(cx, cy, 20, 20, 36);
  celShade(ctx, disc, BRONZE, 4);
  line(ctx, ellipsePath(cx, cy, 13, 13), 2, rgba(palette.ink, 0.6), true);
  // Лицо солнца.
  line(
    ctx,
    [
      { x: cx - 7, y: cy - 3 },
      { x: cx - 3, y: cy - 4 },
    ],
    2.2,
    palette.ink,
  );
  line(
    ctx,
    [
      { x: cx + 3, y: cy - 4 },
      { x: cx + 7, y: cy - 3 },
    ],
    2.2,
    palette.ink,
  );
  brush(
    ctx,
    [
      { x: cx - 6, y: cy + 5 },
      { x: cx, y: cy + 8 },
      { x: cx + 6, y: cy + 5 },
    ],
    2.4,
    palette.ink,
    0.5,
  );
  ink(ctx, disc, 3.4);
  glint(ctx, cx - 9, cy - 9, 4);
  // Латунные заклёпки по углам.
  for (const [x, y] of [
    [20, 20],
    [SLAB_W - 20, 20],
    [20, SLAB_H - 20],
    [SLAB_W - 20, SLAB_H - 20],
    [cx, 20],
  ]) {
    const st = ellipsePath(x, y, 4.2, 4.2, 16);
    celShade(ctx, st, BRONZE, 1.5);
    line(ctx, st, 2, palette.ink, true);
  }
  // Глифы сверху.
  for (let i = 0; i < 4; i++) {
    const x = 26 + i * 18.5;
    const y = 40;
    line(
      ctx,
      [
        { x: x - 4, y: y - 5 },
        { x: x + 4, y: y + 5 },
      ],
      2.2,
      rgba(palette.ink, 0.55),
    );
    line(
      ctx,
      [
        { x: x + 4, y: y - 5 },
        { x: x - 4, y: y + 5 },
      ],
      2.2,
      rgba(palette.ink, 0.55),
    );
  }
  crack(ctx, rng, { x: 18 + rng() * 20, y: SLAB_H - 8 }, 46, -Math.PI / 2 + 0.4, 1.8);
  // Нижняя кромка темнее — край, который скребёт по полу.
  line(
    ctx,
    [
      { x: 4, y: SLAB_H - 5 },
      { x: SLAB_W - 4, y: SLAB_H - 5 },
    ],
    4,
    rgba(palette.ink, 0.5),
  );
  ink(ctx, p, INK - 1);
}

function framePillar(ctx: Ctx, rng: Rng, flip: boolean): void {
  const W = 34;
  const H = 210;
  const tones: Tones = {
    base: shiftHex(DOOR.base, 0.84, 6),
    shadow: shiftHex(DOOR.shadow, 0.85, 8),
    light: shiftHex(DOOR.light, 0.92, 4),
  };
  const p = roughRect(rng, 3, 2, W - 6, H - 4, 3, 1);
  fillPath(ctx, p, tones.base);
  ctx.save();
  ctx.beginPath();
  tracePath(ctx, p);
  ctx.clip();
  // Свет слева, тень справа.
  ctx.fillStyle = tones.light;
  ctx.fillRect(flip ? W - 10 : 0, 0, 10, H);
  ctx.fillStyle = tones.shadow;
  ctx.fillRect(flip ? 0 : W - 11, 0, 11, H);
  halftone(ctx, rgba(palette.ink, 0.5), {
    region: { x: flip ? 0 : W - 14, y: 0, w: 14, h: H },
    spacing: 5,
    rMin: 0.3,
    rMax: 2,
    dir: { x: flip ? -1 : 1, y: 0 },
  });
  // Кольца-пояски.
  for (const y of [30, 70, 110, 150, 190]) {
    line(
      ctx,
      [
        { x: 0, y: y + 1.5 },
        { x: W, y: y + 1.5 },
      ],
      2.4,
      rgba('#ffffff', 0.22),
    );
    line(
      ctx,
      [
        { x: 0, y },
        { x: W, y },
      ],
      2.6,
      rgba(palette.ink, 0.65),
    );
  }
  ctx.restore();
  ink(ctx, p, 5.5);
}

function lintel(ctx: Ctx, rng: Rng): void {
  const W = 196;
  const H = 40;
  const p = roughRect(rng, 3, 3, W - 6, H - 6, 4, 1.4);
  const tones: Tones = { base: shiftHex(DOOR.base, 0.9, 4), shadow: DOOR.shadow, light: DOOR.light };
  celShade(ctx, p, tones, 7, { lightK: 3 });
  ctx.save();
  clipShadowCrescent(ctx, p, 7);
  halftone(ctx, rgba(palette.ink, 0.45), { region: bounds(p), spacing: 5, rMin: 0.3, rMax: 2 });
  ctx.restore();
  // Ключевой камень.
  const key = polyPath([
    [W / 2 - 14, 2],
    [W / 2 + 14, 2],
    [W / 2 + 10, H - 2],
    [W / 2 - 10, H - 2],
  ]);
  celShade(ctx, key, { base: DOOR.light, shadow: DOOR.base, light: '#ece2c8' }, 4);
  ink(ctx, key, 4);
  // Ряд глифов.
  for (let i = 0; i < 8; i++) {
    const x = 18 + i * 21 + (i >= 4 ? 28 : 0);
    if (x > W - 14) break;
    line(ctx, ellipsePath(x, H / 2, 4.5, 4.5), 2.2, rgba(palette.ink, 0.55), true);
  }
  ink(ctx, p, 6.5);
}

function gear(ctx: Ctx): void {
  const cx = 24;
  const cy = 24;
  const teeth = 10;
  const pts: Path = [];
  for (let i = 0; i < teeth * 4; i++) {
    const a = (i / (teeth * 4)) * Math.PI * 2;
    const r = i % 4 < 2 ? 21 : 16;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  celShade(ctx, pts, IRON, 4);
  ink(ctx, pts, 3.6);
  const hub = ellipsePath(cx, cy, 8, 8, 20);
  celShade(ctx, hub, BRONZE, 2);
  line(ctx, hub, 2.6, palette.ink, true);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    line(
      ctx,
      [
        { x: cx + Math.cos(a) * 9, y: cy + Math.sin(a) * 9 },
        { x: cx + Math.cos(a) * 14, y: cy + Math.sin(a) * 14 },
      ],
      2.6,
      palette.ink,
    );
  }
  fillPath(ctx, ellipsePath(cx, cy, 2.4, 2.4), palette.ink);
}

function chain(ctx: Ctx): void {
  // Тайл цепи: два звена (вертикальное и ребром), высота 32 — бесшовно по вертикали.
  const link = (y: number, edge: boolean) => {
    if (edge) {
      const r = polyPath([
        [6, y],
        [10, y],
        [10, y + 16],
        [6, y + 16],
      ]);
      fillPath(ctx, r, IRON.shadow);
      line(ctx, r, 2, palette.ink, true);
    } else {
      const o = ellipsePath(8, y + 8, 5.5, 9.5, 20);
      line(ctx, o, 5, palette.ink, true);
      line(ctx, o, 2.6, IRON.light, true);
    }
  };
  link(0, false);
  link(16, true);
}

/** Небо в щели: полосы, солнце, силуэты джунглей. Комиксные ступени, без плавного градиента. */
function sky(ctx: Ctx, rng: Rng, late: boolean): void {
  const W = 112;
  const H = 160;
  const bands = late
    ? ['#ff7a54', '#ff9a5c', '#ffc07a', '#ffe0a0']
    : ['#7fc8ff', '#a9dcff', '#d8efff', '#fff1c9'];
  for (let i = 0; i < bands.length; i++) {
    ctx.fillStyle = bands[i];
    ctx.fillRect(0, (H * i) / bands.length, W, H / bands.length + 1);
  }
  // Растр на стыках полос.
  for (let i = 1; i < bands.length; i++) {
    ctx.save();
    const y = (H * i) / bands.length;
    ctx.beginPath();
    ctx.rect(0, y - 8, W, 8);
    ctx.clip();
    halftoneFlat(ctx, bands[i - 1], { x: 0, y: y - 8, w: W, h: 16 }, 4.5, 1.6);
    ctx.restore();
  }
  // Солнце.
  const sy = late ? H * 0.62 : H * 0.36;
  fillPath(ctx, ellipsePath(W * 0.62, sy, late ? 20 : 15, late ? 20 : 15), late ? '#fff0b0' : '#ffffff');
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    line(
      ctx,
      [
        { x: W * 0.62 + Math.cos(a) * 22, y: sy + Math.sin(a) * 22 },
        { x: W * 0.62 + Math.cos(a) * 30, y: sy + Math.sin(a) * 30 },
      ],
      2.4,
      rgba('#ffffff', 0.8),
    );
  }
  // Облако.
  const cl = blob(rng, 44, 14, { cx: W * 0.28, cy: H * 0.22, points: 9 });
  fillPath(ctx, cl, late ? '#ffd2a6' : '#ffffff');
  line(ctx, cl, 2, rgba(palette.ink, 0.5), true);
  // Дальние джунгли.
  const far: Path = [{ x: 0, y: H }];
  for (let x = 0; x <= W; x += 6)
    far.push({ x, y: H * 0.7 - Math.abs(Math.sin(x * 0.17 + rng())) * 16 - rng() * 6 });
  far.push({ x: W, y: H });
  fillPath(ctx, far, late ? '#8a4a5a' : palette.jungle.far);
  // Ближние джунгли и пальма.
  const near: Path = [{ x: 0, y: H }];
  for (let x = 0; x <= W; x += 5)
    near.push({ x, y: H * 0.84 - Math.abs(Math.sin(x * 0.23 + 1.3)) * 14 - rng() * 5 });
  near.push({ x: W, y: H });
  fillPath(ctx, near, late ? '#4a2440' : palette.jungle.near);
  const tx = W * 0.2;
  brush(
    ctx,
    [
      { x: tx, y: H },
      { x: tx + 4, y: H * 0.72 },
      { x: tx + 10, y: H * 0.55 },
    ],
    6,
    late ? '#3a1a34' : '#1e3a3c',
    0.6,
  );
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI + (i / 4) * Math.PI;
    brush(
      ctx,
      [
        { x: tx + 10, y: H * 0.55 },
        { x: tx + 10 + Math.cos(a) * 16, y: H * 0.55 + Math.sin(a) * 6 - 4 },
        { x: tx + 10 + Math.cos(a) * 26, y: H * 0.55 + 8 },
      ],
      5,
      late ? '#3a1a34' : '#1e3a3c',
      0.3,
    );
  }
}

function rays(ctx: Ctx, rng: Rng): void {
  const W = 140;
  const H = 120;
  for (let i = 0; i < 7; i++) {
    const x = 20 + rng() * (W - 40);
    const w = 6 + rng() * 10;
    fillPath(
      ctx,
      polyPath([
        [x, H],
        [x + w, H],
        [x + w * 0.5 + (rng() - 0.5) * 30, 0],
      ]),
      rgba('#fff6d8', 0.26),
    );
  }
}

function beam(ctx: Ctx): void {
  // Трапеция луча на полу: плоская заливка, растр по краям — без плавного градиента.
  const W = 220;
  const H = 300;
  const top = 34;
  const p = polyPath([
    [W / 2 - top, 0],
    [W / 2 + top, 0],
    [W - 8, H],
    [8, H],
  ]);
  fillPath(ctx, p, rgba('#fff6d8', 0.55));
  ctx.save();
  ctx.beginPath();
  tracePath(ctx, p);
  ctx.clip();
  halftone(ctx, rgba('#fff6d8', 0.5), {
    region: { x: 0, y: H * 0.55, w: W, h: H * 0.45 },
    spacing: 7,
    rMin: 2.6,
    rMax: 0,
    dir: { x: 0, y: 1 },
  });
  ctx.restore();
  // Растворяется к концу: вычитаем растр.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  halftone(ctx, '#000', {
    region: { x: 0, y: H * 0.6, w: W, h: H * 0.4 },
    spacing: 7,
    rMin: 0,
    rMax: 4.2,
    dir: { x: 0, y: 1 },
  });
  ctx.fillStyle = 'rgba(0,0,0,1)';
  ctx.fillRect(0, H - 6, W, 6);
  ctx.restore();
}

function hourglassFrame(ctx: Ctx): void {
  const W = 60;
  const H = 96;
  const cx = W / 2;
  // Стойки.
  for (const x of [8, W - 8]) {
    const post = polyPath([
      [x - 3, 12],
      [x + 3, 12],
      [x + 3, H - 12],
      [x - 3, H - 12],
    ]);
    celShade(ctx, post, BRONZE, 2);
    line(ctx, post, 2.6, palette.ink, true);
  }
  // Колбы — контур стекла.
  const glass: Path = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const y = 14 + t * (H - 28);
    const w = 3 + Math.abs(Math.cos(t * Math.PI)) * 17;
    glass.push({ x: cx - w, y });
  }
  for (let i = 20; i >= 0; i--) {
    const t = i / 20;
    const y = 14 + t * (H - 28);
    const w = 3 + Math.abs(Math.cos(t * Math.PI)) * 17;
    glass.push({ x: cx + w, y });
  }
  line(ctx, glass, 3.4, palette.ink, true);
  // Риски по четвертям на верхней колбе.
  for (let q = 1; q < 4; q++) {
    const y = 14 + (q / 4) * ((H - 28) / 2);
    line(
      ctx,
      [
        { x: cx + 12, y },
        { x: cx + 17, y },
      ],
      1.8,
      palette.ink,
    );
  }
  // Плиты сверху и снизу.
  for (const y of [4, H - 14]) {
    const plate = roughRect(mulberry32(y), 2, y, W - 4, 10, 3, 0.6);
    celShade(ctx, plate, BRONZE, 3);
    ink(ctx, plate, 3.4);
  }
}

function hourglassSand(ctx: Ctx): void {
  // Песок для колбы (обрезается сверху по уровню).
  const W = 40;
  const H = 38;
  const p: Path = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    p.push({ x: W / 2 - (3 + (1 - t) * 15), y: t * H });
  }
  for (let i = 16; i >= 0; i--) {
    const t = i / 16;
    p.push({ x: W / 2 + 3 + (1 - t) * 15, y: t * H });
  }
  fillPath(ctx, p, palette.sand.base);
  ctx.save();
  ctx.beginPath();
  tracePath(ctx, p);
  ctx.clip();
  ctx.fillStyle = palette.sand.light;
  ctx.fillRect(0, 0, W * 0.4, H);
  halftone(ctx, rgba(palette.sand.shadow, 0.9), {
    region: { x: W * 0.5, y: 0, w: W * 0.5, h: H },
    spacing: 3.5,
    rMin: 0.3,
    rMax: 1.3,
    dir: { x: 1, y: 0 },
  });
  ctx.restore();
}

function hourglassGlass(ctx: Ctx): void {
  const W = 60;
  const H = 96;
  line(
    ctx,
    [
      { x: 19, y: 20 },
      { x: 22, y: 36 },
    ],
    2.6,
    rgba('#ffffff', 0.75),
  );
  line(
    ctx,
    [
      { x: 20, y: 62 },
      { x: 22, y: 76 },
    ],
    2.6,
    rgba('#ffffff', 0.6),
  );
  glint(ctx, 24, 22, 4);
  void W;
  void H;
}

export function doorSprites(add: AddSprite, rng: Rng): void {
  const D = SPR.door;
  add(D.slab, {
    w: SLAB_W,
    h: SLAB_H,
    ox: SLAB_W / 2,
    oy: 0,
    draw: (c) => slab(c, mulberry32(Math.floor(rng() * 1e9))),
  });
  add(D.frameL, { w: 34, h: 210, ox: 34, oy: 210, draw: (c) => framePillar(c, mulberry32(11), false) });
  add(D.frameR, { w: 34, h: 210, ox: 0, oy: 210, draw: (c) => framePillar(c, mulberry32(12), true) });
  add(D.lintel, { w: 196, h: 40, ox: 98, oy: 40, draw: (c) => lintel(c, mulberry32(13)) });
  add(D.gear, { w: 48, h: 48, ox: 24, oy: 24, draw: gear });
  add(D.chain, { w: 16, h: 32, ox: 8, oy: 0, draw: chain });
  add(D.sky, { w: 112, h: 160, ox: 56, oy: 160, draw: (c) => sky(c, mulberry32(21), false) });
  add(D.skyLate, { w: 112, h: 160, ox: 56, oy: 160, draw: (c) => sky(c, mulberry32(21), true) });
  add(D.rays, { w: 140, h: 120, ox: 70, oy: 120, draw: (c) => rays(c, mulberry32(22)) });
  add(D.beam, { w: 220, h: 300, ox: 110, oy: 0, draw: beam });
  add(SPR.hourglass.frame, { w: 60, h: 96, ox: 30, oy: 48, draw: hourglassFrame });
  add(SPR.hourglass.sand, { w: 40, h: 38, ox: 20, oy: 38, draw: hourglassSand });
  add(SPR.hourglass.glass, { w: 60, h: 96, ox: 30, oy: 48, draw: hourglassGlass });
  void hatch;
  void radialSpot;
}
