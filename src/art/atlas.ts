// Упаковка процедурных спрайтов в атласы степени двойки (для мипмапов WebGL).

import { makeCanvas, type Ctx } from './comicKit';

export interface FrameMeta {
  /** Ключ атласа (текстуры) в менеджере текстур. */
  key: string;
  frame: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Точка привязки в долях кадра. */
  ox: number;
  oy: number;
  /** Сколько пикселей текстуры приходится на одну мировую единицу (128 на клетку). */
  scale: number;
}

export interface DrawSpec {
  /** Размер в мировых единицах (128 на клетку). */
  w: number;
  h: number;
  /** Точка привязки в мировых единицах от левого верхнего угла. */
  ox: number;
  oy: number;
  draw: (ctx: Ctx) => void;
}

export class Atlas {
  readonly key: string;
  readonly size: number;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: Ctx;
  readonly frames = new Map<string, FrameMeta>();
  private shelfY = 0;
  private shelfH = 0;
  private cursorX = 0;
  private readonly pad: number;

  constructor(key: string, size = 2048, pad = 6) {
    this.key = key;
    this.size = size;
    this.pad = pad;
    const { canvas, ctx } = makeCanvas(size, size);
    this.canvas = canvas;
    this.ctx = ctx;
  }

  /** Есть ли место под кадр w × h пикселей. */
  fits(w: number, h: number): boolean {
    const p = this.pad;
    if (w + p * 2 > this.size) return false;
    if (this.cursorX + w + p * 2 <= this.size) return this.shelfY + h + p * 2 <= this.size;
    return this.shelfY + this.shelfH + h + p * 2 <= this.size;
  }

  /**
   * Выделить место и нарисовать. `pxPerUnit` — сколько пикселей на мировую единицу.
   * Рисование идёт в мировых единицах: контекст уже смещён и отмасштабирован.
   */
  add(name: string, spec: DrawSpec, pxPerUnit: number): FrameMeta {
    const w = Math.ceil(spec.w * pxPerUnit);
    const h = Math.ceil(spec.h * pxPerUnit);
    const p = this.pad;
    if (this.cursorX + w + p * 2 > this.size) {
      this.shelfY += this.shelfH;
      this.shelfH = 0;
      this.cursorX = 0;
    }
    if (this.shelfY + h + p * 2 > this.size) throw new Error(`Atlas ${this.key}: нет места для ${name}`);
    const x = this.cursorX + p;
    const y = this.shelfY + p;
    this.cursorX += w + p * 2;
    this.shelfH = Math.max(this.shelfH, h + p * 2);

    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(x, y);
    ctx.scale(pxPerUnit, pxPerUnit);
    spec.draw(ctx);
    ctx.restore();

    const meta: FrameMeta = {
      key: this.key,
      frame: name,
      x,
      y,
      w,
      h,
      ox: spec.ox / spec.w,
      oy: spec.oy / spec.h,
      scale: pxPerUnit,
    };
    this.frames.set(name, meta);
    return meta;
  }
}

/** Набор атласов: новый атлас заводится, когда текущий заполнен. */
export class AtlasSet {
  readonly atlases: Atlas[] = [];
  readonly frames = new Map<string, FrameMeta>();
  private readonly prefix: string;
  private readonly size: number;

  constructor(prefix: string, size = 2048) {
    this.prefix = prefix;
    this.size = size;
  }

  add(name: string, spec: DrawSpec, pxPerUnit: number): FrameMeta {
    const w = Math.ceil(spec.w * pxPerUnit);
    const h = Math.ceil(spec.h * pxPerUnit);
    let atlas = this.atlases[this.atlases.length - 1];
    if (!atlas || !atlas.fits(w, h)) {
      const size = Math.max(this.size, nextPow2(Math.max(w, h) + 16));
      atlas = new Atlas(`${this.prefix}${this.atlases.length}`, size);
      this.atlases.push(atlas);
    }
    const meta = atlas.add(name, spec, pxPerUnit);
    this.frames.set(name, meta);
    return meta;
  }
}

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}
