// Фабрика арта: генерирует процедурные текстуры при запуске и на каждый зал,
// упаковывает их в атласы и регистрирует в менеджере текстур Phaser.

import Phaser from 'phaser';
import type { GeneratedLevel } from '../core/levelGen';
import { hashSeed, mulberry32, type Rng } from '../core/rng';
import type { WorldGeom } from '../render/geometry';
import { AtlasSet, nextPow2, type DrawSpec, type FrameMeta } from './atlas';
import { makeCanvas, type Ctx } from './comicKit';
import { TEX } from './manifest';

export type AddSprite = (name: string, spec: DrawSpec) => void;

export interface Bake {
  /** Размер и положение в мировых единицах. */
  x: number;
  y: number;
  w: number;
  h: number;
  draw: (ctx: Ctx) => void;
}

export interface SfxStyle {
  fill: string;
  outer: string;
  size: number;
  skew?: number;
  burst?: string | null;
}

export interface StyleKit {
  name: string;
  sprites(add: AddSprite, rng: Rng): void;
  floor(geom: WorldGeom, level: GeneratedLevel): Bake;
  walls(geom: WorldGeom, level: GeneratedLevel): Bake;
  ledge(geom: WorldGeom, level: GeneratedLevel): Bake;
  cave(geom: WorldGeom, level: GeneratedLevel): Bake;
  vignette(): Bake;
  sfxWord(text: string, style: SfxStyle, rng: Rng): DrawSpec;
}

export interface BakedTexture {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Пикселей на мировую единицу. */
  scale: number;
}

export class ArtFactory {
  readonly frames = new Map<string, FrameMeta>();
  readonly baked = new Map<string, BakedTexture>();
  private readonly sfxCache = new Map<string, FrameMeta>();
  private sfxCount = 0;
  readonly pxPerUnit: number;
  readonly timings: Record<string, number> = {};
  /** Холсты атласов — для превью арта и DOM-иконок. */
  readonly atlasCanvases = new Map<string, HTMLCanvasElement>();

  constructor(
    private readonly textures: Phaser.Textures.TextureManager,
    readonly kit: StyleKit,
    cellPx: number,
  ) {
    this.pxPerUnit = cellPx / 128;
  }

  buildStatic(seed = 1): void {
    const t0 = performance.now();
    const set = new AtlasSet('atlas', 2048);
    const rng = mulberry32(hashSeed(seed, 7));
    this.kit.sprites((name, spec) => set.add(name, spec, this.pxPerUnit), rng);
    for (const atlas of set.atlases) {
      if (this.textures.exists(atlas.key)) this.textures.remove(atlas.key);
      const tex = this.textures.addCanvas(atlas.key, atlas.canvas);
      if (!tex) continue;
      for (const f of atlas.frames.values()) tex.add(f.frame, 0, f.x, f.y, f.w, f.h);
      this.atlasCanvases.set(atlas.key, atlas.canvas);
    }
    for (const [k, v] of set.frames) this.frames.set(k, v);
    const vg = this.kit.vignette();
    this.bake(TEX.vignette, vg, 0.5);
    this.timings.static = performance.now() - t0;
  }

  buildLevel(geom: WorldGeom, level: GeneratedLevel): void {
    const t0 = performance.now();
    this.bake(TEX.floor, this.kit.floor(geom, level), this.pxPerUnit);
    this.bake(TEX.walls, this.kit.walls(geom, level), this.pxPerUnit);
    this.bake(TEX.ledge, this.kit.ledge(geom, level), this.pxPerUnit);
    this.bake(TEX.cave, this.kit.cave(geom, level), this.pxPerUnit * 0.5);
    this.timings.level = performance.now() - t0;
  }

  private bake(key: string, b: Bake, scale: number): void {
    const pw = Math.ceil(b.w * scale);
    const ph = Math.ceil(b.h * scale);
    const { canvas, ctx } = makeCanvas(nextPow2(pw), nextPow2(ph));
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-b.x, -b.y);
    b.draw(ctx);
    ctx.restore();
    if (this.textures.exists(key)) this.textures.remove(key);
    const tex = this.textures.addCanvas(key, canvas);
    tex?.add('main', 0, 0, 0, pw, ph);
    this.baked.set(key, { key, x: b.x, y: b.y, w: b.w, h: b.h, scale });
  }

  frame(name: string): FrameMeta {
    const f = this.frames.get(name) ?? this.sfxCache.get(name);
    if (!f) throw new Error(`Art: нет кадра ${name}`);
    return f;
  }

  has(name: string): boolean {
    return this.frames.has(name) || this.sfxCache.has(name);
  }

  /** Слово-звук как текстура; кэшируется. */
  sfx(text: string, style: SfxStyle): FrameMeta {
    const id = `sfx:${text}:${style.fill}:${style.outer}:${style.size}:${style.burst ?? ''}`;
    const cached = this.sfxCache.get(id);
    if (cached) return cached;
    const spec = this.kit.sfxWord(text, style, mulberry32(hashSeed(text.length, this.sfxCount)));
    const scale = this.pxPerUnit;
    const pw = Math.ceil(spec.w * scale);
    const ph = Math.ceil(spec.h * scale);
    const { canvas, ctx } = makeCanvas(pw, ph);
    ctx.scale(scale, scale);
    spec.draw(ctx);
    const key = `sfx${this.sfxCount++}`;
    const tex = this.textures.addCanvas(key, canvas);
    tex?.add('main', 0, 0, 0, pw, ph);
    const meta: FrameMeta = { key, frame: 'main', x: 0, y: 0, w: pw, h: ph, ox: spec.ox / spec.w, oy: spec.oy / spec.h, scale };
    this.sfxCache.set(id, meta);
    return meta;
  }

  /** Отрисовать кадр атласа в отдельный холст (для DOM-иконок). */
  frameToCanvas(name: string, cssH: number, dpr = 2): HTMLCanvasElement | null {
    const f = this.frames.get(name);
    if (!f) return null;
    const src = this.atlasCanvases.get(f.key);
    if (!src) return null;
    const h = Math.round(cssH * dpr);
    const w = Math.round((f.w / f.h) * h);
    const { canvas, ctx } = makeCanvas(w, h);
    ctx.drawImage(src, f.x, f.y, f.w, f.h, 0, 0, w, h);
    return canvas;
  }
}

/** Помощник для видов: картинка из атласа с правильными якорем и масштабом. */
export class Art {
  constructor(
    readonly scene: Phaser.Scene,
    readonly factory: ArtFactory,
  ) {}

  img(x: number, y: number, name: string): Phaser.GameObjects.Image {
    const f = this.factory.frame(name);
    const im = this.scene.add.image(x, y, f.key, f.frame);
    im.setOrigin(f.ox, f.oy);
    im.setScale(1 / f.scale);
    return im;
  }

  sprite(x: number, y: number, name: string): Phaser.GameObjects.Sprite {
    const f = this.factory.frame(name);
    const sp = this.scene.add.sprite(x, y, f.key, f.frame);
    sp.setOrigin(f.ox, f.oy);
    sp.setScale(1 / f.scale);
    return sp;
  }

  /** Сменить кадр, сохранив масштаб по отношению к базовому. */
  setFrame(im: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, name: string): void {
    const f = this.factory.frame(name);
    im.setTexture(f.key, f.frame);
    im.setOrigin(f.ox, f.oy);
  }

  baseScale(name: string): number {
    return 1 / this.factory.frame(name).scale;
  }

  baked(key: string): Phaser.GameObjects.Image {
    const b = this.factory.baked.get(key);
    if (!b) throw new Error(`Art: нет запечённой текстуры ${key}`);
    const im = this.scene.add.image(b.x, b.y, key, 'main');
    im.setOrigin(0, 0);
    im.setScale(1 / b.scale);
    return im;
  }

  sfx(x: number, y: number, text: string, style: SfxStyle): Phaser.GameObjects.Image {
    const f = this.factory.sfx(text, style);
    const im = this.scene.add.image(x, y, f.key, f.frame);
    im.setOrigin(f.ox, f.oy);
    im.setScale(1 / f.scale);
    return im;
  }
}
