// Сочность (раздел 9): слова-звуки, тряска, удар-зум, вспышки, хит-стоп, отсчёт.
// Ничто не блокирует ввод и не останавливает часы. В режиме «меньше движения» —
// ни тряски, ни зума, ни вспышек, слова появляются без прыжка.

import Phaser from 'phaser';
import { balance } from '../config/balance';
import { hexToInt, palette } from '../config/palette';
import type { Art, SfxStyle } from '../art/ArtFactory';
import { countdownDe, countdownRu, sfxDe, sfxRu, type SfxKey } from '../i18n/sfx.de';
import { CELL } from './geometry';
import type { Layers } from './layers';

export type WordSize = 'small' | 'big' | 'huge';

interface Word {
  img: Phaser.GameObjects.Image;
  born: number;
  dead: boolean;
}

const STYLE: Record<SfxKey, { fill: string; outer: string; size: WordSize; burst?: string }> = {
  los: { fill: palette.caption, outer: palette.hero.scarf, size: 'big', burst: palette.paper },
  kling: { fill: palette.gold.light, outer: palette.gold.shadow, size: 'small' },
  funkel: { fill: palette.white, outer: palette.sapphire.base, size: 'big' },
  aechz: { fill: palette.hero.shirt, outer: palette.hero.scarf, size: 'small' },
  puh: { fill: palette.white, outer: palette.good, size: 'small' },
  klirr: { fill: palette.white, outer: palette.ironLight, size: 'small' },
  hoppla: { fill: palette.caption, outer: palette.bad, size: 'small' },
  riesel: { fill: palette.sand.light, outer: palette.sand.shadow, size: 'small' },
  plumps: { fill: palette.sand.base, outer: palette.rock.shadow, size: 'small' },
  knirsch: { fill: palette.doorStone.light, outer: palette.bronze.shadow, size: 'big' },
  voll: { fill: palette.white, outer: palette.bad, size: 'small' },
  geschafft: { fill: palette.caption, outer: palette.good, size: 'huge', burst: palette.paper },
  knapp: { fill: palette.white, outer: palette.hero.scarf, size: 'huge', burst: palette.caption },
  rumms: { fill: palette.white, outer: palette.rock.shadow, size: 'huge', burst: palette.doorStone.light },
  zuSpaet: { fill: palette.bad, outer: palette.ink, size: 'huge', burst: palette.paper },
};

const SIZE_PX: Record<WordSize, number> = { small: 34, big: 46, huge: 74 };

export interface Avoid {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Juice {
  private readonly words: Word[] = [];
  private time = 0;
  private shakeAmp = 0;
  private shakeUntil = 0;
  private shakeDur = 1;
  private punchMul = 1;
  private punchDur = 1;
  private punchAt = -1e9;
  private readonly flashRect: Phaser.GameObjects.Rectangle;
  private flashTimes: number[] = [];
  private hitStopUntil = 0;
  reduced = false;
  lang: 'de' | 'ru' = 'de';
  /** Зоны, которые слова не должны закрывать (герой). */
  avoid: () => Avoid | null = () => null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: Art,
    private readonly layers: Layers,
  ) {
    this.flashRect = scene.add.rectangle(0, 0, 10, 10, 0xffffff, 1).setOrigin(0, 0).setAlpha(0).setVisible(false);
    layers.overlay.add(this.flashRect);
  }

  private styleFor(key: SfxKey): SfxStyle {
    const s = STYLE[key];
    return { fill: s.fill, outer: s.outer, size: SIZE_PX[s.size], burst: s.burst ?? null, skew: -0.12 };
  }

  text(key: SfxKey): string {
    return (this.lang === 'de' ? sfxDe : sfxRu)[key];
  }

  /** Слово-звук над событием, со смещением вверх; не больше трёх одновременно. */
  word(key: SfxKey, x: number, y: number, opts: { lift?: number; scale?: number } = {}): void {
    const style = this.styleFor(key);
    this.spawn(this.text(key), style, x, y - (opts.lift ?? CELL * 0.75), opts.scale ?? 1);
  }

  countdown(n: number, x: number, y: number): void {
    const digit: SfxStyle = { fill: n <= 3 ? palette.bad : palette.caption, outer: palette.ink, size: 96, burst: null, skew: -0.1 };
    const wordStyle: SfxStyle = { fill: palette.white, outer: n <= 3 ? palette.bad : palette.hero.scarf, size: 30, burst: null, skew: -0.1 };
    const label = (this.lang === 'de' ? countdownDe : countdownRu)[n] ?? '';
    this.spawn(String(n), digit, x, y, 1, true);
    this.spawn(label, wordStyle, x, y + 70, 1, true);
  }

  private spawn(text: string, style: SfxStyle, x: number, y: number, scale: number, fixed = false): void {
    while (this.words.filter((w) => !w.dead).length >= balance.anim.maxSfxWords) {
      const oldest = this.words.find((w) => !w.dead);
      if (!oldest) break;
      this.kill(oldest, true);
    }
    const img = this.art.sfx(x, y, text, style);
    const base = img.scaleX * scale;
    // Не закрывать героя: сдвигаем вбок или выше.
    if (!fixed) {
      const av = this.avoid();
      if (av) {
        const hw = img.displayWidth / 2;
        const hh = img.displayHeight / 2;
        const overlap = (px: number, py: number) =>
          px + hw > av.x && px - hw < av.x + av.w && py + hh > av.y && py - hh < av.y + av.h;
        if (overlap(img.x, img.y)) {
          const cands = [
            [img.x, av.y - hh - 6],
            [av.x - hw - 8, img.y],
            [av.x + av.w + hw + 8, img.y],
          ];
          for (const [cx, cy] of cands) {
            if (!overlap(cx, cy)) {
              img.setPosition(cx, cy);
              break;
            }
          }
        }
      }
    }
    this.layers.overlay.add(img);
    const w: Word = { img, born: this.time, dead: false };
    this.words.push(w);
    if (this.reduced) {
      img.setScale(base);
    } else {
      img.setScale(base * 0.35);
      img.angle = -8;
      this.scene.tweens.add({ targets: img, scale: base, angle: -3, duration: 190, ease: 'Back.Out' });
    }
    this.scene.time.delayedCall(balance.anim.sfxWordMs - 300, () => this.kill(w, false));
  }

  private kill(w: Word, fast: boolean): void {
    if (w.dead) return;
    w.dead = true;
    if (fast || this.reduced) {
      this.scene.tweens.add({ targets: w.img, alpha: 0, duration: fast ? 80 : 200, onComplete: () => w.img.destroy() });
    } else {
      this.scene.tweens.add({
        targets: w.img,
        alpha: 0,
        y: w.img.y - 24,
        duration: 300,
        ease: 'Quad.In',
        onComplete: () => w.img.destroy(),
      });
    }
    this.scene.time.delayedCall(320, () => {
      const i = this.words.indexOf(w);
      if (i >= 0) this.words.splice(i, 1);
    });
  }

  /** Тряска в экранных пикселях. */
  shake(px: number, ms = 220): void {
    if (this.reduced) return;
    this.shakeAmp = Math.max(this.shakeAmp * this.shakeLeft(), px);
    this.shakeDur = ms;
    this.shakeUntil = this.time + ms;
  }

  private shakeLeft(): number {
    return Math.max(0, (this.shakeUntil - this.time) / this.shakeDur);
  }

  punch(mul = balance.anim.zoomPunch, ms = 260): void {
    if (this.reduced) return;
    this.punchMul = mul;
    this.punchDur = ms;
    this.punchAt = this.time;
  }

  /** Вспышка не чаще трёх раз в секунду. */
  flash(color: string = palette.white, ms = 220, alpha = 0.85): void {
    if (this.reduced) return;
    this.flashTimes = this.flashTimes.filter((t) => this.time - t < 1000);
    if (this.flashTimes.length >= balance.anim.maxFlashesPerSec) return;
    this.flashTimes.push(this.time);
    const cam = this.scene.cameras.main;
    const v = cam.worldView;
    this.flashRect.setPosition(v.x - 50, v.y - 50).setSize(v.width + 100, v.height + 100);
    this.flashRect.setFillStyle(hexToInt(color), 1);
    this.flashRect.setVisible(true).setAlpha(alpha);
    this.scene.tweens.add({ targets: this.flashRect, alpha: 0, duration: ms, ease: 'Quad.Out', onComplete: () => this.flashRect.setVisible(false) });
  }

  /** Хит-стоп замораживает только картинку мира. */
  hitStop(ms = balance.anim.hitStopMs): void {
    if (this.reduced) return;
    this.hitStopUntil = Math.max(this.hitStopUntil, performance.now() + ms);
  }

  frozen(): boolean {
    return performance.now() < this.hitStopUntil;
  }

  /** Смещение камеры (экранные пиксели) и множитель зума на этот кадр. */
  cameraOffsets(): { dx: number; dy: number; zoomMul: number } {
    let dx = 0;
    let dy = 0;
    const k = this.shakeLeft();
    if (k > 0) {
      const a = this.shakeAmp * k;
      dx = (Math.random() * 2 - 1) * a;
      dy = (Math.random() * 2 - 1) * a;
    }
    let zoomMul = 1;
    const pt = (this.time - this.punchAt) / this.punchDur;
    if (pt >= 0 && pt < 1) zoomMul = 1 + (this.punchMul - 1) * Math.sin(Math.PI * pt) * (1 - pt * 0.3);
    return { dx, dy, zoomMul };
  }

  update(dt: number): void {
    this.time += dt;
    this.scene.tweens.timeScale = this.frozen() ? 0.0001 : 1;
  }

  clear(): void {
    for (const w of this.words) w.img.destroy();
    this.words.length = 0;
  }
}
