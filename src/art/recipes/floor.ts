// Пол (раздел 7.5.1): плиты — неровные скруглённые четырёхугольники с отступом от краёв клетки,
// щели цвета slab.mortar, светотень, растр, трещины, изредка мох. Пол уровня запекается в одну текстуру.

import { palette, rgba, shiftHex } from '../../config/palette';
import { cellIndex, startIndex } from '../../core/grid';
import type { GeneratedLevel } from '../../core/levelGen';
import { hashSeed, mulberry32 } from '../../core/rng';
import { CELL, type WorldGeom } from '../../render/geometry';
import type { Bake } from '../ArtFactory';
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
  ink,
  line,
  roughRect,
  tracePath,
  translatePath,
  wobble,
  type Ctx,
  type Path,
  type Rng,
  type Tones,
} from '../comicKit';
import { edgeDots, moss, stone, tonesVar } from './common';

const SLAB: Tones = { base: palette.slab.base, shadow: palette.slab.shadow, light: palette.slab.light };
const THRESHOLD: Tones = {
  base: palette.doorStone.base,
  shadow: palette.doorStone.shadow,
  light: palette.doorStone.light,
};
/** Редкие «чужие» камни в кладке — холодные и приглушённые, без цветов добычи. */
const ALT: Tones[] = [
  { base: '#5f6180', shadow: '#3f4062', light: '#8586a6' },
  { base: '#566582', shadow: '#384562', light: '#7b8cab' },
  { base: '#655a84', shadow: '#433a64', light: '#8a80ad' },
];

/** Резные глифы на плитах — без цветов добычи. */
function glyph(ctx: Ctx, rng: Rng, cx: number, cy: number, s: number): void {
  const kind = Math.floor(rng() * 4);
  const draw = (dx: number, dy: number, col: string, w: number) => {
    ctx.save();
    ctx.translate(dx, dy);
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (kind === 0) {
      ctx.arc(cx, cy, s * 0.32, 0, Math.PI * 2);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.moveTo(cx + Math.cos(a) * s * 0.48, cy + Math.sin(a) * s * 0.48);
        ctx.lineTo(cx + Math.cos(a) * s * 0.7, cy + Math.sin(a) * s * 0.7);
      }
    } else if (kind === 1) {
      for (let t = 0; t < 14; t += 0.25) {
        const r = t * s * 0.05;
        const x = cx + Math.cos(t) * r;
        const y = cy + Math.sin(t) * r;
        if (t === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    } else if (kind === 2) {
      ctx.moveTo(cx - s * 0.6, cy);
      ctx.quadraticCurveTo(cx, cy - s * 0.5, cx + s * 0.6, cy);
      ctx.quadraticCurveTo(cx, cy + s * 0.5, cx - s * 0.6, cy);
      ctx.moveTo(cx + s * 0.16, cy);
      ctx.arc(cx, cy, s * 0.16, 0, Math.PI * 2);
    } else {
      ctx.moveTo(cx - s * 0.6, cy + s * 0.3);
      for (let i = 0; i < 4; i++) {
        const x0 = cx - s * 0.6 + i * s * 0.3;
        ctx.lineTo(x0, cy - s * 0.3);
        ctx.lineTo(x0 + s * 0.15, cy - s * 0.3);
        ctx.lineTo(x0 + s * 0.15, cy + s * 0.3);
        ctx.lineTo(x0 + s * 0.3, cy + s * 0.3);
      }
    }
    ctx.stroke();
    ctx.restore();
  };
  // Резьба: светлая кромка снизу-справа, тёмная выемка сверху-слева.
  draw(1.5, 1.5, rgba('#ffffff', 0.2), 3.4);
  draw(0, 0, rgba(palette.ink, 0.55), 3.4);
}

/** Лужица — тёмная, с тонкой полоской отражения, без блика-звезды (блестит только добыча). */
function puddle(ctx: Ctx, rng: Rng, cx: number, cy: number, s: number): void {
  const p = blob(rng, s * 1.5, s * 0.72, { cx, cy, points: 9, jitter: 0.18 });
  fillPath(ctx, p, shiftHex(palette.slab.shadow, 0.78, 6));
  ctx.save();
  ctx.beginPath();
  tracePath(ctx, p);
  ctx.clip();
  fillPath(ctx, translatePath(p, s * 0.07, s * 0.09), shiftHex(palette.slab.shadow, 0.62, 10));
  line(
    ctx,
    [
      { x: cx - s * 0.45, y: cy - s * 0.06 },
      { x: cx - s * 0.1, y: cy - s * 0.18 },
    ],
    2.2,
    rgba(palette.slab.light, 0.7),
  );
  ctx.restore();
  ink(ctx, p, 2.2);
}

/** Пятна-«мрамор»: несколько полупрозрачных пятен другого тона внутри плиты. */
function mottle(ctx: Ctx, rng: Rng, path: Path, tones: Tones): void {
  const b = bounds(path);
  ctx.save();
  ctx.beginPath();
  tracePath(ctx, path);
  ctx.clip();
  const n = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const w = b.w * (0.2 + rng() * 0.35);
    const blobP = blob(rng, w, w * (0.5 + rng() * 0.5), {
      cx: b.x + rng() * b.w,
      cy: b.y + rng() * b.h,
      points: 8,
      jitter: 0.25,
    });
    fillPath(ctx, blobP, rng() < 0.5 ? rgba(tones.light, 0.22) : rgba(tones.shadow, 0.3));
  }
  // Поры и крапины — два пути, по одному на цвет.
  const specks = 26 + Math.floor(rng() * 16);
  const pores = new Path2D();
  const flecks = new Path2D();
  for (let i = 0; i < specks; i++) {
    const p = rng() < 0.6 ? pores : flecks;
    const x = b.x + rng() * b.w;
    const y = b.y + rng() * b.h;
    const r = 0.7 + rng() * 1.8;
    p.moveTo(x + r, y);
    p.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fillStyle = rgba(palette.ink, 0.24);
  ctx.fill(pores);
  ctx.fillStyle = rgba('#ffffff', 0.15);
  ctx.fill(flecks);
  // Лёгкие волокна камня.
  for (let i = 0; i < 2; i++) {
    const yy = b.y + b.h * (0.2 + rng() * 0.6);
    brush(
      ctx,
      [
        { x: b.x + b.w * 0.08, y: yy },
        { x: b.x + b.w * 0.45, y: yy + (rng() - 0.5) * 8 },
        { x: b.x + b.w * 0.85, y: yy + (rng() - 0.5) * 8 },
      ],
      2.4,
      rgba(palette.ink, 0.12),
    );
  }
  ctx.restore();
}

/** Фаска: светлая линия вдоль верхнего и левого края плиты. */
function bevel(ctx: Ctx, path: Path, tones: Tones): void {
  const b = bounds(path);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const inner = path.map((p) => ({ x: cx + (p.x - cx) * 0.9, y: cy + (p.y - cy) * 0.88 }));
  ctx.save();
  ctx.beginPath();
  ctx.rect(b.x - 4, b.y - 4, b.w * 0.75, b.h * 0.7);
  ctx.clip();
  line(ctx, inner, 2.4, rgba(tones.light, 0.85), true);
  ctx.restore();
}

/** Одна плита. */
function slab(
  ctx: Ctx,
  rng: Rng,
  x0: number,
  y0: number,
  opts: { threshold: boolean; nearWall: boolean },
): void {
  const inset = 3.5 + rng() * 2.5;
  const lip = 8;
  const family = !opts.threshold && rng() < 0.16 ? ALT[Math.floor(rng() * ALT.length)] : SLAB;
  const tones = opts.threshold ? tonesVar(rng, THRESHOLD, 0.03, 2) : tonesVar(rng, family, 0.07, 5);
  const w = CELL - inset * 2;
  const h = CELL - inset * 2 - lip;
  const kindR = opts.threshold ? 1 : rng();

  // Брусчатка из четырёх камней вместо цельной плиты.
  if (kindR < 0.06) {
    for (let i = 0; i < 4; i++) {
      const cx = x0 + CELL * (i % 2 ? 0.72 : 0.29) + (rng() - 0.5) * 6;
      const cy = y0 + CELL * (i < 2 ? 0.29 : 0.68) + (rng() - 0.5) * 6;
      stone(ctx, rng, 48 + rng() * 10, 40 + rng() * 8, tonesVar(rng, family, 0.07, 5), {
        cx,
        cy,
        inkW: 4,
        specks: 6,
        flatBottom: 0.1,
      });
    }
    return;
  }

  const path: Path = wobble(roughRect(rng, x0 + inset, y0 + inset, w, h, 9 + rng() * 9, 3), 1.1, rng, 8);

  // Торец плиты: видна толщина камня (вид «три четверти»).
  const lipPath = translatePath(path, 0, lip);
  fillPath(ctx, lipPath, shiftHex(tones.shadow, 0.82, 6));
  ctx.save();
  ctx.beginPath();
  tracePath(ctx, lipPath);
  ctx.clip();
  halftone(ctx, rgba(palette.ink, 0.5), {
    region: bounds(lipPath),
    spacing: 5,
    rMin: 0.5,
    rMax: 2,
    dir: { x: 0.3, y: 1 },
  });
  ctx.restore();
  ink(ctx, lipPath, 4.4);

  // Верх: светотень, «мрамор», растр в тени, фаска.
  const k = 13;
  celShade(ctx, path, tones, k, { lightK: 6 });
  mottle(ctx, rng, path, tones);
  ctx.save();
  clipShadowCrescent(ctx, path, k);
  halftone(ctx, rgba(palette.ink, 0.45), { region: bounds(path), spacing: 6.5, rMin: 0.4, rMax: 2.8 });
  ctx.restore();
  bevel(ctx, path, tones);

  const b = bounds(path);
  ctx.save();
  ctx.beginPath();
  tracePath(ctx, path);
  ctx.clip();
  if (opts.threshold) {
    // Порог: стёртая дорожка и резной орнамент.
    fillPath(ctx, ellipsePath(b.x + b.w / 2, b.y + b.h * 0.55, b.w * 0.26, b.h * 0.36), rgba('#ffffff', 0.1));
    for (const yy of [b.y + 12, b.y + b.h - 14]) {
      line(
        ctx,
        [
          { x: b.x + 14, y: yy + 1.4 },
          { x: b.x + b.w - 14, y: yy + 1.4 },
        ],
        2.6,
        rgba('#ffffff', 0.25),
      );
      line(
        ctx,
        [
          { x: b.x + 14, y: yy },
          { x: b.x + b.w - 14, y: yy },
        ],
        2.6,
        rgba(palette.ink, 0.5),
      );
    }
  } else if (kindR < 0.17) {
    // Расколотая плита: щель поперёк.
    const pts: Path = [];
    const horiz = rng() < 0.5;
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const j = (rng() - 0.5) * 12;
      pts.push(
        horiz
          ? { x: b.x - 4 + (b.w + 8) * t, y: b.y + b.h * (0.35 + rng() * 0.3) + j * 0.4 }
          : { x: b.x + b.w * (0.35 + rng() * 0.3) + j * 0.4, y: b.y - 4 + (b.h + 8) * t },
      );
    }
    line(ctx, pts, 7, palette.slab.mortar);
    line(ctx, translatePath(pts, -1.5, -1.5), 1.6, rgba(tones.light, 0.6));
    line(ctx, translatePath(pts, 2.5, 2.5), 2.4, palette.ink);
  } else if (kindR < 0.43) {
    const nC = rng() < 0.3 ? 2 : 1;
    for (let i = 0; i < nC; i++) {
      const sx = b.x + b.w * (0.2 + rng() * 0.6);
      const sy = b.y + b.h * (0.2 + rng() * 0.6);
      const ang = rng() * Math.PI * 2;
      const seed = Math.floor(rng() * 1e6);
      ctx.save();
      ctx.translate(1.3, 1.3);
      crack(ctx, mulberry32(seed), { x: sx, y: sy }, 34 + rng() * 26, ang, 1.7, rgba('#ffffff', 0.22));
      ctx.restore();
      crack(ctx, mulberry32(seed), { x: sx, y: sy }, 34 + rng() * 26, ang, 1.7, palette.ink);
    }
  } else if (kindR < 0.5) {
    glyph(ctx, rng, b.x + b.w / 2, b.y + b.h / 2, 26);
  } else if (kindR < 0.53) {
    puddle(ctx, rng, b.x + b.w * (0.35 + rng() * 0.3), b.y + b.h * (0.4 + rng() * 0.25), 30);
  }
  ctx.restore();

  // Скол по краю.
  if (!opts.threshold && rng() < 0.32) {
    const i = Math.floor(rng() * path.length);
    const p = path[i];
    const chip = blob(rng, 16 + rng() * 12, 12 + rng() * 9, { cx: p.x, cy: p.y, points: 6, jitter: 0.3 });
    fillPath(ctx, chip, palette.slab.mortar);
  }
  ink(ctx, path, 4.6);
  if (!opts.threshold && rng() < (opts.nearWall ? 0.34 : 0.1)) {
    const i = Math.floor(rng() * path.length);
    moss(ctx, rng, path[i].x, path[i].y, 9);
  }
}

export function floorBake(geom: WorldGeom, level: GeneratedLevel): Bake {
  const { g } = level;
  const W = geom.floorW;
  const H = geom.floorH;
  return {
    x: 0,
    y: 0,
    w: W,
    h: H,
    draw(ctx) {
      const rng = mulberry32(hashSeed(level.usedSeed, 101));
      // Раствор с мелкими камешками.
      ctx.fillStyle = palette.slab.mortar;
      ctx.fillRect(0, 0, W, H);
      const pebblesA = new Path2D();
      const pebblesB = new Path2D();
      for (let i = 0; i < (W * H) / 700; i++) {
        const p = rng() < 0.5 ? pebblesA : pebblesB;
        const x = rng() * W;
        const y = rng() * H;
        const r = 1.5 + rng() * 3.2;
        p.moveTo(x + r, y);
        p.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fillStyle = rgba(palette.rock.shadow, 0.9);
      ctx.fill(pebblesA);
      ctx.fillStyle = rgba(palette.rockFar, 0.9);
      ctx.fill(pebblesB);
      const start = startIndex(g);
      for (let y = 0; y < g.rows; y++) {
        for (let x = 0; x < g.cols; x++) {
          const i = cellIndex(g, x, y);
          const crng = mulberry32(hashSeed(level.usedSeed, 7000 + i));
          const nearWall = x === 0 || y === 0 || x === g.cols - 1 || y === g.rows - 1;
          slab(ctx, crng, x * CELL, y * CELL, { threshold: i === start, nearWall });
        }
      }
      // Тень у стен растром: гуще к стене.
      const ao = rgba(palette.ink, 0.62);
      edgeDots(ctx, { x: 0, y: 0, w: W, h: 50 }, { x: 0, y: -1 }, 7, ao, 3.6);
      edgeDots(ctx, { x: 0, y: 0, w: 36, h: H }, { x: -1, y: 0 }, 7, ao, 3.2);
      edgeDots(ctx, { x: W - 36, y: 0, w: 36, h: H }, { x: 1, y: 0 }, 7, ao, 3.2);
      edgeDots(ctx, { x: 0, y: H - 28, w: W, h: 28 }, { x: 0, y: 1 }, 7, ao, 2.8);
    },
  };
}
