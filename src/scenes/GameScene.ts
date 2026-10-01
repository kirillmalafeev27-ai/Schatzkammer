// Сцена мира. Читает состояние раунда и реагирует на события; состояние не меняет.
// Умеет режим заставки для меню: случайный зал с героем и светом из двери.

import Phaser from 'phaser';
import { balance } from '../config/balance';
import type { TrailMode } from '../config/levels';
import { hexToInt, hexToRgb01, palette } from '../config/palette';
import { Art, type ArtFactory } from '../art/ArtFactory';
import { SPR, TEX } from '../art/manifest';
import type { GameEvent } from '../core/events';
import { exitIndex, cellXY, neighbors, startIndex } from '../core/grid';
import type { GeneratedLevel } from '../core/levelGen';
import { hashSeed, mulberry32 } from '../core/rng';
import { isGem } from '../core/rules';
import { currentCost, awaitingTarget, remainingMs, type GameState } from '../core/state';
import type { Round } from '../game/Round';
import { blend, registerBlendModes } from '../render/blend';
import { ComicLightController, registerComicLight } from '../render/ComicLightFilter';
import { DEPTH, DoorView } from '../render/DoorView';
import { cellBase, CELL, worldGeom, type WorldGeom } from '../render/geometry';
import { HeroView } from '../render/HeroView';
import { ItemView } from '../render/ItemView';
import { createLayers, litLayers, type Layers } from '../render/layers';
import { ambientRgb, computeLights } from '../render/lights';
import { PathPreview } from '../render/PathPreview';
import { SandView } from '../render/SandView';
import { WorldView } from '../render/WorldView';
import { Juice } from '../render/juice';

/** Матрица вида камеры (мир → пиксели камеры); в типах Phaser её нет. */
function camMatrix(cam: Phaser.Cameras.Scene2D.Camera): Phaser.GameObjects.Components.TransformMatrix {
  return (cam as unknown as { matrix: Phaser.GameObjects.Components.TransformMatrix }).matrix;
}

export interface SceneBridge {
  onSceneReady(scene: GameScene): void;
  onFrame(dtMs: number): void;
  onTapCell(cell: number): void;
  onTapHero(): void;
  onTapObstacle(cell: number): void;
  /** Где на канве (CSS px) лежит плашка мешка — туда летят монеты. */
  bagTarget(): { x: number; y: number } | null;
  trailMode(): TrailMode;
  trailHints(): boolean;
  reducedMotion(): boolean;
  sfxLang(): 'de' | 'ru';
}

export interface ViewOptions {
  lightEnabled: boolean;
}

export class GameScene extends Phaser.Scene {
  bridge!: SceneBridge;
  factory!: ArtFactory;
  art!: Art;
  layers!: Layers;
  private overlayCam!: Phaser.Cameras.Scene2D.Camera;
  private light: ComicLightController | null = null;
  private lightSupported = false;
  private fallback: Phaser.GameObjects.Image[] = [];
  private vignette: Phaser.GameObjects.Image | null = null;

  geom: WorldGeom | null = null;
  level: GeneratedLevel | null = null;
  round: Round | null = null;
  private world: WorldView | null = null;
  hero: HeroView | null = null;
  items: ItemView | null = null;
  door: DoorView | null = null;
  private sand: SandView | null = null;
  private path: PathPreview | null = null;
  juice!: Juice;
  private unsub: (() => void) | null = null;
  private mode: 'none' | 'attract' | 'round' = 'none';
  private attractState: GameState | null = null;
  private attractNext = 0;
  private attractRng = mulberry32(1);
  private cssW = 1;
  private cssH = 1;
  private dpr = 1;
  private baseZoom = 1;
  /** Сколько CSS px сверху занимает плашка мешка — зал вписывается ниже. */
  private topReserve = 0;
  private camOffsetY = 0;
  private lastFrame = 0;
  private elapsed = 0;
  private lockedAnim = false;
  private darkness = 0;
  private lastRiesel = -1e9;
  private heartbeat = 0;
  /** Обзор зала на интро: камера чуть отъезжает. */
  private introZoom = 1;
  private readonly timeQueue: { at: number; fn: () => void }[] = [];

  constructor() {
    super('game');
  }

  init(data: { bridge: SceneBridge; factory: ArtFactory }): void {
    this.bridge = data.bridge;
    this.factory = data.factory;
  }

  create(): void {
    registerBlendModes(this.renderer);
    this.art = new Art(this, this.factory);
    this.layers = createLayers(this);
    const main = this.cameras.main;
    main.setBackgroundColor(palette.caveDeep);
    this.overlayCam = this.cameras.add(0, 0, this.scale.width, this.scale.height, false, 'overlay');
    main.ignore(this.layers.overlay);
    this.overlayCam.ignore(litLayers(this.layers));

    const renderer = this.renderer;
    if (renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      this.lightSupported = registerComicLight(renderer);
      if (this.lightSupported) {
        try {
          this.light = main.filters.internal.add(new ComicLightController(main)) as ComicLightController;
          this.light.ambient = ambientRgb();
        } catch (e) {
          console.warn('ComicLight: не удалось включить фильтр', e);
          this.lightSupported = false;
          this.light = null;
        }
      }
    }

    this.juice = new Juice(this, this.art, this.layers);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointer(p));
    this.lastFrame = performance.now();
    this.bridge.onSceneReady(this);
  }

  // ── Освещение ──────────────────────────────────────────────────────────────

  get lightActive(): boolean {
    return !!this.light && this.light.active;
  }

  hasLightSupport(): boolean {
    return this.lightSupported;
  }

  setLightEnabled(on: boolean): void {
    if (this.light) this.light.setActive(on && this.lightSupported);
    this.updateFallbackVisibility();
  }

  private updateFallbackVisibility(): void {
    const fb = !this.lightActive;
    for (const f of this.fallback) f.setVisible(fb);
    this.vignette?.setVisible(fb);
    this.world?.setFallbackGlow(fb);
  }

  // ── Сборка мира ────────────────────────────────────────────────────────────

  private teardown(): void {
    this.unsub?.();
    this.unsub = null;
    this.juice.clear();
    this.hero?.destroy();
    this.door?.destroy();
    this.path?.destroy();
    this.items?.clear();
    this.sand?.clear();
    for (const l of [this.layers.bg, this.layers.floor, this.layers.shadows, this.layers.objects, this.layers.atmos]) l.removeAll(true);
    // В слое 5 живёт прямоугольник вспышки — его не трогаем.
    const keep = new Set<Phaser.GameObjects.GameObject>();
    this.layers.overlay.each((c: Phaser.GameObjects.GameObject) => {
      if (c instanceof Phaser.GameObjects.Rectangle) keep.add(c);
    });
    for (const c of [...this.layers.overlay.list]) if (!keep.has(c)) c.destroy();
    this.tweens.killAll();
    this.fallback = [];
    this.vignette = null;
    this.world = null;
    this.hero = null;
    this.items = null;
    this.door = null;
    this.sand = null;
    this.path = null;
    this.lockedAnim = false;
    this.darkness = 0;
  }

  private buildWorld(level: GeneratedLevel, state: GameState): void {
    this.teardown();
    this.level = level;
    const geom = worldGeom(level.g, level.usedSeed);
    this.geom = geom;
    this.factory.buildLevel(geom, level);
    const rng = mulberry32(hashSeed(level.usedSeed, 77));
    const reduced = this.bridge.reducedMotion();

    this.world = new WorldView(this, this.art, geom, level, this.layers);
    this.door = new DoorView(this, this.art, geom, this.layers, rng);
    this.items = new ItemView(this, this.art, this.layers, level.g, rng);
    this.items.build(state.items);
    this.sand = new SandView(this, this.art, this.layers, level.g, rng);
    this.path = new PathPreview(this, this.art, this.layers, level.g);
    const b = cellBase(level.g, state.hero);
    this.hero = new HeroView(this, this.art, b.x, b.y, rng);
    this.hero.setFacing(state.facing);
    this.hero.root.setDepth(b.y);
    this.layers.objects.add(this.hero.root);
    this.layers.overlay.add(this.hero.pipsContainer);
    this.path.attachBadge();

    // Запасной путь без фильтра: виньетка и аддитивные пятна света.
    this.vignette = this.art.baked(TEX.vignette);
    this.vignette.setDepth(1e9);
    this.layers.atmos.add(this.vignette);
    for (let i = 0; i < balance.light.maxLights; i++) {
      const spot = this.art.img(0, 0, SPR.lightSpot).setBlendMode(blend.addKeep).setVisible(false).setDepth(1e8);
      this.layers.atmos.add(spot);
      this.fallback.push(spot);
    }
    for (const v of [this.world, this.door, this.items, this.sand, this.path, this.hero]) v.setReducedMotion(reduced);
    this.juice.reduced = reduced;
    this.juice.lang = this.bridge.sfxLang();
    this.juice.avoid = () => {
      if (!this.hero) return null;
      // Прямоугольник, охватывающий героя сейчас и там, куда он прыгает.
      const x0 = Math.min(this.hero.x, this.hero.destX) - CELL * 0.45;
      const x1 = Math.max(this.hero.x, this.hero.destX) + CELL * 0.45;
      const y0 = Math.min(this.hero.y, this.hero.destY) - CELL * 1.5;
      const y1 = Math.max(this.hero.y, this.hero.destY) + CELL * 0.05;
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    };
    this.updateFallbackVisibility();
    this.fit();
  }

  /** Заставка для меню: случайный зал с героем и светом из двери, без раунда. */
  showAttract(level: GeneratedLevel, state: GameState): void {
    this.buildWorld(level, state);
    this.mode = 'attract';
    this.round = null;
    this.attractState = state;
    this.attractRng = mulberry32(hashSeed(level.usedSeed, 5));
    this.attractNext = 1200;
    this.door?.setProgress(0.18, 0);
  }

  showRound(round: Round): void {
    this.buildWorld(round.level, round.state);
    this.mode = 'round';
    this.round = round;
    this.attractState = null;
    this.unsub = round.on((ev, s, prev) => this.onEvents(ev, s, prev));
    this.syncHeroPose(round.state);
    this.introZoom = this.bridge.reducedMotion() ? 1 : 0.94;
  }

  /** Интро закончилось — камера доезжает до рабочего плана. */
  settleCamera(): void {
    if (this.bridge.reducedMotion()) {
      this.introZoom = 1;
      return;
    }
    this.tweens.add({ targets: this, introZoom: 1, duration: 600, ease: 'Sine.Out' });
  }

  // ── Камеры и размер ────────────────────────────────────────────────────────

  resizeView(cssW: number, cssH: number, dpr: number): void {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.dpr = dpr;
    const w = Math.max(1, Math.round(this.cssW * dpr));
    const h = Math.max(1, Math.round(this.cssH * dpr));
    this.scale.setZoom(1 / dpr);
    this.scale.resize(w, h);
    this.cameras.main.setSize(w, h);
    this.overlayCam.setSize(w, h);
    this.fit();
  }

  setTopReserve(cssPx: number): void {
    this.topReserve = Math.max(0, cssPx);
    this.fit();
  }

  private fit(): void {
    if (!this.geom) return;
    const b = this.geom.bounds;
    const w = this.scale.width;
    const h = this.scale.height;
    const top = Math.min(h * 0.18, this.topReserve * this.dpr);
    this.baseZoom = Math.min(w / b.w, (h - top) / b.h);
    const worldH = b.h * this.baseZoom;
    const free = Math.max(0, h - top - worldH);
    this.camOffsetY = (top + free / 2 + worldH / 2 - h / 2) / this.baseZoom;
    this.applyCamera(0, 0, 1);
  }

  /** Размер клетки на экране в CSS px. */
  cellCss(): number {
    return (CELL * this.baseZoom) / this.dpr;
  }

  /** Отладочный крупный план (скриншоты арта): множитель зума и точка мира. */
  closeUp: { zoom: number; x: number; y: number } | null = null;

  private applyCamera(dx: number, dy: number, zoomMul: number): void {
    if (!this.geom) return;
    const b = this.geom.bounds;
    const cu = this.closeUp;
    const z = this.baseZoom * zoomMul * this.introZoom * (cu?.zoom ?? 1);
    const cx = cu ? cu.x : b.x + b.w / 2;
    const cy = cu ? cu.y : b.y + b.h / 2 - this.camOffsetY;
    for (const cam of [this.cameras.main, this.overlayCam]) {
      cam.setZoom(z);
      cam.centerOn(cx + dx / z, cy + dy / z);
    }
  }

  /** Мир → CSS px внутри канвы. */
  worldToCss(x: number, y: number): { x: number; y: number } {
    const cam = this.cameras.main;
    const p = camMatrix(cam).transformPoint(x, y, { x: 0, y: 0 } as Phaser.Types.Math.Vector2Like);
    return { x: p.x / this.dpr, y: p.y / this.dpr };
  }

  /** CSS px внутри канвы → мир. */
  cssToWorld(x: number, y: number): { x: number; y: number } {
    const p = this.cameras.main.getWorldPoint(x * this.dpr, y * this.dpr);
    return { x: p.x, y: p.y };
  }

  // ── Ввод ───────────────────────────────────────────────────────────────────

  private onPointer(p: Phaser.Input.Pointer): void {
    if (this.mode !== 'round' || !this.level || !this.geom || !this.hero) return;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const hx = this.hero.x;
    const hy = this.hero.y;
    if (Math.abs(w.x - hx) < CELL * 0.38 && w.y < hy + 8 && w.y > hy - CELL * 1.25) {
      this.bridge.onTapHero();
      return;
    }
    const o = this.geom.door.opening;
    const fw = this.geom.door.frameW;
    if (w.x > o.x - fw && w.x < o.x + o.w + fw && w.y > o.y - this.geom.door.lintelH && w.y < 0) {
      this.bridge.onTapCell(exitIndex(this.level.g));
      return;
    }
    const cell = WorldView.floorCellAt(this.level, w.x, w.y);
    if (cell == null) return;
    if (this.level.blocked[cell]) this.bridge.onTapObstacle(cell);
    else this.bridge.onTapCell(cell);
  }

  wobbleObstacle(cell: number): void {
    this.world?.wobble(cell);
  }

  // ── События раунда ─────────────────────────────────────────────────────────

  private syncHeroPose(s: GameState): void {
    if (!this.hero) return;
    const risk = this.round?.risk();
    const alarm = s.status === 'playing' && ((risk?.level === 'danger' && s.target !== exitIndex(s.g)) || remainingMs(s) < 10_000);
    this.hero.setPose({ cost: currentCost(s), ready: awaitingTarget(s) && s.status === 'playing', alarm: !!alarm });
    this.hero.setPips(s.pips, currentCost(s));
  }

  private bagWorld(): { x: number; y: number } {
    const t = this.bridge.bagTarget();
    if (t) return this.cssToWorld(t.x, t.y);
    return { x: this.hero?.x ?? 0, y: (this.hero?.y ?? 0) - CELL };
  }

  private onEvents(events: GameEvent[], s: GameState, prev: GameState): void {
    if (!this.hero || !this.items || !this.door || !this.sand || !this.level || !this.geom) return;
    const g = this.level.g;
    for (const e of events) {
      switch (e.type) {
        case 'STARTED': {
          this.juice.word('los', this.geom.door.cx, -CELL * 0.4, { lift: CELL * 0.6 });
          this.juice.shake(balance.anim.shakeSmallPx * this.dpr, 200);
          this.door.notch();
          this.settleCamera();
          break;
        }
        case 'STEP': {
          this.hero.setFacing(e.facing);
          const exit = e.to === exitIndex(g);
          const b = cellBase(g, e.to);
          if (exit) {
            this.hero.root.setDepth(DEPTH.heroInDoor);
            this.hero.hopTo(b.x, b.y + CELL * 0.3, e.cost, () => this.diveOut());
          } else {
            this.hero.root.setDepth(Math.max(b.y, cellBase(g, e.from).y));
            this.hero.hopTo(b.x, b.y, e.cost, () => {
              this.hero?.root.setDepth(b.y);
              this.dustAt(b.x, b.y, e.cost);
            });
            if (e.cost >= 3) this.juice.word('aechz', b.x, b.y - CELL * 0.5, { lift: CELL * 0.6 });
          }
          break;
        }
        case 'PICKUP': {
          const gem = isGem(e.item);
          const b = cellBase(g, e.cell);
          this.items.pickup(e.cell, () => this.bagWorld());
          if (gem) {
            this.juice.word('funkel', b.x, b.y, { lift: CELL * 1.0 });
            this.juice.hitStop();
            this.juice.punch();
            this.juice.flash(palette.white, 160, 0.45);
            this.rayBurst(b.x, b.y - 30);
          } else {
            this.juice.word('kling', b.x, b.y, { lift: CELL * 0.9 });
          }
          break;
        }
        case 'PICKUP_BLOCKED': {
          const b = cellBase(g, e.cell);
          this.items.refuse(e.cell);
          this.juice.word('voll', b.x, b.y, { lift: CELL * 1.05 });
          break;
        }
        case 'COST_CHANGED': {
          if (e.to > e.from) {
            this.juice.word('aechz', this.hero.x, this.hero.y - CELL * 0.6, { lift: CELL * 0.5 });
            this.juice.shake(balance.anim.shakeSmallPx * this.dpr, 180);
          } else {
            this.juice.word('puh', this.hero.x, this.hero.y - CELL * 0.6, { lift: CELL * 0.5 });
          }
          break;
        }
        case 'DROPPED': {
          this.dropRoll(e.item);
          if (!events.some((x) => x.type === 'COST_CHANGED' && x.to < x.from)) this.juice.word('klirr', this.hero.x, this.hero.y - CELL * 0.4);
          break;
        }
        case 'SAND_WARN': {
          this.sand.warn(e.cell);
          this.items.tremble(e.cell);
          if (prev.items[e.cell] && this.elapsed - this.lastRiesel > 1500) {
            const b = cellBase(g, e.cell);
            this.juice.word('riesel', b.x, b.y, { lift: CELL * 1.2 });
            this.lastRiesel = this.elapsed;
          }
          break;
        }
        case 'SAND_BURIED': {
          this.sand.bury(e.cell);
          if (e.item) {
            this.items.bury(e.cell);
            const b = cellBase(g, e.cell);
            this.juice.word('plumps', b.x, b.y, { lift: CELL * 0.9 });
          }
          break;
        }
        case 'DOOR_NOTCH': {
          this.door.notch();
          this.juice.word('knirsch', this.geom.door.cx + CELL * 0.9, -CELL * 1.1, { lift: 0 });
          this.juice.shake(balance.anim.shakeTinyPx * this.dpr, 160);
          this.slabDust();
          break;
        }
        case 'COUNTDOWN': {
          // Цифра на стене — по ту сторону от двери, чтобы не закрывать выход.
          const doorLeft = this.geom.door.cx < this.geom.floorW / 2;
          const x = this.geom.floorW * (doorLeft ? 0.74 : 0.26);
          this.juice.countdown(e.n, x, -this.geom.northH * 0.62);
          break;
        }
        case 'ESCAPED': {
          this.hero.celebrate();
          this.juice.word(e.timeLeftMs < balance.door.narrowEscapeMs ? 'knapp' : 'geschafft', this.geom.door.cx, CELL * 1.6, { lift: 0 });
          break;
        }
        case 'LOCKED_IN': {
          this.lockedAnim = true;
          this.door.close();
          this.juice.shake(balance.anim.shakeBigPx * this.dpr, 520);
          this.juice.word('rumms', this.geom.door.cx, -CELL * 0.2, { lift: 0 });
          this.slabDust(true);
          this.timeEvent(650, () => {
            if (!this.geom) return;
            this.juice.word('zuSpaet', this.geom.floorW / 2, this.geom.floorH * 0.45, { lift: 0 });
          });
          break;
        }
        default:
          break;
      }
    }
    if (events.length) this.syncHeroPose(s);
  }

  /** Отложенное действие по времени сцены (не зависит от хит-стопа). */
  private timeEvent(ms: number, fn: () => void): void {
    this.timeQueue.push({ at: this.elapsed + ms, fn });
  }

  private diveOut(): void {
    if (!this.hero || !this.geom) return;
    const h = this.hero.root;
    if (this.bridge.reducedMotion()) {
      this.hero.setVisible(false);
      return;
    }
    this.juice.flash(palette.white, 260, 0.9);
    this.tweens.add({ targets: h, y: h.y - CELL * 0.35, scale: 0.55, alpha: 0, duration: 420, ease: 'Quad.In', onComplete: () => this.hero?.setVisible(false) });
  }

  private dustAt(x: number, y: number, cost: number): void {
    if (this.bridge.reducedMotion()) return;
    const n = balance.anim.stepDustBase + balance.anim.stepDustPerCost * (cost - 1);
    for (let i = 0; i < n; i++) {
      const p = this.art.img(x + (Math.random() - 0.5) * 36, y - 2, SPR.puff);
      const s = this.art.baseScale(SPR.puff) * (0.25 + Math.random() * 0.25) * (1 + cost * 0.12);
      p.setScale(s).setAlpha(0.8);
      this.layers.atmos.add(p);
      this.tweens.add({
        targets: p,
        x: p.x + (p.x - x) * 1.6 + (Math.random() - 0.5) * 10,
        y: p.y - 8 - Math.random() * 10,
        scale: s * 1.6,
        alpha: 0,
        duration: 360 + Math.random() * 160,
        ease: 'Quad.Out',
        onComplete: () => p.destroy(),
      });
    }
  }

  private slabDust(big = false): void {
    if (!this.geom || this.bridge.reducedMotion()) return;
    const o = this.geom.door.opening;
    const gap = this.door?.gapFrac() ?? 0;
    const y = o.y + (1 - gap) * o.h;
    const n = big ? 14 : 5;
    for (let i = 0; i < n; i++) {
      const p = this.art.img(o.x + Math.random() * o.w, y, big ? SPR.puff : SPR.sandGrain);
      const s = (big ? this.art.baseScale(SPR.puff) * (0.5 + Math.random() * 0.6) : this.art.baseScale(SPR.sandGrain)) * 1;
      p.setScale(s);
      p.setDepth(DEPTH.frame + 3);
      this.layers.objects.add(p);
      this.tweens.add({
        targets: p,
        y: big ? p.y - 30 - Math.random() * 30 : p.y + 40 + Math.random() * 30,
        x: p.x + (Math.random() - 0.5) * (big ? 120 : 12),
        alpha: 0,
        scale: big ? s * 1.8 : s,
        duration: big ? 700 : 500 + Math.random() * 300,
        ease: big ? 'Quad.Out' : 'Quad.In',
        onComplete: () => p.destroy(),
      });
    }
  }

  private rayBurst(x: number, y: number): void {
    if (this.bridge.reducedMotion()) return;
    const r = this.art.img(x, y, SPR.rayBurst).setBlendMode(Phaser.BlendModes.ADD);
    const s = this.art.baseScale(SPR.rayBurst);
    r.setScale(s * 0.4).setAlpha(1);
    this.layers.overlay.add(r);
    this.tweens.add({ targets: r, scale: s * 1.5, alpha: 0, angle: 25, duration: 380, ease: 'Quad.Out', onComplete: () => r.destroy() });
  }

  /** Выброшенный предмет вылетает из мешка, катится в трещину и пропадает. */
  private dropRoll(item: number): void {
    if (!this.hero || this.bridge.reducedMotion()) return;
    const name = isGem(item) ? SPR.gem[item === 2 ? 'ruby' : item === 3 ? 'emerald' : 'sapphire'] : SPR.coin;
    const sx = this.hero.x - 18 * (this.hero.root.scaleX || 1);
    const sy = this.hero.y - CELL * 0.6;
    const im = this.art.img(sx, sy, name);
    this.layers.overlay.add(im);
    const dir = Math.random() < 0.5 ? -1 : 1;
    const ex = sx + dir * CELL * 0.7;
    const ey = this.hero.y + 6;
    const st = { t: 0 };
    const base = im.scaleX;
    this.tweens.add({
      targets: st,
      t: 1,
      duration: balance.anim.dropRollMs,
      ease: 'Quad.Out',
      onUpdate: () => {
        const t = st.t;
        im.x = sx + (ex - sx) * t;
        im.y = sy + (ey - sy) * t - Math.sin(Math.PI * Math.min(1, t * 1.4)) * 30;
        im.angle = t * 360 * dir;
        const k = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
        im.setScale(base * k);
      },
      onComplete: () => im.destroy(),
    });
  }

  // ── Кадр ───────────────────────────────────────────────────────────────────

  override update(): void {
    const now = performance.now();
    const dt = Math.min(balance.frame.maxDtMs, now - this.lastFrame);
    this.lastFrame = now;
    this.elapsed += dt;
    for (let i = this.timeQueue.length - 1; i >= 0; i--) {
      if (this.timeQueue[i].at <= this.elapsed) {
        const q = this.timeQueue[i];
        this.timeQueue.splice(i, 1);
        q.fn();
      }
    }
    this.bridge.onFrame(dt);
    if (this.mode === 'none' || !this.geom || !this.hero || !this.door || !this.items || !this.sand || !this.world || !this.path) return;

    const frozen = this.juice.frozen();
    const wdt = frozen ? 0 : dt;
    const s = this.round?.state ?? this.attractState;
    if (!s) return;

    if (this.mode === 'attract') this.attractTick(dt);

    const p = this.mode === 'round' ? s.t / s.D : 0.18;
    const cs = balance.colorScript;
    const late = Phaser.Math.Clamp((p - cs.warmFrom) / (cs.lateFrom - cs.warmFrom), 0, 1);
    if (!this.lockedAnim) this.door.setProgress(p, late);

    this.hero.update(wdt);
    this.items.update(wdt);
    this.sand.update(wdt);
    this.door.update(wdt);
    const heroCell = s.hero;
    const occupied = (c: number) => c === heroCell || this.items!.has(c) || c === s.target;
    this.world.update(wdt, occupied);
    if (this.mode === 'round' && this.round) {
      const est = s.status === 'playing' ? this.round.risk() : null;
      this.path.update(dt, est, s.hero, s.status === 'playing' ? s.target : null, this.bridge.trailMode(), this.bridge.trailHints());
      if (est) this.syncHeroPose(s);
    } else this.path.update(dt, null, s.hero, null, 'none', false);
    this.juice.update(dt);

    // Цветовой сценарий раунда.
    const rem = this.mode === 'round' ? remainingMs(s) : Infinity;
    if (this.lockedAnim) this.darkness = Math.min(1, this.darkness + dt / 900);
    this.updateLights(s, p, late, rem);

    const off = this.juice.cameraOffsets();
    this.applyCamera(off.dx, off.dy, off.zoomMul);
  }

  private attractTick(dt: number): void {
    const s = this.attractState;
    if (!s || !this.hero || !this.level) return;
    this.attractNext -= dt;
    if (this.attractNext > 0) return;
    this.attractNext = 1600 + this.attractRng() * 1800;
    const g = this.level.g;
    const nb = neighbors(g, s.hero).filter((c) => c !== exitIndex(g) && !this.level!.blocked[c]);
    if (!nb.length) return;
    // Держимся неподалёку от входа.
    const start = startIndex(g);
    const scored = nb.map((c) => ({ c, d: Math.abs(cellXY(g, c).x - cellXY(g, start).x) + cellXY(g, c).y }));
    scored.sort((a, b) => a.d - b.d + (this.attractRng() - 0.5) * 3);
    const to = scored[0].c;
    const dx = cellXY(g, to).x - cellXY(g, s.hero).x;
    if (dx) this.hero.setFacing(dx > 0 ? 1 : -1);
    const b = cellBase(g, to);
    this.hero.hopTo(b.x, b.y, 1, () => this.hero?.root.setDepth(b.y));
    this.hero.root.setDepth(Math.max(b.y, this.hero.y));
    s.hero = to;
  }

  private updateLights(s: GameState, p: number, late: number, remMs: number): void {
    if (!this.geom || !this.hero || !this.door || !this.items || !this.world) return;
    const reduced = this.bridge.reducedMotion();
    const gap = this.door.gapFrac();
    const frame = computeLights({
      timeMs: this.elapsed,
      torches: this.world.torchPositions(),
      lantern: this.hero.root.visible ? this.hero.lanternPos() : null,
      door: { x: this.geom.door.cx, floorY: 0, gapFrac: gap, lateFrac: late, beamLen: this.door.beamLength() },
      hourglass: this.door.hourglassPos(),
      gems: this.items.gemLights(),
      crystals: this.geom.crystals.map((c, i) => ({ x: c.x, y: c.y, phase: i * 2.1 })),
      hero: { x: this.hero.x, y: this.hero.y },
      flickerBoost: late,
      reducedMotion: reduced,
    });
    const dark = this.darkness;
    if (dark > 0) {
      for (const l of frame.lights) l.intensity *= 1 - dark * 0.75;
    }

    if (this.light && this.light.active) {
      const cam = this.cameras.main;
      const L = this.light;
      L.resolution = [cam.width, cam.height];
      L.lights = frame.lights;
      L.dot = balance.light.dotSpacingCss * this.dpr;
      const tmp = { x: 0, y: 0 } as Phaser.Types.Math.Vector2Like;
      L.project = (x, y) => {
        const q = camMatrix(cam).transformPoint(x, y, tmp);
        return { x: q.x, y: q.y, s: cam.zoom };
      };
      const a = camMatrix(cam).transformPoint(0, 0, { x: 0, y: 0 } as Phaser.Types.Math.Vector2Like);
      const b = camMatrix(cam).transformPoint(this.geom.floorW, this.geom.floorH, { x: 0, y: 0 } as Phaser.Types.Math.Vector2Like);
      L.playfield = [a.x, a.y, b.x, b.y];
      L.floorMin = balance.light.floorMinLight * (1 - dark * 0.45);
      const amb = ambientRgb();
      L.ambient = [amb[0] * (1 - dark * 0.4), amb[1] * (1 - dark * 0.4), amb[2] * (1 - dark * 0.4)];
      // Виньетка: последние 15% темнеют, последние 10 с — пульс сердцебиения.
      const vStart = balance.colorScript.lateFrom;
      let vStrength = Phaser.Math.Clamp((p - vStart) / (1 - vStart), 0, 1) * 0.55 + dark * 0.6;
      let pulse = 0;
      let color = hexToRgb01(palette.caveDeep);
      if (remMs < balance.colorScript.heartbeatLastMs && this.mode === 'round' && s.status === 'playing') {
        color = hexToRgb01('#7a0f22');
        if (reduced) pulse = 0.6;
        else {
          this.heartbeat = (this.elapsed % 900) / 900;
          const hb = Math.max(Math.exp(-((this.heartbeat - 0.08) ** 2) / 0.002), 0.7 * Math.exp(-((this.heartbeat - 0.3) ** 2) / 0.002));
          pulse = hb;
          vStrength += 0.2 * hb;
        }
      }
      L.vignette = [Math.min(1, vStrength), 0.38, pulse, 0];
      L.vignetteColor = color;
    } else {
      // Запасной путь: аддитивные спрайты.
      this.fallback.forEach((spot, i) => {
        const l = frame.lights[i];
        if (!l) {
          spot.setVisible(false);
          return;
        }
        spot.setVisible(true);
        spot.setPosition(l.x, l.y);
        spot.setScale((l.radius * 2) / spot.frame.width);
        spot.setTint(Phaser.Display.Color.GetColor(l.color[0] * 255, l.color[1] * 255, l.color[2] * 255));
        spot.setAlpha(Math.min(0.55, l.intensity * 0.32));
      });
      if (this.vignette) {
        const v = this.cameras.main.worldView;
        this.vignette.setPosition(v.x, v.y);
        this.vignette.setDisplaySize(v.width, v.height);
        const vStart = balance.colorScript.lateFrom;
        this.vignette.setAlpha(0.65 + 0.35 * Phaser.Math.Clamp((p - vStart) / (1 - vStart), 0, 1));
        this.vignette.setTint(remMs < 10_000 && s.status === 'playing' ? hexToInt('#ff4060') : 0xffffff);
      }
    }
  }

  /** Снимок кадра для итогов. */
  snapshot(): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
      try {
        this.renderer.snapshot((img) => resolve(img instanceof HTMLImageElement ? img : null));
      } catch {
        resolve(null);
      }
    });
  }
}
