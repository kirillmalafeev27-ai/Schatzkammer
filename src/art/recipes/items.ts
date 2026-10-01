// Добыча (раздел 7.5.5–6): монеты и камни — самые яркие и насыщенные пятна сцены.

import { palette, rgba, shiftHex } from '../../config/palette';
import type { AddSprite } from '../ArtFactory';
import {
  bounds,
  brush,
  burstPath,
  celShade,
  contactShadow,
  ellipsePath,
  fillPath,
  glint,
  halftone,
  halftoneFlat,
  ink,
  line,
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

const GOLD: Tones = { base: palette.gold.base, shadow: palette.gold.shadow, light: palette.gold.light };

/** Монета в ракурсе три четверти: обод, выпуклая корона, блик-полумесяц, гравировка, два глинта. */
function drawCoin(ctx: Ctx, shine: number | null): void {
  const cx = 30;
  const cy = 27;
  const rx = 22;
  const ry = 16;
  const th = 7.5;
  const face = ellipsePath(cx, cy, rx, ry, 48);
  const rim = ellipsePath(cx, cy + th, rx, ry, 48);
  // Обод: нижняя половина «таблетки».
  const body: Path = [
    ...ellipsePath(cx, cy, rx, ry, 48).filter((p) => p.y <= cy),
    ...ellipsePath(cx, cy + th, rx, ry, 48).filter((p) => p.y > cy + th),
  ];
  body.sort((a, b) => Math.atan2(a.y - cy - th / 2, a.x - cx) - Math.atan2(b.y - cy - th / 2, b.x - cx));
  fillPath(ctx, rim, shiftHex(palette.gold.shadow, 0.9, 4));
  fillPath(
    ctx,
    [
      { x: cx - rx, y: cy },
      { x: cx + rx, y: cy },
      { x: cx + rx, y: cy + th },
      { x: cx - rx, y: cy + th },
    ],
    shiftHex(palette.gold.shadow, 0.9, 4),
  );
  // Насечка на ребре.
  ctx.save();
  ctx.beginPath();
  tracePath(ctx, rim);
  ctx.rect(cx - rx, cy, rx * 2, th);
  ctx.clip();
  for (let a = 0.15; a < Math.PI - 0.1; a += 0.22) {
    const x = cx - Math.cos(a) * rx;
    line(
      ctx,
      [
        { x, y: cy + Math.sin(a) * ry * 0.4 + 2 },
        { x, y: cy + Math.sin(a) * ry + th - 1 },
      ],
      1.4,
      rgba(palette.gold.engrave, 0.7),
    );
  }
  ctx.restore();
  // Лицевая сторона.
  celShade(ctx, face, GOLD, 5.5, { lightK: 3 });
  // Выпуклая корона.
  const inner = ellipsePath(cx, cy, rx * 0.66, ry * 0.66, 40);
  ctx.save();
  ctx.beginPath();
  tracePath(ctx, inner);
  ctx.clip();
  fillPath(ctx, inner, palette.gold.light);
  fillPath(ctx, translatePath(inner, 2.2, 2.2), palette.gold.base);
  ctx.restore();
  line(ctx, inner, 1.6, rgba(palette.gold.engrave, 0.8), true);
  // Гравировка: корона.
  const engr: Path = polyPath([
    [cx - 8, cy + 4],
    [cx - 9, cy - 4],
    [cx - 4, cy - 0.5],
    [cx, cy - 6],
    [cx + 4, cy - 0.5],
    [cx + 9, cy - 4],
    [cx + 8, cy + 4],
  ]);
  line(ctx, translatePath(engr, 0.9, 0.9), 2.2, rgba(palette.gold.light, 0.9), true);
  line(ctx, engr, 2.2, palette.gold.engrave, true);
  // Диагональный блик пробегает по монете.
  if (shine != null) {
    ctx.save();
    ctx.beginPath();
    tracePath(ctx, face);
    ctx.clip();
    const x = cx - rx - 10 + shine * (rx * 2 + 20);
    ctx.fillStyle = rgba('#ffffff', 0.85);
    ctx.beginPath();
    ctx.moveTo(x - 4, cy - ry - 4);
    ctx.lineTo(x + 6, cy - ry - 4);
    ctx.lineTo(x - 2, cy + ry + 4);
    ctx.lineTo(x - 12, cy + ry + 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // Контур.
  const outline: Path = [];
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI + (i / 24) * Math.PI;
    outline.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI;
    outline.push({ x: cx + Math.cos(a) * rx, y: cy + th + Math.sin(a) * ry });
  }
  ink(ctx, outline, 5);
  line(
    ctx,
    ellipsePath(cx, cy, rx, ry, 48)
      .filter((p) => p.y >= cy - 0.5)
      .sort((a, b) => a.x - b.x),
    2.4,
    palette.ink,
  );
  glint(ctx, cx - 11, cy - 7, 6.5);
  glint(ctx, cx - 3, cy - 11, 3.4);
  void body;
}

export function coinSprites(add: AddSprite): void {
  add(SPR.coin, { w: 60, h: 56, ox: 30, oy: 46, draw: (c) => drawCoin(c, null) });
  for (let i = 0; i < 5; i++)
    add(`coin.s${i}`, { w: 60, h: 56, ox: 30, oy: 46, draw: (c) => drawCoin(c, (i + 0.5) / 5) });
  // Отдельный блик-оверлей (поверх света).
  add(SPR.coinShine, {
    w: 60,
    h: 56,
    ox: 30,
    oy: 46,
    draw: (c) => {
      ctxClipEllipse(c, 30, 27, 22, 16, () => {
        c.fillStyle = rgba('#ffffff', 0.9);
        c.beginPath();
        c.moveTo(24, 6);
        c.lineTo(34, 6);
        c.lineTo(26, 48);
        c.lineTo(16, 48);
        c.closePath();
        c.fill();
      });
    },
  });
}

function ctxClipEllipse(c: Ctx, cx: number, cy: number, rx: number, ry: number, fn: () => void): void {
  c.save();
  c.beginPath();
  c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  c.clip();
  fn();
  c.restore();
}

// ── Камни ────────────────────────────────────────────────────────────────

type GemKind = 'ruby' | 'emerald' | 'sapphire';

function gemTones(kind: GemKind): Tones {
  const p = palette[kind];
  return { base: p.base, shadow: p.shadow, light: p.light };
}

/** Грань: треугольник/многоугольник одного из трёх тонов + тонкая тушь. */
function facet(ctx: Ctx, pts: [number, number][], color: string): void {
  const p = polyPath(pts);
  fillPath(ctx, p, color);
  line(ctx, p, 1.6, rgba(palette.ink, 0.75), true);
}

function toneFor(t: Tones, nx: number, ny: number): string {
  // Свет сверху слева: нормаль грани к (−1,−1) — светлая, к (1,1) — тёмная.
  const d = -(nx * 0.7071 + ny * 0.7071);
  if (d > 0.35) return t.light;
  if (d < -0.3) return t.shadow;
  return t.base;
}

function drawRuby(ctx: Ctx): void {
  const t = gemTones('ruby');
  const cx = 32;
  const cy = 34;
  const rx = 23;
  const ry = 19;
  const n = 10;
  const outer: [number, number][] = [];
  const tab: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    outer.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    const b = a + Math.PI / n;
    tab.push([cx + Math.cos(b) * rx * 0.48, cy - 2 + Math.sin(b) * ry * 0.48]);
  }
  for (let i = 0; i < n; i++) {
    const a = outer[i];
    const b = outer[(i + 1) % n];
    const m = tab[i];
    const nx = (a[0] + b[0]) / 2 - cx;
    const ny = (a[1] + b[1]) / 2 - cy;
    const l = Math.hypot(nx, ny);
    facet(ctx, [a, b, m], toneFor(t, nx / l, ny / l));
    const prevTab = tab[(i + n - 1) % n];
    facet(
      ctx,
      [a, m, prevTab],
      toneFor(t, (a[0] - cx) / rx, (a[1] - cy) / ry) === t.light ? t.light : t.base,
    );
  }
  facet(ctx, tab, t.base);
  // Блик на площадке.
  fillPath(ctx, polyPath([tab[7], tab[8], tab[9], [cx - 2, cy - 2]]), rgba('#ffffff', 0.55));
  ink(ctx, polyPath(outer), 5);
  glint(ctx, cx - 9, cy - 9, 9);
  glint(ctx, cx + 8, cy + 6, 4);
}

function drawEmerald(ctx: Ctx): void {
  const t = gemTones('emerald');
  const cx = 32;
  const cy = 34;
  const oct = (w: number, h: number, c: number): [number, number][] => [
    [cx - w / 2 + c, cy - h / 2],
    [cx + w / 2 - c, cy - h / 2],
    [cx + w / 2, cy - h / 2 + c],
    [cx + w / 2, cy + h / 2 - c],
    [cx + w / 2 - c, cy + h / 2],
    [cx - w / 2 + c, cy + h / 2],
    [cx - w / 2, cy + h / 2 - c],
    [cx - w / 2, cy - h / 2 + c],
  ];
  const o1 = oct(44, 34, 9);
  const o2 = oct(31, 22, 6);
  const o3 = oct(19, 11, 3);
  // Ступенчатая огранка: кольца граней.
  for (const [A, B] of [
    [o1, o2],
    [o2, o3],
  ] as const) {
    for (let i = 0; i < 8; i++) {
      const a = A[i];
      const b = A[(i + 1) % 8];
      const c = B[(i + 1) % 8];
      const d = B[i];
      const nx = (a[0] + b[0]) / 2 - cx;
      const ny = (a[1] + b[1]) / 2 - cy;
      const l = Math.hypot(nx, ny) || 1;
      facet(ctx, [a, b, c, d], toneFor(t, nx / l, ny / l));
    }
  }
  facet(ctx, o3, t.base);
  fillPath(ctx, polyPath([o3[0], o3[1], [cx, cy], o3[7]]), rgba('#ffffff', 0.45));
  ink(ctx, polyPath(o1), 5);
  glint(ctx, cx - 11, cy - 8, 8);
  glint(ctx, cx + 10, cy + 5, 3.6);
}

function drawSapphire(ctx: Ctx): void {
  const t = gemTones('sapphire');
  const cx = 32;
  const cy = 36;
  // Триллион: треугольник со скруглёнными сторонами.
  const R = 26;
  const v: [number, number][] = [0, 1, 2].map((i) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
    return [cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.86];
  });
  const mid = (i: number): [number, number] => {
    const a = v[i];
    const b = v[(i + 1) % 3];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const dx = mx - cx;
    const dy = my - cy;
    return [mx + dx * 0.22, my + dy * 0.22];
  };
  const outer: [number, number][] = [v[0], mid(0), v[1], mid(1), v[2], mid(2)];
  const inner = outer.map(([x, y]) => [cx + (x - cx) * 0.45, cy - 1 + (y - cy) * 0.45] as [number, number]);
  for (let i = 0; i < 6; i++) {
    const a = outer[i];
    const b = outer[(i + 1) % 6];
    const c = inner[(i + 1) % 6];
    const d = inner[i];
    const nx = (a[0] + b[0]) / 2 - cx;
    const ny = (a[1] + b[1]) / 2 - cy;
    const l = Math.hypot(nx, ny) || 1;
    facet(ctx, [a, b, c, d], toneFor(t, nx / l, ny / l));
  }
  facet(ctx, inner, t.base);
  fillPath(ctx, polyPath([inner[5], inner[0], [cx, cy - 1]]), rgba('#ffffff', 0.5));
  ink(ctx, polyPath(outer), 5);
  glint(ctx, cx - 8, cy - 12, 8.5);
  glint(ctx, cx + 9, cy + 6, 3.6);
}

function drawPedestal(ctx: Ctx): void {
  const stone: Tones = {
    base: shiftHex(palette.slab.light, 0.92, 4),
    shadow: palette.slab.shadow,
    light: shiftHex(palette.slab.light, 1.18, -2),
  };
  const cx = 38;
  const top = 18;
  const bot = 32;
  const rx = 28;
  const ry = 9;
  const body: Path = [
    ...ellipsePath(cx, top, rx, ry, 40)
      .filter((p) => p.y <= top + 0.01)
      .sort((a, b) => a.x - b.x),
    ...ellipsePath(cx, bot, rx, ry, 40)
      .filter((p) => p.y >= bot - 0.01)
      .sort((a, b) => b.x - a.x),
  ];
  fillPath(ctx, body, stone.base);
  // Тень на правой стороне цилиндра.
  ctx.save();
  ctx.beginPath();
  tracePath(ctx, body);
  ctx.clip();
  ctx.fillStyle = stone.shadow;
  ctx.fillRect(cx + rx * 0.35, 0, rx, 60);
  halftone(ctx, rgba(palette.ink, 0.5), {
    region: { x: cx + rx * 0.1, y: top, w: rx, h: bot - top + ry },
    spacing: 5,
    rMin: 0.3,
    rMax: 2,
    dir: { x: 1, y: 0 },
  });
  ctx.fillStyle = rgba('#ffffff', 0.18);
  ctx.fillRect(cx - rx, 0, rx * 0.35, 60);
  // Резной поясок.
  line(
    ctx,
    ellipsePath(cx, (top + bot) / 2 + 1, rx, ry, 40).filter((p) => p.y > (top + bot) / 2 + 1),
    2,
    rgba(palette.ink, 0.55),
  );
  ctx.restore();
  const topE = ellipsePath(cx, top, rx, ry, 40);
  celShade(ctx, topE, stone, 3, { lightK: 2 });
  ink(ctx, body, 4.6);
  ink(ctx, topE, 3);
}

/** Комиксный ореол: кольца растра цвета камня и редкие лучи. */
function drawHalo(ctx: Ctx, color: string, rng: Rng): void {
  const cx = 64;
  const cy = 64;
  ctx.save();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng() * 0.3;
    const len = 46 + rng() * 14;
    const w = 0.09;
    fillPath(
      ctx,
      polyPath([
        [cx + Math.cos(a - w) * 18, cy + Math.sin(a - w) * 18],
        [cx + Math.cos(a) * len, cy + Math.sin(a) * len],
        [cx + Math.cos(a + w) * 18, cy + Math.sin(a + w) * 18],
      ]),
      rgba(color, 0.4),
    );
  }
  for (const [r, dot, alpha] of [
    [56, 1.5, 0.4],
    [44, 2.3, 0.55],
    [32, 3.1, 0.7],
  ] as const) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.arc(cx, cy, r - 12, 0, Math.PI * 2, true);
    ctx.clip();
    halftoneFlat(ctx, rgba(color, alpha), { x: cx - r, y: cy - r, w: r * 2, h: r * 2 }, 7, dot);
    ctx.restore();
  }
  radialSpot(ctx, cx, cy, 30, color, 0.35);
  ctx.restore();
}

export function gemSprites(add: AddSprite, rng: Rng): void {
  add(SPR.pedestal, { w: 76, h: 46, ox: 38, oy: 34, draw: drawPedestal });
  add(SPR.gem.ruby, { w: 64, h: 64, ox: 32, oy: 54, draw: drawRuby });
  add(SPR.gem.emerald, { w: 64, h: 64, ox: 32, oy: 54, draw: drawEmerald });
  add(SPR.gem.sapphire, { w: 64, h: 64, ox: 32, oy: 56, draw: drawSapphire });
  for (const k of ['ruby', 'emerald', 'sapphire'] as const) {
    add(SPR.halo[k], { w: 128, h: 128, ox: 64, oy: 64, draw: (c) => drawHalo(c, palette[k].light, rng) });
  }
}

export function miscSprites(add: AddSprite, rng: Rng): void {
  add(SPR.shadow, { w: 96, h: 34, ox: 48, oy: 17, draw: (c) => contactShadow(c, 48, 17, 40, 11) });
  add(SPR.glint, { w: 30, h: 30, ox: 15, oy: 15, draw: (c) => glint(c, 15, 15, 13) });
  add(SPR.sparkle, {
    w: 36,
    h: 36,
    ox: 18,
    oy: 18,
    draw: (c) => {
      glint(c, 18, 18, 16, '#ffffff', 0.12);
      c.save();
      c.translate(18, 18);
      c.rotate(Math.PI / 4);
      glint(c, 0, 0, 8, '#ffffff', 0.2);
      c.restore();
    },
  });
  add(SPR.dot, {
    w: 12,
    h: 12,
    ox: 6,
    oy: 6,
    draw: (c) => fillPath(c, ellipsePath(6, 6, 4.5, 4.5), '#ffffff'),
  });
  add(SPR.softDot, { w: 32, h: 32, ox: 16, oy: 16, draw: (c) => radialSpot(c, 16, 16, 15, '#ffffff', 0.9) });
  add(SPR.ring, {
    w: 64,
    h: 64,
    ox: 32,
    oy: 32,
    draw: (c) => line(c, ellipsePath(32, 32, 26, 26), 4, '#ffffff', true),
  });
  add(SPR.lightSpot, {
    w: 128,
    h: 128,
    ox: 64,
    oy: 64,
    draw: (c) => radialSpot(c, 64, 64, 63, '#ffffff', 0.85),
  });
  add(SPR.rayBurst, {
    w: 200,
    h: 200,
    ox: 100,
    oy: 100,
    draw: (c) => {
      const p = burstPath(100, 100, 30, 96, 14, rng, 1);
      fillPath(c, p, rgba('#ffffff', 0.55));
      fillPath(c, burstPath(100, 100, 18, 60, 10, rng, 1), rgba('#fff8d0', 0.8));
      void bounds;
      void brush;
    },
  });
}
