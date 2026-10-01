// Песок (раздел 7.5.10): струи из трещин потолка проявляются сверху, дюны растут в три стадии
// (тонкий слой → холмик → дюна) и сливаются с соседними.

import Phaser from 'phaser';
import type { Art } from '../art/ArtFactory';
import { SPR } from '../art/manifest';
import type { GridShape } from '../core/grid';
import { cellBase, cellCenter, CELL } from './geometry';
import type { Layers } from './layers';

interface Stream {
  cell: number;
  img: Phaser.GameObjects.Image;
  grains: { img: Phaser.GameObjects.Image; k: number; speed: number; dx: number }[];
  age: number;
  fadeAt: number;
  texH: number;
}

interface Dune {
  img: Phaser.GameObjects.Image;
  stage: number;
}

export class SandView {
  private readonly streams = new Map<number, Stream>();
  private readonly dunes = new Map<number, Dune>();
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

  warn(cell: number): void {
    if (this.streams.has(cell)) return;
    const b = cellBase(this.g, cell);
    const img = this.art.img(b.x, b.y - 4, SPR.sandStream);
    img.setAlpha(0.95);
    this.layers.atmos.add(img);
    const texH = img.frame.height;
    img.setCrop(0, 0, img.frame.width, 0);
    const grains: Stream['grains'] = [];
    for (let i = 0; i < 7; i++) {
      const gi = this.art.img(b.x, b.y, SPR.sandGrain);
      gi.setScale(this.art.baseScale(SPR.sandGrain) * (0.6 + this.rng() * 0.6));
      this.layers.atmos.add(gi);
      grains.push({ img: gi, k: this.rng(), speed: 0.0016 + this.rng() * 0.0012, dx: (this.rng() - 0.5) * 12 });
    }
    this.streams.set(cell, { cell, img, grains, age: 0, fadeAt: Infinity, texH });
    this.setDune(cell, 0);
  }

  bury(cell: number): void {
    this.setDune(cell, 1);
    const s = this.streams.get(cell);
    if (s) s.fadeAt = s.age + 1400;
    this.scene.time.delayedCall(900, () => this.setDune(cell, 2));
    this.puff(cell);
  }

  private setDune(cell: number, stage: number): void {
    const c = cellCenter(this.g, cell);
    let d = this.dunes.get(cell);
    if (!d) {
      const img = this.art.img(c.x, c.y + CELL * 0.08, SPR.dunes[0]);
      img.setAlpha(0);
      this.layers.floor.add(img);
      d = { img, stage: -1 };
      this.dunes.set(cell, d);
      this.scene.tweens.add({ targets: img, alpha: 1, duration: this.reduced ? 1 : 2400 });
    }
    if (stage <= d.stage) return;
    d.stage = stage;
    const name = SPR.dunes[Math.min(SPR.dunes.length - 1, stage)];
    this.art.setFrame(d.img, name);
    const base = this.art.baseScale(name);
    if (!this.reduced && stage > 0) {
      d.img.setScale(base * 0.82, base * 0.6);
      this.scene.tweens.add({ targets: d.img, scaleX: base, scaleY: base, duration: 320, ease: 'Back.Out' });
    } else d.img.setScale(base);
  }

  puff(cell: number): void {
    if (this.reduced) return;
    const b = cellBase(this.g, cell);
    for (let i = 0; i < 4; i++) {
      const p = this.art.img(b.x + (this.rng() - 0.5) * 40, b.y - 10, SPR.puff);
      const s = this.art.baseScale(SPR.puff) * (0.5 + this.rng() * 0.4);
      p.setScale(s);
      this.layers.atmos.add(p);
      this.scene.tweens.add({
        targets: p,
        x: p.x + (this.rng() - 0.5) * 70,
        y: p.y - 20 - this.rng() * 26,
        scale: s * 1.7,
        alpha: 0,
        duration: 520 + this.rng() * 200,
        ease: 'Quad.Out',
        onComplete: () => p.destroy(),
      });
    }
  }

  isBuried(cell: number): boolean {
    return (this.dunes.get(cell)?.stage ?? -1) >= 1;
  }

  update(dt: number): void {
    for (const s of this.streams.values()) {
      s.age += dt;
      // Струя проявляется сверху вниз за 350 мс.
      const reveal = this.reduced ? 1 : Math.min(1, s.age / 350);
      s.img.setCrop(0, 0, s.img.frame.width, s.texH * reveal);
      const fading = s.age > s.fadeAt;
      const fadeK = fading ? Math.max(0, 1 - (s.age - s.fadeAt) / 700) : 1;
      s.img.setAlpha(0.95 * fadeK);
      const topY = s.img.y - s.img.displayHeight;
      for (const gr of s.grains) {
        if (!this.reduced) gr.k += gr.speed * dt;
        if (gr.k > 1) gr.k -= 1;
        const y = topY + gr.k * s.img.displayHeight * reveal;
        gr.img.setPosition(s.img.x + gr.dx * gr.k, y);
        gr.img.setAlpha(fadeK * (reveal > gr.k ? 1 : 0));
      }
      if (fading && fadeK <= 0) {
        s.img.destroy();
        for (const gr of s.grains) gr.img.destroy();
        this.streams.delete(s.cell);
      }
    }
  }

  clear(): void {
    for (const s of this.streams.values()) {
      s.img.destroy();
      for (const gr of s.grains) gr.img.destroy();
    }
    this.streams.clear();
    for (const d of this.dunes.values()) d.img.destroy();
    this.dunes.clear();
  }
}
