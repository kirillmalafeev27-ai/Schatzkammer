// Герой (раздел 7.5.7): собран из частей-контейнеров, анимации — на твинах.
// Наклон и мешок зависят от цены шага; брови — главный носитель эмоции.

import Phaser from 'phaser';
import { balance, stepAnimMs } from '../config/balance';
import type { Art } from '../art/ArtFactory';
import { SPR } from '../art/manifest';
import { HERO_RIG as R } from '../art/recipes/hero';

type Mood = 'neutral' | 'worried' | 'strain' | 'happy';

export interface HeroPose {
  cost: number;
  ready: boolean;
  alarm: boolean;
}

export class HeroView {
  readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Container;
  private readonly upper: Phaser.GameObjects.Container;
  private readonly headC: Phaser.GameObjects.Container;
  private readonly legB: Phaser.GameObjects.Image;
  private readonly legF: Phaser.GameObjects.Image;
  private readonly bootB: Phaser.GameObjects.Image;
  private readonly bootF: Phaser.GameObjects.Image;
  private readonly bag: Phaser.GameObjects.Image;
  private readonly torso: Phaser.GameObjects.Image;
  private readonly armB: Phaser.GameObjects.Image;
  private readonly armF: Phaser.GameObjects.Image;
  private readonly lantern: Phaser.GameObjects.Image;
  private readonly scarf: Phaser.GameObjects.Image;
  private readonly scarfTail: Phaser.GameObjects.Image;
  private readonly headImg: Phaser.GameObjects.Image;
  private readonly eyes: Phaser.GameObjects.Image;
  private readonly brows: Phaser.GameObjects.Image;
  private readonly mouth: Phaser.GameObjects.Image;
  private readonly hat: Phaser.GameObjects.Image;
  private readonly sweat: Phaser.GameObjects.Image;
  private readonly pips: Phaser.GameObjects.Container;
  private pipImgs: Phaser.GameObjects.Image[] = [];

  private facing: 1 | -1 = 1;
  private lean = 0;
  private mood: Mood = 'neutral';
  private blinkAt = 0;
  private blinkUntil = 0;
  private hopping = false;
  private time = 0;
  private lookBackUntil = 0;
  private nextLookBack = 0;
  private reduced = false;
  private scarfLag = 0;
  private stepping: Phaser.Tweens.Tween | null = null;
  private pose: HeroPose = { cost: 1, ready: false, alarm: false };
  private readonly rng: () => number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: Art,
    x: number,
    y: number,
    rng: () => number,
  ) {
    this.rng = rng;
    const H = SPR.hero;
    this.root = scene.add.container(x, y);
    this.destX = x;
    this.destY = y;
    this.body = scene.add.container(0, 0);
    this.upper = scene.add.container(R.upper.x, R.upper.y);
    this.headC = scene.add.container(R.head.x, R.head.y);

    this.bag = art.img(R.bag.x, R.bag.y, H.bag[0]);
    this.legB = art.img(R.legB.x, R.legB.y, H.legB);
    this.legF = art.img(R.legF.x, R.legF.y, H.legF);
    this.bootB = art.img(R.bootB.x, R.bootB.y, H.bootB);
    this.bootF = art.img(R.bootF.x, R.bootF.y, H.bootF);
    this.armB = art.img(R.armB.x, R.armB.y, H.armB);
    this.torso = art.img(R.torso.x, R.torso.y, H.torso);
    this.lantern = art.img(R.lantern.x, R.lantern.y, H.lantern);
    this.scarfTail = art.img(R.scarfTail.x, R.scarfTail.y, H.scarfTail);
    this.scarf = art.img(R.scarf.x, R.scarf.y, H.scarf);
    this.armF = art.img(R.armF.x, R.armF.y, H.armF);
    this.headImg = art.img(0, 0, H.head);
    this.eyes = art.img(R.eyes.x, R.eyes.y, H.eyes);
    this.brows = art.img(R.brows.x, R.brows.y, H.browsNeutral);
    this.mouth = art.img(R.mouth.x, R.mouth.y, H.mouthSmile);
    this.hat = art.img(R.hat.x, R.hat.y, H.hat);
    this.sweat = art.img(R.sweat.x, R.sweat.y, H.sweat).setVisible(false);

    this.headC.add([this.headImg, this.eyes, this.brows, this.mouth, this.hat, this.sweat]);
    this.upper.add([
      this.bag,
      this.armB,
      this.torso,
      this.lantern,
      this.scarfTail,
      this.scarf,
      this.headC,
      this.armF,
    ]);
    this.body.add([this.legB, this.bootB, this.legF, this.bootF, this.upper]);
    this.pips = scene.add.container(0, R.pips.y);
    this.root.add([this.body]);
    this.blinkAt = 1500 + rng() * 2000;
    this.nextLookBack = 2000;
  }

  /** Сапоги-заряды над героем: живут в слое поверх света. */
  get pipsContainer(): Phaser.GameObjects.Container {
    return this.pips;
  }

  setReducedMotion(v: boolean): void {
    this.reduced = v;
  }

  get x(): number {
    return this.root.x;
  }
  get y(): number {
    return this.root.y;
  }
  /** Куда герой придёт после текущего прыжка (для раскладки слов-звуков). */
  destX = 0;
  destY = 0;

  /** Мировая позиция фонаря (для света). */
  lanternPos(): { x: number; y: number } {
    const m = this.lantern.getWorldTransformMatrix();
    return { x: m.tx, y: m.ty };
  }

  setFacing(f: 1 | -1): void {
    this.facing = f;
    this.body.scaleX = f;
  }

  setPips(have: number, need: number): void {
    while (this.pipImgs.length < need) {
      const im = this.art.img(0, 0, SPR.pipEmpty);
      this.pips.add(im);
      this.pipImgs.push(im);
    }
    const spacing = 30;
    this.pipImgs.forEach((im, i) => {
      im.setVisible(i < need);
      if (i >= need) return;
      im.x = (i - (need - 1) / 2) * spacing;
      const want = i < have ? SPR.pipFull : SPR.pipEmpty;
      if (im.frame.name !== this.art.factory.frame(want).frame) {
        this.art.setFrame(im, want);
        if (i < have && !this.reduced) {
          im.setScale(this.art.baseScale(want) * 1.5);
          this.scene.tweens.add({
            targets: im,
            scale: this.art.baseScale(want),
            duration: 220,
            ease: 'Back.Out',
          });
        }
      }
    });
  }

  setPose(p: HeroPose): void {
    const costChanged = p.cost !== this.pose.cost;
    this.pose = p;
    if (costChanged) this.applyCost(p.cost);
    const mood: Mood = p.alarm ? 'worried' : p.cost >= 3 ? 'strain' : 'neutral';
    this.setMood(mood);
  }

  private applyCost(cost: number): void {
    const leanTable = balance.anim.heroLeanDeg;
    this.lean = leanTable[Math.min(leanTable.length - 1, Math.max(0, cost - 1))];
    const stage = Math.min(SPR.hero.bag.length - 1, Math.max(0, cost - 1));
    this.art.setFrame(this.bag, SPR.hero.bag[stage]);
    if (!this.reduced) {
      this.bag.setScale(this.art.baseScale(SPR.hero.bag[stage]) * 1.25);
      this.scene.tweens.add({
        targets: this.bag,
        scale: this.art.baseScale(SPR.hero.bag[stage]),
        duration: 260,
        ease: 'Back.Out',
      });
    }
    this.sweat.setVisible(cost >= balance.anim.sweatFromCost);
  }

  setMood(m: Mood): void {
    if (m === this.mood) return;
    this.mood = m;
    const H = SPR.hero;
    const brows = {
      neutral: H.browsNeutral,
      worried: H.browsWorried,
      strain: H.browsStrain,
      happy: H.browsHappy,
    }[m];
    const mouth = { neutral: H.mouthSmile, worried: H.mouthFlat, strain: H.mouthGrit, happy: H.mouthOpen }[m];
    this.art.setFrame(this.brows, brows);
    this.art.setFrame(this.mouth, mouth);
  }

  /** Шаг: прыжок с приплющиванием при приземлении и запаздывающим шарфом. */
  hopTo(x: number, y: number, cost: number, onLand?: () => void): void {
    const dur = stepAnimMs(cost);
    this.stepping?.stop();
    this.destX = x;
    this.destY = y;
    const fromX = this.root.x;
    const fromY = this.root.y;
    const hopH = this.reduced ? 0 : 16 + 4 * Math.max(0, 3 - cost);
    this.hopping = true;
    this.scarfLag = 1;
    const st = { t: 0 };
    this.stepping = this.scene.tweens.add({
      targets: st,
      t: 1,
      duration: dur,
      ease: 'Sine.InOut',
      onUpdate: () => {
        const t = st.t;
        this.root.x = fromX + (x - fromX) * t;
        this.root.y = fromY + (y - fromY) * t - Math.sin(Math.PI * t) * hopH;
        const stretch = this.reduced ? 1 : 1 + 0.08 * Math.sin(Math.PI * t);
        this.body.scaleY = stretch;
        this.body.scaleX = this.facing / Math.sqrt(stretch);
      },
      onComplete: () => {
        this.root.setPosition(x, y);
        this.hopping = false;
        this.stepping = null;
        onLand?.();
        if (!this.reduced) {
          const squash = 0.82 - 0.03 * Math.min(4, cost - 1);
          this.body.scaleY = squash;
          this.body.scaleX = this.facing * (2 - squash);
          this.scene.tweens.add({
            targets: this.body,
            scaleY: 1,
            scaleX: this.facing,
            duration: 140,
            ease: 'Back.Out',
          });
        } else {
          this.body.scaleY = 1;
          this.body.scaleX = this.facing;
        }
      },
    });
  }

  /** Мгновенно поставить в клетку (поворот экрана, старт). */
  place(x: number, y: number): void {
    this.stepping?.stop();
    this.stepping = null;
    this.hopping = false;
    this.root.setPosition(x, y);
    this.destX = x;
    this.destY = y;
    this.body.setScale(this.facing, 1);
  }

  /** Качнуться на месте (тап по препятствию у героя, отказ). */
  shrug(): void {
    if (this.reduced) return;
    this.scene.tweens.add({
      targets: this.headC,
      angle: { from: -8, to: 0 },
      duration: 260,
      ease: 'Back.Out',
    });
  }

  celebrate(): void {
    this.setMood('happy');
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    const H = SPR.hero;

    // Дыхание.
    const breath = this.reduced ? 0 : Math.sin((t / balance.anim.breatheMs) * Math.PI * 2);
    this.torso.scaleY = this.art.baseScale(H.torso) * (1 + 0.025 * breath);
    this.headC.y = R.head.y - 1.2 * breath;
    // Руки покачиваются при ходьбе.
    const swing = this.hopping && !this.reduced ? Math.sin(t / 45) * 14 : Math.sin(t / 700) * 2;
    this.armF.angle = swing;
    this.armB.angle = -swing;

    // Наклон корпуса по весу (в сторону взгляда — у контейнера уже есть scaleX).
    const leanRad = Phaser.Math.DegToRad(this.lean);
    this.upper.rotation += (leanRad - this.upper.rotation) * Math.min(1, dt / 120);
    this.headC.rotation = -this.upper.rotation * 0.45;

    // Моргание раз в 3–5 с.
    if (t >= this.blinkAt) {
      this.blinkUntil = t + 120;
      this.blinkAt =
        t + balance.anim.blinkMinMs + this.rng() * (balance.anim.blinkMaxMs - balance.anim.blinkMinMs);
    }
    // Тревога: время от времени оглядывается на дверь.
    let eyes: string = H.eyes;
    if (this.pose.alarm) {
      if (t >= this.nextLookBack) {
        this.lookBackUntil = t + 700;
        this.nextLookBack = t + 1800 + this.rng() * 1500;
      }
      if (t < this.lookBackUntil) eyes = H.eyesBack;
    } else if (this.pose.ready) {
      eyes = H.eyesFront;
    }
    if (t < this.blinkUntil) eyes = H.eyesClosed;
    if (this.eyes.frame.name !== this.art.factory.frame(eyes).frame) this.art.setFrame(this.eyes, eyes);

    // Готовность: притоптывает.
    if (this.pose.ready && !this.hopping && !this.reduced) {
      const tap = Math.max(0, Math.sin(t / 110));
      this.bootF.y = R.bootF.y - tap * 4;
      this.bootF.angle = -tap * 14;
    } else {
      this.bootF.y = R.bootF.y;
      this.bootF.angle = 0;
    }

    // Шарф догоняет после шага, фонарь покачивается.
    this.scarfLag = Math.max(0, this.scarfLag - dt / 380);
    const flap = this.reduced ? 0 : Math.sin(t / 160) * 4 * (0.3 + this.scarfLag);
    this.scarfTail.angle = -10 - 26 * this.scarfLag + flap;
    this.lantern.angle = this.reduced ? 0 : Math.sin(t / 420) * 6 + (this.hopping ? 10 : 0);

    // Пот.
    if (this.sweat.visible) {
      const k = (((t / 700) % 1) + 1) % 1;
      this.sweat.y = R.sweat.y + k * 14;
      this.sweat.alpha = 1 - k;
    }

    // Сапоги-заряды покачиваются над головой.
    this.pips.setPosition(this.root.x, this.root.y + R.pips.y + (this.reduced ? 0 : Math.sin(t / 300) * 1.5));
  }

  setVisible(v: boolean): void {
    this.root.setVisible(v);
    this.pips.setVisible(v);
  }

  destroy(): void {
    this.stepping?.stop();
    this.root.destroy();
    this.pips.destroy();
  }
}
