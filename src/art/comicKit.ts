// Комикс-кит (раздел 7.4): инструменты, которыми процедурно рисуется весь арт.
// Толстая тушь переменной толщины, светотень в три тона, растр в тенях, штриховка, глинты.

import { palette, rgba } from '../config/palette';
import { mulberry32, type Rng } from '../core/rng';

export { mulberry32 };
export type { Rng };

export interface Pt {
  x: number;
  y: number;
}
export type Path = Pt[];

export interface Tones {
  base: string;
  shadow: string;
  light: string;
}

export type Ctx = CanvasRenderingContext2D;

// ── Геометрия ────────────────────────────────────────────────────────────────

/** Сглаживание Чайкина. */
export function chaikin(path: Path, passes = 2, closed = true): Path {
  let p = path;
  for (let k = 0; k < passes; k++) {
    const out: Path = [];
    const n = p.length;
    const last = closed ? n : n - 1;
    if (!closed) out.push(p[0]);
    for (let i = 0; i < last; i++) {
      const a = p[i];
      const b = p[(i + 1) % n];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    if (!closed) out.push(p[n - 1]);
    p = out;
  }
  return p;
}

export interface BlobOpts {
  cx?: number;
  cy?: number;
  points?: number;
  jitter?: number;
  passes?: number;
  /** Сплющить низ (для камней, лежащих на полу). */
  flatBottom?: number;
  rotation?: number;
}

/** Неровная замкнутая форма: точки по эллипсу с разбросом радиуса, сглаживание Чайкина. */
export function blob(rng: Rng, w: number, h: number, opts: BlobOpts = {}): Path {
  const n = opts.points ?? 9;
  const jitter = opts.jitter ?? 0.15;
  const cx = opts.cx ?? 0;
  const cy = opts.cy ?? 0;
  const rot = opts.rotation ?? 0;
  const pts: Path = [];
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    const r = 1 + (rng() * 2 - 1) * jitter;
    let x = Math.cos(a) * (w / 2) * r;
    let y = Math.sin(a) * (h / 2) * r;
    if (opts.flatBottom && y > 0) y *= 1 - opts.flatBottom;
    const xr = x * Math.cos(rot) - y * Math.sin(rot);
    const yr = x * Math.sin(rot) + y * Math.cos(rot);
    x = xr;
    y = yr;
    pts.push({ x: cx + x, y: cy + y });
  }
  return chaikin(pts, opts.passes ?? 2, true);
}

/** Прямоугольник со скруглёнными неровными углами (плиты, панели). */
export function roughRect(
  rng: Rng,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  jitter: number,
): Path {
  const j = () => (rng() * 2 - 1) * jitter;
  const corners = [
    { x: x + j(), y: y + j() },
    { x: x + w + j(), y: y + j() },
    { x: x + w + j(), y: y + h + j() },
    { x: x + j(), y: y + h + j() },
  ];
  const pts: Path = [];
  for (let i = 0; i < 4; i++) {
    const p = corners[i];
    const prev = corners[(i + 3) % 4];
    const next = corners[(i + 1) % 4];
    const r = radius * (0.7 + rng() * 0.6);
    const d1 = Math.hypot(prev.x - p.x, prev.y - p.y);
    const d2 = Math.hypot(next.x - p.x, next.y - p.y);
    const k1 = Math.min(0.45, r / d1);
    const k2 = Math.min(0.45, r / d2);
    pts.push({ x: p.x + (prev.x - p.x) * k1, y: p.y + (prev.y - p.y) * k1 });
    pts.push(p);
    pts.push({ x: p.x + (next.x - p.x) * k2, y: p.y + (next.y - p.y) * k2 });
  }
  // Сглаживаем только углы: точка-угол заменяется дугой Чайкина.
  return chaikin(pts, 2, true);
}

/** Дрожание линии: дробит длинные отрезки и сдвигает точки на amp. */
export function wobble(path: Path, amp: number, rng: Rng, seg = 7, closed = true): Path {
  const out: Path = [];
  const n = path.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = path[i];
    const b = path[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.round(len / seg));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push({
        x: a.x + (b.x - a.x) * t + (rng() * 2 - 1) * amp,
        y: a.y + (b.y - a.y) * t + (rng() * 2 - 1) * amp,
      });
    }
  }
  if (!closed) out.push(path[n - 1]);
  return out;
}

export function translatePath(path: Path, dx: number, dy: number): Path {
  return path.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

export function scalePath(path: Path, sx: number, sy: number, cx = 0, cy = 0): Path {
  return path.map((p) => ({ x: cx + (p.x - cx) * sx, y: cy + (p.y - cy) * sy }));
}

export function bounds(path: Path): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of path) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function ellipsePath(cx: number, cy: number, rx: number, ry: number, n = 40): Path {
  const pts: Path = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

export function polyPath(pts: [number, number][]): Path {
  return pts.map(([x, y]) => ({ x, y }));
}

// ── Рисование ────────────────────────────────────────────────────────────────

export function tracePath(ctx: Ctx, path: Path, closed = true): void {
  if (!path.length) return;
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  if (closed) ctx.closePath();
}

export function fillPath(ctx: Ctx, path: Path, color: string): void {
  ctx.beginPath();
  tracePath(ctx, path);
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * Трёхтоновая светотень: блик полумесяцем сверху слева, тень полумесяцем снизу справа.
 * `k` — ширина тени (≈ 12% размера объекта).
 */
export function celShade(
  ctx: Ctx,
  path: Path,
  tones: Tones,
  k: number,
  opts: { lightK?: number } = {},
): void {
  const lk = opts.lightK ?? k * 0.5;
  const b = bounds(path);
  ctx.save();
  ctx.beginPath();
  tracePath(ctx, path);
  ctx.fillStyle = tones.light;
  ctx.fill();
  ctx.clip();
  // Основной тон со сдвигом вниз-вправо: сверху слева остаётся полумесяц блика.
  ctx.beginPath();
  tracePath(ctx, translatePath(path, lk, lk));
  ctx.fillStyle = tones.base;
  ctx.fill();
  // Тень: всё, что вне формы, сдвинутой вверх-влево на k.
  ctx.beginPath();
  ctx.rect(b.x - k * 2, b.y - k * 2, b.w + k * 4, b.h + k * 4);
  tracePath(ctx, translatePath(path, -k, -k));
  ctx.fillStyle = tones.shadow;
  ctx.fill('evenodd');
  ctx.restore();
}

/** Клип по полумесяцу тени (форма минус форма, сдвинутая на (−k, −k)). */
export function clipShadowCrescent(ctx: Ctx, path: Path, k: number): void {
  ctx.beginPath();
  tracePath(ctx, path);
  ctx.clip();
  const b = bounds(path);
  ctx.beginPath();
  ctx.rect(b.x - k * 2, b.y - k * 2, b.w + k * 4, b.h + k * 4);
  tracePath(ctx, translatePath(path, -k, -k));
  ctx.clip('evenodd');
}

export interface HalftoneOpts {
  spacing: number;
  rMin: number;
  rMax: number;
  /** Направление, в котором точки растут (к теневой стороне). */
  dir?: Pt;
  /** Область растра; по умолчанию — границы клипа, переданные вызывающим. */
  region: { x: number; y: number; w: number; h: number };
  angle?: number;
}

/**
 * Растр: точки по сетке под 45°, радиус растёт к теневой стороне.
 * Рисует в текущий клип — вызывающий сам задаёт форму.
 */
export function halftone(ctx: Ctx, color: string, o: HalftoneOpts): void {
  const { region, spacing } = o;
  const dir = o.dir ?? { x: 0.7071, y: 0.7071 };
  const ang = o.angle ?? Math.PI / 4;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const cx = region.x + region.w / 2;
  const cy = region.y + region.h / 2;
  const half = Math.hypot(region.w, region.h) / 2 + spacing;
  // Проекция углов области на направление роста — для нормировки.
  const proj = (x: number, y: number) => (x - cx) * dir.x + (y - cy) * dir.y;
  const pr = Math.abs((region.w / 2) * dir.x) + Math.abs((region.h / 2) * dir.y) || 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let u = -half; u <= half; u += spacing) {
    for (let v = -half; v <= half; v += spacing) {
      const x = cx + u * ca - v * sa;
      const y = cy + u * sa + v * ca;
      if (
        x < region.x - spacing ||
        y < region.y - spacing ||
        x > region.x + region.w + spacing ||
        y > region.y + region.h + spacing
      )
        continue;
      const t = Math.max(0, Math.min(1, (proj(x, y) / pr + 1) / 2));
      const r = o.rMin + (o.rMax - o.rMin) * t;
      if (r <= 0.15) continue;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}

/** Равномерный растр с постоянным радиусом. */
export function halftoneFlat(
  ctx: Ctx,
  color: string,
  region: { x: number; y: number; w: number; h: number },
  spacing: number,
  r: number,
): void {
  halftone(ctx, color, { region, spacing, rMin: r, rMax: r });
}

/** Штриховка для самых глубоких теней. */
export function hatch(
  ctx: Ctx,
  region: { x: number; y: number; w: number; h: number },
  angle: number,
  spacing: number,
  width: number,
  color: string = palette.ink,
): void {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const cx = region.x + region.w / 2;
  const cy = region.y + region.h / 2;
  const half = Math.hypot(region.w, region.h) / 2 + spacing;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let v = -half; v <= half; v += spacing) {
    ctx.moveTo(cx - half * ca - v * sa, cy - half * sa + v * ca);
    ctx.lineTo(cx + half * ca - v * sa, cy + half * sa + v * ca);
  }
  ctx.stroke();
}

/**
 * Контур тушью в два прохода: сначала штрих 1.35w со сдвигом (+0.35w, +0.35w) — снизу справа
 * линия тяжелее; затем основной штрих w.
 */
export function ink(ctx: Ctx, path: Path, w: number, closed = true, color: string = palette.ink): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.beginPath();
  tracePath(ctx, translatePath(path, w * 0.35, w * 0.35), closed);
  ctx.lineWidth = w * 1.35;
  ctx.stroke();
  ctx.beginPath();
  tracePath(ctx, path, closed);
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.restore();
}

/** Простой штрих тушью одной толщины (для деталей). */
export function line(ctx: Ctx, path: Path, w: number, color: string = palette.ink, closed = false): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  tracePath(ctx, path, closed);
  ctx.stroke();
  ctx.restore();
}

/** Штрих переменной толщины: тонкие концы, толстая середина — как кистью. */
export function brush(ctx: Ctx, path: Path, wMax: number, color: string = palette.ink, wMin = 0.25): void {
  if (path.length < 2) return;
  const left: Pt[] = [];
  const right: Pt[] = [];
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(n - 1, i + 1)];
    let nx = -(b.y - a.y);
    let ny = b.x - a.x;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    const t = i / (n - 1);
    const w = (wMin + (1 - wMin) * Math.sin(Math.PI * t)) * wMax * 0.5;
    left.push({ x: path[i].x + nx * w, y: path[i].y + ny * w });
    right.push({ x: path[i].x - nx * w, y: path[i].y - ny * w });
  }
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  tracePath(ctx, [...left, ...right.reverse()]);
  ctx.fill();
  ctx.restore();
}

/** Белая четырёхлучевая звезда-блик. */
export function glint(ctx: Ctx, x: number, y: number, r: number, color = '#ffffff', thin = 0.16): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  const w = r * thin;
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + w, y - w, x + r, y);
  ctx.quadraticCurveTo(x + w, y + w, x, y + r);
  ctx.quadraticCurveTo(x - w, y + w, x - r, y);
  ctx.quadraticCurveTo(x - w, y - w, x, y - r);
  ctx.fill();
  ctx.restore();
}

/** Ломаная трещина с одним ответвлением. */
export function crack(
  ctx: Ctx,
  rng: Rng,
  from: Pt,
  len: number,
  angle = rng() * Math.PI * 2,
  w = 2.5,
  color: string = palette.ink,
): Path {
  const pts: Path = [from];
  let a = angle;
  let p = from;
  const segs = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < segs; i++) {
    a += (rng() * 2 - 1) * 0.7;
    const l = (len / segs) * (0.7 + rng() * 0.6);
    p = { x: p.x + Math.cos(a) * l, y: p.y + Math.sin(a) * l };
    pts.push(p);
  }
  brush(ctx, pts, w * 1.6, color, 0.2);
  const bi = 1 + Math.floor(rng() * (pts.length - 2));
  const bp = pts[bi];
  const ba = angle + (rng() < 0.5 ? 1 : -1) * (0.6 + rng() * 0.6);
  const bl = len * (0.25 + rng() * 0.25);
  const mid = {
    x: bp.x + Math.cos(ba) * bl * 0.5 + (rng() - 0.5) * 3,
    y: bp.y + Math.sin(ba) * bl * 0.5 + (rng() - 0.5) * 3,
  };
  brush(ctx, [bp, mid, { x: bp.x + Math.cos(ba) * bl, y: bp.y + Math.sin(ba) * bl }], w * 1.1, color, 0.2);
  return pts;
}

/** Взрыв-баллон под крупные слова-звуки. */
export function burstPath(
  cx: number,
  cy: number,
  rIn: number,
  rOut: number,
  spikes: number,
  rng: Rng,
  squash = 0.75,
): Path {
  const pts: Path = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 + (rng() - 0.5) * 0.12;
    const r = i % 2 === 0 ? rOut * (0.85 + rng() * 0.3) : rIn * (0.9 + rng() * 0.2);
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * squash });
  }
  return pts;
}

export function burst(
  ctx: Ctx,
  cx: number,
  cy: number,
  rIn: number,
  rOut: number,
  spikes: number,
  rng: Rng,
  fill: string,
  inkW: number,
): Path {
  const p = burstPath(cx, cy, rIn, rOut, spikes, rng);
  fillPath(ctx, p, fill);
  ink(ctx, p, inkW);
  return p;
}

/** Контактная тень: эллипс цвета туши с прозрачностью 35% и растром. */
export function contactShadow(ctx: Ctx, cx: number, cy: number, rx: number, ry: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = rgba(palette.ink, 0.35);
  ctx.fill();
  ctx.clip();
  const sp = Math.max(3, rx * 0.16);
  halftone(ctx, rgba(palette.ink, 0.45), {
    region: { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 },
    spacing: sp,
    rMin: sp * 0.42,
    rMax: sp * 0.12,
    dir: { x: 0, y: -1 },
  });
  ctx.restore();
}

// ── Канвы ────────────────────────────────────────────────────────────────────

export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w));
  canvas.height = Math.max(1, Math.ceil(h));
  // Растеризация на CPU: запекание — тысячи мелких контуров, и на GPU-канве (особенно программной,
  // без драйвера) оно в десятки раз медленнее; готовая канва один раз копируется в текстуру WebGL.
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as Ctx;
  return { canvas, ctx };
}

/** Мягкое пятно света (только для запасного пути без фильтра и для ореолов). */
export function radialSpot(ctx: Ctx, cx: number, cy: number, r: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Ступенчатое «комиксное» пятно: кольца растра вместо градиента. */
export function steppedHalo(
  ctx: Ctx,
  cx: number,
  cy: number,
  r: number,
  color: string,
  rings = 3,
  spacing = 6,
): void {
  ctx.save();
  for (let i = rings; i >= 1; i--) {
    const rr = (r * i) / rings;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.clip();
    const dotR = spacing * (0.12 + 0.36 * (1 - (i - 1) / rings));
    halftoneFlat(ctx, color, { x: cx - rr, y: cy - rr, w: rr * 2, h: rr * 2 }, spacing, dotR);
    ctx.restore();
  }
  ctx.restore();
}
