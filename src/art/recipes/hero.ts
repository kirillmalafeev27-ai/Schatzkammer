// Герой (раздел 7.5.7): части-контейнеры; лицо простое — глаза-овалы с бликом,
// главный носитель эмоции — брови. Мешок в 4 стадиях по цене шага.
// Все части нарисованы лицом вправо; якоря согласованы с HeroView (см. HERO_RIG).

import { palette, rgba, shiftHex } from '../../config/palette';
import type { AddSprite } from '../ArtFactory';
import {
  blob,
  bounds,
  brush,
  celShade,
  chaikin,
  clipShadowCrescent,
  ellipsePath,
  fillPath,
  glint,
  halftone,
  ink,
  line,
  mulberry32,
  polyPath,
  tracePath,
  type Ctx,
  type Path,
  type Tones,
} from '../comicKit';
import { SPR } from '../manifest';
import { tonesFrom } from './common';

const P = palette.hero;
const T = {
  skin: tonesFrom(P.skin, 0.8, 1.1, 10),
  shirt: tonesFrom(P.shirt, 0.8, 1.04, 22),
  pants: tonesFrom(P.pants, 0.66, 1.4, 10),
  boots: tonesFrom(P.boots, 0.62, 1.55, 6),
  hat: tonesFrom(P.hat, 0.66, 1.36, 8),
  scarf: tonesFrom(P.scarf, 0.74, 1.22, 12),
  bag: tonesFrom(P.bag, 0.7, 1.26, 8),
  brass: { base: palette.bronze.base, shadow: palette.bronze.shadow, light: palette.bronze.light } as Tones,
};
const HAIR = '#4e2c1c';
const LINE = 5.4;

/** Якоря частей героя в мировых единицах (ноги в (0,0), лицом вправо). */
export const HERO_RIG = {
  legB: { x: -8, y: -46 },
  legF: { x: 8, y: -46 },
  bootB: { x: -9, y: 0 },
  bootF: { x: 9, y: 0 },
  upper: { x: 0, y: -44 },
  bag: { x: -14, y: -26 },
  armB: { x: 15, y: -42 },
  torso: { x: 0, y: 0 },
  lantern: { x: 20, y: -8 },
  scarfTail: { x: -10, y: -47 },
  scarf: { x: 2, y: -47 },
  head: { x: 3, y: -48 },
  eyes: { x: 9, y: -27 },
  brows: { x: 9, y: -37 },
  mouth: { x: 16, y: -11 },
  hat: { x: -1, y: -45 },
  sweat: { x: -20, y: -42 },
  armF: { x: -16, y: -42 },
  pips: { x: 0, y: -186 },
} as const;

function shadeDots(ctx: Ctx, path: Path, k: number, spacing = 4.5, r = 1.7): void {
  ctx.save();
  clipShadowCrescent(ctx, path, k);
  halftone(ctx, rgba(palette.ink, 0.42), { region: bounds(path), spacing, rMin: 0.2, rMax: r });
  ctx.restore();
}

function part(ctx: Ctx, path: Path, tones: Tones, k: number, w = LINE, dots = true): void {
  celShade(ctx, path, tones, k, { lightK: k * 0.45 });
  if (dots) shadeDots(ctx, path, k);
  ink(ctx, path, w);
}

const soft = (pts: [number, number][], passes = 1): Path => chaikin(polyPath(pts), passes, true);

// ── Ноги ─────────────────────────────────────────────────────────────────

function boot(ctx: Ctx, back: boolean): void {
  const t = back
    ? { base: T.boots.shadow, shadow: shiftHex(T.boots.shadow, 0.72), light: T.boots.base }
    : T.boots;
  const p = soft([
    [8, 2],
    [21, 2],
    [22, 9],
    [31, 11],
    [36, 15],
    [35, 21],
    [5, 21],
    [6, 9],
  ]);
  part(ctx, p, t, 4, 4.8, false);
  // Подошва и отворот голенища.
  line(
    ctx,
    [
      { x: 6, y: 19 },
      { x: 34, y: 19 },
    ],
    3.2,
    palette.ink,
  );
  line(
    ctx,
    [
      { x: 8, y: 6.5 },
      { x: 21, y: 6.5 },
    ],
    2.2,
    rgba(palette.ink, 0.65),
  );
  if (!back) glint(ctx, 27, 13, 3.2);
}

function leg(ctx: Ctx, back: boolean): void {
  const t = back
    ? { base: T.pants.shadow, shadow: shiftHex(T.pants.shadow, 0.74), light: T.pants.base }
    : T.pants;
  const p = soft([
    [2, 1],
    [21, 1],
    [20, 34],
    [3, 34],
  ]);
  part(ctx, p, t, 4, 4.6);
  line(
    ctx,
    [
      { x: 4, y: 27 },
      { x: 19, y: 27 },
    ],
    2.2,
    rgba(palette.ink, 0.7),
  );
}

// ── Корпус ───────────────────────────────────────────────────────────────

function torso(ctx: Ctx): void {
  const p = soft([
    [9, 4],
    [51, 4],
    [57, 14],
    [53, 52],
    [7, 52],
    [3, 14],
  ]);
  part(ctx, p, T.shirt, 6.5);
  // Воротник углом.
  const col = polyPath([
    [21, 5],
    [30, 16],
    [39, 5],
  ]);
  fillPath(ctx, col, T.shirt.shadow);
  line(ctx, col, 2.6, palette.ink);
  for (const y of [22, 32]) fillPath(ctx, ellipsePath(31, y, 1.9, 1.9), palette.ink);
  // Нагрудный карман.
  const pocket = polyPath([
    [37, 19],
    [48, 19],
    [48, 29],
    [37, 29],
  ]);
  fillPath(ctx, pocket, T.shirt.shadow);
  line(ctx, pocket, 2.2, palette.ink, true);
  line(
    ctx,
    [
      { x: 37, y: 22 },
      { x: 48, y: 22 },
    ],
    1.6,
    palette.ink,
  );
  // Лямка мешка по диагонали.
  const strap = polyPath([
    [8, 5],
    [16, 5],
    [46, 45],
    [38, 47],
  ]);
  fillPath(ctx, strap, T.bag.shadow);
  line(ctx, strap, 2.6, palette.ink, true);
  for (let i = 0; i < 4; i++) {
    const k = 0.14 + i * 0.22;
    const x = 12 + (42 - 12) * k;
    const y = 5 + (46 - 5) * k;
    line(
      ctx,
      [
        { x: x - 2.5, y },
        { x: x + 2.5, y: y + 0.6 },
      ],
      1.5,
      P.bagStitch,
    );
  }
  // Ремень с латунной пряжкой.
  const belt = polyPath([
    [6, 43],
    [54, 43],
    [54, 51],
    [6, 51],
  ]);
  fillPath(ctx, belt, P.boots);
  line(ctx, belt, 2.6, palette.ink, true);
  const buckle = polyPath([
    [27, 42],
    [35, 42],
    [35, 52],
    [27, 52],
  ]);
  celShade(ctx, buckle, T.brass, 2);
  line(ctx, buckle, 2.4, palette.ink, true);
  ink(ctx, p, LINE);
}

function arm(ctx: Ctx, back: boolean): void {
  const shirt = back
    ? { base: T.shirt.shadow, shadow: shiftHex(T.shirt.shadow, 0.78), light: T.shirt.base }
    : T.shirt;
  const skin = back
    ? { base: T.skin.shadow, shadow: shiftHex(T.skin.shadow, 0.8), light: T.skin.base }
    : T.skin;
  const fore = soft([
    [5, 18],
    [15, 18],
    [15, 34],
    [5, 34],
  ]);
  part(ctx, fore, skin, 3, 4.2, false);
  const sleeve = soft([
    [2, 2],
    [18, 2],
    [18, 21],
    [2, 22],
  ]);
  part(ctx, sleeve, shirt, 3.6, 4.4, false);
  line(
    ctx,
    [
      { x: 3, y: 17 },
      { x: 18, y: 16 },
    ],
    2.4,
    palette.ink,
  );
  const fist = blob(mulberry32(back ? 3 : 4), 16, 14, { cx: 10, cy: 37, points: 8, jitter: 0.05 });
  part(ctx, fist, skin, 3, 4.2, false);
}

function lantern(ctx: Ctx): void {
  line(ctx, ellipsePath(12, 3, 4, 3), 2.2, palette.ink, true);
  const cap = soft([
    [5, 6],
    [19, 6],
    [17, 11],
    [7, 11],
  ]);
  part(ctx, cap, T.brass, 2, 3, false);
  const glass = polyPath([
    [6, 11],
    [18, 11],
    [19, 25],
    [5, 25],
  ]);
  fillPath(ctx, glass, P.lantern);
  fillPath(
    ctx,
    polyPath([
      [7, 12],
      [11, 12],
      [10, 24],
      [6, 24],
    ]),
    '#fff6cf',
  );
  fillPath(ctx, ellipsePath(12, 19, 3, 4.5), '#ffffff');
  line(ctx, glass, 3, palette.ink, true);
  line(
    ctx,
    [
      { x: 12, y: 11 },
      { x: 12, y: 25 },
    ],
    1.6,
    rgba(palette.ink, 0.7),
  );
  const bottom = soft([
    [4, 25],
    [20, 25],
    [18, 30],
    [6, 30],
  ]);
  part(ctx, bottom, T.brass, 2, 3, false);
}

function scarf(ctx: Ctx): void {
  const p = blob(mulberry32(21), 50, 19, { cx: 27, cy: 11, points: 9, jitter: 0.05 });
  part(ctx, p, T.scarf, 4, 4.6);
  line(
    ctx,
    [
      { x: 13, y: 8 },
      { x: 23, y: 13 },
    ],
    1.8,
    rgba(palette.ink, 0.55),
  );
  line(
    ctx,
    [
      { x: 28, y: 13 },
      { x: 39, y: 9 },
    ],
    1.8,
    rgba(palette.ink, 0.55),
  );
}

function scarfTail(ctx: Ctx): void {
  const p = soft([
    [41, 3],
    [28, 2],
    [14, 5],
    [2, 2],
    [7, 9],
    [3, 15],
    [16, 13],
    [30, 11],
    [41, 11],
  ]);
  part(ctx, p, T.scarf, 3.5, 4.4, false);
  line(
    ctx,
    [
      { x: 31, y: 6.5 },
      { x: 16, y: 8.5 },
    ],
    1.6,
    rgba(palette.ink, 0.5),
  );
}

// ── Голова ───────────────────────────────────────────────────────────────
// Кадр 72×64, якорь — низ подбородка (36, 62).

function head(ctx: Ctx): void {
  // Волосы на затылке (под полями шляпы).
  const hair = blob(mulberry32(32), 30, 22, { cx: 17, cy: 22, points: 9, jitter: 0.12 });
  fillPath(ctx, hair, HAIR);
  ink(ctx, hair, 3.8);
  // Ухо.
  const ear = blob(mulberry32(31), 14, 19, { cx: 15, cy: 37, points: 8, jitter: 0.05 });
  part(ctx, ear, T.skin, 3, 4.2, false);
  // Голова: челюсть чуть выдаётся вперёд (вправо).
  const p = chaikin(
    polyPath([
      [20, 10],
      [44, 7],
      [60, 18],
      [64, 34],
      [60, 50],
      [46, 61],
      [28, 60],
      [16, 50],
      [12, 30],
    ]),
    2,
    true,
  );
  celShade(ctx, p, T.skin, 7.5, { lightK: 3.5 });
  shadeDots(ctx, p, 7.5, 4.2, 1.5);
  fillPath(ctx, ellipsePath(48, 44, 6, 3.6), rgba('#ff6a5a', 0.38));
  ink(ctx, p, LINE);
  // Завиток уха поверх контура.
  line(
    ctx,
    [
      { x: 14, y: 33 },
      { x: 16, y: 40 },
    ],
    2,
    rgba(palette.ink, 0.7),
  );
  // Нос картошкой справа.
  const nose = blob(mulberry32(34), 15, 13, { cx: 63, cy: 39, points: 8, jitter: 0.04 });
  part(ctx, nose, T.skin, 2.6, 4, false);
  // Щетина-растр на подбородке.
  ctx.save();
  ctx.beginPath();
  tracePath(ctx, p);
  ctx.clip();
  halftone(ctx, rgba(palette.ink, 0.2), {
    region: { x: 32, y: 50, w: 28, h: 12 },
    spacing: 3.2,
    rMin: 0.55,
    rMax: 0.65,
  });
  ctx.restore();
}

function eyes(ctx: Ctx, look: 'side' | 'front' | 'back' | 'closed'): void {
  // Ближний глаз крупнее дальнего.
  for (const [cx, rx, ry] of [
    [8, 5.4, 7.2],
    [22, 4.8, 6.6],
  ] as const) {
    if (look === 'closed') {
      brush(
        ctx,
        [
          { x: cx - 5.5, y: 8 },
          { x: cx, y: 11 },
          { x: cx + 5.5, y: 8 },
        ],
        3,
        palette.ink,
        0.5,
      );
      continue;
    }
    const e = ellipsePath(cx, 8, rx, ry, 24);
    fillPath(ctx, e, '#ffffff');
    line(ctx, e, 2.4, palette.ink, true);
    const dx = look === 'side' ? 1.8 : look === 'back' ? -1.4 : 0;
    const dy = look === 'back' ? -2.6 : look === 'front' ? 0.8 : 0.6;
    const pr = look === 'front' ? 3.3 : 2.9;
    fillPath(ctx, ellipsePath(cx + dx, 8 + dy, pr, pr * 1.18), palette.heroEye);
    fillPath(ctx, ellipsePath(cx + dx - 1, 8 + dy - 1.4, 1.2, 1.2), '#ffffff');
  }
}

function brows(ctx: Ctx, mood: 'neutral' | 'worried' | 'strain' | 'happy'): void {
  const L: Record<typeof mood, [number, number][][]> = {
    neutral: [
      [
        [2, 7.5],
        [8, 5],
        [14, 6],
      ],
      [
        [17, 6],
        [23, 4.5],
        [29, 6.5],
      ],
    ],
    // Брови домиком: внутренние концы вверх.
    worried: [
      [
        [2, 8.5],
        [8, 6.5],
        [14, 2.5],
      ],
      [
        [17, 2.5],
        [23, 6.5],
        [29, 8.5],
      ],
    ],
    // Натуга: внутренние концы вниз.
    strain: [
      [
        [2, 3.5],
        [8, 5.5],
        [14, 9],
      ],
      [
        [17, 9],
        [23, 5.5],
        [29, 3.5],
      ],
    ],
    happy: [
      [
        [2, 6.5],
        [8, 2.5],
        [14, 5.5],
      ],
      [
        [17, 5.5],
        [23, 2.5],
        [29, 6.5],
      ],
    ],
  };
  for (const b of L[mood]) brush(ctx, polyPath(b), 4.8, HAIR, 0.55);
}

function mouth(ctx: Ctx, kind: 'smile' | 'open' | 'flat' | 'grit'): void {
  if (kind === 'smile')
    brush(
      ctx,
      [
        { x: 2, y: 4 },
        { x: 8, y: 8.5 },
        { x: 16, y: 4 },
      ],
      3.4,
      palette.ink,
      0.45,
    );
  else if (kind === 'flat')
    brush(
      ctx,
      [
        { x: 3, y: 7 },
        { x: 9, y: 5.8 },
        { x: 15, y: 7.6 },
      ],
      3,
      palette.ink,
      0.5,
    );
  else if (kind === 'open') {
    const m = ellipsePath(9, 6.5, 6, 5);
    fillPath(ctx, m, '#7a1f2c');
    fillPath(ctx, ellipsePath(9, 9, 3.4, 1.8), '#ff8a8a');
    line(ctx, m, 2.4, palette.ink, true);
  } else {
    const m = polyPath([
      [2, 3.5],
      [16, 3.5],
      [15, 10],
      [3, 10],
    ]);
    fillPath(ctx, m, '#ffffff');
    line(
      ctx,
      [
        { x: 2, y: 6.8 },
        { x: 16, y: 6.8 },
      ],
      1.4,
      palette.ink,
    );
    for (const x of [6, 10, 13])
      line(
        ctx,
        [
          { x, y: 3.5 },
          { x, y: 10 },
        ],
        1.2,
        palette.ink,
      );
    line(ctx, m, 2.4, palette.ink, true);
  }
}

function hat(ctx: Ctx): void {
  // Шляпа искателя: широкие поля, тулья с вмятиной, лента. Якорь — центр полей (46, 38).
  const brim = chaikin(
    polyPath([
      [4, 38],
      [14, 32],
      [46, 29],
      [78, 31],
      [88, 37],
      [80, 44],
      [46, 47],
      [12, 44],
    ]),
    2,
    true,
  );
  part(ctx, brim, T.hat, 4, LINE);
  const crown = chaikin(
    polyPath([
      [24, 36],
      [26, 14],
      [36, 7],
      [46, 12],
      [56, 6],
      [66, 13],
      [68, 36],
    ]),
    2,
    true,
  );
  part(ctx, crown, T.hat, 6.5, LINE);
  const band = polyPath([
    [25, 28],
    [67, 28],
    [68, 36],
    [24, 36],
  ]);
  fillPath(ctx, band, shiftHex(P.hat, 0.52, 10));
  line(ctx, band, 2.6, palette.ink, true);
  brush(
    ctx,
    [
      { x: 39, y: 12 },
      { x: 46, y: 17 },
      { x: 53, y: 11 },
    ],
    2.8,
    rgba(palette.ink, 0.8),
    0.4,
  );
  glint(ctx, 33, 18, 3.6);
}

function sweat(ctx: Ctx): void {
  const p = soft([
    [6, 1],
    [10, 9],
    [9, 13],
    [6, 15],
    [3, 13],
    [2, 9],
  ]);
  fillPath(ctx, p, palette.sweat);
  line(ctx, p, 2, palette.ink, true);
  fillPath(ctx, ellipsePath(5, 10, 1.2, 1.6), '#ffffff');
}

/** Мешок: 4 стадии от почти пустого до набитого, с торчащими монетами и камнями. */
function bag(ctx: Ctx, stage: number): void {
  const s = [0.56, 0.78, 1.0, 1.2][stage];
  const W = 80;
  const cx = W / 2 - 2;
  const cy = 50;
  if (stage >= 2) {
    const coin = (x: number, y: number, a: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      fillPath(ctx, ellipsePath(0, 0, 9, 6.5), palette.gold.base);
      fillPath(ctx, ellipsePath(-1.5, -1.5, 5, 3.4), palette.gold.light);
      line(ctx, ellipsePath(0, 0, 9, 6.5), 2.6, palette.ink, true);
      ctx.restore();
    };
    coin(cx - 8 * s, cy - 32 * s, -0.4);
    coin(cx + 7 * s, cy - 34 * s, 0.3);
    if (stage >= 3) {
      coin(cx - 1, cy - 39 * s, 0.1);
      const gem = polyPath([
        [cx + 14 * s, cy - 42 * s],
        [cx + 22 * s, cy - 34 * s],
        [cx + 14 * s, cy - 26 * s],
        [cx + 6 * s, cy - 34 * s],
      ]);
      fillPath(ctx, gem, palette.ruby.base);
      fillPath(
        ctx,
        polyPath([
          [cx + 14 * s, cy - 42 * s],
          [cx + 6 * s, cy - 34 * s],
          [cx + 14 * s, cy - 34 * s],
        ]),
        palette.ruby.light,
      );
      line(ctx, gem, 2.4, palette.ink, true);
    }
  }
  const body = blob(mulberry32(51 + stage), 50 * s + 8, 48 * s + 10, {
    cx,
    cy: cy + 2,
    points: 10,
    jitter: 0.06,
    flatBottom: 0.12,
  });
  celShade(ctx, body, T.bag, 7 * s + 2.5, { lightK: 3 });
  shadeDots(ctx, body, 7 * s + 2.5, 4.5, 1.8);
  const neck = blob(mulberry32(61 + stage), 26 * s + 7, 12 * s + 5, {
    cx,
    cy: cy - 23 * s - 1,
    points: 8,
    jitter: 0.1,
  });
  part(ctx, neck, T.bag, 3, 4.2, false);
  line(
    ctx,
    [
      { x: cx - 10 * s - 2, y: cy - 17 * s },
      { x: cx + 10 * s + 2, y: cy - 17 * s },
    ],
    3.2,
    P.bagStitch,
  );
  const patch = polyPath([
    [cx - 6, cy + 2],
    [cx + 9 * s, cy],
    [cx + 10 * s, cy + 12 * s],
    [cx - 5, cy + 13 * s],
  ]);
  fillPath(ctx, patch, T.bag.light);
  line(ctx, patch, 2, palette.ink, true);
  ink(ctx, body, LINE);
  if (stage >= 1)
    brush(
      ctx,
      [
        { x: cx - 18 * s, y: cy + 8 },
        { x: cx - 12 * s, y: cy + 15 * s },
      ],
      2.6,
      rgba(palette.ink, 0.7),
    );
}

export function heroSprites(add: AddSprite): void {
  const H = SPR.hero;
  add(H.bootB, { w: 40, h: 24, ox: 16, oy: 21, draw: (c) => boot(c, true) });
  add(H.bootF, { w: 40, h: 24, ox: 16, oy: 21, draw: (c) => boot(c, false) });
  add(H.legB, { w: 23, h: 36, ox: 11, oy: 2, draw: (c) => leg(c, true) });
  add(H.legF, { w: 23, h: 36, ox: 11, oy: 2, draw: (c) => leg(c, false) });
  add(H.torso, { w: 62, h: 56, ox: 30, oy: 52, draw: torso });
  add(H.armB, { w: 20, h: 46, ox: 10, oy: 4, draw: (c) => arm(c, true) });
  add(H.armF, { w: 20, h: 46, ox: 10, oy: 4, draw: (c) => arm(c, false) });
  add(H.head, { w: 76, h: 66, ox: 36, oy: 62, draw: head });
  add(H.eyes, { w: 30, h: 17, ox: 15, oy: 8, draw: (c) => eyes(c, 'side') });
  add(H.eyesFront, { w: 30, h: 17, ox: 15, oy: 8, draw: (c) => eyes(c, 'front') });
  add(H.eyesBack, { w: 30, h: 17, ox: 15, oy: 8, draw: (c) => eyes(c, 'back') });
  add(H.eyesClosed, { w: 30, h: 17, ox: 15, oy: 8, draw: (c) => eyes(c, 'closed') });
  add(H.browsNeutral, { w: 32, h: 12, ox: 16, oy: 6, draw: (c) => brows(c, 'neutral') });
  add(H.browsWorried, { w: 32, h: 12, ox: 16, oy: 6, draw: (c) => brows(c, 'worried') });
  add(H.browsStrain, { w: 32, h: 12, ox: 16, oy: 6, draw: (c) => brows(c, 'strain') });
  add(H.browsHappy, { w: 32, h: 12, ox: 16, oy: 6, draw: (c) => brows(c, 'happy') });
  add(H.mouthSmile, { w: 19, h: 13, ox: 9, oy: 6, draw: (c) => mouth(c, 'smile') });
  add(H.mouthOpen, { w: 19, h: 13, ox: 9, oy: 6, draw: (c) => mouth(c, 'open') });
  add(H.mouthFlat, { w: 19, h: 13, ox: 9, oy: 6, draw: (c) => mouth(c, 'flat') });
  add(H.mouthGrit, { w: 19, h: 13, ox: 9, oy: 6, draw: (c) => mouth(c, 'grit') });
  add(H.hat, { w: 92, h: 50, ox: 46, oy: 38, draw: hat });
  add(H.scarf, { w: 54, h: 22, ox: 27, oy: 11, draw: scarf });
  add(H.scarfTail, { w: 44, h: 18, ox: 41, oy: 7, draw: scarfTail });
  add(H.lantern, { w: 24, h: 32, ox: 12, oy: 2, draw: lantern });
  H.bag.forEach((name, i) => add(name, { w: 80, h: 84, ox: 60, oy: 48, draw: (c) => bag(c, i) }));
  add(H.sweat, { w: 12, h: 17, ox: 6, oy: 8, draw: sweat });
}
