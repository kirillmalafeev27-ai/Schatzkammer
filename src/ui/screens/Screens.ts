// Экраны (раздел 11.5): DOM поверх живой сцены.

import { levels, ENDLESS_LEVEL_ID } from '../../config/levels';
import { ru } from '../../i18n/ru';
import type { SaveData, Settings } from '../../game/storage';
import { h } from '../dom';

export interface ScreenHost {
  el: HTMLElement;
}

export class Screens {
  private current: HTMLElement | null = null;
  constructor(private readonly host: HTMLElement) {}

  show(el: HTMLElement): void {
    this.hide();
    this.current = el;
    this.host.append(el);
    const focusable = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>('button');
    focusable?.focus({ preventScroll: true });
  }

  hide(): void {
    this.current?.remove();
    this.current = null;
  }

  get open(): boolean {
    return !!this.current;
  }

  get kind(): string | null {
    return this.current?.dataset.screen ?? null;
  }
}

function lockSvg(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 28');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '28');
  svg.innerHTML =
    '<path d="M6 12V8a6 6 0 0 1 12 0v4" fill="none" stroke="#1b1020" stroke-width="3.2"/>' +
    '<rect x="2.5" y="11.5" width="19" height="14" rx="2" fill="#ffe066" stroke="#1b1020" stroke-width="2.6"/>' +
    '<circle cx="12" cy="18" r="2.3" fill="#1b1020"/>';
  return svg;
}

const starRow = (n: number, big = false): HTMLElement =>
  h('div', { class: big ? 'tz-stars-big' : 'tz-stars', role: 'img', 'aria-label': ru.stars(n) }, ...[0, 1, 2].map((i) => h('span', { class: `tz-star${i < n ? ' is-on' : ''}` })));

export function menuScreen(opts: { onPlay: () => void; onLevels: () => void; onSettings: () => void }): HTMLElement {
  return h(
    'div',
    { class: 'tz-screen is-clear', 'data-screen': 'menu' },
    h(
      'div',
      { class: 'tz-menu' },
      h('h1', { class: 'tz-title' }, ru.title),
      h('div', { class: 'tz-subtitle', lang: 'de' }, ru.subtitle),
      h('div', { class: 'tz-caption tz-tagline' }, ru.tagline),
      h('button', { class: 'tz-btn tz-play', type: 'button', 'data-autofocus': true, onclick: opts.onPlay }, ru.play),
      h(
        'div',
        { class: 'tz-menu-links' },
        h('button', { class: 'tz-btn', type: 'button', onclick: opts.onLevels }, ru.levels),
        h('button', { class: 'tz-btn', type: 'button', onclick: opts.onSettings }, ru.settings),
      ),
      h('div', { class: 'tz-caption tz-tagline', style: 'font-size:13px;transform:rotate(-1deg)' }, ru.menuHint),
    ),
  );
}

export function levelsScreen(save: SaveData, opts: { onPick: (id: number) => void; onBack: () => void; doorIcon?: string }): HTMLElement {
  const cards = levels.map((l) => {
    const unlocked = save.isUnlocked(l.id);
    const pr = save.progress[l.id];
    const meta = !unlocked ? ru.locked : l.id === ENDLESS_LEVEL_ID ? ru.endless : pr?.best ? ru.best(pr.best) : ' ';
    return h(
      'button',
      {
        class: `tz-level${l.id === ENDLESS_LEVEL_ID ? ' is-endless' : ''}`,
        type: 'button',
        disabled: !unlocked,
        title: unlocked ? '' : ru.lockedHint,
        'aria-label': `${ru.levelLabel(l.id)}${unlocked ? '' : `, ${ru.locked}`}`,
        onclick: () => opts.onPick(l.id),
      },
      opts.doorIcon ? h('img', { class: 'tz-level-door', src: opts.doorIcon, alt: '' }) : null,
      h('span', { class: 'tz-level-name' }, ru.levelLabel(l.id)),
      h('span', { class: 'tz-level-meta' }, meta),
      starRow(pr?.stars ?? 0),
      unlocked ? null : h('span', { class: 'tz-level-lock', 'aria-hidden': 'true' }, lockSvg()),
    );
  });
  return h(
    'div',
    { class: 'tz-screen', 'data-screen': 'levels' },
    h(
      'div',
      { class: 'tz-card', style: 'max-width:720px' },
      h('div', { class: 'tz-caption tz-card-tag' }, ru.levels),
      h('div', { class: 'tz-levels' }, ...cards),
      h('div', { class: 'tz-row is-end' }, h('button', { class: 'tz-btn', type: 'button', onclick: opts.onBack }, ru.back)),
    ),
  );
}

export function pauseScreen(opts: { onResume: () => void; onRestart: () => void; onSettings: () => void; onMenu: () => void }): HTMLElement {
  return h(
    'div',
    { class: 'tz-screen', 'data-screen': 'pause' },
    h(
      'div',
      { class: 'tz-card', style: 'max-width:420px;text-align:center' },
      h('div', { class: 'tz-caption tz-card-tag' }, ru.pause),
      h('h2', {}, ru.pause),
      h('p', { class: 'tz-note', style: 'margin:0 0 16px' }, ru.pauseHint),
      h(
        'div',
        { class: 'tz-row', style: 'justify-content:center' },
        h('button', { class: 'tz-btn is-primary', type: 'button', 'data-autofocus': true, onclick: opts.onResume }, ru.resume),
        h('button', { class: 'tz-btn', type: 'button', onclick: opts.onRestart }, ru.restart),
      ),
      h(
        'div',
        { class: 'tz-row', style: 'justify-content:center;margin-top:12px' },
        h('button', { class: 'tz-btn', type: 'button', onclick: opts.onSettings }, ru.settings),
        h('button', { class: 'tz-btn', type: 'button', onclick: opts.onMenu }, ru.toMenu),
      ),
    ),
  );
}

export interface SettingsOpts {
  settings: Settings;
  trailAvailable: boolean;
  lightAvailable: boolean;
  onChange: (s: Settings) => void;
  onBack: () => void;
}

export function settingsScreen(o: SettingsOpts): HTMLElement {
  const s = { ...o.settings };
  const emit = () => o.onChange({ ...s });
  const slider = (label: string, key: 'sfxVolume' | 'ambientVolume') =>
    h(
      'label',
      { class: 'tz-setting' },
      label,
      h('input', {
        type: 'range',
        min: 0,
        max: 100,
        value: Math.round(s[key] * 100),
        'aria-label': label,
        oninput: (e: Event) => {
          s[key] = Number((e.target as HTMLInputElement).value) / 100;
          emit();
        },
      }),
    );
  const toggle = (label: string, value: boolean, set: (v: boolean) => void, disabled = false, note?: string) =>
    h(
      'label',
      { class: 'tz-setting' },
      h('span', {}, label, note ? h('div', { class: 'tz-note' }, note) : null),
      h('input', {
        type: 'checkbox',
        class: 'tz-switch',
        role: 'switch',
        checked: value,
        disabled,
        onchange: (e: Event) => {
          set((e.target as HTMLInputElement).checked);
          emit();
        },
      }),
    );
  const seg = (label: string, items: [string, string][], value: string, set: (v: string) => void, note?: string) => {
    const wrap = h('div', { class: 'tz-seg', role: 'group', 'aria-label': label });
    const render = (v: string) => {
      wrap.replaceChildren(
        ...items.map(([val, text]) =>
          h(
            'button',
            {
              type: 'button',
              'aria-pressed': String(val === v),
              onclick: () => {
                set(val);
                render(val);
                emit();
              },
            },
            text,
          ),
        ),
      );
    };
    render(value);
    return h('div', { class: 'tz-setting' }, h('span', {}, label, note ? h('div', { class: 'tz-note' }, note) : null), wrap);
  };
  return h(
    'div',
    { class: 'tz-screen', 'data-screen': 'settings' },
    h(
      'div',
      { class: 'tz-card', style: 'max-width:520px' },
      h('div', { class: 'tz-caption tz-card-tag' }, ru.settingsTitle),
      h(
        'div',
        { class: 'tz-settings' },
        toggle(ru.soundOn, !s.muted, (v) => (s.muted = !v)),
        slider(ru.sfxVolume, 'sfxVolume'),
        slider(ru.ambientVolume, 'ambientVolume'),
        toggle(ru.reducedMotion, s.reducedMotion, (v) => {
          s.reducedMotion = v;
          s.reducedMotionUser = v;
        }),
        seg(
          ru.quality,
          [
            ['high', ru.qualityHigh],
            ['low', ru.qualityLow],
          ],
          s.quality,
          (v) => {
            s.quality = v as Settings['quality'];
            s.qualityAuto = false;
          },
          s.qualityAuto ? ru.qualityAutoNote : o.lightAvailable ? undefined : ru.webglMissing,
        ),
        toggle(ru.trailHints, s.trailHints, (v) => (s.trailHints = v), !o.trailAvailable, o.trailAvailable ? undefined : ru.trailUnavailable),
        seg(
          ru.sfxLanguage,
          [
            ['de', ru.sfxLangDe],
            ['ru', ru.sfxLangRu],
          ],
          s.sfxLang,
          (v) => (s.sfxLang = v as Settings['sfxLang']),
        ),
        h('p', { class: 'tz-note', style: 'margin:4px 0 0' }, ru.keyboardHelp),
      ),
      h('div', { class: 'tz-row is-end', style: 'margin-top:16px' }, h('button', { class: 'tz-btn is-primary', type: 'button', 'data-autofocus': true, onclick: o.onBack }, ru.back)),
    ),
  );
}

export interface ResultsData {
  escaped: boolean;
  narrow: boolean;
  score: number;
  total: number;
  stars: number;
  bag: { src: string; value: number }[];
  correct: number;
  wrong: number;
  medianSec: string;
  best: number;
  newBest: boolean;
  marginSec: string | null;
  snapshot: HTMLImageElement | null;
  stampText: string;
  hasNext: boolean;
  narrowLayout: boolean;
}

export function resultsScreen(d: ResultsData, opts: { onAgain: () => void; onNext: () => void; onMenu: () => void; onTally: (i: number) => void }): HTMLElement {
  const shot = h('div', { class: `tz-rp tz-rp-shot${d.escaped ? '' : ' is-lose'}` });
  if (d.snapshot) {
    d.snapshot.alt = '';
    shot.append(d.snapshot);
  }
  shot.append(h('div', { class: 'tz-stamp', lang: 'de' }, d.stampText));

  const loot = h('div', { class: 'tz-loot', 'aria-hidden': 'true' });
  const counter = h('div', { class: 'tz-big' }, '0');
  const lootPanel = h(
    'div',
    { class: 'tz-rp' },
    h('div', { class: 'tz-caption tz-card-tag' }, d.escaped ? ru.resultsWin : ru.resultsLose),
    loot,
    counter,
    h('div', { class: 'tz-sub' }, d.escaped ? ru.carried(d.score, d.total) : ru.lostAll),
  );

  const stats = h(
    'ul',
    { class: 'tz-stats' },
    h('li', {}, ru.statCorrect(d.correct)),
    h('li', {}, ru.statWrong(d.wrong)),
    h('li', {}, ru.statMedian(d.medianSec)),
    h('li', {}, ru.statBest(d.best)),
    d.marginSec ? h('li', {}, ru.statMargin(d.marginSec)) : null,
  );
  const starPanel = h(
    'div',
    { class: 'tz-rp' },
    h('div', { class: 'tz-caption tz-card-tag' }, ru.stars(d.stars)),
    starRow(d.stars, true),
    d.newBest ? h('div', { class: 'tz-caption tz-record' }, ru.newRecord) : null,
    stats,
  );

  const panels = h('div', { class: `tz-results-panels${d.narrowLayout ? ' is-narrow' : ''}` }, shot, lootPanel, starPanel);
  const buttons = h(
    'div',
    { class: 'tz-row', style: 'justify-content:center' },
    h('button', { class: 'tz-btn is-primary', type: 'button', 'data-autofocus': true, onclick: opts.onAgain }, ru.again),
    d.hasNext ? h('button', { class: 'tz-btn is-dark', type: 'button', onclick: opts.onNext }, ru.next) : null,
    h('button', { class: 'tz-btn', type: 'button', onclick: opts.onMenu }, ru.toMenu),
  );
  const root = h('div', { class: 'tz-screen', 'data-screen': 'results' }, h('div', { class: 'tz-results' }, panels, buttons));

  // Панели появляются по очереди; добыча летит по одной, счётчик ускоряется.
  const ps = [shot, lootPanel, starPanel];
  ps.forEach((p, i) => setTimeout(() => p.classList.add('is-in'), 80 + i * 260));
  if (!d.escaped) {
    // Что осталось в сокровищнице: добыча серыми силуэтами.
    d.bag.forEach((it, i) => setTimeout(() => loot.append(h('img', { src: it.src, alt: '', class: 'is-lost' })), 500 + i * 60));
  }
  if (d.escaped) {
    let sum = 0;
    let delay = 600;
    d.bag.forEach((it, i) => {
      const step = Math.max(45, 170 - i * 14);
      delay += step;
      setTimeout(() => {
        loot.append(h('img', { src: it.src, alt: '' }));
        sum += it.value;
        counter.textContent = String(Math.min(d.score, sum));
        opts.onTally(i);
      }, delay);
    });
    setTimeout(() => (counter.textContent = String(d.score)), delay + 60);
  }
  return root;
}

export function loadingScreen(): HTMLElement {
  return h(
    'div',
    { class: 'tz-loading', role: 'status' },
    h('div', { class: 'tz-card' }, h('div', { class: 'tz-loading-word', lang: 'de' }, ru.loading), h('div', { class: 'tz-loading-coin' })),
  );
}

export function introCaption(sec: number): HTMLElement {
  return h('div', { class: 'tz-caption tz-intro', role: 'status' }, ru.introDoor(sec), h('small', {}, ru.tapToSkip));
}

export function bubble(text: string, onOk: () => void): HTMLElement {
  return h(
    'div',
    { class: 'tz-bubble', role: 'dialog', 'aria-live': 'polite' },
    h('div', {}, text),
    h('button', { class: 'tz-btn is-primary', type: 'button', 'data-autofocus': true, onclick: onOk }, ru.tutorialOk),
  );
}
