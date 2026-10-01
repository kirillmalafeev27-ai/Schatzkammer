// Предметы на полу: монеты покачиваются и ловят диагональный блик, камни на пьедесталах
// пульсируют ореолом. Подбор, отказ «VOLL!», дрожь перед песком, погружение под песок.

import Phaser from 'phaser';
import { balance } from '../config/balance';
import { palette } from '../config/palette';
import type { Art } from '../art/ArtFactory';
import { GEM_KIND_BY_CODE, SPR } from '../art/manifest';
import { isGem } from '../core/rules';
import type { GridShape } from '../core/grid';
import { cellBase, CELL } from './geometry';
import type { Layers } from './layers';

interface ItemSprite {
  cell: number;
  code: number;
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  pedestal: Phaser.GameObjects.Image | null;
  shine: Phaser.GameObjects.Image | null;
  shadow: Phaser.GameObjects.Image;
  halo: Phaser.GameObjects.Image | null;
  glint: Phaser.GameObjects.Image;
  phase: number;
  nextShine: number;
  shineT: number;
  trembleUntil: number;
  baseY: number;
  x0: number;
  dead: boolean;
}

export class ItemView {
  private readonly items = new Map<number, ItemSprite>();
  private time = 0;
  private reduced = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: Art,
    private readonly layers: Layers,
    private readonly g: GridShape,
    private readonly rng: () => number,
  ) {}

  setReducedMotion(v: boolean): void {
    this.reduced = v;
  }

  build(items: ArrayLike<number>): void {
    for (let i = 0; i < items.length; i++) if (items[i]) this.add(i, items[i]);
  }

  private add(cell: number, code: number): void {
    const b = cellBase(this.g, cell);
    const gem = isGem(code);
    const root = this.scene.add.container(b.x, b.y);
    const shadow = this.art.img(b.x, b.y + 2, SPR.shadow);
    shadow.setScale(this.art.baseScale(SPR.shadow) * (gem ? 0.85 : 0.6));
    this.layers.shadows.add(shadow);
    let pedestal: Phaser.GameObjects.Image | null = null;
    let halo: Phaser.GameObjects.Image | null = null;
    let shine: Phaser.GameObjects.Image | null = null;
    let body: Phaser.GameObjects.Image;
    if (gem) {
      const kind = GEM_KIND_BY_CODE[code];
      pedestal = this.art.img(0, 0, SPR.pedestal);
      body = this.art.img(0, -18, SPR.gem[kind]);
      root.add([pedestal, body]);
      halo = this.art.img(b.x, b.y - 30, SPR.halo[kind]);
      halo.setBlendMode(Phaser.BlendModes.ADD);
      this.layers.overlay.add(halo);
    } else {
      body = this.art.img(0, 0, SPR.coin);
      shine = this.art.img(0, 0, SPR.coinShine);
      shine.setBlendMode(Phaser.BlendModes.ADD);
      shine.setAlpha(0);
      root.add([body]);
      this.layers.overlay.add(shine);
    }
    const glint = this.art.img(b.x, b.y, SPR.glint);
    glint.setAlpha(0);
    this.layers.overlay.add(glint);
    root.setDepth(b.y);
    this.layers.objects.add(root);
    const phase = this.rng() * Math.PI * 2;
    this.items.set(cell, {
      cell,
      code,
      root,
      body,
      pedestal,
      shine,
      shadow,
      halo,
      glint,
      phase,
      nextShine: balance.anim.coinShineMinMs * this.rng() * 1.5,
      shineT: -1,
      trembleUntil: 0,
      baseY: b.y,
      x0: b.x,
      dead: false,
    });
  }

  has(cell: number): boolean {
    return this.items.has(cell);
  }

  position(cell: number): { x: number; y: number } | null {
    const it = this.items.get(cell);
    return it ? { x: it.root.x, y: it.root.y } : null;
  }

  /** Есть ли на клетке видимый предмет (для полупрозрачности препятствий). */
  cells(): number[] {
    return [...this.items.keys()];
  }

  gemLights(): { cell: number; x: number; y: number; color: string; phase: number }[] {
    const out: { cell: number; x: number; y: number; color: string; phase: number }[] = [];
    for (const it of this.items.values()) {
      if (!isGem(it.code) || it.dead) continue;
      const kind = GEM_KIND_BY_CODE[it.code];
      out.push({ cell: it.cell, x: it.root.x, y: it.root.y, color: palette[kind].base, phase: it.phase });
    }
    return out;
  }

  /** Подбор: предмет подлетает, крутится и по дуге летит к цели (мешок / плашка). */
  pickup(cell: number, to: () => { x: number; y: number }, onArrive?: () => void): void {
    const it = this.items.get(cell);
    if (!it) return;
    this.items.delete(cell);
    it.dead = true;
    it.shadow.destroy();
    it.halo?.destroy();
    it.shine?.destroy();
    it.glint.destroy();
    it.pedestal?.destroy();
    // Летящий предмет — поверх света, в слое 5.
    const flyer = it.body;
    const wx = it.root.x + flyer.x;
    const wy = it.root.y + flyer.y;
    it.root.remove(flyer);
    it.root.destroy();
    flyer.setPosition(wx, wy);
    this.layers.overlay.add(flyer);
    const base = flyer.scaleX;
    if (this.reduced) {
      flyer.destroy();
      onArrive?.();
      return;
    }
    const start = { x: wx, y: wy };
    const st = { t: 0 };
    const dur = balance.anim.pickupFlyMs;
    this.scene.tweens.add({
      targets: st,
      t: 1,
      duration: dur,
      ease: 'Quad.In',
      onUpdate: () => {
        const end = to();
        const t = st.t;
        const lift = 70;
        const x = start.x + (end.x - start.x) * t;
        const y = start.y + (end.y - start.y) * t - Math.sin(Math.PI * Math.min(1, t * 1.15)) * lift;
        flyer.setPosition(x, y);
        flyer.scaleX = base * Math.cos(t * Math.PI * 4) * (1 - 0.4 * t);
        flyer.scaleY = base * (1 - 0.4 * t);
      },
      onComplete: () => {
        flyer.destroy();
        onArrive?.();
      },
    });
  }

  /** Мешок полон: предмет подпрыгивает и остаётся лежать. */
  refuse(cell: number): void {
    const it = this.items.get(cell);
    if (!it || this.reduced) return;
    this.scene.tweens.add({ targets: it.body, y: it.body.y - 26, duration: 140, yoyo: true, ease: 'Quad.Out' });
  }

  tremble(cell: number): void {
    const it = this.items.get(cell);
    if (it) it.trembleUntil = this.time + balance.sand.warnMs + 200;
  }

  /** Засыпан песком: предмет тонет под маской. */
  bury(cell: number): void {
    const it = this.items.get(cell);
    if (!it) return;
    this.items.delete(cell);
    it.dead = true;
    it.halo?.destroy();
    it.shine?.destroy();
    it.glint.destroy();
    const dur = this.reduced ? 1 : balance.anim.sandSinkMs;
    const parts = [it.body, ...(it.pedestal ? [it.pedestal] : [])];
    const st = { k: 0 };
    const heights = parts.map((p) => p.frame.height);
    const ys = parts.map((p) => p.y);
    this.scene.tweens.add({
      targets: st,
      k: 1,
      duration: dur,
      ease: 'Quad.In',
      onUpdate: () => {
        parts.forEach((p, i) => {
          const h = heights[i];
          const sinkPx = h * st.k;
          p.setCrop(0, 0, p.frame.width, Math.max(0, h - sinkPx));
          p.y = ys[i] + sinkPx * p.scaleY;
        });
        it.shadow.alpha = 1 - st.k;
      },
      onComplete: () => {
        it.root.destroy();
        it.shadow.destroy();
      },
    });
  }

  /** Быстро убрать без анимации (сброс). */
  clear(): void {
    for (const it of this.items.values()) {
      it.root.destroy();
      it.shadow.destroy();
      it.halo?.destroy();
      it.shine?.destroy();
      it.glint.destroy();
    }
    this.items.clear();
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    for (const it of this.items.values()) {
      const gem = isGem(it.code);
      const bob = this.reduced ? 0 : Math.sin(t / 520 + it.phase);
      let dx = 0;
      if (t < it.trembleUntil && !this.reduced) dx = Math.sin(t / 22 + it.phase) * 2.2;
      it.root.x = it.x0 + dx;
      if (gem) {
        it.body.y = -18 - 3 * bob;
        if (it.halo) {
          const pulse = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin((t / balance.anim.gemPulseMs) * Math.PI * 2 + it.phase);
          it.halo.setAlpha(0.55 + 0.35 * pulse);
          it.halo.setScale(this.art.baseScale(SPR.halo.ruby) * (0.92 + 0.12 * pulse));
          it.halo.setPosition(it.root.x, it.root.y - 34 - 3 * bob);
        }
      } else {
        it.body.angle = this.reduced ? 0 : bob * 4;
        it.body.y = -1.5 * Math.max(0, bob);
        // Диагональный блик раз в 2–4 с, фазы случайные.
        if (it.shine) {
          if (it.shineT < 0 && t >= it.nextShine) it.shineT = 0;
          if (it.shineT >= 0) {
            it.shineT += dt / 420;
            const k = it.shineT;
            it.shine.setPosition(it.root.x + (k - 0.5) * 30, it.root.y - 22 + (k - 0.5) * 10);
            it.shine.setAlpha(Math.sin(Math.min(1, k) * Math.PI) * 0.95);
            if (k >= 1) {
              it.shineT = -1;
              it.shine.setAlpha(0);
              const a = balance.anim;
              it.nextShine = t + a.coinShineMinMs + this.rng() * (a.coinShineMaxMs - a.coinShineMinMs);
            }
          }
        }
      }
      // Глинт-звёздочка: изредка вспыхивает.
      const gp = ((t / (gem ? 1700 : 2600) + it.phase) % 1 + 1) % 1;
      const ga = gp < 0.12 && !this.reduced ? Math.sin((gp / 0.12) * Math.PI) : 0;
      it.glint.setAlpha(ga);
      it.glint.setPosition(it.root.x + (gem ? 10 : 9), it.root.y + (gem ? -46 : -30));
      it.glint.setScale(this.art.baseScale(SPR.glint) * (0.6 + ga * 0.6));
    }
  }

  setAlphaForCell(cell: number, a: number): void {
    const it = this.items.get(cell);
    if (it) it.root.setAlpha(a);
  }

  /** Есть ли предмет на клетке прямо над этой (для полупрозрачности препятствий). */
  occupies(cell: number): boolean {
    return this.items.has(cell);
  }

  static cellHeight(): number {
    return CELL;
  }
}
