// Панель вопроса (раздел 11.2). Время ответа — от момента, когда вопрос стал активным, до клика
// или отправки (паузы, ожидание цели и проверка ответа не считаются). Следующий вопрос
// загружается заранее, если источник этого хочет.
// Форматы обучающего движка: инструкция и метка темы, перевод, поле слова, аудирование
// с повтором, свободный ответ и строка разбора, которая остаётся видна под следующим вопросом.

import { balance } from '../config/balance';
import { ru } from '../i18n/ru';
import { playQuestionAudio, stopQuestionAudio, unlockQuestionAudio } from '../learning/audio';
import { localRecallEvaluation } from '../learning/recall';
import type { Question, QuestionProvider, RecallVerdict } from '../questions/types';
import { h, promptNodes, restartAnim } from './dom';

export interface PanelIcons {
  pipFull: string;
  pipEmpty: string;
}

export type PanelMode = 'off' | 'intro' | 'active';

/** Вариант длиннее этого в портрете не делит ряд с соседом. */
const LONG_OPTION_CHARS = 24;

export class QuestionPanel {
  readonly el: HTMLElement;
  private readonly body: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly promptLabel: HTMLElement;
  private readonly promptMeta: HTMLElement;
  private readonly promptText: HTMLElement;
  private readonly wordField: HTMLElement;
  private readonly translation: HTMLElement;
  private readonly replay: HTMLButtonElement;
  private readonly hint: HTMLElement;
  private readonly options: HTMLElement;
  private readonly recallForm: HTMLFormElement;
  private readonly recallInput: HTMLInputElement;
  private readonly recallSubmit: HTMLButtonElement;
  private readonly feedbackLine: HTMLElement;
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
  private shownSerial = 0;
  private audioKey = '';
  /** Ответ: верно ли, время, вопрос. */
  onAnswer: (correct: boolean, timeMs: number, q: Question) => void = () => {};
  canAnswer: () => boolean = () => true;

  constructor(private readonly touch: boolean) {
    this.pipsEl = h('span', { class: 'tz-pips-boots', 'aria-hidden': 'true' });
    this.pipsLabel = h('span', { class: 'tz-pips-label' }, ru.stepCost(1));
    const pips = h('div', { class: 'tz-pips', role: 'status' }, this.pipsEl, this.pipsLabel);
    const head = h(
      'div',
      { class: 'tz-q-head' },
      h('div', { class: 'tz-caption tz-q-title' }, 'Вопрос на шаг'),
      pips,
    );
    this.promptLabel = h('span', { class: 'tz-prompt-label' }, ru.chooseAnswer);
    this.promptMeta = h('span', { class: 'tz-prompt-meta', lang: 'de' });
    this.promptText = h('span', { class: 'tz-prompt-text' });
    this.wordField = h('span', { class: 'tz-wordfield', hidden: true });
    this.translation = h('span', { class: 'tz-translation', lang: 'ru', hidden: true });
    this.replay = h(
      'button',
      {
        class: 'tz-replay',
        type: 'button',
        hidden: true,
        'aria-label': ru.replayLabel,
        onclick: () => this.replayAudio(),
      },
      ru.replay,
    );
    this.prompt = h(
      'div',
      { class: 'tz-caption tz-prompt', id: 'tz-prompt' },
      h('span', { class: 'tz-prompt-top' }, this.promptLabel, this.promptMeta),
      this.promptText,
      this.wordField,
      this.translation,
      this.replay,
    );
    this.hint = h('div', { class: 'tz-hint', hidden: true });
    this.options = h('div', { class: 'tz-options' });
    this.recallInput = h('input', {
      class: 'tz-recall-input',
      type: 'text',
      lang: 'de',
      autocomplete: 'off',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
      enterkeyhint: 'done',
      'aria-label': ru.recallLabel,
    });
    this.recallSubmit = h(
      'button',
      { class: 'tz-btn is-primary tz-recall-submit', type: 'submit' },
      ru.check,
    );
    this.recallForm = h(
      'form',
      {
        class: 'tz-recall',
        hidden: true,
        onsubmit: (e: Event) => {
          e.preventDefault();
          void this.submitRecall();
        },
      },
      this.recallInput,
      this.recallSubmit,
    );
    this.recallInput.addEventListener('input', () => this.refreshRecall());
    this.feedbackLine = h('div', { class: 'tz-feedback', hidden: true });
    const await_ = h('div', { class: 'tz-caption tz-await' }, ru.chooseTarget);
    this.body = h(
      'div',
      { class: 'tz-q-body' },
      this.prompt,
      this.hint,
      this.options,
      this.recallForm,
      this.feedbackLine,
      await_,
    );
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

  /** Новый раунд: «Приготовься…», первый вопрос грузится заранее, если источник не против. */
  startRound(provider: QuestionProvider): void {
    this.el.classList.remove('is-rules');
    this.provider = provider;
    this.gen++;
    this.mode = 'intro';
    this.feedback = false;
    this.current = null;
    this.nextQ = provider.prefetch === false ? null : provider.next();
    this.setFeedback('', 'none');
    this.el.classList.add('is-intro');
    this.el.classList.remove('is-awaiting', 'is-paused');
    this.stopClock();
    this.syncAudio();
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
    this.recallInput.disabled = true;
    this.recallSubmit.disabled = true;
    this.syncAudio();
  }

  private async showNext(flip: boolean): Promise<void> {
    if (!this.provider) return;
    const myGen = this.gen;
    const q = await (this.nextQ ?? this.provider.next());
    if (myGen !== this.gen) return;
    this.current = q;
    this.shownSerial++;
    this.nextQ = this.provider.prefetch === false ? null : this.provider.next();
    this.render(q);
    if (flip) restartAnim(this.body, 'tz-flip');
    this.activeMs = 0;
    this.activeSince = null;
    this.feedback = false;
    this.guardUntil = performance.now() + balance.answers.doubleTapGuardMs;
    this.refreshActive();
  }

  private render(q: Question): void {
    this.promptLabel.textContent = q.instruction || ru.chooseAnswer;
    this.promptMeta.textContent = q.meta ?? '';
    this.promptMeta.hidden = !q.meta;
    this.promptText.replaceChildren(...promptNodes(q.prompt));
    this.promptText.setAttribute('lang', q.promptLang);
    this.wordField.hidden = !q.wordField;
    this.wordField.replaceChildren(
      ...(q.wordField
        ? [
            h('span', { class: 'tz-wordfield-base' }, ru.wordField(q.wordField.base)),
            h('em', { lang: 'de' }, q.wordField.bank.join(' · ')),
          ]
        : []),
    );
    // Аудирование не печатает ни фразу, ни перевод: вместо перевода — кнопка повтора.
    this.translation.textContent = q.audioText ? '' : (q.translation ?? '');
    this.translation.hidden = !!q.audioText || !q.translation;
    this.replay.hidden = !q.audioText;
    this.hint.textContent = q.hint ?? '';
    this.hint.hidden = !q.hint;
    this.el.dataset.answer = q.recall ? 'recall' : 'choice';

    if (q.recall) {
      this.buttons = [];
      this.options.replaceChildren();
      this.options.hidden = true;
      this.options.dataset.long = 'false';
      this.el.dataset.long = 'false';
      this.recallForm.hidden = false;
      this.recallInput.value = '';
      this.recallInput.placeholder = q.recall.placeholder;
      this.recallInput.classList.remove('is-correct', 'is-wrong');
      this.recallSubmit.classList.remove('is-busy');
    } else {
      this.recallForm.hidden = true;
      this.options.hidden = false;
      this.buttons = q.options.map((text, i) =>
        h(
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
        ),
      );
      this.options.replaceChildren(...this.buttons);
      this.options.dataset.count = String(q.options.length);
      // Целые предложения (сборка, преобразование, исправление ошибки) по два в ряд на телефоне
      // не читаются — такие варианты идут столбиком и в портрете.
      this.options.dataset.long = String(q.options.some((text) => text.length > LONG_OPTION_CHARS));
      this.el.dataset.long = this.options.dataset.long;
    }
    // Разбор прошлого ответа остаётся под новым вопросом, приглушённым, до следующего ответа.
    this.feedbackLine.classList.add('is-past');
    if (!q.rule && !this.feedbackLine.textContent) this.feedbackLine.hidden = true;
    else this.feedbackLine.hidden = false;
    this.fit();
    this.live.textContent = q.audioText ? (q.instruction ?? '') : q.prompt.replace(/___/g, '…');
  }

  /**
   * Подогнать задание и варианты под текущий размер панели. Если задание с переводом, полем слова
   * и разбором всё равно не помещается (телефон), панель переходит в плотную компоновку, а на
   * самых маленьких экранах — в тесную: разбор всплывает поверх задания только на время ответа.
   */
  fit(): void {
    // Длинные варианты сначала пробуют встать столбиком; если и в тесной компоновке четыре
    // предложения не помещаются (360 × 640), они возвращаются по два в ряд — там строки
    // заполняются плотнее и ни один вариант не уходит за край панели.
    const long = this.options.dataset.long === 'true';
    for (const stack of long ? [true, false] : [false]) {
      this.options.dataset.stack = String(stack);
      this.layoutOptions();
      this.el.classList.remove('is-dense', 'is-cramped');
      this.fitPrompt();
      for (const level of ['is-dense', 'is-cramped']) {
        if (!this.overflowing()) break;
        this.el.classList.add(level);
        this.fitPrompt();
      }
      if (!this.overflowing()) break;
    }
    this.fitOptions();
  }

  /** Число рядов вариантов: в портрете по два в ряд (длинные — столбиком, если влезают), в ландшафте — столбиком. */
  private layoutOptions(): void {
    const n = this.buttons.length;
    const portrait = this.el.closest<HTMLElement>('.tz')?.dataset.orient === 'portrait';
    const pairs = portrait && this.options.dataset.stack !== 'true';
    this.options.style.setProperty('--opt-rows', String(pairs ? Math.ceil(n / 2) : n));
  }

  /** Панель переполнена: либо всё задание, либо ряды вариантов не влезают в оставшееся место. */
  private overflowing(): boolean {
    return (
      this.body.scrollHeight > this.body.clientHeight + 1 ||
      (!this.options.hidden && this.options.scrollHeight > this.options.clientHeight + 1)
    );
  }

  /** Если текст не помещается в две строки или панель переполнена, шрифт ужимается с 24 до 16 px. */
  private fitPrompt(): void {
    const L = balance.layout;
    let size = L.promptFontMax;
    this.el.style.setProperty('--q-font', `${size}px`);
    const el = this.prompt;
    let guard = 0;
    while (
      size > L.promptFontMin &&
      (el.scrollWidth > el.clientWidth + 1 ||
        this.promptText.offsetHeight > size * 2.6 ||
        this.overflowing()) &&
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
    // Четыре предложения в тесной панели (360 × 640) помещаются только мельче обычного минимума.
    const minSize =
      this.el.classList.contains('is-cramped') && this.options.dataset.long === 'true'
        ? L.optionFontMinCramped
        : L.optionFontMin;
    for (const b of this.buttons) {
      const text = b.querySelector<HTMLElement>('.tz-opt-text');
      if (!text) continue;
      b.style.fontSize = '';
      b.classList.remove('is-tight');
      let size = parseFloat(getComputedStyle(b).fontSize) || L.optionFontMax;
      let guard = 0;
      while (!fits(b, text) && size > minSize && guard++ < 30) {
        size = Math.max(minSize, size - 1.5);
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
    this.refreshRecall();
    this.syncAudio();
  }

  /**
   * Поле свободного ответа. Во время проверки и разбора оно только для чтения, но не теряет
   * фокус — экранная клавиатура телефона не прыгает между вопросами. Пока ждём цель или стоим
   * на паузе, поле выключено, а стрелки и клавиши героя снова управляют игрой.
   */
  private refreshRecall(): void {
    if (!this.current?.recall) return;
    const live = this.isLive();
    const idle = this.mode !== 'active' || this.paused || this.awaiting;
    const focused = document.activeElement === this.recallInput;
    this.recallInput.disabled = idle;
    this.recallInput.readOnly = !live;
    this.recallSubmit.disabled = !live || !this.recallInput.value.trim();
    if (live && !this.touch && !focused) this.recallInput.focus({ preventScroll: true });
    if (idle && focused) {
      this.recallInput.blur();
      this.el.closest<HTMLElement>('.tz')?.focus({ preventScroll: true });
    }
  }

  /** Фраза аудирования звучит, когда вопрос на экране и игра не стоит; смолкает на паузе. */
  private syncAudio(): void {
    const q = this.current;
    const audible = this.mode === 'active' && !this.paused && !this.awaiting && !!q?.audioText;
    const key = audible && q ? `${q.id}#${this.shownSerial}` : '';
    if (key === this.audioKey) return;
    this.audioKey = key;
    if (audible && q?.audioText) void playQuestionAudio(q.audioText);
    else stopQuestionAudio();
  }

  private replayAudio(): void {
    const text = this.current?.audioText;
    if (!text || this.mode !== 'active' || this.paused) return;
    unlockQuestionAudio();
    void playQuestionAudio(text);
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
    if (correct) this.buttons[i].classList.add('is-correct');
    else {
      this.buttons[i].classList.add('is-wrong');
      this.buttons[q.correctIndex]?.classList.add('is-right');
    }
    const text = q.rule ? (correct ? q.rule : ru.wrongRule(q.rule)) : '';
    this.conclude(q, correct, timeMs, text);
  }

  private async submitRecall(): Promise<void> {
    const q = this.current;
    const provider = this.provider;
    const answer = this.recallInput.value.trim();
    if (!q?.recall || !provider || !answer || !this.isLive()) return;
    if (performance.now() < this.guardUntil) return;
    if (!this.canAnswer()) return;
    const timeMs = Math.round(this.elapsed());
    this.stopClock();
    this.feedback = true;
    this.recallSubmit.classList.add('is-busy');
    this.refreshActive();
    const myGen = this.gen;
    let verdict: RecallVerdict;
    try {
      verdict = provider.evaluate ? await provider.evaluate(q, answer) : this.localVerdict(q, answer);
    } catch {
      verdict = this.localVerdict(q, answer);
    }
    if (myGen !== this.gen || this.current !== q) return;
    this.recallSubmit.classList.remove('is-busy');
    if (!this.canAnswer()) {
      // Пока шла проверка, игра встала на паузу: ответ не засчитан, его можно отправить снова.
      this.feedback = false;
      this.refreshActive();
      return;
    }
    provider.report({ id: q.id, correct: verdict.correct, timeMs });
    this.recallInput.classList.add(verdict.correct ? 'is-correct' : 'is-wrong');
    this.refreshActive();
    this.conclude(q, verdict.correct, timeMs, verdict.feedback);
  }

  private localVerdict(q: Question, answer: string): RecallVerdict {
    const expected = q.options[q.correctIndex];
    return localRecallEvaluation(answer, expected).correct
      ? { correct: true, feedback: q.rule ?? '' }
      : { correct: false, feedback: ru.recallMiss(expected) };
  }

  /** Общий хвост ответа: разбор, «HOPPLA!», событие для игры и следующий вопрос. */
  private conclude(q: Question, correct: boolean, timeMs: number, text: string): void {
    this.setFeedback(text, correct ? 'good' : 'bad');
    if (!correct) restartAnim(this.hoppla, 'is-on');
    this.live.textContent = text || (correct ? '' : q.options[q.correctIndex]);
    this.onAnswer(correct, timeMs, q);
    const myGen = this.gen;
    setTimeout(
      () => {
        if (myGen === this.gen) void this.showNext(true);
      },
      correct ? balance.answers.correctFlashMs : balance.answers.wrongFeedbackMs,
    );
  }

  private setFeedback(text: string, tone: 'good' | 'bad' | 'none'): void {
    this.feedbackLine.textContent = text;
    this.feedbackLine.hidden = !text && !this.current?.rule;
    this.feedbackLine.classList.remove('is-past', 'is-good', 'is-bad');
    if (tone !== 'none') this.feedbackLine.classList.add(tone === 'good' ? 'is-good' : 'is-bad');
  }
}
