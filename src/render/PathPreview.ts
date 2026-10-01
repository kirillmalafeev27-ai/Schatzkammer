// Подсказка следов (раздел 2.8, 7.5.13–14): отпечатки сапог до цели и от цели до выхода,
// окрашенные по риску; подсветка цели с бегущим пунктиром и значок с числом шагов.

import Phaser from 'phaser';
import type { TrailMode } from '../config/levels';
import { hexToInt, palette } from '../config/palette';
import type { Art } from '../art/ArtFactory';
import { SPR } from '../art/manifest';
import { cellXY, exitIndex, type GridShape } from '../core/grid';
import type { RiskLevel, RouteEstimate } from '../core/risk';
import { cellCenter, CELL } from './geometry';
import type { Layers } from './layers';

export class PathPreview {
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private used = 0;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly ants: Phaser.GameObjects.Graphics;
  private readonly badge: Phaser.GameObjects.Image;
  private readonly badgeText: Phaser.GameObjects.Text;
  private target: number | null = null;
  private time = 0;
  private reduced = false;
  private lastKey = '';
  private visible = true;

  constructor(
    scene: Phaser.Scene,
    private readonly art: Art,
    private readonly layers: Layers,
    private readonly g: GridShape,
  ) {
    this.glow = art.img(0, 0, SPR.targetGlow).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
    this.ants = scene.add.graphics();
    this.badge = art.img(0, 0, SPR.badge).setVisible(false);
    this.badgeText = scene.add
      .text(0, 0, '', {
        fontFamily: 'Rubik',
        fontStyle: '900',
        fontSize: '30px',
        color: palette.ink,
        align: 'center',
      })
      .setOrigin(0.5, 0.56)
      .setVisible(false);
    layers.overlay.add([this.glow, this.ants]);
  }

  /** Значок рисуется поверх следов. */
  attachBadge(): void {
    this.layers.overlay.add([this.badge, this.badgeText]);
  }

  setReducedMotion(v: boolean): void {
    this.reduced = v;
  }

  setVisible(v: boolean): void {
    this.visible = v;
    if (!v) {
      this.hideAll();
      this.lastKey = '';
    }
  }

  private hideAll(): void {
    for (let i = 0; i < this.pool.length; i++) this.pool[i].setVisible(false);
    this.used = 0;
    this.glow.setVisible(false);
    this.badge.setVisible(false);
    this.badgeText.setVisible(false);
    this.ants.clear();
  }

  private print(name: string, x: number, y: number, angle: number, alpha: number): void {
    let im = this.pool[this.used];
    if (!im) {
      im = this.art.img(0, 0, name);
      this.layers.overlay.addAt(im, 0);
      this.pool.push(im);
    } else if (im.frame.name !== this.art.factory.frame(name).frame) this.art.setFrame(im, name);
    im.setPosition(x, y);
    im.setRotation(angle);
    im.setAlpha(alpha);
    im.setVisible(true);
    this.used++;
  }

  /**
   * Перерисовать следы. heroCell — клетка героя (над ней следы не рисуются, чтобы не закрыть голову).
   */
  update(
    dt: number,
    est: RouteEstimate | null,
    hero: number,
    target: number | null,
    mode: TrailMode,
    hintsOn: boolean,
  ): void {
    this.time += dt;
    this.target = target;
    if (!this.visible) return;
    const show = hintsOn && mode !== 'none' && est != null;
    const key = show
      ? `${hero}|${target}|${est.level}|${est.toTarget?.path.join(',')}|${est.toExit.path.join(',')}|${mode}`
      : `none|${target}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      for (let i = 0; i < this.used; i++) this.pool[i].setVisible(false);
      this.used = 0;
      if (show && est) {
        const style = mode === 'risk' ? est.level : 'plain';
        let from = hero;
        if (est.toTarget?.reachable) {
          for (const c of est.toTarget.path) {
            this.stepPrints(from, c, hero, style, 1);
            from = c;
          }
        }
        for (const c of est.toExit.path) {
          this.stepPrints(from, c, hero, style, 0.42);
          from = c;
        }
      }
      for (let i = this.used; i < this.pool.length; i++) this.pool[i].setVisible(false);
      // Значок с числом шагов у цели.
      if (target != null) {
        const steps = est?.toTarget?.reachable
          ? est.toTarget.path.length
          : est && target === exitIndex(this.g)
            ? est.toExit.path.length
            : 0;
        const c = this.markerPos(target);
        this.badge.setPosition(c.x + CELL * 0.3, c.y - CELL * 0.32).setVisible(steps > 0);
        this.badgeText
          .setText(String(steps))
          .setPosition(this.badge.x, this.badge.y)
          .setVisible(steps > 0);
        this.badgeText.setScale(steps > 9 ? 0.8 : 1);
      } else {
        this.badge.setVisible(false);
        this.badgeText.setVisible(false);
      }
    }
    this.drawTarget();
  }

  private markerPos(cell: number): { x: number; y: number } {
    return cellCenter(this.g, cell);
  }

  private stepPrints(
    from: number,
    to: number,
    hero: number,
    style: RiskLevel | 'plain',
    alpha: number,
  ): void {
    const a = cellXY(this.g, from);
    const b = cellXY(this.g, to);
    const h = cellXY(this.g, hero);
    // Клетка прямо над героем: там его голова — следы не рисуем.
    if (b.x === h.x && b.y === h.y - 1) return;
    if (to === exitIndex(this.g)) return;
    const c = cellCenter(this.g, to);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const ang = Math.atan2(dy, dx) + Math.PI / 2;
    const px = -dy;
    const py = dx;
    const set = style === 'plain' ? SPR.print.plain : SPR.print[style];
    const off = 13;
    const along = 12;
    this.print(set[0], c.x + px * off - dx * along, c.y + py * off - dy * along, ang, alpha);
    this.print(set[1], c.x - px * off + dx * along, c.y - py * off + dy * along, ang, alpha);
  }

  private drawTarget(): void {
    const g = this.ants;
    g.clear();
    if (this.target == null || !this.visible) {
      this.glow.setVisible(false);
      return;
    }
    const c = this.markerPos(this.target);
    const exit = this.target === exitIndex(this.g);
    const w = exit ? CELL * 0.84 : CELL - 14;
    const h = exit ? CELL * 1.2 : CELL - 14;
    const cy = exit ? -CELL * 0.62 : c.y;
    this.glow.setVisible(true).setPosition(c.x, cy);
    const pulse = this.reduced ? 0.6 : 0.5 + 0.25 * Math.sin(this.time / 220);
    this.glow.setAlpha(pulse);
    this.glow.setScale(
      this.art.baseScale(SPR.targetGlow) * (w / (CELL - 14)),
      this.art.baseScale(SPR.targetGlow) * (h / (CELL - 14)),
    );
    // Бегущий пунктир тушью по контуру.
    const x0 = c.x - w / 2;
    const y0 = cy - h / 2;
    const dash = 14;
    const gap = 9;
    const per = dash + gap;
    const offset = this.reduced ? 0 : (this.time / 28) % per;
    const perim = 2 * (w + h);
    const pointAt = (s: number): [number, number] => {
      s = ((s % perim) + perim) % perim;
      if (s < w) return [x0 + s, y0];
      s -= w;
      if (s < h) return [x0 + w, y0 + s];
      s -= h;
      if (s < w) return [x0 + w - s, y0 + h];
      s -= w;
      return [x0, y0 + h - s];
    };
    const drawDashes = (width: number, color: number) => {
      g.lineStyle(width, color, 1);
      for (let s = -offset; s < perim; s += per) {
        const a0 = Math.max(0, s);
        const a1 = Math.min(perim, s + dash);
        if (a1 <= a0) continue;
        g.beginPath();
        const [sx, sy] = pointAt(a0);
        g.moveTo(sx, sy);
        // Несколько точек на штрих — чтобы он честно огибал углы.
        const steps = 6;
        for (let k = 1; k <= steps; k++) {
          const [x, y] = pointAt(a0 + ((a1 - a0) * k) / steps);
          g.lineTo(x, y);
        }
        g.strokePath();
      }
    };
    drawDashes(7, hexToInt(palette.ink));
    drawDashes(3.5, hexToInt(palette.caption));
  }

  destroy(): void {
    for (const p of this.pool) p.destroy();
    this.glow.destroy();
    this.ants.destroy();
    this.badge.destroy();
    this.badgeText.destroy();
  }
}
