// Стены (раздел 7.5.2–3): северная скала лицом к нам (три слоя глыб, сталактиты, резные плиты
// с глифами у двери, друзы кристаллов), боковые массивы скал, низкий южный уступ, фон пещеры.

import { palette, rgba, shiftHex } from '../../config/palette';
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
  fillPath,
  glint,
  halftone,
  halftoneFlat,
  hatch,
  ink,
  line,
  polyPath,
  roughRect,
  tracePath,
  wobble,
  type Ctx,
  type Path,
  type Rng,
  type Tones,
} from '../comicKit';
import { block, moss, rock, stone, tonesFrom, tonesVar } from './common';

const ROCK: Tones = { base: palette.rock.base, shadow: palette.rock.shadow, light: palette.rock.light };
const ROCK_MID: Tones = tonesFrom(shiftHex(palette.rock.base, 0.78, 4), 0.7, 1.3);
const ROCK_FAR: Tones = tonesFrom(palette.rockFar, 0.72, 1.32);

function stalactite(ctx: Ctx, rng: Rng, x: number, y: number, len: number, w: number, tones: Tones): void {
  const pts: Path = [
    { x: x - w / 2, y },
    { x: x + w / 2, y },
    { x: x + w * 0.18 + (rng() - 0.5) * 4, y: y + len * 0.65 },
    { x: x + (rng() - 0.5) * 4, y: y + len },
    { x: x - w * 0.2, y: y + len * 0.6 },
  ];
  const p = wobble(pts, 0.8, rng, 6);
  celShade(ctx, p, tones, w * 0.22);
  ink(ctx, p, 3.4);
}

/** Друза бирюзовых кристаллов. */
export function crystalCluster(ctx: Ctx, rng: Rng, cx: number, cy: number, s: number): void {
  const tones: Tones = {
    base: palette.crystal.base,
    shadow: shiftHex(palette.crystal.base, 0.62, 12),
    light: palette.crystal.glow,
  };
  // Гнездо в скале.
  const nest = blob(rng, 44 * s, 22 * s, { cx, cy: cy + 8 * s, points: 8 });
  fillPath(ctx, nest, shiftHex(palette.rock.shadow, 0.8));
  ink(ctx, nest, 3);
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.42 + (rng() - 0.5) * 0.2;
    const len = (24 + rng() * 22) * s * (i === 2 ? 1.25 : 1);
    const w = (8 + rng() * 5) * s;
    const bx = cx + (i - (n - 1) / 2) * 7 * s;
    const by = cy + 6 * s;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const px = -dy;
    const py = dx;
    const tip = { x: bx + dx * len, y: by + dy * len };
    const p = polyPath([
      [bx + px * w * 0.5, by + py * w * 0.5],
      [bx + px * w * 0.5 + dx * len * 0.78, by + py * w * 0.5 + dy * len * 0.78],
      [tip.x, tip.y],
      [bx - px * w * 0.5 + dx * len * 0.78, by - py * w * 0.5 + dy * len * 0.78],
      [bx - px * w * 0.5, by - py * w * 0.5],
    ]);
    fillPath(ctx, p, tones.base);
    // Грань: половина кристалла светлее.
    fillPath(
      ctx,
      polyPath([
        [bx, by],
        [bx + dx * len * 0.78, by + dy * len * 0.78],
        [tip.x, tip.y],
        [bx - px * w * 0.5 + dx * len * 0.78, by - py * w * 0.5 + dy * len * 0.78],
        [bx - px * w * 0.5, by - py * w * 0.5],
      ]),
      tones.light,
    );
    fillPath(
      ctx,
      polyPath([
        [bx + px * w * 0.5, by + py * w * 0.5],
        [bx + px * w * 0.5 + dx * len * 0.78, by + py * w * 0.5 + dy * len * 0.78],
        [bx + px * w * 0.15 + dx * len * 0.7, by + py * w * 0.15 + dy * len * 0.7],
        [bx + px * w * 0.15, by + py * w * 0.15],
      ]),
      tones.shadow,
    );
    ink(ctx, p, 2.8);
  }
  glint(ctx, cx - 6 * s, cy - 20 * s, 7 * s);
}

/** Резная плита с глифами у двери. */
function carvedPanel(ctx: Ctx, rng: Rng, x: number, y: number, w: number, h: number): void {
  const tones: Tones = {
    base: shiftHex(palette.doorStone.base, 0.8, 6),
    shadow: shiftHex(palette.doorStone.shadow, 0.78, 8),
    light: shiftHex(palette.doorStone.light, 0.85, 4),
  };
  const p = roughRect(rng, x, y, w, h, 6, 1.5);
  celShade(ctx, p, tones, 7, { lightK: 3 });
  ctx.save();
  clipShadowCrescent(ctx, p, 7);
  halftone(ctx, rgba(palette.ink, 0.45), { region: bounds(p), spacing: 5, rMin: 0.3, rMax: 1.8 });
  ctx.restore();
  // Ряды глифов.
  const rows = Math.floor(h / 26);
  for (let r = 0; r < rows; r++) {
    const cy = y + 16 + r * 26;
    const kind = Math.floor(rng() * 4);
    const cx = x + w / 2;
    ctx.save();
    for (const [dx, dy, col] of [
      [1.2, 1.2, rgba('#ffffff', 0.22)],
      [0, 0, rgba(palette.ink, 0.6)],
    ] as const) {
      ctx.translate(dx, dy);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (kind === 0) {
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.moveTo(cx - 12, cy + 9);
        ctx.lineTo(cx + 12, cy + 9);
      } else if (kind === 1) {
        ctx.moveTo(cx - 10, cy + 7);
        ctx.lineTo(cx, cy - 8);
        ctx.lineTo(cx + 10, cy + 7);
        ctx.moveTo(cx - 4, cy + 1);
        ctx.lineTo(cx + 4, cy + 1);
      } else if (kind === 2) {
        ctx.moveTo(cx - 10, cy - 6);
        ctx.lineTo(cx + 10, cy - 6);
        ctx.moveTo(cx, cy - 6);
        ctx.lineTo(cx, cy + 8);
        ctx.moveTo(cx - 6, cy + 8);
        ctx.lineTo(cx + 6, cy + 8);
      } else {
        ctx.moveTo(cx - 9, cy);
        ctx.quadraticCurveTo(cx, cy - 12, cx + 9, cy);
        ctx.quadraticCurveTo(cx, cy + 12, cx - 9, cy);
      }
      ctx.stroke();
      ctx.translate(-dx, -dy);
    }
    ctx.restore();
  }
  ink(ctx, p, 4.6);
}

function cobweb(ctx: Ctx, x: number, y: number, s: number, flip: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip, 1);
  ctx.strokeStyle = rgba('#e8e4f4', 0.55);
  ctx.lineWidth = 1.4;
  const rays = 5;
  const ends: { x: number; y: number }[] = [];
  for (let i = 0; i < rays; i++) {
    const a = (i / (rays - 1)) * (Math.PI / 2);
    const e = { x: Math.cos(a) * s, y: Math.sin(a) * s };
    ends.push(e);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
  }
  for (let r = 0.3; r <= 0.95; r += 0.22) {
    ctx.beginPath();
    for (let i = 0; i < rays; i++) {
      const p = { x: ends[i].x * r, y: ends[i].y * r };
      if (i === 0) ctx.moveTo(p.x, p.y);
      else {
        const prev = { x: ends[i - 1].x * r, y: ends[i - 1].y * r };
        ctx.quadraticCurveTo((p.x + prev.x) * 0.42, (p.y + prev.y) * 0.42, p.x, p.y);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

function root(ctx: Ctx, rng: Rng, x: number, y: number, len: number): void {
  const pts: Path = [{ x, y }];
  let px = x;
  let py = y;
  for (let i = 0; i < 6; i++) {
    px += (rng() - 0.5) * 10;
    py += len / 6;
    pts.push({ x: px, y: py });
  }
  const col = shiftHex('#5a4a5e', 1, 0);
  brush(ctx, pts, 7, palette.ink, 0.35);
  brush(ctx, pts, 4, col, 0.3);
  // Отростки.
  for (let i = 2; i < 5; i++) {
    const b = pts[i];
    const e = { x: b.x + (rng() < 0.5 ? -1 : 1) * (8 + rng() * 8), y: b.y + 6 + rng() * 8 };
    brush(ctx, [b, { x: (b.x + e.x) / 2, y: (b.y + e.y) / 2 + 2 }, e], 3, palette.ink, 0.2);
  }
}

/** Насколько стены выходят за границы зала — чтобы в полях экрана была скала, а не пустота. */
export const WALL_MARGIN = { x: 3 * CELL, top: 2 * CELL };

export function wallsBake(geom: WorldGeom, level: GeneratedLevel): Bake {
  const b = geom.bounds;
  const ext = {
    x: b.x - WALL_MARGIN.x,
    y: b.y - WALL_MARGIN.top,
    w: b.w + WALL_MARGIN.x * 2,
    h: b.h + WALL_MARGIN.top,
  };
  return {
    ...ext,
    draw(ctx) {
      const rng = mulberry32(hashSeed(level.usedSeed, 202));
      const wallTop = -geom.northH;
      const left = ext.x;
      const right = ext.x + ext.w;
      const o = geom.door.opening;
      const masonL = o.x - geom.door.frameW - 46;
      const masonR = o.x + o.w + geom.door.frameW + 46;

      // ── Потолок и северная стена ───────────────────────────────────────
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, ext.y, ext.w, -ext.y + 10);
      ctx.clip();
      ctx.fillStyle = shiftHex(palette.caveDeep, 0.9);
      ctx.fillRect(left, ext.y, ext.w, -ext.y + 10);
      // Своды над стеной: крупные тёмные глыбы.
      for (let x = left - 40; x < right + 40; x += 70 + rng() * 50) {
        rock(ctx, rng, 120 + rng() * 80, 90 + rng() * 60, tonesVar(rng, ROCK_FAR, 0.05, 3), {
          cx: x,
          cy: wallTop - 90 - rng() * 120,
          inkW: 4,
          specks: 0,
          cracks: 0,
        });
      }
      // Дальний слой стены.
      for (let x = left - 30; x < right + 30; x += 48 + rng() * 30) {
        rock(ctx, rng, 74 + rng() * 50, 62 + rng() * 40, tonesVar(rng, ROCK_FAR, 0.05, 3), {
          cx: x,
          cy: wallTop + 18 + rng() * 40,
          inkW: 4.4,
        });
      }
      // Средний слой.
      for (let x = left - 20; x < right + 30; x += 54 + rng() * 32) {
        if (x > masonL - 20 && x < masonR + 20) continue;
        rock(ctx, rng, 84 + rng() * 50, 66 + rng() * 34, tonesVar(rng, ROCK_MID, 0.05, 3), {
          cx: x,
          cy: wallTop + 92 + rng() * 34,
          inkW: 5,
        });
      }
      // Ближний слой — у пола, вне кладки у двери.
      for (let x = left - 10; x < right + 30; x += 58 + rng() * 34) {
        if (x > masonL - 30 && x < masonR + 30) continue;
        const w = 88 + rng() * 46;
        const h = 62 + rng() * 28;
        rock(ctx, rng, w, h, tonesVar(rng, ROCK, 0.06, 3), {
          cx: x,
          cy: -h * 0.38 + rng() * 6,
          inkW: 6.5,
          flatBottom: 0.25,
          hatchDeep: rng() < 0.3,
        });
      }
      // Кладка храма вокруг двери: тёсаные блоки рядами вперевязку.
      const mason: Tones = {
        base: shiftHex(palette.rock.base, 1.05, 10),
        shadow: palette.rock.shadow,
        light: shiftHex(palette.rock.light, 1.02, 6),
      };
      const rowH = 34;
      let row = 0;
      for (let y = -rowH; y > wallTop - 4; y -= rowH, row++) {
        let x = masonL - (row % 2 ? 22 : 0);
        while (x < masonR) {
          const w = 40 + rng() * 22;
          block(
            ctx,
            rng,
            x + 2,
            y + 2,
            Math.min(w, masonR - x) - 4,
            rowH - 4,
            tonesVar(rng, mason, 0.06, 4),
            4,
          );
          x += w;
        }
      }
      // Сталактиты: разной длины, гроздьями.
      for (let x = left; x < right;) {
        const big = rng() < 0.25;
        stalactite(
          ctx,
          rng,
          x,
          wallTop - 6,
          big ? 60 + rng() * 50 : 20 + rng() * 30,
          big ? 26 + rng() * 12 : 12 + rng() * 10,
          tonesVar(rng, ROCK_FAR, 0.05, 2),
        );
        x += big ? 40 + rng() * 30 : 14 + rng() * 46;
      }
      for (let i = 0; i < 4; i++)
        root(ctx, rng, left + 120 + rng() * (ext.w - 240), wallTop - 10, 40 + rng() * 50);
      ctx.restore();

      // Ниша для песочных часов.
      const hg = geom.hourglass;
      const niche = roughRect(rng, hg.x - hg.w * 0.78, hg.y - hg.h * 0.64, hg.w * 1.56, hg.h * 1.24, 16, 2);
      fillPath(ctx, niche, shiftHex(palette.caveDeep, 0.9));
      ctx.save();
      ctx.beginPath();
      tracePath(ctx, niche);
      ctx.clip();
      halftoneFlat(ctx, rgba(palette.rock.shadow, 0.8), bounds(niche), 6, 1.6);
      ctx.restore();
      ink(ctx, niche, 5);

      // Резные плиты у двери.
      const pw = 34;
      const ph = o.h * 0.86;
      carvedPanel(ctx, rng, o.x - geom.door.frameW - pw - 4, -ph - 6, pw, ph);
      carvedPanel(ctx, rng, o.x + o.w + geom.door.frameW + 4, -ph - 6, pw, ph);

      // Копоть над факелами.
      for (const t of geom.torches) {
        ctx.save();
        const r = 42;
        ctx.beginPath();
        ctx.ellipse(t.x, t.y - 46, r * 0.6, r, 0, 0, Math.PI * 2);
        ctx.clip();
        halftone(ctx, rgba(palette.ink, 0.55), {
          region: { x: t.x - r, y: t.y - 46 - r, w: r * 2, h: r * 2 },
          spacing: 6,
          rMin: 2.4,
          rMax: 0,
          dir: { x: 0, y: 1 },
        });
        ctx.restore();
      }

      for (const c of geom.crystals)
        crystalCluster(ctx, mulberry32(hashSeed(level.usedSeed, Math.round(c.x))), c.x, c.y, c.s);

      cobweb(ctx, -geom.sideW + 2, wallTop + 2, 50, 1);
      cobweb(ctx, geom.floorW + geom.sideW - 2, wallTop + 2, 46, -1);

      // ── Боковые массивы — до краёв запечённой области ───────────────────
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? left : geom.floorW;
        const x1 = side < 0 ? 0 : right;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, -24, x1 - x0, geom.floorH + geom.southH + 24);
        ctx.clip();
        ctx.fillStyle = shiftHex(palette.caveDeep, 0.9);
        ctx.fillRect(x0, -24, x1 - x0, geom.floorH + geom.southH + 24);
        // Дальше от зала — темнее.
        for (let pass = 0; pass < 2; pass++) {
          for (let y = -10; y < geom.floorH + geom.southH; y += 40 + rng() * 26) {
            const near = pass === 1;
            const w = near ? geom.sideW * 2.2 + rng() * 30 : 110 + rng() * 70;
            const h = 54 + rng() * 30;
            const cx = near
              ? side < 0
                ? -geom.sideW * 0.5
                : geom.floorW + geom.sideW * 0.5
              : x0 + rng() * (x1 - x0);
            if (!near && Math.abs(cx - (side < 0 ? 0 : geom.floorW)) < geom.sideW * 1.6) continue;
            rock(ctx, rng, w, h, tonesVar(rng, near ? (rng() < 0.5 ? ROCK : ROCK_MID) : ROCK_FAR, 0.06, 3), {
              cx,
              cy: y + h / 2,
              inkW: near ? 5.5 : 4.4,
            });
          }
        }
        ctx.restore();
        const ex = side < 0 ? 0 : geom.floorW;
        line(
          ctx,
          [
            { x: ex, y: -4 },
            { x: ex, y: geom.floorH },
          ],
          5,
          palette.ink,
        );
      }

      // Кромка северной стены у пола и мох на стыке.
      line(
        ctx,
        [
          { x: left, y: 1 },
          { x: o.x - 2, y: 1 },
        ],
        4,
        palette.ink,
      );
      line(
        ctx,
        [
          { x: o.x + o.w + 2, y: 1 },
          { x: right, y: 1 },
        ],
        4,
        palette.ink,
      );
      for (let i = 0; i < 6; i++) moss(ctx, rng, rng() * geom.floorW, -4 + rng() * 6, 7 + rng() * 4);

      // Проём двери — прозрачный: за ним небо и джунгли.
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
      ctx.fillRect(o.x, o.y, o.w, o.h + 2);
      ctx.restore();
    },
  };
}

export function ledgeBake(geom: WorldGeom, level: GeneratedLevel): Bake {
  const b = geom.bounds;
  const x0 = b.x - WALL_MARGIN.x;
  const w = b.w + WALL_MARGIN.x * 2;
  const y0 = geom.floorH - 8;
  const h = geom.southH + 8 + 2 * CELL;
  return {
    x: x0,
    y: y0,
    w,
    h,
    draw(ctx) {
      const rng = mulberry32(hashSeed(level.usedSeed, 303));
      ctx.fillStyle = shiftHex(palette.caveDeep, 0.9);
      ctx.fillRect(x0, geom.floorH + 6, w, h);
      // Ниже уступа — темнота и дальние глыбы.
      for (let x = x0 - 20; x < x0 + w + 40; x += 80 + rng() * 60) {
        rock(ctx, rng, 130 + rng() * 60, 80 + rng() * 40, tonesVar(rng, ROCK_FAR, 0.05, 3), {
          cx: x,
          cy: geom.floorH + geom.southH + 50 + rng() * 60,
          inkW: 4,
          cracks: 0,
        });
      }
      for (let x = x0 - 20; x < x0 + w + 30; x += 46 + rng() * 26) {
        const ww = 74 + rng() * 40;
        const hh = 42 + rng() * 16;
        rock(ctx, rng, ww, hh, tonesVar(rng, ROCK, 0.06, 3), {
          cx: x,
          cy: geom.floorH + hh * 0.5 + 4,
          inkW: 6,
          flatBottom: 0.2,
        });
      }
      for (let i = 0; i < 4; i++) moss(ctx, rng, b.x + rng() * b.w, geom.floorH + 8 + rng() * 8, 8);
      void stone;
    },
  };
}

export function caveBake(geom: WorldGeom, level: GeneratedLevel): Bake {
  const b = geom.bounds;
  const m = 700;
  const box = { x: b.x - m, y: b.y - m, w: b.w + m * 2, h: b.h + m * 2 };
  return {
    ...box,
    draw(ctx) {
      const rng = mulberry32(hashSeed(level.usedSeed, 404));
      ctx.fillStyle = shiftHex(palette.caveDeep, 0.85, 0);
      ctx.fillRect(box.x, box.y, box.w, box.h);
      // Дальние скалы-силуэты.
      for (let i = 0; i < 70; i++) {
        const x = box.x + rng() * box.w;
        const y = box.y + rng() * box.h;
        const w = 160 + rng() * 260;
        const p = blob(rng, w, w * (0.5 + rng() * 0.4), { cx: x, cy: y, points: 9, jitter: 0.2 });
        fillPath(ctx, p, rng() < 0.5 ? shiftHex(palette.rockFar, 0.55) : shiftHex(palette.caveDeep, 1.25));
        ink(ctx, p, 5);
      }
      // Сталактиты сверху.
      for (let x = box.x; x < box.x + box.w; x += 60 + rng() * 90) {
        stalactite(
          ctx,
          rng,
          x,
          box.y + m * 0.6 + rng() * 80,
          60 + rng() * 90,
          26 + rng() * 22,
          tonesFrom(shiftHex(palette.rockFar, 0.7)),
        );
      }
      // Редкие тусклые кристаллы.
      for (let i = 0; i < 9; i++) {
        const x = box.x + rng() * box.w;
        const y = box.y + rng() * box.h;
        if (x > b.x - 30 && x < b.x + b.w + 30 && y > b.y - 30 && y < b.y + b.h + 30) continue;
        ctx.save();
        ctx.globalAlpha = 0.45;
        crystalCluster(ctx, rng, x, y, 0.9);
        ctx.restore();
      }
      // Крупный растр-текстура.
      ctx.save();
      ctx.globalAlpha = 0.5;
      halftoneFlat(ctx, shiftHex(palette.caveDeep, 0.6), box, 16, 3.5);
      ctx.restore();
      // Штриховка самых глубоких мест.
      ctx.save();
      ctx.globalAlpha = 0.25;
      hatch(ctx, { x: box.x, y: box.y, w: box.w, h: m * 0.7 }, -Math.PI / 4, 9, 2);
      ctx.restore();
    },
  };
}
