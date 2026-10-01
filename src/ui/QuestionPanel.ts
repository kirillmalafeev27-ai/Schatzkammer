// Панель вопроса (раздел 11.2). Следующий вопрос загружается заранее; время ответа — от момента,
// когда вопрос стал активным, до клика (паузы и ожидание цели не считаются).

import { balance } from '../config/balance';
import { ru } from '../i18n/ru';
import type { Question, QuestionProvider } from '../questions/types';
import { h, promptNodes, restartAnim } from './dom';

export interface PanelIcons {
  pipFull: string;
  pipEmpty: string;
}

export type PanelMode = 'off' | 'intro' | 'active';

export class QuestionPanel {
  readonly el: HTMLElement;
  private readonly body: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly promptText: HTMLElement;
  private readonly options: HTMLElement;
  private readonly pipsEl: HTMLElement;
  private readonly pipsLabel: HTMLElement;
  private readonly hoppla: HTMLElement;
  private readonly live: HTMLElement;
  private readonly rules: HTMLElement;
  private buttons: HTMLButtonElement[] = [];
  private current: Question | null = null;
  private nextQ: Promise<Question> | null = null;
  private provider: QuestionProvider | null = null;
  private mode: PanelMode = 'off';
  private paused = false;
  private awaiting = false;
  private feedback = false;
  private activeMs = 0;
  private activeSince: number | null = null;
  private guardUntil = 0;
  private pipKey = '';
  private icons: PanelIcons = { pipFull: '', pipEmpty: '' };
  private gen = 0;
  /** Ответ: верно ли, время, вопрос. */
  onAnswer: (correct: boolean, timeMs: number, q: Question) => void = () => {};
  canAnswer: () => boolean = () => true;

  constructor(touch: boolean) {
    this.pipsEl = h('span', { class: 'tz-pips-boots', 'aria-hidden': 'true' });
    this.pipsLabel = h('span', { class: 'tz-pips-label' }, ru.stepCost(1));
    const pips = h('div', { class: 'tz-pips', role: 'status' }, this.pipsEl, this.pipsLabel);
    const head = h(
      'div',
      { class: 'tz-q-head' },
      h('div', { class: 'tz-caption tz-q-title' }, 'Вопрос на шаг'),
      pips,
    );
    this.promptText = h('span', { class: 'tz-prompt-text' });
    this.prompt = h(
      'div',
      { class: 'tz-caption tz-prompt', id: 'tz-prompt' },
      h('span', { class: 'tz-prompt-label' }, 'Выбери верный ответ'),
      this.promptText,
    );
    this.options = h('div', { class: 'tz-options' });
    const await_ = h('div', { class: 'tz-caption tz-await' }, ru.chooseTarget);
    this.body = h('div', { class: 'tz-q-body' }, this.prompt, this.options, await_);
    this.hoppla = h('div', { class: 'tz-hoppla', 'aria-hidden': 'true' }, 'HOPPLA!');
    this.live = h('div', { class: 'tz-sr', 'aria-live': 'polite' });
    const ready = h('div', { class: 'tz-ready' }, ru.getReady);
    this.rules = h('div', { class: 'tz-rules' });
    const foot = h('div', { class: 'tz-q-foot' }, ru.footerControls);
    this.el = h(
      'section',
      {
        class: 'tz-panel tz-question',
        role: 'group',
        'aria-label': ru.questionGroup,
        'aria-describedby': 'tz-prompt',
      },
      head,
      this.body,
      ready,
      this.rules,
      foot,
      this.hoppla,
      this.live,
    );
    if (touch) this.el.classList.add('is-touch');
  }

  setIcons(icons: PanelIcons): void {
    this.icons = icons;
    this.pipKey = '';
  }

  setHoppla(text: string): void {
    this.hoppla.textContent = text;
  }

  /** Меню: вместо вопроса — три шага правил с картинками. */
  showRules(icons: string[]): void {
    this.stop();
    this.el.classList.remove('is-intro', 'is-awaiting', 'is-paused');
    this.el.classList.add('is-rules');
    this.rules.replaceChildren(
      h('div', { class: 'tz-caption tz-rules-title' }, ru.rulesTitle),
      ...ru.rules.map((text, i) =>
        h(
          'div',
          { class: 'tz-rule' },
          h('span', { class: 'tz-rule-n' }, String(i + 1)),
          icons[i] ? h('img', { class: 'tz-rule-icon', src: icons[i], alt: '' }) : null,
          h('span', { class: 'tz-rule-text' }, text),
        ),
      ),
    );
  }

  /** Новый раунд: «Приготовься…», первый вопрос грузится заранее. */
  startRound(provider: QuestionProvider): void {
    this.el.classList.remove('is-rules');
    this.provider = provider;
    this.gen++;
    this.mode = 'intro';
    this.feedback = false;
    this.current = null;
    this.nextQ = provider.next();
    this.el.classList.add('is-intro');
    this.el.classList.remove('is-awaiting', 'is-paused');
    this.stopClock();
  }

  /** Интро закончилось — показать первый вопрос. */
  async activate(): Promise<void> {
    if (!this.provider) return;
    this.mode = 'active';
    this.el.classList.remove('is-intro');
    await this.showNext(false);
  }

  stop(): void {
    this.mode = 'off';
    this.stopClock();
    this.gen++;
    this.feedback = false;
    for (const b of this.buttons) b.disabled = true;
  }

  private async showNext(flip: boolean): Promise<void> {
    if (!this.provider) return;
    const myGen = this.gen;
    const q = await (this.nextQ ?? this.provider.next());
    if (myGen !== this.gen) return;
    this.current = q;
    this.nextQ = this.provider.next();
    this.render(q);
    if (flip) restartAnim(this.body, 'tz-flip');
    this.activeMs = 0;
    this.activeSince = null;
    this.feedback = false;
    this.guardUntil = performance.now() + balance.answers.doubleTapGuardMs;
    this.refreshActive();
  }

  private render(q: Question): void {
    this.promptText.replaceChildren(...promptNodes(q.prompt));
    this.promptText.setAttribute('lang', q.promptLang);
    this.buttons = q.options.map((text, i) => {
      const b = h(
        'button',
        {
          class: 'tz-opt',
          type: 'button',
          lang: q.optionsLang,
          'aria-label': ru.optionLabel(i + 1, text),
          onclick: () => this.answer(i),
        },
        h('span', { class: 'tz-opt-key', 'aria-hidden': 'true' }, String(i + 1)),
        h('span', { class: 'tz-opt-text' }, text),
      );
      return b;
    });
    this.options.replaceChildren(...this.buttons);
    this.options.dataset.count = String(q.options.length);
    this.fit();
    this.live.textContent = q.prompt.replace(/___/g, '…');
  }

  /** Подогнать задание и варианты под текущий размер панели. */
  fit(): void {
    this.fitPrompt();
    this.fitOptions();
  }

  /** Если текст не помещается в две строки, шрифт ужимается с 24 до 16 px. */
  private fitPrompt(): void {
    const L = balance.layout;
    let size = L.promptFontMax;
    this.el.style.setProperty('--q-font', `${size}px`);
    const el = this.prompt;
    let guard = 0;
    while (
      size > L.promptFontMin &&
      (el.scrollWidth > el.clientWidth + 1 || this.promptText.offsetHeight > size * 2.6) &&
      guard++ < 10
    ) {
      size -= 2;
      this.el.style.setProperty('--q-font', `${size}px`);
    }
  }

  /**
   * Длинное немецкое слово не вылезает из кнопки: шрифт ужимается, пока слово не встанет целиком,
   * и только на минимальном размере слово переносится по буквам. Размер общий для всех вариантов.
   */
  private fitOptions(): void {
    const L = balance.layout;
    const fits = (b: HTMLElement, text: HTMLElement) =>
      text.scrollWidth <= text.clientWidth + 1 && b.scrollHeight <= b.clientHeight + 1;
    const items: { b: HTMLElement; text: HTMLElement }[] = [];
    let common = Infinity;
    for (const b of this.buttons) {
      const text = b.querySelector<HTMLElement>('.tz-opt-text');
      if (!text) continue;
      b.style.fontSize = '';
      b.classList.remove('is-tight');
      let size = parseFloat(getComputedStyle(b).fontSize) || L.optionFontMax;
      let guard = 0;
      while (!fits(b, text) && size > L.optionFontMin && guard++ < 30) {
        size = Math.max(L.optionFontMin, size - 1.5);
        b.style.fontSize = `${size}px`;
      }
      common = Math.min(common, size);
      items.push({ b, text });
    }
    for (const { b, text } of items) {
      b.style.fontSize = `${common}px`;
      if (!fits(b, text)) b.classList.add('is-tight');
    }
  }

  /** Сколько времени вопрос был активен. */
  private elapsed(): number {
    return this.activeMs + (this.activeSince != null ? performance.now() - this.activeSince : 0);
  }

  private stopClock(): void {
    if (this.activeSince != null) {
      this.activeMs += performance.now() - this.activeSince;
      this.activeSince = null;
    }
  }

  private isLive(): boolean {
    return this.mode === 'active' && !this.paused && !this.awaiting && !this.feedback && !!this.current;
  }

  private refreshActive(): void {
    const live = this.isLive();
    if (live && this.activeSince == null) this.activeSince = performance.now();
    if (!live) this.stopClock();
    for (const b of this.buttons) b.disabled = !live;
    this.el.classList.toggle('is-awaiting', this.awaiting && this.mode === 'active' && !this.feedback);
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.el.classList.toggle('is-paused', p);
    this.refreshActive();
  }

  /** Заряды и цена шага; ожидание цели гасит кнопки. */
  setStep(pips: number, cost: number, awaiting: boolean): void {
    const key = `${pips}/${cost}`;
    if (key !== this.pipKey) {
      const prevHave = Number(this.pipKey.split('/')[0] || 0);
      this.pipKey = key;
      const boots: HTMLElement[] = [];
      for (let i = 0; i < cost; i++) {
        const full = i < pips;
        const img = h('img', {
          class: `tz-pip${full ? ' is-full' : ''}`,
          src: full ? this.icons.pipFull : this.icons.pipEmpty,
          alt: '',
        });
        if (full && i < prevHave) img.classList.remove('is-full');
        boots.push(img);
      }
      this.pipsEl.replaceChildren(...boots);
      this.pipsLabel.textContent = ru.stepCost(cost);
      this.pipsEl.parentElement?.setAttribute('aria-label', ru.pipsLabel(pips, cost));
    }
    if (awaiting !== this.awaiting) {
      this.awaiting = awaiting;
      this.refreshActive();
    }
  }

  /** Клавиши 1–4. */
  pressKey(n: number): void {
    const b = this.buttons[n - 1];
    if (!b || b.disabled) return;
    b.classList.add('is-pressed');
    setTimeout(() => b.classList.remove('is-pressed'), 90);
    this.answer(n - 1);
  }

  private answer(i: number): void {
    const q = this.current;
    if (!q || !this.isLive() || !this.provider) return;
    if (performance.now() < this.guardUntil) return;
    if (!this.canAnswer()) return;
    const timeMs = Math.round(this.elapsed());
    const correct = i === q.correctIndex;
    this.stopClock();
    this.feedback = true;
    this.refreshActive();
    this.provider.report({ id: q.id, correct, timeMs });
    const btn = this.buttons[i];
    const myGen = this.gen;
    if (correct) {
      btn.classList.add('is-correct');
      this.onAnswer(true, timeMs, q);
      setTimeout(() => {
        if (myGen === this.gen) void this.showNext(true);
      }, balance.answers.correctFlashMs);
    } else {
      btn.classList.add('is-wrong');
      this.buttons[q.correctIndex]?.classList.add('is-right');
      restartAnim(this.hoppla, 'is-on');
      this.live.textContent = `${q.options[q.correctIndex]}`;
      this.onAnswer(false, timeMs, q);
      setTimeout(() => {
        if (myGen === this.gen) void this.showNext(true);
      }, balance.answers.wrongFeedbackMs);
    }
  }
}
