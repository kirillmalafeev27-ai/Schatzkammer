// Пресеты звуков (раздел 10.2). Высота и глухость шага зависят от веса;
// монеты в серии звенят на полтона выше.

import type { Preset } from './mixer';

const semis = (n: number) => Math.pow(2, n / 12);

export const presets: Record<string, Preset> = {
  /** Шаг по камню; k — ступень цены (1–5): чем тяжелее, тем ниже и глуше. */
  step(e, o, out, t) {
    const w = Math.max(0, Math.min(1, (o.k - 1) / 4));
    const variant = Math.floor(Math.random() * 3);
    const f = (900 - 420 * w) * o.pitch * [1, 0.9, 1.12][variant];
    e.noise(out, t, 0.07 + 0.04 * w, 0.45, { type: 'bandpass', f, q: 1.4 }, { send: 0.15 });
    e.osc(out, 'sine', (130 - 45 * w) * o.pitch, t, 0.09 + 0.05 * w, 0.35 + 0.25 * w, { f1: 60, send: 0.1 });
  },

  /** «Дзынь»; k — номер монеты в серии (каждая следующая на полтона выше). */
  coin(e, o, out, t) {
    const f = 1568 * semis(Math.min(12, o.k)) * o.pitch;
    e.osc(out, 'sine', f, t, 0.42, 0.22, { send: 0.35 });
    e.osc(out, 'sine', f * 1.5, t + 0.012, 0.3, 0.12, { send: 0.3 });
    e.osc(out, 'triangle', f * 2.01, t, 0.12, 0.06);
    e.noise(out, t, 0.03, 0.15, { type: 'highpass', f: 6000 });
  },

  /** Хрустальный аккорд камня. */
  gem(e, o, out, t) {
    const base = 1318.5 * o.pitch;
    [1, semis(4), semis(7), semis(12)].forEach((m, i) => {
      e.osc(out, 'sine', base * m, t + i * 0.035, 0.9, 0.12, { send: 0.7, detune: (i - 1.5) * 6 });
      e.osc(out, 'triangle', base * m * 2, t + i * 0.035, 0.35, 0.03, { send: 0.5 });
    });
    e.noise(out, t, 0.25, 0.08, { type: 'highpass', f: 7000 }, { send: 0.5 });
  },

  /** Рост цены: глухое «бум» мешка. */
  costUp(e, o, out, t) {
    e.osc(out, 'sine', 120 * o.pitch, t, 0.28, 0.55, { f1: 48 });
    e.noise(out, t, 0.16, 0.3, { type: 'lowpass', f: 420, f1: 120 }, { send: 0.2 });
  },

  /** Выброс: звонкий дребезг. */
  drop(e, o, out, t) {
    for (let i = 0; i < 4; i++) {
      const f = (1200 + Math.random() * 1400) * o.pitch;
      e.osc(out, 'triangle', f, t + i * 0.055 + Math.random() * 0.02, 0.09, 0.09, { send: 0.3 });
    }
    e.noise(out, t + 0.2, 0.18, 0.08, { type: 'bandpass', f: 2500, q: 2 }, { send: 0.3 });
  },

  /** Ошибка: мягкий «бонк», не обидный. */
  wrong(e, o, out, t) {
    e.osc(out, 'sine', 240 * o.pitch, t, 0.22, 0.32, { f1: 150 });
    e.osc(out, 'triangle', 480 * o.pitch, t, 0.08, 0.05, { f1: 300 });
  },

  /** Верный ответ: короткий щелчок; k — длина серии быстрых ответов. */
  correct(e, o, out, t) {
    const f = 880 * semis(Math.min(10, o.k * 2)) * o.pitch;
    e.osc(out, 'triangle', f, t, 0.08, 0.16);
    e.osc(out, 'sine', f * 2, t + 0.02, 0.07, 0.06);
  },

  /** Заряд налился. */
  pip(e, o, out, t) {
    e.osc(out, 'square', 660 * o.pitch, t, 0.05, 0.035);
  },

  sandWarn(e, _o, out, t) {
    e.noise(out, t, 1.2, 0.12, { type: 'bandpass', f: 4200, q: 0.8 }, { attack: 0.35, send: 0.3 });
  },

  sandBury(e, o, out, t) {
    e.noise(out, t, 0.4, 0.4, { type: 'lowpass', f: 600, f1: 140 }, { send: 0.3 });
    e.osc(out, 'sine', 95 * o.pitch, t, 0.25, 0.3, { f1: 55 });
  },

  /** Механизм двери: скрежет и удар. */
  notch(e, o, out, t) {
    e.noise(out, t, 0.32, 0.28, { type: 'bandpass', f: 380, f1: 900, q: 6 }, { send: 0.3 });
    e.osc(out, 'square', 170 * o.pitch, t + 0.26, 0.18, 0.1, { f1: 110, send: 0.4 });
    e.noise(out, t + 0.26, 0.2, 0.3, { type: 'lowpass', f: 900 }, { send: 0.4 });
  },

  /** Старт раунда: щелчок механизма. */
  start(e, o, out, t) {
    e.osc(out, 'square', 220 * o.pitch, t, 0.06, 0.12, { f1: 140 });
    e.noise(out, t, 0.1, 0.25, { type: 'bandpass', f: 1500, q: 3 }, { send: 0.4 });
    e.osc(out, 'sine', 80, t + 0.05, 0.6, 0.3, { f1: 45, send: 0.5 });
  },

  tick(e, o, out, t) {
    e.osc(out, 'square', 1250 * o.pitch, t, 0.03, 0.08);
    e.noise(out, t, 0.02, 0.1, { type: 'highpass', f: 3000 });
  },

  heartbeat(e, _o, out, t) {
    e.osc(out, 'sine', 62, t, 0.16, 0.6, { f1: 38 });
    e.osc(out, 'sine', 58, t + 0.2, 0.14, 0.42, { f1: 36 });
  },

  /** Дверь закрылась: удар с эхом. */
  slam(e, _o, out, t) {
    e.osc(out, 'sine', 70, t, 1.4, 0.9, { f1: 28, send: 1 });
    e.noise(out, t, 0.9, 0.7, { type: 'lowpass', f: 900, f1: 80 }, { send: 1 });
    e.noise(out, t, 0.08, 0.4, { type: 'bandpass', f: 2200, q: 1 }, { send: 0.8 });
  },

  /** Короткая фанфара выхода. */
  fanfare(e, o, out, t) {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      e.osc(out, 'triangle', f * o.pitch, t + i * 0.085, 0.32 + (i === 3 ? 0.4 : 0), 0.18, { send: 0.4 });
      e.osc(out, 'square', f * o.pitch, t + i * 0.085, 0.12, 0.035);
    });
    e.osc(out, 'sine', 1046.5 * 1.5 * o.pitch, t + 0.34, 0.6, 0.06, { send: 0.6 });
  },

  /** Подсчёт добычи: «дзынь» с растущей высотой; k — номер. */
  tally(e, o, out, t) {
    const f = 1046.5 * semis(Math.min(19, o.k)) * o.pitch;
    e.osc(out, 'sine', f, t, 0.18, 0.13, { send: 0.3 });
    e.osc(out, 'triangle', f * 2, t, 0.06, 0.04);
  },

  /** Отказ: тап по препятствию, глухой стук. */
  thud(e, o, out, t) {
    e.osc(out, 'sine', 110 * o.pitch, t, 0.12, 0.4, { f1: 70 });
    e.noise(out, t, 0.06, 0.25, { type: 'lowpass', f: 700 });
  },

  /** Мешок полон. */
  full(e, o, out, t) {
    e.osc(out, 'sine', 180 * o.pitch, t, 0.1, 0.3, { f1: 120 });
    e.osc(out, 'sine', 150 * o.pitch, t + 0.11, 0.12, 0.3, { f1: 100 });
  },

  /** Щелчок интерфейса. */
  ui(e, o, out, t) {
    e.osc(out, 'triangle', 700 * o.pitch, t, 0.05, 0.08);
  },
};
