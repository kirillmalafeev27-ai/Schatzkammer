// Плашка мешка (раздел 11.3): лежит на северной стене, заходит на рамку панели мира.
// Сумма подпрыгивает при изменении; кнопки «Выбросить монету/камень» и «К выходу».

import { ru } from '../i18n/ru';
import { h, restartAnim } from './dom';

export interface BagIcons {
  bag: string;
  coin: string;
  gem: string;
}

export class BagWidget {
  readonly el: HTMLElement;
  private readonly icon: HTMLImageElement;
  private readonly score: HTMLElement;
  private readonly coinN: HTMLElement;
  private readonly gemN: HTMLElement;
  private readonly coinImg: HTMLImageElement;
  private readonly gemImg: HTMLImageElement;
  private readonly dropCoinBtn: HTMLButtonElement;
  private readonly dropGemBtn: HTMLButtonElement;
  private readonly exitBtn: HTMLButtonElement;
  private readonly dropCoinIcon: HTMLImageElement;
  private readonly dropGemIcon: HTMLImageElement;
  private last = { score: -1, coins: -1, gems: -1, exit: false };
  onDrop: (kind: 'coin' | 'gem') => void = () => {};
  onExit: () => void = () => {};

  constructor() {
    this.icon = h('img', { class: 'tz-bag-icon', alt: '' });
    this.score = h('span', { class: 'tz-bag-score', 'aria-live': 'polite' }, '0');
    this.coinImg = h('img', { alt: '' });
    this.gemImg = h('img', { alt: '' });
    this.coinN = h('span', {}, '0');
    this.gemN = h('span', {}, '0');
    const counts = h(
      'div',
      { class: 'tz-bag-counts' },
      h('span', { class: 'tz-bag-count', title: ru.coins }, this.coinImg, '×', this.coinN),
      h('span', { class: 'tz-bag-count', title: ru.gems }, this.gemImg, '×', this.gemN),
    );
    const main = h('div', { class: 'tz-bag-main' }, this.icon, this.score, counts);
    const coinIco = h('img', { alt: '' });
    const gemIco = h('img', { alt: '' });
    this.dropCoinIcon = coinIco;
    this.dropGemIcon = gemIco;
    this.dropCoinBtn = h(
      'button',
      { class: 'tz-mini', type: 'button', 'aria-label': ru.dropCoin, title: ru.dropCoin, onclick: () => this.onDrop('coin') },
      h('span', { class: 'tz-minus' }, '−'),
      coinIco,
      h('span', { class: 'tz-kbd' }, 'Q'),
    );
    this.dropGemBtn = h(
      'button',
      { class: 'tz-mini', type: 'button', 'aria-label': ru.dropGem, title: ru.dropGem, onclick: () => this.onDrop('gem') },
      h('span', { class: 'tz-minus' }, '−'),
      gemIco,
      h('span', { class: 'tz-kbd' }, 'E'),
    );
    this.exitBtn = h(
      'button',
      { class: 'tz-mini tz-exit', type: 'button', 'aria-label': ru.toExitHint, title: ru.toExitHint, 'aria-pressed': 'false', onclick: () => this.onExit() },
      '↑ ',
      ru.toExit,
      h('span', { class: 'tz-kbd' }, 'H'),
    );
    const actions = h('div', { class: 'tz-bag-actions' }, this.dropCoinBtn, this.dropGemBtn, this.exitBtn);
    this.el = h('div', { class: 'tz-caption tz-bag', role: 'group', 'aria-label': ru.bagLabel }, main, actions);
  }

  setIcons(icons: BagIcons): void {
    this.icon.src = icons.bag;
    this.coinImg.src = icons.coin;
    this.gemImg.src = icons.gem;
    this.dropCoinIcon.src = icons.coin;
    this.dropGemIcon.src = icons.gem;
  }

  setSide(side: 'left' | 'right'): void {
    this.el.dataset.side = side;
  }

  update(score: number, coins: number, gems: number, exitTarget: boolean, enabled: boolean): void {
    if (score !== this.last.score) {
      if (this.last.score >= 0) restartAnim(this.score, 'tz-bump');
      this.score.textContent = ru.bagScore(score);
    }
    if (coins !== this.last.coins) this.coinN.textContent = String(coins);
    if (gems !== this.last.gems) this.gemN.textContent = String(gems);
    if (exitTarget !== this.last.exit) this.exitBtn.setAttribute('aria-pressed', String(exitTarget));
    this.last = { score, coins, gems, exit: exitTarget };
    this.dropCoinBtn.disabled = !enabled || coins === 0;
    this.dropGemBtn.disabled = !enabled || gems === 0;
    this.exitBtn.disabled = !enabled;
  }

  gulp(): void {
    restartAnim(this.icon, 'tz-gulp');
  }

  reset(): void {
    this.last = { score: -1, coins: -1, gems: -1, exit: false };
    this.update(0, 0, 0, false, false);
  }

  /** Центр иконки мешка в координатах страницы. */
  iconRect(): DOMRect {
    return this.icon.getBoundingClientRect();
  }
}
