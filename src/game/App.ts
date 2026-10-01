// Оркестратор: DOM, компоновка, Phaser, раунды, экраны, звук, сохранения.

import Phaser from 'phaser';
import { balance } from '../config/balance';
import { getLevel, levels, ENDLESS_LEVEL_ID, type TrailMode } from '../config/levels';
import { palette } from '../config/palette';
import { ArtFactory, type StyleKit } from '../art/ArtFactory';
import { GEM_KIND_BY_CODE, SPR } from '../art/manifest';
import { AudioEngine } from '../audio/mixer';
import { presets } from '../audio/presets';
import type { GameEvent } from '../core/events';
import { exitIndex, cellIndex, cellXY } from '../core/grid';
import { generateLevel } from '../core/levelGen';
import { computePace, pushAnswer } from '../core/pace';
import { freshSeed } from '../core/rng';
import { bagScore, isGem, itemValue, starsFor } from '../core/rules';
import { awaitingTarget, canAnswer, coinsInBag, createState, currentCost, gemsInBag, isActive, score } from '../core/state';
import { ru } from '../i18n/ru';
import type { QuestionProvider } from '../questions/types';
import { chooseGrid, computeLayout } from '../render/layout';
import { CELL } from '../render/geometry';
import { BootScene } from '../scenes/BootScene';
import { GameScene, type SceneBridge } from '../scenes/GameScene';
import { BagWidget } from '../ui/BagWidget';
import { h } from '../ui/dom';
import { QuestionPanel } from '../ui/QuestionPanel';
import {
  bubble,
  introCaption,
  levelsScreen,
  loadingScreen,
  menuScreen,
  pauseScreen,
  resultsScreen,
  Screens,
  settingsScreen,
} from '../ui/screens/Screens';
import { Round } from './Round';
import { SaveData, type KeyValueStorage, type Settings, type TutorialFlag } from './storage';

export interface FinishResult {
  level: number;
  escaped: boolean;
  score: number;
  stars: 0 | 1 | 2 | 3;
}

export interface AppOptions {
  questions: QuestionProvider;
  storage: KeyValueStorage;
  level?: number;
  onFinish?: (r: FinishResult) => void;
  kit: StyleKit;
  debug?: boolean;
  /** Автопереключение качества по FPS (в автотестах выключено: там программный WebGL). */
  autoQuality?: boolean;
}

type Phase = 'loading' | 'menu' | 'intro' | 'playing' | 'finale' | 'results';

export class App implements SceneBridge {
  readonly root: HTMLElement;
  private readonly page: HTMLElement;
  private readonly worldPanel: HTMLElement;
  private readonly canvasHost: HTMLElement;
  private readonly worldUi: HTMLElement;
  private readonly levelTag: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly panel: QuestionPanel;
  private readonly bag: BagWidget;
  private readonly screens: Screens;
  private readonly loading: HTMLElement;
  private game: Phaser.Game | null = null;
  scene: GameScene | null = null;
  factory: ArtFactory | null = null;
  readonly save: SaveData;
  readonly audio = new AudioEngine();
  round: Round | null = null;
  phase: Phase = 'loading';
  levelId = 1;
  private gridCols: number = balance.grid.cols;
  private gridRows: number = balance.grid.rows;
  private ro: ResizeObserver | null = null;
  private dpr = 1;
  private intro: HTMLElement | null = null;
  private introTimer: number | null = null;
  private bubbleEl: HTMLElement | null = null;
  private bubbleFlag: TutorialFlag | null = null;
  private finaleTimer: number | null = null;
  private snapshotImg: HTMLImageElement | null = null;
  private settingsReturn: (() => void) | null = null;
  private coinChain = { n: 0, at: -1e9 };
  private streak = 0;
  private lastSecond = -1;
  private fps = { frames: 0, acc: 0, slow: 0, switched: false };
  private debugEl: HTMLElement | null = null;
  private lightAvailable = false;
  private destroyed = false;
  private readonly listeners: [EventTarget, string, EventListener][] = [];
  private touch = false;

  constructor(
    container: HTMLElement,
    private readonly opts: AppOptions,
  ) {
    this.save = new SaveData(opts.storage);
    this.audio.register(presets);
    this.touch = matchMedia?.('(pointer: coarse)').matches ?? false;
    const sysReduced = matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (this.save.settings.reducedMotionUser == null) this.save.settings.reducedMotion = sysReduced;

    this.canvasHost = h('div', { class: 'tz-canvas-host' });
    this.levelTag = h('div', { class: 'tz-caption tz-tag', style: 'right:44px' }, ru.levelLabel(1));
    this.pauseBtn = h(
      'button',
      { class: 'tz-pause', type: 'button', 'aria-label': ru.pauseButton, title: ru.pauseButton, onclick: () => this.pause() },
      'II',
    );
    this.bag = new BagWidget();
    this.worldUi = h('div', { class: 'tz-world-ui' }, this.bag.el, this.levelTag, this.pauseBtn);
    this.worldPanel = h('section', { class: 'tz-panel tz-world', 'aria-label': 'Сокровищница' }, this.canvasHost, this.worldUi);
    this.panel = new QuestionPanel(this.touch);
    this.page = h('div', { class: 'tz-page' }, this.worldPanel, this.panel.el);
    const screensHost = h('div', { class: 'tz-screens' });
    this.screens = new Screens(screensHost);
    this.loading = loadingScreen();
    this.root = h('div', { class: 'tz', 'data-touch': String(this.touch), tabindex: '-1' }, this.page, screensHost, this.loading);
    container.append(this.root);
    this.applyReduced();

    this.panel.onAnswer = (correct, timeMs) => this.onAnswer(correct, timeMs);
    this.panel.canAnswer = () => !!this.round && canAnswer(this.round.state);
    this.bag.onDrop = (kind) => this.round?.dispatch({ type: 'DROP', kind });
    this.bag.onExit = () => this.targetExit();
    this.bag.reset();
    this.setWorldUiVisible(false);

    this.listen(window, 'keydown', (e) => this.onKey(e as KeyboardEvent));
    this.listen(document, 'visibilitychange', () => {
      if (document.hidden) this.autoPause();
    });
    this.listen(window, 'blur', () => this.autoPause());
    this.ro = new ResizeObserver(() => this.relayout());
    this.ro.observe(this.root);
    this.relayout();
    void this.boot();
  }

  private listen(t: EventTarget, type: string, fn: EventListener): void {
    t.addEventListener(type, fn);
    this.listeners.push([t, type, fn]);
  }

  // ── Запуск ─────────────────────────────────────────────────────────────────

  private async boot(): Promise<void> {
    await this.loadFonts();
    if (this.destroyed) return;
    const cellPx = this.save.settings.quality === 'low' ? balance.quality.cellPxLow : balance.quality.cellPxHigh;
    const rect = this.canvasHost.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, balance.quality.maxDpr);
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.canvasHost,
      width: Math.max(1, Math.round(rect.width * this.dpr)),
      height: Math.max(1, Math.round(rect.height * this.dpr)),
      backgroundColor: palette.caveDeep,
      banner: false,
      audio: { noAudio: true },
      scale: { mode: Phaser.Scale.NONE, zoom: 1 / this.dpr },
      render: { antialias: true, mipmapFilter: 'LINEAR_MIPMAP_LINEAR', roundPixels: false, powerPreference: 'high-performance' },
      input: { activePointers: 2 },
      fps: { smoothStep: false },
    });
    this.game.scene.add('boot', BootScene, true, {
      kit: this.opts.kit,
      cellPx,
      bridge: this,
      onArt: (f: ArtFactory) => (this.factory = f),
    });
    this.game.scene.add('game', GameScene, false);
  }

  private async loadFonts(): Promise<void> {
    if (!document.fonts?.load) return;
    const faces = ['400 32px Rubik', '500 32px Rubik', '700 32px Rubik', '800 32px Rubik', '900 32px Rubik', '400 32px Bangers'];
    const sample = 'Сокровищница ÄÖÜß äöü Lädt';
    await Promise.race([Promise.all(faces.map((f) => document.fonts.load(f, sample).catch(() => []))), new Promise((r) => setTimeout(r, 2500))]);
  }

  // ── SceneBridge ────────────────────────────────────────────────────────────

  onSceneReady(scene: GameScene): void {
    this.scene = scene;
    this.lightAvailable = scene.hasLightSupport();
    scene.setLightEnabled(this.save.settings.quality === 'high');
    this.applyIcons();
    this.loading.remove();
    this.relayout();
    if (this.opts.level) this.startRound(this.opts.level);
    else this.showMenu();
    if (this.opts.debug) this.toggleDebug(true);
    (window as unknown as { __tz?: unknown }).__tz = this.testApi();
  }

  onFrame(dt: number): void {
    this.trackFps(dt);
    const r = this.round;
    if (!r || this.phase !== 'playing') return;
    r.dispatch({ type: 'TICK', dt });
    this.refreshUi();
    this.maybeRiskTutorial();
    // Последние 10 с: тиканье и сердцебиение, эмбиент тише.
    const rem = r.state.D - r.state.t;
    const sec = Math.ceil(rem / 1000);
    if (r.state.status === 'playing' && !this.paused() && rem < balance.colorScript.heartbeatLastMs && sec !== this.lastSecond) {
      this.lastSecond = sec;
      this.audio.play('heartbeat', { vol: 0.9 });
    }
    this.audio.setScrape(r.state.status === 'playing' && !this.paused() ? 0.35 + 0.65 * (r.state.t / r.state.D) : 0);
    if (this.debugEl) this.renderDebug();
  }

  onTapCell(cell: number): void {
    const r = this.round;
    if (!r || this.phase !== 'playing') return;
    if (this.bubbleFlag === 'start') this.closeBubble();
    if (this.paused()) return;
    if (cell === r.state.hero) {
      r.dispatch({ type: 'CANCEL_TARGET' });
      return;
    }
    const ev = r.dispatch({ type: 'SET_TARGET', cell });
    if (ev.some((e) => e.type === 'BUMP')) {
      this.scene?.wobbleObstacle(cell);
      this.audio.play('thud', { pan: this.panOf(cell) });
    } else this.audio.play('ui', { vol: 0.5, pitch: 1.2 });
  }

  onTapHero(): void {
    if (this.phase !== 'playing' || !this.round) return;
    this.round.dispatch({ type: 'CANCEL_TARGET' });
  }

  onTapObstacle(cell: number): void {
    if (this.phase !== 'playing' || !this.round || this.paused()) return;
    this.scene?.wobbleObstacle(cell);
    this.audio.play('thud', { pan: this.panOf(cell) });
  }

  bagTarget(): { x: number; y: number } | null {
    const host = this.canvasHost.getBoundingClientRect();
    const r = this.bag.iconRect();
    if (!r.width) return null;
    return { x: r.left + r.width / 2 - host.left, y: r.top + r.height / 2 - host.top };
  }

  trailMode(): TrailMode {
    return this.round?.level.config.trail ?? 'none';
  }

  trailHints(): boolean {
    return this.save.settings.trailHints;
  }

  reducedMotion(): boolean {
    return this.save.settings.reducedMotion;
  }

  sfxLang(): 'de' | 'ru' {
    return this.save.settings.sfxLang;
  }

  // ── Компоновка ─────────────────────────────────────────────────────────────

  private relayout(): void {
    const w = this.root.clientWidth;
    const hgt = this.root.clientHeight;
    if (!w || !hgt) return;
    const lay = computeLayout(w, hgt);
    this.root.dataset.orient = lay.orient;
    this.root.dataset.compact = String(lay.worldW < 520);
    this.root.style.setProperty('--q-size', `${lay.qSize}px`);
    this.root.style.setProperty('--gutter', `${lay.gutter}px`);
    if (this.phase !== 'playing' && this.phase !== 'intro' && this.phase !== 'finale') {
      const grid = chooseGrid(lay.worldW, lay.worldH);
      this.gridCols = grid.cols;
      this.gridRows = grid.rows;
    }
    this.dpr = Math.min(window.devicePixelRatio || 1, balance.quality.maxDpr);
    const rect = this.canvasHost.getBoundingClientRect();
    this.scene?.resizeView(rect.width, rect.height, this.dpr);
    this.updateTopReserve();
    this.panel.fitPrompt();
    this.positionBubble();
  }

  /** Плашка мешка заходит на рамку сверху — зал вписывается ниже неё. */
  private updateTopReserve(): void {
    const visible = this.bag.el.style.visibility !== 'hidden';
    const reserve = visible ? Math.max(0, this.bag.el.offsetHeight - 15 + 6) : 0;
    this.scene?.setTopReserve(reserve);
  }

  private applyReduced(): void {
    this.root.dataset.reduced = String(this.save.settings.reducedMotion);
  }

  private applyIcons(): void {
    const f = this.factory;
    if (!f) return;
    const url = (name: string, hgt = 40) => f.frameToCanvas(name, hgt)?.toDataURL() ?? '';
    this.panel.setIcons({ pipFull: url(SPR.pipFull, 26), pipEmpty: url(SPR.pipEmpty, 26) });
    this.bag.setIcons({ bag: url(SPR.hero.bag[2], 40), coin: url(SPR.coin, 22), gem: url(SPR.gem.ruby, 22) });
    this.ruleIcons = [url(SPR.pipFull, 56), url(SPR.hero.bag[3], 64), url(SPR.door.slab, 64)];
    this.iconCache = {
      coin: url(SPR.coin, 30),
      ruby: url(SPR.gem.ruby, 30),
      emerald: url(SPR.gem.emerald, 30),
      sapphire: url(SPR.gem.sapphire, 30),
    };
  }
  private iconCache: Record<string, string> = {};
  private ruleIcons: string[] = [];

  private setWorldUiVisible(v: boolean): void {
    this.bag.el.style.visibility = v ? 'visible' : 'hidden';
    this.levelTag.style.visibility = v ? 'visible' : 'hidden';
    this.pauseBtn.style.visibility = v ? 'visible' : 'hidden';
    this.updateTopReserve();
  }

  // ── Меню ───────────────────────────────────────────────────────────────────

  showMenu(): void {
    this.endRound();
    this.phase = 'menu';
    this.setWorldUiVisible(false);
    this.panel.showRules(this.ruleIcons);
    const level = generateLevel(getLevel(1), { seed: freshSeed(), cols: this.gridCols, rows: this.gridRows });
    const state = createState(level, computePace(this.save.pace));
    this.scene?.showAttract(level, state);
    this.screens.show(
      menuScreen({
        onPlay: () => {
          this.unlockAudio();
          this.showLevels();
        },
        onLevels: () => {
          this.unlockAudio();
          this.showLevels();
        },
        onSettings: () => {
          this.unlockAudio();
          this.showSettings(() => this.showMenu());
        },
      }),
    );
  }

  private unlockAudio(): void {
    this.audio.unlock();
    const s = this.save.settings;
    this.audio.setVolumes(s.sfxVolume, s.ambientVolume, s.muted);
    this.audio.startAmbient();
  }

  private showLevels(): void {
    this.audio.play('ui');
    this.screens.show(
      levelsScreen(this.save, {
        doorIcon: this.ruleIcons[2],
        onPick: (id) => {
          this.audio.play('ui', { pitch: 1.3 });
          this.startRound(id);
        },
        onBack: () => this.showMenu(),
      }),
    );
  }

  private showSettings(back: () => void): void {
    this.settingsReturn = back;
    const trailAvailable = (this.round?.level.config.trail ?? 'risk') !== 'none';
    this.screens.show(
      settingsScreen({
        settings: this.save.settings,
        trailAvailable,
        lightAvailable: this.lightAvailable,
        onChange: (s) => this.applySettings(s),
        onBack: () => this.settingsReturn?.(),
      }),
    );
  }

  private applySettings(s: Settings): void {
    this.save.settings = s;
    this.save.saveSettings();
    this.audio.setVolumes(s.sfxVolume, s.ambientVolume, s.muted);
    this.applyReduced();
    this.scene?.setLightEnabled(s.quality === 'high');
  }

  // ── Раунд ──────────────────────────────────────────────────────────────────

  startRound(levelId: number): void {
    this.endRound();
    this.unlockAudio();
    this.screens.hide();
    this.levelId = levelId;
    this.relayout();
    const cfg = getLevel(levelId);
    const level = generateLevel(cfg, { seed: freshSeed(), cols: this.gridCols, rows: this.gridRows });
    for (const w of level.warnings) console.warn(w);
    const round = new Round(level, computePace(this.save.pace));
    this.round = round;
    this.phase = 'intro';
    this.scene?.showRound(round);
    round.on((ev) => this.onRoundEvents(ev));
    this.levelTag.textContent = ru.levelLabel(levelId);
    this.bag.reset();
    this.bag.setSide(this.scene?.geom && this.scene.geom.door.cx < this.scene.geom.floorW * 0.42 ? 'right' : 'left');
    this.setWorldUiVisible(true);
    this.panel.startRound(this.opts.questions);
    this.panel.setHoppla(this.save.settings.sfxLang === 'de' ? 'HOPPLA!' : 'ОПА!');
    this.panel.setPaused(false);
    this.coinChain = { n: 0, at: -1e9 };
    this.streak = 0;
    this.lastSecond = -1;
    this.snapshotImg = null;
    this.refreshUi();

    // Интро: общий вид зала и плашка с временем двери; часы стоят; пропускается тапом.
    const sec = Math.max(5, Math.round(round.state.D / 1000 / 5) * 5);
    this.intro = introCaption(sec);
    this.worldUi.append(this.intro);
    const skip = () => this.endIntro();
    this.intro.addEventListener('pointerdown', skip);
    this.canvasHost.addEventListener('pointerdown', skip, { once: true });
    this.introTimer = window.setTimeout(skip, balance.anim.introMaxMs);
  }

  private endIntro(): void {
    if (this.phase !== 'intro' || !this.round) return;
    if (this.introTimer != null) clearTimeout(this.introTimer);
    this.introTimer = null;
    this.intro?.remove();
    this.intro = null;
    this.phase = 'playing';
    this.round.dispatch({ type: 'START' });
    this.audio.play('start');
    void this.panel.activate();
    this.refreshUi();
    if (!this.save.tutorial.start) this.showTutorial('start', ru.tutorialStart);
  }

  private endRound(): void {
    if (this.introTimer != null) clearTimeout(this.introTimer);
    if (this.finaleTimer != null) clearTimeout(this.finaleTimer);
    this.introTimer = null;
    this.finaleTimer = null;
    this.intro?.remove();
    this.intro = null;
    this.closeBubble(true);
    this.round = null;
    this.audio.setScrape(0);
    this.audio.duck(false);
  }

  private paused(): boolean {
    return !!this.round && this.round.state.pauseReasons.length > 0;
  }

  private refreshUi(): void {
    const r = this.round;
    if (!r) return;
    const s = r.state;
    const playing = this.phase === 'playing' && s.status === 'playing';
    this.panel.setStep(s.pips, currentCost(s), playing && awaitingTarget(s));
    this.bag.update(score(s), coinsInBag(s), gemsInBag(s), s.target === exitIndex(s.g), playing && isActive(s));
  }

  private onAnswer(correct: boolean, timeMs: number): void {
    const r = this.round;
    if (!r) return;
    this.save.pace = pushAnswer(this.save.pace, correct, timeMs);
    this.save.savePace();
    if (correct) {
      this.streak = timeMs < r.state.tMed ? this.streak + 1 : 0;
      this.audio.play('correct', { k: this.streak });
    } else {
      this.streak = 0;
      this.audio.play('wrong');
    }
    r.dispatch({ type: 'ANSWER', correct, timeMs });
    this.refreshUi();
  }

  private panOf(cell: number): number {
    const r = this.round;
    if (!r) return 0;
    const { x } = cellXY(r.state.g, cell);
    return ((x + 0.5) / r.state.g.cols) * 1.6 - 0.8;
  }

  private onRoundEvents(events: GameEvent[]): void {
    const r = this.round;
    if (!r) return;
    for (const e of events) {
      switch (e.type) {
        case 'PIP':
          this.audio.play('pip', { pitch: 1 + e.pips * 0.08 });
          break;
        case 'STEP':
          this.audio.play('step', { k: e.cost, pan: this.panOf(e.to === exitIndex(r.state.g) ? e.from : e.to) });
          break;
        case 'PICKUP': {
          const now = performance.now();
          if (isGem(e.item)) this.audio.play('gem', { pan: this.panOf(e.cell) });
          else {
            this.coinChain.n = now - this.coinChain.at < balance.audio.coinChainMs ? this.coinChain.n + 1 : 0;
            this.coinChain.at = now;
            this.audio.play('coin', { k: this.coinChain.n, pan: this.panOf(e.cell) });
          }
          window.setTimeout(() => this.bag.gulp(), balance.anim.pickupFlyMs);
          if (e.bagCount === balance.bag.itemsPerCostStep && !this.save.tutorial.heavy) {
            window.setTimeout(() => this.showTutorial('heavy', ru.tutorialHeavy), balance.anim.pickupFlyMs + 80);
          }
          break;
        }
        case 'PICKUP_BLOCKED':
          this.audio.play('full', { pan: this.panOf(e.cell) });
          break;
        case 'COST_CHANGED':
          if (e.to > e.from) this.audio.play('costUp');
          break;
        case 'DROPPED':
          this.audio.play('drop');
          break;
        case 'SAND_WARN':
          if (r.state.items[e.cell] || Math.random() < 0.25) this.audio.play('sandWarn', { pan: this.panOf(e.cell), vol: 0.7 });
          break;
        case 'SAND_BURIED':
          if (e.item) this.audio.play('sandBury', { pan: this.panOf(e.cell) });
          break;
        case 'DOOR_NOTCH':
          this.audio.play('notch', { pan: this.panOf(cellIndex(r.state.g, r.state.g.doorCol, 0)) });
          this.audio.rumble();
          break;
        case 'COUNTDOWN':
          this.audio.play('tick', { pitch: e.n <= 3 ? 1.25 : 1 });
          if (e.n === 10) this.audio.duck(true);
          break;
        case 'ESCAPED':
        case 'LOCKED_IN':
          this.finale(e.type === 'ESCAPED');
          break;
        default:
          break;
      }
    }
    this.refreshUi();
  }

  private targetExit(): void {
    const r = this.round;
    if (!r || this.phase !== 'playing') return;
    if (this.bubbleFlag === 'start') this.closeBubble();
    r.dispatch({ type: 'SET_TARGET', cell: exitIndex(r.state.g) });
    this.refreshUi();
  }

  // ── Обучение ───────────────────────────────────────────────────────────────

  private showTutorial(flag: TutorialFlag, text: string): void {
    const r = this.round;
    if (!r || this.phase !== 'playing' || this.save.tutorial[flag] || this.bubbleEl) return;
    this.save.tutorial[flag] = true;
    this.save.saveTutorial();
    r.dispatch({ type: 'PAUSE', reason: 'tutorial' });
    this.panel.setPaused(true);
    this.bubbleFlag = flag;
    this.bubbleEl = bubble(text, () => this.closeBubble());
    this.worldUi.append(this.bubbleEl);
    this.positionBubble();
  }

  private positionBubble(): void {
    if (!this.bubbleEl || !this.scene?.hero) return;
    const p = this.scene.worldToCss(this.scene.hero.x, this.scene.hero.y - CELL * 1.5);
    const w = this.canvasHost.clientWidth;
    this.bubbleEl.style.left = `${Math.max(150, Math.min(w - 150, p.x))}px`;
    this.bubbleEl.style.top = `${Math.max(150, p.y)}px`;
  }

  private closeBubble(silent = false): void {
    if (!this.bubbleEl) return;
    this.bubbleEl.remove();
    this.bubbleEl = null;
    this.bubbleFlag = null;
    if (silent || !this.round) return;
    this.round.dispatch({ type: 'RESUME', reason: 'tutorial' });
    if (!this.round.state.pauseReasons.length) this.panel.setPaused(false);
  }

  private maybeRiskTutorial(): void {
    const r = this.round;
    if (!r || this.save.tutorial.risk || r.level.config.trail !== 'risk' || !this.save.settings.trailHints) return;
    if (r.state.status !== 'playing' || this.paused()) return;
    if (r.risk().level !== 'safe') this.showTutorial('risk', ru.tutorialRisk);
  }

  // ── Пауза ──────────────────────────────────────────────────────────────────

  pause(): void {
    const r = this.round;
    if (!r || (this.phase !== 'playing' && this.phase !== 'intro')) return;
    if (this.phase === 'intro') this.endIntro();
    r.dispatch({ type: 'PAUSE', reason: 'user' });
    this.panel.setPaused(true);
    this.audio.setScrape(0);
    this.screens.show(
      pauseScreen({
        onResume: () => this.resume(),
        onRestart: () => this.startRound(this.levelId),
        onSettings: () => this.showSettings(() => this.pause()),
        onMenu: () => this.showMenu(),
      }),
    );
  }

  resume(): void {
    const r = this.round;
    this.screens.hide();
    if (!r) return;
    r.dispatch({ type: 'RESUME', reason: 'user' });
    if (!r.state.pauseReasons.length) this.panel.setPaused(false);
    this.root.focus({ preventScroll: true });
  }

  private autoPause(): void {
    if (this.phase === 'playing' && this.round && !this.round.state.pauseReasons.includes('user')) this.pause();
  }

  // ── Финал и итоги ──────────────────────────────────────────────────────────

  private finale(escaped: boolean): void {
    const r = this.round;
    if (!r || this.phase === 'finale') return;
    this.phase = 'finale';
    this.panel.stop();
    this.closeBubble(true);
    this.audio.setScrape(0);
    this.audio.duck(false);
    this.audio.play(escaped ? 'fanfare' : 'slam');
    window.setTimeout(() => {
      void this.scene?.snapshot().then((img) => (this.snapshotImg = img));
    }, 320);
    const done = () => {
      this.canvasHost.removeEventListener('pointerdown', done);
      if (this.finaleTimer != null) clearTimeout(this.finaleTimer);
      this.finaleTimer = null;
      if (this.phase === 'finale') window.setTimeout(() => this.showResults(escaped), this.snapshotImg ? 0 : 350);
    };
    this.finaleTimer = window.setTimeout(done, balance.anim.finaleMaxMs);
    window.setTimeout(() => this.canvasHost.addEventListener('pointerdown', done, { once: true }), 250);
  }

  private showResults(escaped: boolean): void {
    const r = this.round;
    if (!r) return;
    this.phase = 'results';
    const s = r.state;
    const sc = escaped ? bagScore(s.bag) : 0;
    const stars = starsFor(escaped, sc, r.level.s2, r.level.s3);
    const { newBest } = this.save.record(this.levelId, stars, sc);
    const times = [...s.stats.answerTimes].sort((a, b) => a - b);
    const med = times.length ? times[Math.floor(times.length / 2)] : 0;
    const margin = escaped && s.escapedAt != null ? (s.D - s.escapedAt) / 1000 : null;
    const bagIcons = s.bag.map((c) => ({ src: isGem(c) ? this.iconCache[GEM_KIND_BY_CODE[c]] : this.iconCache.coin, value: itemValue(c) }));
    const nextId = this.levelId < ENDLESS_LEVEL_ID ? this.levelId + 1 : ENDLESS_LEVEL_ID;
    const hasNext = this.save.isUnlocked(nextId) && levels.some((l) => l.id === nextId);
    this.opts.onFinish?.({ level: this.levelId, escaped, score: sc, stars });
    const lang = this.save.settings.sfxLang;
    const stamp = escaped ? (margin != null && margin * 1000 < balance.door.narrowEscapeMs ? (lang === 'de' ? 'KNAPP!' : 'ЕЛЕ УСПЕЛ!') : lang === 'de' ? 'GESCHAFFT!' : 'ПОЛУЧИЛОСЬ!') : lang === 'de' ? 'ZU SPÄT!' : 'ПОЗДНО!';
    this.screens.show(
      resultsScreen(
        {
          escaped,
          narrow: false,
          score: sc,
          total: r.level.totalValue,
          stars,
          bag: bagIcons,
          correct: s.stats.correct,
          wrong: s.stats.wrong,
          medianSec: (med / 1000).toFixed(1).replace('.', ','),
          best: this.save.progress[this.levelId]?.best ?? 0,
          newBest,
          marginSec: margin != null ? margin.toFixed(1).replace('.', ',') : null,
          snapshot: this.snapshotImg,
          stampText: stamp,
          hasNext,
          narrowLayout: this.root.clientWidth < 760,
        },
        {
          onAgain: () => this.startRound(this.levelId),
          onNext: () => this.startRound(nextId),
          onMenu: () => this.showMenu(),
          onTally: (i) => this.audio.play('tally', { k: i }),
        },
      ),
    );
  }

  // ── Клавиатура ─────────────────────────────────────────────────────────────

  private onKey(e: KeyboardEvent): void {
    if (this.destroyed) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === '`' && (import.meta.env.DEV || this.opts.debug)) {
      this.toggleDebug(!this.debugEl);
      return;
    }
    if (this.phase === 'intro' && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      this.endIntro();
      return;
    }
    if (this.phase === 'finale' && (e.key === ' ' || e.key === 'Enter')) {
      if (this.finaleTimer != null) {
        clearTimeout(this.finaleTimer);
        this.finaleTimer = null;
        this.showResults(this.round?.state.status === 'escaped');
      }
      return;
    }
    if (this.phase !== 'playing' || !this.round) return;
    const r = this.round;
    if (e.key === 'p' || e.key === 'P' || e.key === 'з' || e.key === 'З' || e.key === 'Escape') {
      e.preventDefault();
      if (this.screens.kind === 'pause') this.resume();
      else if (!this.screens.open) this.pause();
      return;
    }
    if (this.screens.open) return;
    if (this.bubbleEl && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      this.closeBubble();
      return;
    }
    if (/^[1-4]$/.test(e.key)) {
      this.panel.pressKey(Number(e.key));
      return;
    }
    const g = r.state.g;
    const { x, y } = cellXY(g, r.state.hero);
    const arrows: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (arrows[e.key]) {
      e.preventDefault();
      if (this.bubbleFlag === 'start') this.closeBubble();
      const [dx, dy] = arrows[e.key];
      const nx = x + dx;
      const ny = y + dy;
      if (ny === -1 && nx === g.doorCol) this.onTapCell(exitIndex(g));
      else if (nx >= 0 && ny >= 0 && nx < g.cols && ny < g.rows) this.onTapCell(cellIndex(g, nx, ny));
      return;
    }
    switch (e.key.toLowerCase()) {
      case 'h':
      case 'р':
        this.targetExit();
        break;
      case ' ':
        e.preventDefault();
        r.dispatch({ type: 'CANCEL_TARGET' });
        break;
      case 'q':
      case 'й':
        r.dispatch({ type: 'DROP', kind: 'coin' });
        break;
      case 'e':
      case 'у':
        r.dispatch({ type: 'DROP', kind: 'gem' });
        break;
      default:
        return;
    }
    this.refreshUi();
  }

  // ── Производительность ─────────────────────────────────────────────────────

  private trackFps(dt: number): void {
    const f = this.fps;
    f.frames++;
    f.acc += dt;
    if (f.acc < 1000) return;
    const fps = (f.frames * 1000) / f.acc;
    f.frames = 0;
    f.acc = 0;
    if (this.phase !== 'playing' || document.hidden) {
      f.slow = 0;
      return;
    }
    f.slow = fps < balance.quality.lowFpsThreshold ? f.slow + 1 : 0;
    if (this.opts.autoQuality === false) return;
    if (f.slow >= balance.quality.lowFpsSeconds && !f.switched && this.save.settings.quality === 'high') {
      f.switched = true;
      this.applySettings({ ...this.save.settings, quality: 'low', qualityAuto: true });
    }
  }

  // ── Отладка ────────────────────────────────────────────────────────────────

  private toggleDebug(on: boolean): void {
    if (!on) {
      this.debugEl?.remove();
      this.debugEl = null;
      return;
    }
    this.debugEl = h('div', { class: 'tz-debug' });
    this.root.append(this.debugEl);
    this.renderDebug();
  }

  private renderDebug(): void {
    const el = this.debugEl;
    if (!el) return;
    const r = this.round;
    const fps = this.game ? Math.round(this.game.loop.actualFps) : 0;
    const lines = [`FPS ${fps}`];
    if (r) {
      const s = r.state;
      lines.push(
        `сид ${r.level.usedSeed} (зал ${r.level.config.id}, ${s.g.cols}×${s.g.rows})`,
        `T_med ${(s.tMed / 1000).toFixed(2)} с, p ${s.p.toFixed(2)}`,
        `B ${r.level.budget.toFixed(1)}, S2 ${r.level.s2}, S3 ${r.level.s3}`,
        `t ${(s.t / 1000).toFixed(1)} / ${(s.D / 1000).toFixed(0)} с, риск ${r.risk().r.toFixed(2)} (${r.risk().level})`,
        `свет: ${this.scene?.lightActive ? 'фильтр' : 'запасной путь'}`,
      );
    }
    el.replaceChildren(
      ...lines.map((l) => h('div', {}, l)),
      h('button', { type: 'button', onclick: () => r?.dispatch({ type: 'DEBUG_SET_TIME', t: r.state.D - 10_000 }) }, '→ 10 с'),
      h('button', { type: 'button', onclick: () => r && (r.immortal = !r.immortal) }, r?.immortal ? 'смертен' : 'бессмертие'),
    );
  }

  /** API для сквозных тестов и скриншотов. */
  private testApi() {
    return {
      app: this,
      state: () => this.round?.state ?? null,
      phase: () => this.phase,
      start: (id: number) => this.startRound(id),
      skipIntro: () => this.endIntro(),
      answer: (correct: boolean) => this.onAnswer(correct, 2000),
      target: (cell: number) => this.onTapCell(cell),
      exit: () => this.targetExit(),
      setTime: (t: number) => this.round?.dispatch({ type: 'DEBUG_SET_TIME', t }),
      closeBubble: () => this.closeBubble(),
      results: () => this.screens.kind,
    };
  }

  destroy(): void {
    this.destroyed = true;
    this.endRound();
    this.ro?.disconnect();
    for (const [t, type, fn] of this.listeners) t.removeEventListener(type, fn);
    this.audio.destroy();
    this.game?.destroy(true);
    this.game = null;
    this.root.remove();
  }
}
