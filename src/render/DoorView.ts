// Дверь (раздел 7.5.8) и песочные часы (7.5.9): плита опускается равномерно, шестерни вращаются,
// в щели видно небо и джунгли, луч дневного света на полу сужается вместе со щелью.

import Phaser from 'phaser';
import { hexToInt, mixHex, palette } from '../config/palette';
import type { Art } from '../art/ArtFactory';
import { SPR } from '../art/manifest';
import { CELL, type WorldGeom } from './geometry';
import type { Layers } from './layers';

export const DEPTH = {
  walls: -10_000,
  sky: -6000,
  heroInDoor: -5200,
  slab: -5000,
  frame: -4000,
  wallProps: -3900,
  ledge: 1_000_000,
};

interface Mote {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

export class DoorView {
  private readonly sky: Phaser.GameObjects.Image;
  private readonly skyLate: Phaser.GameObjects.Image;
  private readonly rays: Phaser.GameObjects.Image;
  private readonly slab: Phaser.GameObjects.Image;
  private readonly gears: Phaser.GameObjects.Image[];
  private readonly chains: Phaser.GameObjects.TileSprite[];
  private readonly beam: Phaser.GameObjects.Image;
  private readonly hgSandTop: Phaser.GameObjects.Image;
  private readonly hgSandBottom: Phaser.GameObjects.Image;
  private readonly hgStream: Phaser.GameObjects.Rectangle;
  private readonly motes: Mote[] = [];
  private progress = 0;
  private gearAngle = 0;
  private gearKick = 0;
  private closed = false;
  private reduced = false;
  private readonly slabH: number;
  private readonly slabTexH: number;
  private readonly hg: WorldGeom['hourglass'];
  private readonly sandTexH: number;
  private time = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly art: Art,
    private readonly geom: WorldGeom,
    private readonly layers: Layers,
    private readonly rng: () => number,
  ) {
    const d = geom.door;
    const o = d.opening;
    const D = SPR.door;

    this.sky = art.img(d.cx, 0, D.sky).setDepth(DEPTH.sky);
    this.skyLate = art.img(d.cx, 0, D.skyLate).setDepth(DEPTH.sky + 1).setAlpha(0);
    this.rays = art.img(d.cx, 0, D.rays).setDepth(DEPTH.sky + 2).setBlendMode(Phaser.BlendModes.ADD);
    this.slab = art.img(d.cx, o.y, D.slab).setDepth(DEPTH.slab);
    this.slabTexH = this.slab.frame.height;
    this.slabH = this.slabTexH * this.slab.scaleY;
    const frameL = art.img(o.x, 0, D.frameL).setDepth(DEPTH.frame);
    const frameR = art.img(o.x + o.w, 0, D.frameR).setDepth(DEPTH.frame);
    const lintel = art.img(d.cx, o.y, D.lintel).setDepth(DEPTH.frame + 1);
    const gearY = o.y - d.lintelH * 0.55;
    this.gears = [
      art.img(o.x - d.frameW * 0.55, gearY, D.gear).setDepth(DEPTH.frame + 2),
      art.img(o.x + o.w + d.frameW * 0.55, gearY, D.gear).setDepth(DEPTH.frame + 2),
    ];
    const chainFrame = art.factory.frame(D.chain);
    this.chains = [-1, 1].map((side) => {
      const x = side < 0 ? o.x - d.frameW * 0.55 : o.x + o.w + d.frameW * 0.55;
      const ts = scene.add.tileSprite(x, gearY, chainFrame.w, Math.round((-gearY - 6) * chainFrame.scale), chainFrame.key, chainFrame.frame);
      ts.setOrigin(0.5, 0);
      ts.setScale(1 / chainFrame.scale);
      ts.setDepth(DEPTH.frame + 1.5);
      return ts;
    });
    this.layers.objects.add([this.sky, this.skyLate, this.rays, this.slab, frameL, frameR, lintel, ...this.chains, ...this.gears]);

    // Луч дневного света на полу: аддитивная трапеция, длина равна щели.
    this.beam = art.img(d.cx, -4, D.beam).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.5);
    this.layers.atmos.add(this.beam);
    for (let i = 0; i < 26; i++) {
      const img = art.img(0, 0, SPR.softDot).setBlendMode(Phaser.BlendModes.ADD);
      img.setScale(art.baseScale(SPR.softDot) * (0.25 + this.rng() * 0.35));
      this.layers.atmos.add(img);
      this.motes.push({ img, x: this.rng(), y: this.rng(), vx: (this.rng() - 0.5) * 0.02, vy: -0.01 - this.rng() * 0.02, phase: this.rng() * 6 });
    }

    // Песочные часы.
    this.hg = geom.hourglass;
    const hg = this.hg;
    const frame = art.img(hg.x, hg.y, SPR.hourglass.frame).setDepth(DEPTH.wallProps);
    this.hgSandTop = art.img(hg.x, hg.y - 4, SPR.hourglass.sand).setDepth(DEPTH.wallProps - 2);
    this.hgSandBottom = art.img(hg.x, hg.y + hg.h * 0.43, SPR.hourglass.sand).setDepth(DEPTH.wallProps - 2);
    this.sandTexH = this.hgSandTop.frame.height;
    this.hgStream = scene.add.rectangle(hg.x, hg.y, 2.2, hg.h * 0.4, hexToInt(palette.sand.light)).setOrigin(0.5, 0).setDepth(DEPTH.wallProps - 1);
    const glass = art.img(hg.x, hg.y, SPR.hourglass.glass).setDepth(DEPTH.wallProps + 1);
    this.layers.objects.add([this.hgSandTop, this.hgSandBottom, this.hgStream, frame, glass]);
    this.setProgress(0, 0);
  }

  setReducedMotion(v: boolean): void {
    this.reduced = v;
  }

  /** Доля открытой щели: 1 — дверь поднята, 0 — закрыта. */
  gapFrac(): number {
    return this.closed ? 0 : 1 - this.progress;
  }

  /** Длина луча на полу в мировых единицах. */
  beamLength(): number {
    return CELL * (0.6 + 3.2 * this.gapFrac());
  }

  doorFloorPoint(): { x: number; y: number } {
    return { x: this.geom.door.cx, y: 0 };
  }

  hourglassPos(): { x: number; y: number } {
    return { x: this.hg.x, y: this.hg.y };
  }

  /** p — доля прошедшего времени t/D; late — доля «закатности» цветового сценария. */
  setProgress(p: number, late: number): void {
    this.progress = Math.max(0, Math.min(1, p));
    const o = this.geom.door.opening;
    const gap = this.gapFrac();
    // Нижняя кромка плиты: от верха проёма до пола.
    const bottom = o.y + (1 - gap) * o.h;
    const top = bottom - this.slabH;
    this.slab.y = top;
    // Видна только часть внутри проёма.
    const hiddenPx = Math.max(0, (o.y - top) / this.slab.scaleY);
    this.slab.setCrop(0, hiddenPx, this.slab.frame.width, Math.max(0, this.slabTexH - hiddenPx));

    // Небо: к закату теплеет.
    this.skyLate.setAlpha(late);
    this.rays.setAlpha(0.35 + 0.65 * gap);
    this.rays.setScale(this.art.baseScale(SPR.door.rays), this.art.baseScale(SPR.door.rays) * (0.3 + 0.7 * gap));

    // Луч на полу.
    const len = this.beamLength();
    const beamF = this.art.factory.frame(SPR.door.beam);
    const baseS = 1 / beamF.scale;
    // Высота кадра в пикселях → нужная длина в мировых единицах.
    this.beam.scaleX = baseS * (0.55 + 0.45 * gap);
    this.beam.scaleY = len / beamF.h;
    const col = mixHex(palette.daylight.early, palette.daylight.late, late);
    this.beam.setTint(hexToInt(col));
    this.beam.setAlpha((0.22 + 0.32 * gap) * (gap > 0.001 ? 1 : 0));

    // Песочные часы: верхняя колба пустеет, нижняя наполняется.
    const sh = this.sandTexH;
    const left = 1 - this.progress;
    const topVisible = sh * left;
    this.hgSandTop.setCrop(0, sh - topVisible, this.hgSandTop.frame.width, topVisible);
    const botVisible = sh * this.progress;
    this.hgSandBottom.setCrop(0, sh - botVisible, this.hgSandBottom.frame.width, botVisible);
    this.hgStream.setVisible(!this.closed && left > 0.002);

    // Цепи — звенья ползут вниз вместе с плитой.
    for (const c of this.chains) c.tilePositionY = -this.progress * 220;
  }

  /** Щелчок механизма каждые 10%. */
  notch(): void {
    this.gearKick = 1;
  }

  close(): void {
    this.closed = true;
    this.setProgress(1, 1);
    this.beam.setAlpha(0);
    this.rays.setAlpha(0);
  }

  update(dt: number): void {
    this.time += dt;
    // Шестерни вращаются, пока дверь движется; щелчок дёргает их вперёд.
    const speed = this.closed ? 0 : 0.0009;
    this.gearKick = Math.max(0, this.gearKick - dt / 260);
    this.gearAngle += dt * speed + (this.reduced ? 0 : this.gearKick * 0.012 * dt);
    this.gears[0].rotation = this.gearAngle;
    this.gears[1].rotation = -this.gearAngle;

    // Пылинки в луче.
    const d = this.geom.door;
    const gap = this.gapFrac();
    const len = this.beamLength();
    const wTop = d.opening.w * 0.8;
    const wBot = d.opening.w * (1.5 + 0.4 * gap);
    for (const m of this.motes) {
      if (!this.reduced) {
        m.x += m.vx * dt * 0.01;
        m.y += m.vy * dt * 0.01;
      }
      if (m.y < 0) m.y += 1;
      if (m.x < 0 || m.x > 1) m.vx = -m.vx;
      m.x = Math.min(1, Math.max(0, m.x));
      const yy = m.y * len;
      const w = wTop + (wBot - wTop) * m.y;
      m.img.setPosition(d.cx + (m.x - 0.5) * w, -8 + yy);
      const tw = 0.5 + 0.5 * Math.sin(this.time / 600 + m.phase);
      m.img.setAlpha(gap > 0.001 ? (0.15 + 0.55 * tw) * (1 - m.y * 0.7) : 0);
    }
    if (!this.closed) this.hgStream.alpha = 0.6 + 0.4 * Math.sin(this.time / 50);
  }

  destroy(): void {
    for (const m of this.motes) m.img.destroy();
  }
}
