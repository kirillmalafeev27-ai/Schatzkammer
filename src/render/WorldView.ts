// Статичная часть мира: фон пещеры, пол, стены, уступ, препятствия, факелы, кристаллы.

import Phaser from 'phaser';
import { balance } from '../config/balance';
import type { Art } from '../art/ArtFactory';
import { SPR, TEX } from '../art/manifest';
import { cellIndex, cellXY, exitIndex } from '../core/grid';
import { Obstacle, type GeneratedLevel } from '../core/levelGen';
import { hashSeed, mulberry32 } from '../core/rng';
import { DEPTH } from './DoorView';
import { cellBase, CELL, type WorldGeom } from './geometry';
import type { Layers } from './layers';

interface ObstacleSprite {
  cell: number;
  img: Phaser.GameObjects.Image;
  alpha: number;
  above: number;
}

interface Torch {
  holder: Phaser.GameObjects.Image;
  flame: Phaser.GameObjects.Image;
  frame: number;
  next: number;
  embers: { img: Phaser.GameObjects.Image; life: number; vx: number; vy: number }[];
  x: number;
  y: number;
}

export class WorldView {
  private readonly obstacles: ObstacleSprite[] = [];
  private readonly torches: Torch[] = [];
  private readonly crystalGlows: { img: Phaser.GameObjects.Image; phase: number }[] = [];
  private readonly crystalGlints: { img: Phaser.GameObjects.Image; phase: number; x: number; y: number }[] = [];
  private time = 0;
  private reduced = false;
  private readonly rng: () => number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: Art,
    geom: WorldGeom,
    level: GeneratedLevel,
    private readonly layers: Layers,
  ) {
    this.rng = mulberry32(hashSeed(level.usedSeed, 4242));
    layers.bg.add(art.baked(TEX.cave));
    layers.floor.add(art.baked(TEX.floor));
    const walls = art.baked(TEX.walls).setDepth(DEPTH.walls);
    const ledge = art.baked(TEX.ledge).setDepth(DEPTH.ledge);
    layers.objects.add([walls, ledge]);

    const { g } = level;
    for (let i = 0; i < exitIndex(g); i++) {
      if (!level.blocked[i]) continue;
      const kind = level.obstacleKind[i];
      const h = hashSeed(level.usedSeed, i);
      const pool = kind === Obstacle.Rubble ? SPR.rubble : kind === Obstacle.Head ? SPR.head : SPR.column;
      const name = pool[h % pool.length];
      const b = cellBase(g, i);
      const img = art.img(b.x, b.y + 4, name).setDepth(b.y);
      if (h % 2 === 0 && kind !== Obstacle.Column) img.scaleX *= -1;
      const sh = art.img(b.x, b.y + 6, SPR.shadow);
      sh.setScale(art.baseScale(SPR.shadow) * (kind === Obstacle.Column ? 1.0 : 1.25));
      layers.shadows.add(sh);
      layers.objects.add(img);
      const { x, y } = cellXY(g, i);
      this.obstacles.push({ cell: i, img, alpha: 1, above: y > 0 ? cellIndex(g, x, y - 1) : -1 });
    }

    for (const t of geom.torches) {
      const holder = art.img(t.x, t.y, SPR.torchHolder).setDepth(DEPTH.wallProps);
      const frame = Math.floor(this.rng() * SPR.flames.length);
      const flame = art.img(t.x, t.y - 16, SPR.flames[frame]).setDepth(DEPTH.wallProps + 1);
      layers.objects.add([holder, flame]);
      this.torches.push({ holder, flame, frame, next: this.rng() * 90, embers: [], x: t.x, y: t.y - 30 });
    }

    for (const c of geom.crystals) {
      const glow = art.img(c.x, c.y, SPR.lightSpot).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      glow.setScale(art.baseScale(SPR.lightSpot) * 1.4 * c.s);
      glow.setTint(0x9ff5ec);
      layers.atmos.add(glow);
      this.crystalGlows.push({ img: glow, phase: this.rng() * 6 });
      const gl = art.img(c.x, c.y, SPR.glint).setAlpha(0);
      layers.atmos.add(gl);
      this.crystalGlints.push({ img: gl, phase: this.rng(), x: c.x + (this.rng() - 0.5) * 20 * c.s, y: c.y - 14 * c.s });
    }
  }

  setReducedMotion(v: boolean): void {
    this.reduced = v;
  }

  /** Запасной путь без фильтра: кристаллы светятся аддитивными пятнами. */
  setFallbackGlow(on: boolean): void {
    for (const c of this.crystalGlows) c.img.setVisible(on);
  }

  obstacleAt(cell: number): Phaser.GameObjects.Image | null {
    return this.obstacles.find((o) => o.cell === cell)?.img ?? null;
  }

  /** Тап по препятствию: объект слегка качается. */
  wobble(cell: number): void {
    const o = this.obstacles.find((q) => q.cell === cell);
    if (!o || this.reduced) return;
    this.scene.tweens.add({ targets: o.img, angle: { from: 5, to: 0 }, duration: 320, ease: 'Elastic.Out' });
  }

  torchPositions(): { x: number; y: number }[] {
    return this.torches.map((t) => ({ x: t.x, y: t.y }));
  }

  update(dt: number, occupied: (cell: number) => boolean): void {
    this.time += dt;
    // Препятствие становится полупрозрачным, если за ним герой, предмет или цель.
    for (const o of this.obstacles) {
      const want = o.above >= 0 && occupied(o.above) ? balance.anim.obstacleFadeAlpha : 1;
      o.alpha += (want - o.alpha) * Math.min(1, dt / 120);
      o.img.setAlpha(o.alpha);
    }
    for (const t of this.torches) {
      t.next -= dt;
      if (t.next <= 0) {
        t.frame = (t.frame + 1 + (this.rng() < 0.2 ? 1 : 0)) % SPR.flames.length;
        this.art.setFrame(t.flame, SPR.flames[t.frame]);
        t.next = 70 + this.rng() * 60;
      }
      // Искры.
      if (!this.reduced && this.rng() < dt / 260) {
        const img = this.art.img(t.x + (this.rng() - 0.5) * 14, t.y, SPR.ember).setBlendMode(Phaser.BlendModes.ADD);
        this.layers.atmos.add(img);
        t.embers.push({ img, life: 1, vx: (this.rng() - 0.5) * 0.03, vy: -0.05 - this.rng() * 0.05 });
      }
      for (let i = t.embers.length - 1; i >= 0; i--) {
        const e = t.embers[i];
        e.life -= dt / 900;
        e.img.x += e.vx * dt + Math.sin(this.time / 120 + i) * 0.2;
        e.img.y += e.vy * dt;
        e.img.setAlpha(Math.max(0, e.life));
        if (e.life <= 0) {
          e.img.destroy();
          t.embers.splice(i, 1);
        }
      }
    }
    for (const c of this.crystalGlows) {
      const p = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin((this.time / balance.light.crystal.pulseMs) * Math.PI * 2 + c.phase);
      c.img.setAlpha(c.img.visible ? 0.25 + 0.25 * p : 0);
    }
    for (const c of this.crystalGlints) {
      const k = ((this.time / 3100 + c.phase) % 1 + 1) % 1;
      const a = k < 0.1 && !this.reduced ? Math.sin((k / 0.1) * Math.PI) : 0;
      c.img.setPosition(c.x, c.y).setAlpha(a);
      c.img.setScale(this.art.baseScale(SPR.glint) * (0.5 + a * 0.5));
    }
  }

  static floorCellAt(level: GeneratedLevel, wx: number, wy: number): number | null {
    const { g } = level;
    if (wx < 0 || wy < 0) return null;
    const x = Math.floor(wx / CELL);
    const y = Math.floor(wy / CELL);
    if (x >= g.cols || y >= g.rows) return null;
    return cellIndex(g, x, y);
  }
}
